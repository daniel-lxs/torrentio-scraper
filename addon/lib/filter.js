import { parseSize, extractSize } from './titleHelper.js';
import { Type } from './types.js';
import { getIndexers } from './scraper/prowlarr.js';
import { setTimeout, setInterval } from 'timers/promises';

// Legacy providers list - will be used as fallback if Prowlarr is not available
export const LegacyProviders = {
  key: 'providers',
  options: [
    {
      key: 'yts',
      label: 'YTS'
    },
    {
      key: 'eztv',
      label: 'EZTV'
    },
    {
      key: 'rarbg',
      label: 'RARBG'
    },
    {
      key: '1337x',
      label: '1337x'
    },
    {
      key: 'thepiratebay',
      label: 'ThePirateBay'
    },
    {
      key: 'kickasstorrents',
      label: 'KickassTorrents'
    },
    {
      key: 'torrentgalaxy',
      label: 'TorrentGalaxy'
    },
    {
      key: 'magnetdl',
      label: 'MagnetDL'
    },
    {
      key: 'horriblesubs',
      label: 'HorribleSubs',
      anime: true
    },
    {
      key: 'nyaasi',
      label: 'NyaaSi',
      anime: true
    },
    {
      key: 'tokyotosho',
      label: 'TokyoTosho',
      anime: true
    },
    {
      key: 'anidex',
      label: 'AniDex',
      anime: true
    },
    {
      key: 'rutor',
      label: 'Rutor',
      foreign: '🇷🇺'
    },
    {
      key: 'rutracker',
      label: 'Rutracker',
      foreign: '🇷🇺'
    },
    {
      key: 'comando',
      label: 'Comando',
      foreign: '🇵🇹'
    },
    {
      key: 'bludv',
      label: 'BluDV',
      foreign: '🇵🇹'
    },
    {
      key: 'torrent9',
      label: 'Torrent9',
      foreign: '🇫🇷'
    },
    {
      key: 'ilcorsaronero',
      label: 'ilCorSaRoNeRo',
      foreign: '🇮🇹'
    },
    {
      key: 'mejortorrent',
      label: 'MejorTorrent',
      foreign: '🇪🇸'
    },
    {
      key: 'wolfmax4k',
      label: 'Wolfmax4k',
      foreign: '🇪🇸'
    },
    {
      key: 'cinecalidad',
      label: 'Cinecalidad',
      foreign: '🇲🇽'
    },
    {
      key: 'besttorrents',
      label: 'BestTorrents',
      foreign: '🇵🇱'
    },
  ]
};

// Initialize Providers with legacy options, will be updated with Prowlarr indexers
export const Providers = {
  key: 'providers',
  options: [...LegacyProviders.options],
  lastUpdate: 0, // Timestamp of last update
  updating: false // Flag to prevent concurrent updates
};

// Cache duration in milliseconds (5 minutes)
const PROVIDER_CACHE_DURATION = 5 * 60 * 1000;

// Function to check if providers need refresh
function needsRefresh() {
  const now = Date.now();
  return now - Providers.lastUpdate > PROVIDER_CACHE_DURATION;
}

// Function to refresh providers
export async function refreshProviders(force = false) {
  // If already updating, wait for it to finish
  if (Providers.updating) {
    console.log('[INFO] Provider refresh already in progress, waiting...');
    while (Providers.updating) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return;
  }

  // Check if refresh is needed
  if (!force && !needsRefresh()) {
    return;
  }

  try {
    Providers.updating = true;
    console.log('[INFO] Refreshing Prowlarr providers...');
    const indexers = await getIndexers();
    
    if (indexers && indexers.length > 0) {
      Providers.options = indexers;
      Providers.lastUpdate = Date.now();
      console.log(`[INFO] Successfully refreshed ${indexers.length} providers from Prowlarr`);
    } else {
      console.warn('[WARN] No indexers found in Prowlarr during refresh');
    }
  } catch (error) {
    console.error(`[ERROR] Failed to refresh providers from Prowlarr: ${error.message}`);
  } finally {
    Providers.updating = false;
  }
}

// Set up periodic refresh (every 5 minutes)
if (process.env.PROWLARR_API_KEY) {
  setInterval(() => refreshProviders(), PROVIDER_CACHE_DURATION);
  // Initial refresh
  refreshProviders(true).catch(error => {
    console.error(`[ERROR] Error during initial provider refresh: ${error.message}`);
  });
}

