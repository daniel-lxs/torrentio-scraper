import { createClient } from 'redis';
import { isStaticUrl }  from '../moch/static.js';
import { setTimeout } from 'timers/promises';

const GLOBAL_KEY_PREFIX = 'torrentio-addon';
const STREAM_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|stream`;
const AVAILABILITY_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|availability`;
const RESOLVED_URL_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|resolved`;
const PLAYED_TORRENT_KEY_PREFIX = `${GLOBAL_KEY_PREFIX}|played`;

const STREAM_TTL = 24 * 60 * 60; // 24 hours in seconds
const STREAM_EMPTY_TTL = 60; // 1 minute in seconds
const RESOLVED_URL_TTL = 3 * 60 * 60; // 3 hours in seconds
const AVAILABILITY_TTL = 5 * 24 * 60 * 60; // 5 days in seconds
const PLAYED_TORRENT_TTL = 7 * 24 * 60 * 60; // 7 days in seconds - how long to consider a torrent as "played"
const MESSAGE_VIDEO_URL_TTL = 60; // 1 minute in seconds
// When the streams are empty we want to cache it for less time in case of timeouts or failures

// Redis operation metrics
const redisMetrics = {
  totalOperations: 0,
  failedOperations: 0,
  lastError: null,
  lastErrorTime: null,
  connectionStatus: 'disconnected'
};

const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';
const REDIS_MAX_RETRIES = process.env.REDIS_MAX_RETRIES || 3;
const REDIS_RETRY_DELAY = process.env.REDIS_RETRY_DELAY || 1000; // ms

// Create Redis client
let redisClient;
let redisConnected = false;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({ url: REDIS_URI });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
      redisConnected = false;
      redisMetrics.connectionStatus = 'error';
      redisMetrics.lastError = err.message;
      redisMetrics.lastErrorTime = new Date().toISOString();
    });
    
    redisClient.on('connect', () => {
      console.log('Redis client connected');
      redisConnected = true;
      redisMetrics.connectionStatus = 'connected';
    });
    
    try {
      await redisClient.connect();
    } catch (error) {
      console.error('Failed to connect to Redis:', error);
      redisMetrics.connectionStatus = 'failed_to_connect';
      redisMetrics.lastError = error.message;
      redisMetrics.lastErrorTime = new Date().toISOString();
    }
  }
  
  return redisConnected ? redisClient : null;
}

// Helper function to execute Redis operations with retries
async function executeWithRetry(operation, retries = REDIS_MAX_RETRIES) {
  redisMetrics.totalOperations++;
  
  try {
    return await operation();
  } catch (error) {
    if (retries <= 0) {
      redisMetrics.failedOperations++;
      redisMetrics.lastError = error.message;
      redisMetrics.lastErrorTime = new Date().toISOString();
      throw error;
    }
    
    console.log(`Redis operation failed, retrying (${retries} attempts left): ${error.message}`);
    await setTimeout(REDIS_RETRY_DELAY);
    return executeWithRetry(operation, retries - 1);
  }
}

async function cacheWrap(key, method, ttlFunc) {
  const redis = await getRedisClient();
  
  if (!redis) {
    return method();
  }
  
  try {
    const value = await redis.get(key);
    if (value !== undefined && value !== null) {
      return JSON.parse(value);
    }
    
    const result = await method();
    const ttl = ttlFunc instanceof Function ? ttlFunc(result) : ttlFunc;
    
    await redis.setEx(key, ttl, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error(`Cache error for key ${key}:`, error);
    return method();
  }
}

export function cacheWrapStream(id, method) {
  // For stream requests, we want to wait for the method to complete
  // before returning a result, even if there's no cached value
  return async function() {
    console.log(`[DEBUG] Starting cacheWrapStream for ${id}`);
    const redis = await getRedisClient();
    
    if (!redis) {
      console.log(`[DEBUG] No Redis client available for ${id}, falling back to direct method call`);
      return method();
    }
    
    const key = `${STREAM_KEY_PREFIX}:${id}`;
    
    try {
      // Check if we have a cached value
      console.log(`[DEBUG] Checking Redis cache for ${id}`);
      const value = await redis.get(key);
      if (value !== undefined && value !== null) {
        console.log(`[DEBUG] Found cached value for ${id} with ${JSON.parse(value).length} results`);
        // Parse the cached data and reconstruct the structure
        const parsed = JSON.parse(value);
        const result = parsed.map(record => ({
          ...record,
          torrent: record.Torrent || record.torrent // Handle both capitalized and lowercase
        }));
        result._fromCache = true;
        return result;
      }
      
      // No cached value, execute the method
      console.log(`[DEBUG] No cached streams for ${id}, starting search...`);
      const result = await method();
      console.log(`[DEBUG] Search completed for ${id}, found ${result.length} results`);
      
      // Prepare data for caching by explicitly structuring it
      const toCache = result.map(record => ({
        ...record.get({ plain: true }), // Convert Sequelize model to plain object
        torrent: record.Torrent ? record.Torrent.get({ plain: true }) : record.torrent // Handle both model and plain object cases
      }));
      
      // Cache the result with appropriate TTL
      const ttl = result.length ? STREAM_TTL : STREAM_EMPTY_TTL;
      await redis.setEx(key, ttl, JSON.stringify(toCache));
      console.log(`[DEBUG] Cached ${result.length} results for ${id} with TTL ${ttl}`);
      
      return result;
    } catch (error) {
      console.error(`[ERROR] Cache error for key ${key}:`, error);
      console.log(`[DEBUG] Falling back to direct method call after error for ${id}`);
      return method();
    }
  }();
}

export function cacheWrapResolvedUrl(id, method) {
  const ttl = (url) => isStaticUrl(url) ? MESSAGE_VIDEO_URL_TTL : RESOLVED_URL_TTL;
  return cacheWrap(`${RESOLVED_URL_KEY_PREFIX}:${id}`, method, ttl);
}

export async function cacheAvailabilityResults(infoHash, fileIds) {
  const redis = await getRedisClient();
  if (!redis) return;
  
  const key = `${AVAILABILITY_KEY_PREFIX}:${infoHash}`;
  const fileIdsString = fileIds.toString();
  
  try {
    const resultStr = await redis.get(key);
    let result = resultStr ? JSON.parse(resultStr) : [];
    
    const containsFileIds = (array) => array.some(ids => ids.toString() === fileIdsString);
    
    if (!containsFileIds(result)) {
      result.push(fileIds);
      result.sort((a, b) => b.length - a.length);
      await redis.setEx(key, AVAILABILITY_TTL, JSON.stringify(result));
    }
  } catch (error) {
    console.error(`Error caching availability results for ${infoHash}:`, error);
  }
}

export async function removeAvailabilityResults(infoHash, fileIds) {
  const redis = await getRedisClient();
  if (!redis) return;
  
  const key = `${AVAILABILITY_KEY_PREFIX}:${infoHash}`;
  const fileIdsString = fileIds.toString();
  
  try {
    const resultStr = await redis.get(key);
    if (!resultStr) return;
    
    const result = JSON.parse(resultStr);
    const storedIndex = result.findIndex(ids => ids.toString() === fileIdsString);
    
    if (storedIndex >= 0) {
      result.splice(storedIndex, 1);
      await redis.setEx(key, AVAILABILITY_TTL, JSON.stringify(result));
    }
  } catch (error) {
    console.error(`Error removing availability results for ${infoHash}:`, error);
  }
}

export async function getCachedAvailabilityResults(infoHashes) {
  const redis = await getRedisClient();
  if (!redis) return {};
  
  try {
    const availabilityResults = {};
    const pipeline = redis.multi();
    
    infoHashes.forEach(infoHash => {
      pipeline.get(`${AVAILABILITY_KEY_PREFIX}:${infoHash}`);
    });
    
    const results = await pipeline.exec();
    
    if (results) {
      results.forEach((result, index) => {
        if (result) {
          const parsedResult = JSON.parse(result);
          if (parsedResult) {
            availabilityResults[infoHashes[index]] = parsedResult;
          }
        }
      });
    }
    
    return availabilityResults;
  } catch (error) {
    console.error('Failed to retrieve availability cache:', error);
    return {};
  }
}

// New function to mark a torrent as played
export async function markTorrentAsPlayed(infoHash, fileIndex) {
  const redis = await getRedisClient();
  if (!redis) {
    console.warn(`Cannot mark torrent as played: Redis client not available (${infoHash}:${fileIndex})`);
    return false;
  }
  
  const key = `${PLAYED_TORRENT_KEY_PREFIX}:${infoHash}:${fileIndex}`;
  
  try {
    // Store the current timestamp as the value
    await executeWithRetry(() => redis.setEx(key, PLAYED_TORRENT_TTL, Date.now().toString()));
    console.log(`[DEBUG] Marked torrent ${infoHash} [${fileIndex}] as played`);
    return true;
  } catch (error) {
    console.error(`Error marking torrent as played for ${infoHash}:${fileIndex}:`, error);
    return false;
  }
}

// New function to check if a torrent has been played recently
export async function isTorrentPlayed(infoHash, fileIndex) {
  const redis = await getRedisClient();
  if (!redis) {
    console.warn(`Cannot check if torrent is played: Redis client not available (${infoHash}:${fileIndex})`);
    return false;
  }
  
  const key = `${PLAYED_TORRENT_KEY_PREFIX}:${infoHash}:${fileIndex}`;
  
  try {
    const value = await executeWithRetry(() => redis.get(key));
    const result = value !== null;
    console.log(`[DEBUG] Checked if torrent ${infoHash} [${fileIndex}] is played: ${result}`);
    return result;
  } catch (error) {
    console.error(`Error checking if torrent is played for ${infoHash}:${fileIndex}:`, error);
    return false;
  }
}

// New function to get all played torrents for a list of info hashes
export async function getPlayedTorrents(infoHashes, fileIndexes) {
  const redis = await getRedisClient();
  if (!redis) {
    console.warn(`Cannot get played torrents: Redis client not available (${infoHashes.length} torrents)`);
    return {};
  }
  
  try {
    const playedResults = {};
    const pipeline = redis.multi();
    
    for (let i = 0; i < infoHashes.length; i++) {
      const infoHash = infoHashes[i];
      const fileIndex = fileIndexes[i];
      pipeline.get(`${PLAYED_TORRENT_KEY_PREFIX}:${infoHash}:${fileIndex}`);
    }
    
    const results = await executeWithRetry(() => pipeline.exec());
    let playedCount = 0;
    
    if (results) {
      results.forEach((result, index) => {
        if (result) {
          const infoHash = infoHashes[index];
          const fileIndex = fileIndexes[index];
          playedResults[`${infoHash}@${fileIndex}`] = true;
          playedCount++;
        }
      });
    }
    
    console.log(`[DEBUG] Retrieved ${playedCount} played torrents out of ${infoHashes.length} requested`);
    return playedResults;
  } catch (error) {
    console.error(`Failed to retrieve played torrents cache (${infoHashes.length} torrents):`, error);
    return {};
  }
}

// New function to get Redis metrics
export function getRedisMetrics() {
  return {
    ...redisMetrics,
    currentTime: new Date().toISOString()
  };
}
