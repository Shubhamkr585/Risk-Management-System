import { createClient } from 'redis';
import winston from 'winston'; // Ensure we use existing logger if possible, but basic console works too

// Use the existing logger format if one exists, otherwise basic console
const logError = (msg, err) => console.error(`[RedisClient] ${msg}`, err);
const logInfo = (msg) => console.log(`[RedisClient] ${msg}`);

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

const redisClient = createClient({
  url: redisUrl,
  socket: {
    // Adding reasonable connection timeouts
    connectTimeout: 50000, 
  }
});

redisClient.on('error', (err) => logError('Redis Client Error', err));
redisClient.on('connect', () => logInfo('Connected to Redis server'));
redisClient.on('ready', () => logInfo('Redis client is ready to use'));
redisClient.on('end', () => logInfo('Redis client connection closed'));

// Attempt to connect immediately. If it fails, the application shouldn't crash, 
// the client will just emit 'error' and remain disconnected (or try to reconnect based on config).
// In production, you might want to await this connection at server startup.
(async () => {
  try {
    await redisClient.connect();
  } catch (error) {
    logError('Initial Redis connection failed. Ensure Redis server is running.', error);
  }
})();

/**
 * Helper function to safely get a cached value
 * @param {string} key 
 * @returns {Promise<any>} The parsed JSON value, or null if not found/error
 */
export const getCachedData = async (key) => {
  if (!redisClient.isReady) return null;
  
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logError(`Error retrieving key ${key}`, error);
    return null;
  }
};

/**
 * Helper function to safely set a cached value with expiration
 * @param {string} key 
 * @param {any} value 
 * @param {number} expirationInSeconds Default is 3600 (1 hour)
 */
export const setCachedData = async (key, value, expirationInSeconds = 3600) => {
  if (!redisClient.isReady) return;

  try {
    const stringValue = JSON.stringify(value);
    await redisClient.set(key, stringValue, {
      EX: expirationInSeconds
    });
  } catch (error) {
    logError(`Error setting key ${key}`, error);
  }
};

export default redisClient;

export { redisClient };