export const QualityFilter = {
  key: 'qualityfilter',
  options: [
    {
      key: 'brremux',
      label: 'BluRay REMUX',
      test(quality, bingeGroup) {
        return bingeGroup?.includes(this.label);
      }
    },
    {
      key: 'hdrall',
      label: 'HDR/HDR10+/Dolby Vision',
      items: ['HDR', 'HDR10+', 'DV'],
      test(quality) {
        const hdrProfiles = quality?.split(' ')?.slice(1)?.join() || '';
        return this.items.some(hdrType => hdrProfiles.includes(hdrType));
      }
    },
    {
      key: 'dolbyvision',
      label: 'Dolby Vision',
      test(quality) {
        const hdrProfiles = quality?.split(' ')?.slice(1)?.join() || '';
        return hdrProfiles === 'DV';
      }
    },
    {
      key: 'dolbyvisionwithhdr',
      label: 'Dolby Vision + HDR',
      test(quality) {
        const hdrProfiles = quality?.split(' ')?.slice(1)?.join() || '';
        return hdrProfiles.includes('DV') && hdrProfiles.includes('HDR');
      }
    },
    {
      key: 'threed',
      label: '3D',
      test(quality) {
        const hdrProfiles = quality?.split(' ')?.slice(1)?.join() || '';
        return hdrProfiles.includes('3D');
      }
    },
    {
      key: 'nonthreed',
      label: 'Non 3D (DO NOT SELECT IF NOT SURE)',
      test(quality) {
        const hdrProfiles = quality?.split(' ')?.slice(1)?.join() || '';
        return !hdrProfiles.includes('3D');
      }
    },
    {
      key: '4k',
      label: '4k',
      items: ['4k'],
      test(quality) {
        return quality && this.items.includes(quality.split(' ')[0]);
      }
    },
    {
      key: '1080p',
      label: '1080p',
      items: ['1080p'],
      test(quality) {
        return this.items.includes(quality)
      }
    },
    {
      key: '720p',
      label: '720p',
      items: ['720p'],
      test(quality) {
        return this.items.includes(quality)
      }
    },
    {
      key: '480p',
      label: '480p',
      items: ['480p'],
      test(quality) {
        return this.items.includes(quality)
      }
    },
    {
      key: 'other',
      label: 'Other (DVDRip/HDRip/BDRip...)',
      // could be ['DVDRip', 'HDRip', 'BDRip', 'BRRip', 'BluRay', 'WEB-DL', 'WEBRip', 'HDTV', 'DivX', 'XviD']
      items: ['4k', '1080p', '720p', '480p', 'SCR', 'CAM', 'TeleSync', 'TeleCine'],
      test(quality) {
        return quality && !this.items.includes(quality.split(' ')[0]);
      }
    },
    {
      key: 'scr',
      label: 'Screener',
      items: ['SCR'],
      test(quality) {
        return this.items.includes(quality)
      }
    },
    {
      key: 'cam',
      label: 'Cam',
      items: ['CAM', 'TeleSync', 'TeleCine'],
      test(quality) {
        return this.items.includes(quality)
      }
    },
    {
      key: 'unknown',
      label: 'Unknown',
      test(quality) {
        return !quality
      }
    }
  ]
};

export const SizeFilter = {
  key: 'sizefilter'
}


export default function applyFilters(streams, config) {
  return [
    filterByQuality,
    filterBySize
  ].reduce((filteredStreams, filter) => filter(filteredStreams, config), streams);
}



function filterByQuality(streams, config) {
  const filters = config[QualityFilter.key];
  if (!filters) {
    return streams;
  }
  
  console.log(`[DEBUG] Filtering by quality: ${filters.join(', ')}`);
  const filterOptions = QualityFilter.options.filter(option => filters.includes(option.key));
  return streams.filter(stream => {
    const streamQuality = stream.name.split('\n')[1];
    const bingeGroup = stream.behaviorHints?.bingeGroup;
    const filtered = !filterOptions.some(option => option.test(streamQuality, bingeGroup));
    if (!filtered) {
      console.log(`[DEBUG] Stream filtered out by quality: ${streamQuality}`);
    }
    return filtered;
  });
}

function filterBySize(streams, config) {
  const sizeFilters = config[SizeFilter.key];
  if (!sizeFilters?.length) {
    return streams;
  }
  
  console.log(`[DEBUG] Filtering by size: ${sizeFilters.join(', ')}`);
  const sizeLimit = parseSize(config.type === Type.MOVIE ? sizeFilters.shift() : sizeFilters.pop());
  return streams.filter(stream => {
    const size = extractSize(stream.title);
    const withinLimit = size <= sizeLimit;
    if (!withinLimit) {
      console.log(`[DEBUG] Stream filtered out by size: ${size} > ${sizeLimit}`);
    }
    return withinLimit;
  });
}
