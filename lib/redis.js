import { Redis } from '@upstash/redis';

// Initialize Redis client
// Note: Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to your .env.local
let redis = null;

// Only initialize Redis if environment variables are present
if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
  redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  console.log('✅ Redis client initialized successfully');
} else {
  console.warn('⚠️ Redis not configured - caching will be disabled');
  console.warn('Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env.local');
}

// Redis helper functions with graceful degradation
export const getCache = async (key) => {
  if (!redis) return null;
  
  try {
    const data = await redis.get(key);
    return data;
  } catch (error) {
    console.error('Redis GET error:', error);
    return null;
  }
};

export const setCache = async (key, value, ttlSeconds = 300) => {
  if (!redis) return false;
  
  try {
    await redis.set(key, value, { ex: ttlSeconds });
    return true;
  } catch (error) {
    console.error('Redis SET error:', error);
    return false;
  }
};

export const deleteCache = async (key) => {
  if (!redis) return false;
  
  try {
    await redis.del(key);
    return true;
  } catch (error) {
    console.error('Redis DELETE error:', error);
    return false;
  }
};

export const deleteCachePattern = async (pattern) => {
  if (!redis) return false;
  
  try {
    // Get all keys matching the pattern
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    return true;
  } catch (error) {
    console.error('Redis DELETE PATTERN error:', error);
    return false;
  }
};

/**
 * Invalidate cache for a specific table
 * Useful when data changes via real-time or API writes
 * 
 * @param {string} table - Table name (e.g., 'applications', 'notifications')
 * @returns {Promise<boolean>} - Success status
 */
export const invalidateTableCache = async (table) => {
  if (!redis) return false;
  
  try {
    // Delete all cache keys for this table
    const patterns = [
      `query:${table}:*`,           // Generic query cache
      `admin:${table}:*`,           // Admin API cache
      `admin:applications:*`,       // Applications cache (if table is applications)
    ];
    
    let deletedCount = 0;
    for (const pattern of patterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
    }
    
    if (deletedCount > 0) {
      console.log(`✅ Invalidated ${deletedCount} cache keys for table: ${table}`);
    }
    
    return true;
  } catch (error) {
    console.error(`Redis invalidate cache error for ${table}:`, error);
    return false;
  }
};

export default redis;
