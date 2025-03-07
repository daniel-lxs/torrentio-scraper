import { createClient } from 'redis';

const CATALOG_TTL = 24 * 60 * 60; // 24 hours in seconds

const REDIS_URI = process.env.REDIS_URI || 'redis://localhost:6379';

// Create Redis client
let redisClient;
let redisConnected = false;

async function getRedisClient() {
  if (!redisClient) {
    redisClient = createClient({ url: REDIS_URI });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error', err);
      redisConnected = false;
    });
    
    redisClient.on('connect', () => {
      console.log('Redis client connected');
      redisConnected = true;
    });
    
    await redisClient.connect();
  }
  
  return redisConnected ? redisClient : null;
}

async function cacheWrap(key, method, ttl) {
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
    await redis.setEx(key, ttl, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error(`Cache error for key ${key}:`, error);
    return method();
  }
}

export function cacheWrapCatalog(key, method) {
  return cacheWrap(key, method, CATALOG_TTL);
}

export function cacheWrapIds(key, method) {
  return cacheWrap(`ids|${key}`, method, CATALOG_TTL);
}
