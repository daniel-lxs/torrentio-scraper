import axios from 'axios';
import magnet from 'magnet-uri';
import { getRandomUserAgent } from './requestHelper.js';
import { getTorrent } from './repository.js';
import { Type } from './types.js';
import { extractProvider } from "./titleHelper.js";
import { Providers } from "./filter.js";

const TRACKERS_URL = 'https://raw.githubusercontent.com/ngosang/trackerslist/master/trackers_best.txt';
const ANIME_TRACKERS = [
  "http://nyaa.tracker.wf:7777/announce",
  "http://anidex.moe:6969/announce",
  "http://tracker.anirena.com:80/announce",
  "udp://tracker.uw0.xyz:6969/announce",
  "http://share.camoe.cn:8080/announce",
  "http://t.nyaatracker.com:80/announce",
];
const RUSSIAN_TRACKERS = [
  "udp://opentor.net:6969",
  "http://bt.t-ru.org/ann?magnet",
  "http://bt2.t-ru.org/ann?magnet",
  "http://bt3.t-ru.org/ann?magnet",
  "http://bt4.t-ru.org/ann?magnet",
];
// Some trackers have limits on original torrent trackers,
// where downloading ip has to seed the torrents for some amount of time,
// thus it doesn't work on mochs.
// So it's better to exclude them and try to download through DHT,
// as the torrent won't start anyway.
const RUSSIAN_PROVIDERS = Providers.options
    .filter(provider => provider.foreign === '🇷🇺')
    .map(provider => provider.label);
const ANIME_PROVIDERS = Providers.options
    .filter(provider => provider.anime)
    .map(provider => provider.label);
let BEST_TRACKERS = [];
let ALL_ANIME_TRACKERS = [];
let ALL_RUSSIAN_TRACKERS = [];

/**
 * Extract infoHash from a magnet link
 * @param {string} magnetLink - The magnet link to extract from
 * @returns {string|undefined} - The infoHash or undefined if not found
 */
export function extractInfoHash(magnetLink) {
  if (!magnetLink) return undefined;
  
  try {
    const parsed = magnet(magnetLink);
    return parsed.infoHash ? parsed.infoHash.toLowerCase() : undefined;
  } catch (error) {
    console.error('Error extracting infoHash:', error.message);
    
    // Fallback to regex if magnet-uri fails
    const match = magnetLink.match(/urn:btih:([^&]+)/i);
    return match ? match[1].toLowerCase() : undefined;
  }
}

/**
 * Generate a magnet link from an infoHash
 * @param {string} infoHash - The infoHash to use
 * @returns {string} - The generated magnet link
 */
export async function getMagnetLink(infoHash) {
  if (!infoHash) return '';
  
  const torrent = await getTorrent(infoHash).catch(() => ({ infoHash }));
  const torrentTrackers = torrent?.trackers?.split(',') || [];
  const animeTrackers = torrent?.type === Type.ANIME ? ALL_ANIME_TRACKERS : [];
  const providerTrackers = RUSSIAN_PROVIDERS.includes(torrent?.provider) && ALL_RUSSIAN_TRACKERS || [];
  const trackers = unique([].concat(torrentTrackers).concat(animeTrackers).concat(providerTrackers));
  
  const magnetParams = {
    xt: `urn:btih:${infoHash}`,
    tr: trackers
  };
  
  if (torrent?.title) {
    magnetParams.dn = encodeURIComponent(torrent.title);
  }
  
  return magnet.encode(magnetParams);
}

export async function initBestTrackers() {
  BEST_TRACKERS = await getBestTrackers();
  ALL_ANIME_TRACKERS = unique(BEST_TRACKERS.concat(ANIME_TRACKERS));
  ALL_RUSSIAN_TRACKERS = unique(BEST_TRACKERS.concat(RUSSIAN_TRACKERS));
  console.log('Retrieved best trackers: ', BEST_TRACKERS);
}

async function getBestTrackers(retry = 2) {
  const options = { timeout: 30000, headers: { 'User-Agent': getRandomUserAgent() } };
  return axios.get(TRACKERS_URL, options)
      .then(response => response?.data?.trim()?.split('\n\n') || [])
      .catch(error => {
        if (retry === 0) {
          console.log(`Failed retrieving best trackers: ${error.message}`);
          throw error;
        }
        return getBestTrackers(retry - 1);
      });
}

export function getSources(trackersInput, infoHash) {
  if (!trackersInput) {
    return null;
  }
  const trackers = Array.isArray(trackersInput) ? trackersInput : trackersInput.split(',');
  return trackers.map(tracker => `tracker:${tracker}`).concat(`dht:${infoHash}`);
}

export function enrichStreamSources(stream) {
  const provider = extractProvider(stream.title);
  if (ANIME_PROVIDERS.includes(provider)) {
    const sources = getSources(ALL_ANIME_TRACKERS, stream.infoHash);
    return { ...stream, sources };
  }
  if (RUSSIAN_PROVIDERS.includes(provider)) {
    const sources = unique([].concat(stream.sources || []).concat(getSources(ALL_RUSSIAN_TRACKERS, stream.infoHash)));
    return { ...stream, sources };
  }
  return stream;
}

function unique(array) {
  return Array.from(new Set(array));
}
