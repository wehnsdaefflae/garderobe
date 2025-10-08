const crypto = require('crypto');
const { getRedisClient } = require('./redis');

/**
 * Generate cryptographically secure event slug
 * 16 characters, URL-safe, base64url encoded
 */
function generateEventSlug() {
  return crypto.randomBytes(12).toString('base64url').slice(0, 16);
}

/**
 * Parse location schema from racks and spots
 * @param {string} rackStart - Starting rack letter (e.g., 'A')
 * @param {string} rackEnd - Ending rack letter (e.g., 'F')
 * @param {number} spotStart - Starting spot number (e.g., 1)
 * @param {number} spotEnd - Ending spot number (e.g., 50)
 * @returns {string} Location schema string (e.g., 'A-F:1-50')
 */
function buildLocationSchema(rackStart, rackEnd, spotStart, spotEnd) {
  return `${rackStart}-${rackEnd}:${spotStart}-${spotEnd}`;
}

/**
 * Create a new event
 * @param {Object} eventData
 * @param {string} eventData.eventName - Optional event name
 * @param {string} eventData.locationSchema - Location schema (e.g., 'A-F:1-50')
 * @param {number} eventData.durationHours - Event duration in hours
 * @returns {Object} Event object with slug and metadata
 */
async function createEvent(eventData) {
  const redis = getRedisClient();

  // Generate unique slug
  let slug;
  let attempts = 0;
  do {
    slug = generateEventSlug();
    attempts++;
    const exists = await redis.exists(`event:${slug}:name`);
    if (!exists) break;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new Error('Failed to generate unique event slug');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + eventData.durationHours * 60 * 60 * 1000);
  const ttlSeconds = eventData.durationHours * 60 * 60;

  // Store event metadata with TTL
  const eventKey = `event:${slug}`;
  await redis.hSet(`${eventKey}:meta`, {
    name: eventData.eventName || '',
    locationSchema: eventData.locationSchema,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    durationHours: eventData.durationHours
  });

  // Set TTL on metadata
  await redis.expire(`${eventKey}:meta`, ttlSeconds);

  // Initialize ticket counter to 0
  await redis.set(`${eventKey}:counter`, 0);
  await redis.expire(`${eventKey}:counter`, ttlSeconds);

  // Initialize location pool (done separately by location-manager)
  // Just mark that event exists in global registry
  await redis.sAdd('active_events', slug);
  await redis.expire('active_events', ttlSeconds);

  console.log(`[EVENT CREATED] Slug: ${slug}, Duration: ${eventData.durationHours}h, Expires: ${expiresAt.toISOString()}`);

  return {
    slug,
    name: eventData.eventName || '',
    locationSchema: eventData.locationSchema,
    durationHours: eventData.durationHours,
    createdAt: now,
    expiresAt,
    ttlSeconds
  };
}

/**
 * Get event metadata by slug
 * @param {string} slug - Event slug
 * @returns {Object|null} Event metadata or null if not found
 */
async function getEvent(slug) {
  const redis = getRedisClient();
  const eventKey = `event:${slug}`;

  const exists = await redis.exists(`${eventKey}:meta`);
  if (!exists) {
    return null;
  }

  const meta = await redis.hGetAll(`${eventKey}:meta`);

  if (!meta || Object.keys(meta).length === 0) {
    return null;
  }

  return {
    slug,
    name: meta.name || '',
    locationSchema: meta.locationSchema,
    createdAt: meta.createdAt,
    expiresAt: meta.expiresAt,
    durationHours: parseInt(meta.durationHours, 10)
  };
}

/**
 * Check if an event exists and is active
 * @param {string} slug - Event slug
 * @returns {boolean} True if event exists
 */
async function eventExists(slug) {
  const event = await getEvent(slug);
  return event !== null;
}

/**
 * Get all active events (for monitoring/admin purposes)
 * @returns {Array} List of event slugs
 */
async function getActiveEvents() {
  const redis = getRedisClient();
  const slugs = await redis.sMembers('active_events');
  return slugs || [];
}

/**
 * Refresh event TTL (extend expiration)
 * @param {string} slug - Event slug
 * @param {number} additionalHours - Hours to add
 */
async function extendEvent(slug, additionalHours) {
  const redis = getRedisClient();
  const eventKey = `event:${slug}`;

  const event = await getEvent(slug);
  if (!event) {
    throw new Error('Event not found');
  }

  const additionalSeconds = additionalHours * 60 * 60;

  // Extend TTL on all event keys
  const pattern = `${eventKey}:*`;
  const keys = await redis.keys(pattern);

  for (const key of keys) {
    const currentTTL = await redis.ttl(key);
    if (currentTTL > 0) {
      await redis.expire(key, currentTTL + additionalSeconds);
    }
  }

  console.log(`[EVENT EXTENDED] Slug: ${slug}, Additional: ${additionalHours}h`);
}

module.exports = {
  generateEventSlug,
  buildLocationSchema,
  createEvent,
  getEvent,
  eventExists,
  getActiveEvents,
  extendEvent
};
