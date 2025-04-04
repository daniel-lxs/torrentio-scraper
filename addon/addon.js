import { addonBuilder } from 'stremio-addon-sdk';
import { Type } from './lib/types.js';
import { dummyManifest } from './lib/manifest.js';
import { cacheWrapStream } from './lib/cache.js';
import { toStreamInfo, applyStaticInfo } from './lib/streamInfo.js';
import * as repository from './lib/repository.js';
import applySorting from './lib/sort.js';
import applyFilters from './lib/filter.js';
import { applyMochs, getMochCatalog, getMochItemMeta } from './moch/moch.js';
import StaticLinks from './moch/static.js';
import { createNamedQueue } from './lib/namedQueue.js';
import pLimit from 'p-limit';
import { searchContent } from './lib/scraper/prowlarr.js';
import axios from 'axios';
import { setTimeout } from 'timers/promises';
import { getImdbMetadata } from './lib/imdb.js';
import { STREMIO_CACHE } from './lib/cacheConfig.js';

const CACHE_MAX_AGE = parseInt(process.env.CACHE_MAX_AGE) || STREMIO_CACHE.MAX_AGE;
const CACHE_MAX_AGE_EMPTY = STREMIO_CACHE.MAX_AGE_EMPTY;
const CATALOG_CACHE_MAX_AGE = 0; // 0 minutes
const STALE_REVALIDATE_AGE = STREMIO_CACHE.STALE_REVALIDATE;
const STALE_ERROR_AGE = STREMIO_CACHE.STALE_ERROR;
const OMDB_API_KEY = process.env.OMDB_API_KEY || ''; // Add OMDB API key to environment variables

const builder = new addonBuilder(dummyManifest());
const requestQueue = createNamedQueue(Infinity);
const newLimiter = pLimit(30);

