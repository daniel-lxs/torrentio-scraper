import axios from 'axios';
import { Type } from '../types.js';
import * as repository from '../repository.js';
import { extractInfoHash } from '../magnetHelper.js';
import * as ptt from 'parse-torrent-title';

// Constants
const PROWLARR_BASE_URL = process.env.PROWLARR_BASE_URL || 'http://localhost:9696';
const PROWLARR_API_KEY = process.env.PROWLARR_API_KEY;
const SEARCH_LIMIT = parseInt(process.env.PROWLARR_SEARCH_LIMIT) || 100;
const PARALLEL_REQUESTS = parseInt(process.env.PROWLARR_PARALLEL_REQUESTS) || 10;

// Define parseTorrentTitle function
const parseTorrentTitle = (title) => {
  try {
    return ptt.parse(title) || {};
  } catch (error) {
    console.error(`Error parsing torrent title: ${error.message}`);
    return {};
  }
};

// Create a configured axios instance for Prowlarr
function createProwlarrClient() {
  return axios.create({
    baseURL: PROWLARR_BASE_URL,
    headers: {
      'X-Api-Key': PROWLARR_API_KEY
    },
    timeout: 30000 // 30 seconds timeout
  });
}

// Format search query for TV shows
function formatTVQuery(title, season, episode) {
  if (season === undefined) {
    return title;
  }
  
  // Format: Show Title S01E01
  const seasonStr = season.toString().padStart(2, '0');
  const episodeStr = episode !== undefined ? 
    episode.toString().padStart(2, '0') : '';
  
  return `${title} S${seasonStr}${episodeStr ? `E${episodeStr}` : ''}`;
}

// Get appropriate categories based on content type
function getCategories(type) {
  // Prowlarr category IDs:
  // 2000: Movies
  // 5000: TV
  // 3000: Audio
  // 1000: Console
  // 4000: PC
  // 6000: XXX
  // 7000: Books
  // 8000: Other
  return type === Type.MOVIE ? [2000] : [5000];
}

// Helper function to chunk an array into smaller arrays
function chunkArray(array, chunkSize) {
  const chunks = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

// Helper function to process a single result and get magnet link
async function processSingleResult(result, type, imdbId, kitsuId, season, episode) {
  try {
    // Get magnet link from downloadUrl if available
    let magnetUrl = null;
    
    if (result.downloadUrl) {
      try {
        console.log(`Getting magnet link from downloadUrl: ${result.downloadUrl}`);
        
        // Make a GET request without following redirects
        const response = await axios.get(result.downloadUrl, {
          maxRedirects: 0,
          headers: {
            'User-Agent': 'curl/8.12.1' // Match curl's UA
          }
        });
        
        // Check for Location header (case insensitive)
        const location = response.headers.location || response.headers.Location;
        
        if (location && location.startsWith('magnet:')) {
          magnetUrl = location;
          console.log(`Successfully obtained magnet link from redirect header`);
        } else {
          console.log(`No magnet link in Location header: ${JSON.stringify(response.headers)}`);
        }
      } catch (error) {
        // Even in case of error, check if we got a redirect in the error response
        if (error.response && error.response.headers) {
          const location = error.response.headers.location || error.response.headers.Location;
          if (location && location.startsWith('magnet:')) {
            magnetUrl = location;
            console.log(`Successfully obtained magnet link from error response redirect header`);
          } else {
            console.error(`Error getting magnet link: ${error.message}`);
          }
        } else {
          console.error(`Error getting magnet link: ${error.message}`);
        }
      }
    }
    
    // Skip results without magnet links
    if (!magnetUrl) {
      console.log(`No magnet link found for result: ${result.title}`);
      return null;
    }

    // Extract infoHash from magnet link
    const infoHash = extractInfoHash(magnetUrl);
    if (!infoHash) {
      console.log(`Could not extract infoHash from magnet link for: ${result.title}`);
      return null;
    }

    console.log(`Successfully processed result: ${result.title} with infoHash: ${infoHash}`);

    // Parse torrent title to extract additional metadata
    const parsedTitle = parseTorrentTitle(result.title);
    const now = new Date();
    
    // Create torrent record
    const torrent = {
      infoHash: infoHash,
      provider: result.indexer,
      torrentId: result.guid,
      title: result.title,
      size: result.size,
      type: type,
      uploadDate: result.publishDate || now,
      seeders: result.seeders || 0,
      trackers: magnetUrl.match(/tr=([^&]+)/g)?.join(',') || '',
      languages: parsedTitle.languages?.join(',') || '',
      resolution: parsedTitle.resolution || ''
    };

    // Create file record
    const file = {
      infoHash: infoHash,
      fileIndex: 0, // Default to first file
      title: result.title,
      size: result.size
    };

    // Add media identifiers
    if (type === Type.MOVIE) {
      if (imdbId) file.imdbId = imdbId;
      if (kitsuId) file.kitsuId = kitsuId;
    } else if (type === Type.SERIES) {
      if (imdbId) {
        file.imdbId = imdbId;
        file.imdbSeason = season;
        file.imdbEpisode = episode;
      }
      if (kitsuId) {
        file.kitsuId = kitsuId;
        file.kitsuEpisode = episode;
      }
    }

    return { torrent, file };
  } catch (error) {
    console.error(`Error processing search result: ${error.message}`, result);
    return null;
  }
}

// Search for content on Prowlarr
async function searchProwlarr(title, type, season, episode) {
  if (!PROWLARR_API_KEY) {
    console.error('Prowlarr API key not configured');
    return { error: 'Prowlarr API key not configured' };
  }

  // Check if title is empty
  if (!title || title.trim() === '') {
    console.error('Cannot search Prowlarr with empty title');
    return { error: 'Empty title provided for search' };
  }

  try {
    const client = createProwlarrClient();
    const categories = getCategories(type);
    const searchQuery = type === Type.SERIES ? 
      formatTVQuery(title, season, episode) : 
      title;

    console.log(`Searching Prowlarr for: ${searchQuery} (${type})`);

    const response = await client.get('/api/v1/search', {
      params: {
        query: searchQuery,
        categories: categories.join(','),
        type: 'search',
        limit: SEARCH_LIMIT
      }
    });

    if (Array.isArray(response.data) && response.data.length > 0) {
      console.log(`Prowlarr returned ${response.data.length} results`);
      // Log a sample result for debugging
      if (response.data[0]) {
        console.log(`Sample result: ${JSON.stringify(response.data[0], null, 2)}`);
      }
    } else {
      console.log(`Prowlarr returned no results for query: ${searchQuery}`);
    }

    return response.data;
  } catch (error) {
    console.error('Error searching Prowlarr:', error.message);
    return { error: `Failed to search Prowlarr: ${error.message}` };
  }
}

// Process Prowlarr search results and save to database
async function processSearchResults(results, type, imdbId, kitsuId, season, episode) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  const torrents = [];
  const files = [];

  // Process results in parallel, 10 at a time
  const chunks = chunkArray(results, PARALLEL_REQUESTS);
  console.log(`Processing ${results.length} results in ${chunks.length} batches of up to ${PARALLEL_REQUESTS}`);

  for (const [index, chunk] of chunks.entries()) {
    console.log(`Processing batch ${index + 1}/${chunks.length} with ${chunk.length} results`);
    
    // Process each chunk in parallel
    const chunkResults = await Promise.all(
      chunk.map(result => processSingleResult(result, type, imdbId, kitsuId, season, episode))
    );
    
    // Filter out null results and add to torrents and files arrays
    for (const result of chunkResults) {
      if (result) {
        torrents.push(result.torrent);
        files.push(result.file);
      }
    }
  }

  // Save to database
  if (torrents.length > 0) {
    try {
      await repository.saveTorrentsAndFiles(torrents, files);
      console.log(`Saved ${torrents.length} torrents to database`);
    } catch (error) {
      console.error('Error saving torrents to database:', error.message);
    }
  }

  return files.map(file => ({
    ...file,
    torrent: torrents.find(t => t.infoHash === file.infoHash)
  }));
}

