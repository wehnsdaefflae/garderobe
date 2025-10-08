const redis = require('redis');

let client = null;

/**
 * Initialize and connect to Redis with persistence enabled
 */
async function initRedis() {
  client = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('Redis connection failed after 10 retries');
          return new Error('Redis connection failed');
        }
        return Math.min(retries * 100, 3000);
      }
    }
  });

  client.on('error', (err) => console.error('Redis Client Error:', err));
  client.on('connect', () => console.log('Redis Client Connected'));
  client.on('ready', () => console.log('Redis Client Ready'));

  await client.connect();

  return client;
}

/**
 * Get the Redis client instance
 */
function getRedisClient() {
  if (!client) {
    throw new Error('Redis client not initialized. Call initRedis() first.');
  }
  return client;
}

/**
 * Close Redis connection gracefully
 */
async function closeRedis() {
  if (client) {
    await client.quit();
  }
}

module.exports = {
  initRedis,
  getRedisClient,
  closeRedis
};