// Function to get title from OMDB API
async function getTitleFromOMDB(imdbId) {
  if (!OMDB_API_KEY) {
    console.log('OMDB API key not configured, skipping OMDB fallback');
    return '';
  }
  
  try {
    const response = await axios.get(`http://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
    if (response.data && response.data.Title) {
      console.log(`Retrieved title from OMDB for ${imdbId}: ${response.data.Title}`);
      return response.data.Title;
    }
    console.error(`OMDB API returned no title for ${imdbId}`);
    return '';
  } catch (error) {
    console.error(`Error getting title from OMDB for ${imdbId}:`, error.message);
    return '';
  }
}

// Function to get title with fallback
async function getTitle(imdbId) {
  let title = '';
  
  // Try nameToImdb first
  try {
    const meta = await getImdbMetadata(imdbId);
    title = meta.name || '';
    if (title) {
      return title;
    }
    console.error(`Error getting title for ${imdbId} from nameToImdb: empty name`);
  } catch (error) {
    console.error(`Error getting title for ${imdbId} from nameToImdb:`, error.message);
  }
  
  // If nameToImdb fails, try OMDB
  return getTitleFromOMDB(imdbId);
}

// Helper function to validate API key
async function validateApiKey(config) {
  const apiKey = config?.apikey;
  if (!apiKey) {
    throw new Error('API key is required. Please configure the addon with your API key.');
  }
  const isValid = await repository.validateApiKey(apiKey);
  if (!isValid) {
    throw new Error('Invalid API key. Please check your configuration.');
  }
  return apiKey;
}

builder.defineStreamHandler(async (args) => {
  if (!args.id.match(/tt\d+/i) && !args.id.match(/kitsu:\d+/i)) {
    return { streams: [] };
  }

  try {
    console.log(`[DEBUG] Stream request received for ${args.id}`);
    console.log('[DEBUG] Stream handler args:', JSON.stringify(args, null, 2));
    
    // Create a merged config object that includes both extra and config
    const config = {
      ...args.extra,
      ...(args.config || {})
    };
    
    console.log('[DEBUG] Merged config:', JSON.stringify(config, null, 2));

    // Validate API key
    await validateApiKey(config);
    
    let streams = await requestQueue.wrap(args.id, () => resolveStreams(args, config));
    console.log(`[DEBUG] Got ${streams.length} streams for ${args.id} before filtering`);
    if (streams.length === 0) {
      return enrichCacheParams([]);
    }

    streams = await applyFilters(streams, config);
    console.log(`[DEBUG] Got ${streams.length} streams for ${args.id} after filtering`);
    if (streams.length === 0) {
      return enrichCacheParams([]);
    }

    streams = await applySorting(streams, config, args.type);
    console.log(`[DEBUG] Got ${streams.length} streams for ${args.id} after sorting`);
    if (streams.length === 0) {
      return enrichCacheParams([]);
    }

    streams = await applyStaticInfo(streams);
    console.log(`[DEBUG] Got ${streams.length} streams for ${args.id} after static info`);
    if (streams.length === 0) {
      return enrichCacheParams([]);
    }

    streams = await applyMochs(streams, config);
    console.log(`[DEBUG] Got ${streams.length} streams for ${args.id} after mochs`);
    
    const result = enrichCacheParams(streams);
    console.log(`[DEBUG] Returning ${result.streams.length} streams to Stremio for ${args.id}`);
    return result;
  } catch (error) {
    console.error(`[ERROR] Failed request ${args.id}: ${error}`);
    throw `Failed request ${args.id}: ${error}`;
  }
});

builder.defineCatalogHandler(async (args) => {
  const [_, mochKey, catalogId] = args.id.split('-');
  console.log(`Incoming catalog ${args.id} request with skip=${args.extra.skip || 0}`);
  console.log('[DEBUG] Catalog handler args:', JSON.stringify(args, null, 2));
  
  // Create a merged config object that includes both extra and config
  const config = {
    ...args.extra,
    ...(args.config || {})
  };
  
  console.log('[DEBUG] Merged config:', JSON.stringify(config, null, 2));

  // Validate API key
  await validateApiKey(config);
  
  return getMochCatalog(mochKey, catalogId, config)
    .then(metas => ({
      metas: metas,
      cacheMaxAge: CATALOG_CACHE_MAX_AGE
    }))
    .catch(error => {
      return Promise.reject(`Failed retrieving catalog ${args.id}: ${JSON.stringify(error.message || error)}`);
    });
});

builder.defineMetaHandler(async (args) => {
  const [mochKey, metaId] = args.id.split(':');
  console.log(`Incoming debrid meta ${args.id} request`);
  console.log('[DEBUG] Meta handler args:', JSON.stringify(args, null, 2));
  
  // Create a merged config object that includes both extra and config
  const config = {
    ...args.extra,
    ...(args.config || {})
  };
  
  console.log('[DEBUG] Merged config:', JSON.stringify(config, null, 2));

  // Validate API key
  await validateApiKey(config);
  
  return getMochItemMeta(mochKey, metaId, config)
    .then(meta => ({
      meta: meta,
      cacheMaxAge: metaId === 'Downloads' ? 0 : CACHE_MAX_AGE
    }))
    .catch(error => {
      return Promise.reject(`Failed retrieving catalog meta ${args.id}: ${JSON.stringify(error)}`);
    });
});

async function resolveStreams(args, config) {
  // First check if we have cached results
  const cachedResults = await cacheWrapStream(args.id, () => Promise.resolve([]));

  if (cachedResults && cachedResults.length > 0) {
    console.log(`[DEBUG] Returning ${cachedResults.length} cached results for ${args.id}`);
    const filteredResults = cachedResults
        .filter(record => record && record.torrent) // Add safety check for torrent property
        .sort((a, b) => {
          // Add safety checks for seeders and uploadDate
          const aSeeder = a.torrent?.seeders || 0;
          const bSeeder = b.torrent?.seeders || 0;
          const aDate = a.torrent?.uploadDate || 0;
          const bDate = b.torrent?.uploadDate || 0;
          return bSeeder - aSeeder || bDate - aDate;
        })
        .map(record => toStreamInfo(record));

    if(filteredResults.length > 0) {
      console.log(`[DEBUG] Returning ${filteredResults.length} filtered results for ${args.id}`);
      return filteredResults;
    }
  }

  console.log(`[DEBUG] No cached results for ${args.id}, proceeding with streamHandler...`);

  // Set a timeout for waiting for results
  const SEARCH_TIMEOUT = 30000; // 30 seconds timeout

  // Create a timeout promise
  const timeoutPromise = new Promise(resolve => {
    setTimeout(() => {
      console.log(`Search timeout reached for ${args.id}`);
      resolve([]);
    }, SEARCH_TIMEOUT);
  });

  // Race the streamHandler promise against the timeout
  return Promise.race([
    newLimiter(() => streamHandler(args, config)
      .then(records => {
        // Add debug logging for new results too
        if (records.length > 0) {
          console.log('[DEBUG] First new result structure:', JSON.stringify(records[0], null, 2));
        }
        
        const validRecords = records.filter(record => record && record.torrent);
        console.log(`[DEBUG] Found ${validRecords.length} valid new results with torrent property out of ${records.length} total results`);
        
        return validRecords
          .sort((a, b) => {
            // Add safety checks for seeders and uploadDate
            const aSeeder = a.torrent?.seeders || 0;
            const bSeeder = b.torrent?.seeders || 0;
            const aDate = a.torrent?.uploadDate || 0;
            const bDate = b.torrent?.uploadDate || 0;
            return bSeeder - aSeeder || bDate - aDate;
          })
          .map(record => toStreamInfo(record));
      })),
    timeoutPromise
  ]);
}

async function streamHandler(args, config) {
  console.log(`[DEBUG] Processing stream request for ${args.id}`);
  if (args.type === Type.MOVIE) {
    return movieRecordsHandler(args, config);
  } else if (args.type === Type.SERIES) {
    return seriesRecordsHandler(args, config);
  }
  return Promise.reject('not supported type');
}

async function seriesRecordsHandler(args, config) {
  if (args.id.match(/^tt\d+:\d+:\d+$/)) {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    const season = parts[1] !== undefined ? parseInt(parts[1], 10) : 1;
    const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : 1;
    
    console.log(`[DEBUG] Checking database for series ${imdbId} S${season}E${episode}`);
    // First check the database for existing entries
    const dbResults = await repository.getImdbIdSeriesEntries(imdbId, season, episode);
    console.log(`[DEBUG] Found ${dbResults.length} results in database for ${imdbId} S${season}E${episode}`);
    
    // If we have enough results from the database, return them without searching Prowlarr
    if (dbResults.length >= 5) {
      console.log(`[DEBUG] Returning ${dbResults.length} results from database for ${imdbId} S${season}E${episode}`);
      return dbResults;
    }
    
    // Get metadata for the series to get the title
    console.log(`[DEBUG] Getting title for ${imdbId}`);
    const title = await getTitle(imdbId);
    
    // If we couldn't get a title, just return database results
    if (!title) {
      console.log(`[DEBUG] Could not get title for ${imdbId}, returning database results only (${dbResults.length})`);
      return dbResults;
    }
    
    // Get selected providers from config
    const selectedProviders = config?.providers || [];
    
    // Use Prowlarr scraper if enabled
    if (process.env.PROWLARR_API_KEY) {
      console.log(`[DEBUG] Searching Prowlarr for ${title} S${season}E${episode}`);
      return searchContent(title, Type.SERIES, imdbId, null, season, episode, selectedProviders);
    }
    
    return dbResults;
  } else if (args.id.match(/^kitsu:\d+(?::\d+)?$/i)) {
    const parts = args.id.split(':');
    const kitsuId = parts[1];
    const episode = parts[2] !== undefined ? parseInt(parts[2], 10) : undefined;
    
    // For Kitsu IDs, check database first
    if (episode !== undefined) {
      console.log(`[DEBUG] Checking database for Kitsu ${kitsuId} E${episode}`);
      const dbResults = await repository.getKitsuIdSeriesEntries(kitsuId, episode);
      console.log(`[DEBUG] Found ${dbResults.length} results in database for Kitsu ${kitsuId} E${episode}`);
      
      // If we have enough results from the database, return them
      if (dbResults.length >= 5) {
        console.log(`[DEBUG] Returning ${dbResults.length} results from database for Kitsu ${kitsuId} E${episode}`);
        return dbResults;
      }
    } else {
      console.log(`[DEBUG] Checking database for Kitsu movie ${kitsuId}`);
      const dbResults = await repository.getKitsuIdMovieEntries(kitsuId);
      console.log(`[DEBUG] Found ${dbResults.length} results in database for Kitsu movie ${kitsuId}`);
      
      // If we have enough results from the database, return them
      if (dbResults.length >= 5) {
        console.log(`[DEBUG] Returning ${dbResults.length} results from database for Kitsu movie ${kitsuId}`);
        return dbResults;
      }
    }
    
    // For Kitsu IDs, we would need to get the title from a Kitsu API
    // This is a placeholder - you would need to implement a function to get the title
    let title = '';
    
    // Get selected providers from config
    const selectedProviders = config?.providers || [];
    
    // Use Prowlarr scraper if enabled
    if (process.env.PROWLARR_API_KEY && episode !== undefined && title) {
      console.log(`[DEBUG] Searching Prowlarr for Kitsu ${kitsuId} title: ${title}`);
      return searchContent(title, Type.SERIES, null, kitsuId, null, episode, selectedProviders);
    }
    
    return episode !== undefined
      ? repository.getKitsuIdSeriesEntries(kitsuId, episode)
      : repository.getKitsuIdMovieEntries(kitsuId);
  }
  return Promise.resolve([]);
}

async function movieRecordsHandler(args, config) {
  if (args.id.match(/^tt\d+$/)) {
    const parts = args.id.split(':');
    const imdbId = parts[0];
    
    console.log(`[DEBUG] Checking database for movie ${imdbId}`);
    // First check the database for existing entries
    const dbResults = await repository.getImdbIdMovieEntries(imdbId);
    console.log(`[DEBUG] Found ${dbResults.length} results in database for movie ${imdbId}`);
    
    // If we have enough results from the database, return them without searching Prowlarr
    if (dbResults.length >= 5) {
      console.log(`[DEBUG] Returning ${dbResults.length} results from database for movie ${imdbId}`);
      return dbResults;
    }
    
    // Get metadata for the movie to get the title
    console.log(`[DEBUG] Getting title for ${imdbId}`);
    const title = await getTitle(imdbId);
    
    // If we couldn't get a title, just return database results
    if (!title) {
      console.log(`[DEBUG] Could not get title for ${imdbId}, returning database results only (${dbResults.length})`);
      return dbResults;
    }
    
    // Get selected providers from config
    const selectedProviders = config?.providers || [];
    
    // Use Prowlarr scraper if enabled
    if (process.env.PROWLARR_API_KEY) {
      console.log(`[DEBUG] Searching Prowlarr for movie ${title}`);
      return searchContent(title, Type.MOVIE, imdbId, null, null, null, selectedProviders);
    }
    
    return dbResults;
  } else if (args.id.match(/^kitsu:\d+$/i)) {
    const parts = args.id.split(':');
    const kitsuId = parts[1];
    
    console.log(`[DEBUG] Checking database for Kitsu movie ${kitsuId}`);
    // First check the database for existing entries
    const dbResults = await repository.getKitsuIdMovieEntries(kitsuId);
    console.log(`[DEBUG] Found ${dbResults.length} results in database for Kitsu movie ${kitsuId}`);
    
    // If we have enough results from the database, return them without searching Prowlarr
    if (dbResults.length >= 5) {
      console.log(`[DEBUG] Returning ${dbResults.length} results from database for Kitsu movie ${kitsuId}`);
      return dbResults;
    }
    
    // For Kitsu IDs, we would need to get the title from a Kitsu API
    // This is a placeholder - you would need to implement a function to get the title
    let title = '';
    
    // Get selected providers from config
    const selectedProviders = config?.providers || [];
    
    // Use Prowlarr scraper if enabled
    if (process.env.PROWLARR_API_KEY && title) {
      console.log(`[DEBUG] Searching Prowlarr for Kitsu movie ${title}`);
      return searchContent(title, Type.MOVIE, null, kitsuId, null, null, selectedProviders);
    }
    
    return dbResults;
  }
  return Promise.resolve([]);
}

function enrichCacheParams(streams) {
  let cacheAge = CACHE_MAX_AGE;
  if (!streams.length) {
    cacheAge = CACHE_MAX_AGE_EMPTY;
  } else if (streams.every(stream => stream?.url?.endsWith(StaticLinks.FAILED_ACCESS))) {
    cacheAge = 0;
  }
  return {
    streams: streams,
    cacheMaxAge: cacheAge,
    staleRevalidate: STALE_REVALIDATE_AGE,
    staleError: STALE_ERROR_AGE
  };
}

export default builder.getInterface();
