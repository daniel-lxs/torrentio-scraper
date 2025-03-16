// Cache TTL constants in seconds
export const CACHE_TTL = {
  // Stream caching
  STREAM: 24 * 60 * 60,           // 24 hours (for stream data)
  STREAM_EMPTY: 60,               // 1 minute (for empty stream results)
  
  // URL caching
  RESOLVED_URL: 3 * 60 * 60,      // 3 hours (for resolved URLs)
  MESSAGE_VIDEO_URL: 60,          // 1 minute (for static message videos)
  
  // Availability caching
  AVAILABILITY: 7 * 24 * 60 * 60, // 7 days (unified availability/played TTL)
  
  // Database refresh
  DATABASE_REFRESH: 24 * 60 * 60, // 24 hours (for Prowlarr results)
};

// Stremio-specific cache settings
export const STREMIO_CACHE = {
  MAX_AGE: 60 * 60,              // 1 hour
  MAX_AGE_EMPTY: 60,             // 1 minute
  STALE_REVALIDATE: 4 * 60 * 60, // 4 hours
  STALE_ERROR: 7 * 24 * 60 * 60, // 7 days
};