// Main search function that combines searching and processing
export async function searchContent(title, type, imdbId, kitsuId, season, episode) {
  // First try to get from database
  let results = [];
  
  if (type === Type.MOVIE) {
    if (imdbId) {
      results = await repository.getImdbIdMovieEntries(imdbId);
    } else if (kitsuId) {
      results = await repository.getKitsuIdMovieEntries(kitsuId);
    }
  } else if (type === Type.SERIES) {
    if (imdbId && season !== undefined && episode !== undefined) {
      results = await repository.getImdbIdSeriesEntries(imdbId, season, episode);
    } else if (kitsuId && episode !== undefined) {
      results = await repository.getKitsuIdSeriesEntries(kitsuId, episode);
    }
  }

  // If we have enough results from the database, return them
  if (results.length >= 10) {
    console.log(`Found ${results.length} results in database for ${imdbId || kitsuId}`);
    return results;
  }

  // Check if title is valid before searching Prowlarr
  let searchTitle = title;
  if (!searchTitle || searchTitle.trim() === '') {
    // If no title is provided, return what we have from the database
    console.log(`Cannot search Prowlarr with empty title for ${imdbId || kitsuId}, returning ${results.length} database results`);
    return results;
  }

  // Otherwise, search Prowlarr
  console.log(`Not enough results in database, searching Prowlarr for ${searchTitle}`);
  const prowlarrResults = await searchProwlarr(searchTitle, type, season, episode);
  
  // If there was an error or no results, return what we have from the database
  if (prowlarrResults.error || !Array.isArray(prowlarrResults) || prowlarrResults.length === 0) {
    console.log(`No additional results from Prowlarr, returning ${results.length} database results`);
    return results;
  }

  console.log(`Processing ${prowlarrResults.length} results from Prowlarr`);
  
  // Process and save the results
  const processedResults = await processSearchResults(
    prowlarrResults, 
    type, 
    imdbId, 
    kitsuId, 
    season, 
    episode
  );

  console.log(`Successfully processed ${processedResults.length} results from Prowlarr`);

  // Combine database results with new results, removing duplicates
  const allInfoHashes = new Set(results.map(r => r.infoHash));
  const newResults = processedResults.filter(r => !allInfoHashes.has(r.infoHash));
  
  const combinedResults = [...results, ...newResults];
  console.log(`Returning ${combinedResults.length} combined results (${results.length} from DB, ${newResults.length} new)`);
  
  return combinedResults;
}