import { extractProvider, parseSize, extractSize } from './titleHelper.js';
import { Type } from './types.js';
export const Providers = {
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
const defaultProviderKeys = Providers.options.map(provider => provider.key);

export default function applyFilters(streams, config) {
  return [
    filterByProvider,
    filterByQuality,
    filterBySize
  ].reduce((filteredStreams, filter) => filter(filteredStreams, config), streams);
}

function filterByProvider(streams, config) {
  // If we're using Prowlarr, skip provider filtering
  if (process.env.PROWLARR_API_KEY) {
    console.log(`[DEBUG] Skipping provider filtering because Prowlarr is enabled`);
    return streams;
  }
  
  const providers = config.providers || defaultProviderKeys;
  if (!providers?.length) {
    return streams;
  }
  
  console.log(`[DEBUG] Filtering by providers: ${providers.join(', ')}`);
  return streams.filter(stream => {
    const provider = extractProvider(stream.title)?.toLowerCase();
    if (!provider) {
      console.log(`[DEBUG] No provider found in stream title: ${stream.title}`);
      return true; // Include streams with no provider
    }
    const included = providers.includes(provider);
    if (!included) {
      console.log(`[DEBUG] Provider ${provider} not in allowed list`);
    }
    return included;
  });
}

function filterByQuality(streams, config) {
  // If we're using Prowlarr, skip quality filtering
  if (process.env.PROWLARR_API_KEY) {
    console.log(`[DEBUG] Skipping quality filtering because Prowlarr is enabled`);
    return streams;
  }
  
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
  // If we're using Prowlarr, skip size filtering
  if (process.env.PROWLARR_API_KEY) {
    console.log(`[DEBUG] Skipping size filtering because Prowlarr is enabled`);
    return streams;
  }
  
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
