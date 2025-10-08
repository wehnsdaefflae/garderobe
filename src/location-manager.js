const { getRedisClient } = require('./redis');

/**
 * Parse location schema from environment variable
 * Format: "A-F:1-50" means racks A through F, spots 1 through 50
 */
function parseLocationSchema(schema) {
  const [racksRange, spotsRange] = schema.split(':');
  const [startRack, endRack] = racksRange.split('-');
  const [startSpot, endSpot] = spotsRange.split('-').map(Number);

  const locations = [];
  const startCharCode = startRack.charCodeAt(0);
  const endCharCode = endRack.charCodeAt(0);

  for (let charCode = startCharCode; charCode <= endCharCode; charCode++) {
    const rack = String.fromCharCode(charCode);
    for (let spot = startSpot; spot <= endSpot; spot++) {
      locations.push(`${rack}-${spot}`);
    }
  }

  return locations;
}

/**
 * Initialize location pool for an event in Redis
 * @param {string} slug - Event slug
 * @param {string} schema - Location schema (e.g., 'A-F:1-50')
 * @param {number} ttlSeconds - TTL for Redis keys
 */
async function initializeLocations(slug, schema, ttlSeconds) {
  const redis = getRedisClient();
  const availableKey = `event:${slug}:available_locations`;
  const usedKey = `event:${slug}:used_locations`;

  // Check if already initialized
  const exists = await redis.exists(availableKey);
  if (exists) {
    console.log(`[LOCATIONS] Already initialized for event ${slug}`);
    return;
  }

  const locations = parseLocationSchema(schema);

  // Use a transaction to initialize atomically
  const multi = redis.multi();

  // Add all locations to the available set
  for (const location of locations) {
    multi.sAdd(availableKey, location);
  }

  // Set TTL on both keys
  multi.expire(availableKey, ttlSeconds);
  multi.expire(usedKey, ttlSeconds);

  await multi.exec();

  console.log(`[LOCATIONS] Initialized ${locations.length} locations for event ${slug}`);
}

/**
 * Get the next available location atomically for an event
 * @param {string} slug - Event slug
 * @returns {string|null} Location string or null if no locations available
 */
async function getNextLocation(slug) {
  const redis = getRedisClient();

  const availableKey = `event:${slug}:available_locations`;
  const usedKey = `event:${slug}:used_locations`;

  // Use Lua script for atomic pop operation
  const lua = `
    local location = redis.call('SPOP', KEYS[1])
    if location then
      redis.call('SADD', KEYS[2], location)
    end
    return location
  `;

  const location = await redis.eval(lua, {
    keys: [availableKey, usedKey],
    arguments: []
  });

  return location;
}

/**
 * Return a location to the available pool atomically
 * @param {string} slug - Event slug
 * @param {string} location - Location to return
 * @returns {boolean} True if successfully returned
 */
async function returnLocation(slug, location) {
  const redis = getRedisClient();

  const availableKey = `event:${slug}:available_locations`;
  const usedKey = `event:${slug}:used_locations`;

  // Use Lua script for atomic operation
  const lua = `
    local removed = redis.call('SREM', KEYS[2], ARGV[1])
    if removed == 1 then
      redis.call('SADD', KEYS[1], ARGV[1])
      return 1
    end
    return 0
  `;

  const result = await redis.eval(lua, {
    keys: [availableKey, usedKey],
    arguments: [location]
  });

  return result === 1;
}

/**
 * Get capacity statistics for an event
 * @param {string} slug - Event slug
 * @returns {Object} Capacity statistics
 */
async function getCapacityStats(slug) {
  const redis = getRedisClient();

  const availableKey = `event:${slug}:available_locations`;
  const usedKey = `event:${slug}:used_locations`;

  const available = await redis.sCard(availableKey);
  const used = await redis.sCard(usedKey);

  return {
    available,
    used,
    total: available + used,
    percentFull: available + used > 0 ? ((used / (available + used)) * 100).toFixed(1) : 0
  };
}

module.exports = {
  parseLocationSchema,
  initializeLocations,
  getNextLocation,
  returnLocation,
  getCapacityStats
};
