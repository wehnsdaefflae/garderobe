const crypto = require('crypto');
const QRCode = require('qrcode');
const { getRedisClient } = require('./redis');
const { createEvent, getEvent, eventExists, buildLocationSchema } = require('./event-manager');
const { initializeLocations, getNextLocation, returnLocation, getCapacityStats } = require('./location-manager');
const { generateChallenge, storeChallenge, verifyChallenge, checkChallengeRateLimit } = require('./challenge');

const DOMAIN = process.env.DOMAIN || 'garderobe.io';
const MAX_EVENTS_PER_IP_PER_HOUR = parseInt(process.env.MAX_EVENTS_PER_IP_PER_HOUR, 10) || 10;
const MAX_TICKETS_PER_EVENT = parseInt(process.env.MAX_TICKETS_PER_EVENT, 10) || 1000;
const MAX_ACTIVE_EVENTS = parseInt(process.env.MAX_ACTIVE_EVENTS, 10) || 1000;
const MAX_EVENTS_PER_HOUR_GLOBAL = parseInt(process.env.MAX_EVENTS_PER_HOUR_GLOBAL, 10) || 100;

/**
 * Generate cryptographically secure token
 */
function generateSecureToken(length = 16) {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Get ticket data from Redis
 */
async function getTicket(slug, ticketId) {
  const redis = getRedisClient();
  const data = await redis.hGetAll(`event:${slug}:ticket:${ticketId}`);

  if (!data || Object.keys(data).length === 0) {
    return null;
  }

  return {
    id: ticketId,
    token: data.token,
    location: data.location || null,
    status: data.checkedOutAt ? 'checked_out' : (data.location ? 'checked_in' : 'new'),
    createdAt: data.createdAt,
    checkedInAt: data.checkedInAt || null,
    checkedOutAt: data.checkedOutAt || null
  };
}

/**
 * Save ticket data to Redis
 */
async function saveTicket(slug, ticketId, data, ttlSeconds) {
  const redis = getRedisClient();
  const ticketKey = `event:${slug}:ticket:${ticketId}`;
  await redis.hSet(ticketKey, data);
  await redis.expire(ticketKey, ttlSeconds);
}

/**
 * Check if staff session exists for this event
 */
function isStaffForEvent(req, slug) {
  return !!(req.session && req.session[`staff_${slug}`]);
}

/**
 * Rate limiting check for event creation
 */
async function checkRateLimit(ip) {
  const redis = getRedisClient();
  const key = `ratelimit:events:${ip}`;
  const count = await redis.incr(key);

  if (count === 1) {
    await redis.expire(key, 3600); // 1 hour
  }

  return count <= MAX_EVENTS_PER_IP_PER_HOUR;
}

/**
 * Setup all application routes
 */
function setupRoutes(app) {

  // =============================================================================
  // LANDING & EVENT CREATION
  // =============================================================================

  /**
   * GET / - Landing page
   */
  app.get('/', (req, res) => {
    res.render('index');
  });

  /**
   * GET /new - Event creation form
   */
  app.get('/new', async (req, res) => {
    try {
      const redis = getRedisClient();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      // Check rate limit for challenge requests
      const allowed = await checkChallengeRateLimit(redis, clientIp);
      if (!allowed) {
        return res.status(429).send('Too many requests. Please try again later.');
      }

      // Generate challenge
      const challenge = generateChallenge();
      await storeChallenge(redis, challenge);

      res.render('new-event', {
        challenge: {
          question: challenge.question,
          challengeId: challenge.challengeId
        }
      });
    } catch (error) {
      console.error('Error generating challenge:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * POST /api/events - Create new event
   */
  app.post('/api/events', async (req, res) => {
    try {
      const redis = getRedisClient();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

      // Verify challenge first
      const { challengeId, challengeAnswer } = req.body;
      if (!challengeId || !challengeAnswer) {
        return res.status(400).json({ error: 'Security challenge required' });
      }

      const challengeResult = await verifyChallenge(redis, challengeId, challengeAnswer);
      if (!challengeResult.valid) {
        return res.status(400).json({ error: challengeResult.error });
      }

      // Check global platform limits
      const activeEventCount = await redis.sCard('active_events');
      if (activeEventCount >= MAX_ACTIVE_EVENTS) {
        return res.status(503).json({
          error: 'Platform at capacity. Please try again later.'
        });
      }

      // Check global hourly limit
      const hourlyKey = 'events_created_this_hour';
      const hourlyCount = await redis.incr(hourlyKey);
      if (hourlyCount === 1) {
        await redis.expire(hourlyKey, 3600);
      }
      if (hourlyCount > MAX_EVENTS_PER_HOUR_GLOBAL) {
        return res.status(503).json({
          error: 'Too many events created recently. Please try again later.'
        });
      }

      // Rate limiting per IP
      const allowed = await checkRateLimit(clientIp);
      if (!allowed) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Maximum 10 events per hour per IP.'
        });
      }

      const {
        eventName,
        rackStart,
        rackEnd,
        spotStart,
        spotEnd,
        duration
      } = req.body;

      // Validation
      if (!rackStart || !rackEnd || !spotStart || !spotEnd || !duration) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const spotStartNum = parseInt(spotStart, 10);
      const spotEndNum = parseInt(spotEnd, 10);
      const durationHours = parseInt(duration, 10);

      if (rackStart > rackEnd) {
        return res.status(400).json({ error: 'Invalid rack range' });
      }

      if (spotStartNum > spotEndNum || spotStartNum < 1) {
        return res.status(400).json({ error: 'Invalid spot range' });
      }

      if (durationHours < 1 || durationHours > 48) {
        return res.status(400).json({ error: 'Duration must be between 1 and 48 hours' });
      }

      // Calculate total locations
      const totalLocations = (rackEnd.charCodeAt(0) - rackStart.charCodeAt(0) + 1) * (spotEndNum - spotStartNum + 1);
      if (totalLocations > 10000) {
        return res.status(400).json({
          error: `Too many locations (${totalLocations}). Maximum is 10,000.`
        });
      }

      const locationSchema = buildLocationSchema(rackStart, rackEnd, spotStartNum, spotEndNum);

      // Create event
      const event = await createEvent({
        eventName: eventName || '',
        locationSchema,
        durationHours
      });

      // Initialize location pool
      await initializeLocations(event.slug, event.locationSchema, event.ttlSeconds);

      // Redirect to success page
      res.redirect(`/event-created/${event.slug}`);

    } catch (error) {
      console.error('Error creating event:', error);
      res.status(500).json({ error: 'Failed to create event' });
    }
  });

  /**
   * GET /event-created/:slug - Event creation success page
   */
  app.get('/event-created/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found');
      }

      const protocol = req.secure ? 'https' : 'http';
      const baseUrl = process.env.NODE_ENV === 'production' ? `https://${DOMAIN}` : `${protocol}://${req.get('host')}`;

      // Format expiration time
      const expiresAt = new Date(event.expiresAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      res.render('event-created', {
        slug: event.slug,
        eventName: event.name,
        durationHours: event.durationHours,
        expiresAt,
        baseUrl
      });

    } catch (error) {
      console.error('Error displaying event created page:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * GET /api/qr-event/:slug - Generate QR code for event guest URL
   */
  app.get('/api/qr-event/:slug', async (req, res) => {
    try {
      const { slug } = req.params;

      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found');
      }

      const protocol = req.secure ? 'https' : 'http';
      const baseUrl = process.env.NODE_ENV === 'production' ? `https://${DOMAIN}` : `${protocol}://${req.get('host')}`;
      const guestUrl = `${baseUrl}/e/${slug}/new`;

      const qrCodeBuffer = await QRCode.toBuffer(guestUrl, {
        errorCorrectionLevel: 'H',
        type: 'png',
        width: 400,
        margin: 2
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(qrCodeBuffer);

    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // =============================================================================
  // EVENT-SPECIFIC ROUTES (Guest)
  // =============================================================================

  /**
   * GET /e/:slug/new - Generate new ticket for event
   */
  app.get('/e/:slug/new', async (req, res) => {
    try {
      const { slug } = req.params;

      // Check event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found or expired');
      }

      const redis = getRedisClient();

      // Check ticket limit
      const currentCount = await redis.get(`event:${slug}:counter`);
      if (currentCount && parseInt(currentCount, 10) >= MAX_TICKETS_PER_EVENT) {
        return res.status(503).send('Event ticket limit reached');
      }

      // Generate sequential ID atomically
      const ticketId = await redis.incr(`event:${slug}:counter`);

      // Refresh TTL on counter
      const ttl = await redis.ttl(`event:${slug}:meta`);
      if (ttl > 0) {
        await redis.expire(`event:${slug}:counter`, ttl);
      }

      // Generate cryptographically secure token
      const token = generateSecureToken(16);

      // Save ticket to Redis
      await saveTicket(slug, ticketId, {
        token,
        createdAt: new Date().toISOString()
      }, ttl);

      console.log(`[NEW TICKET] Event: ${slug}, ID: ${ticketId}, Token: ${token.slice(0, 4)}...`);

      // Redirect to ticket page with token
      const protocol = req.secure ? 'https' : 'http';
      const baseUrl = process.env.NODE_ENV === 'production' ? `https://${DOMAIN}` : `${protocol}://${req.get('host')}`;
      res.redirect(`${baseUrl}/e/${slug}/ticket/${ticketId}?token=${token}`);

    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * GET /e/:slug/ticket/:id - View ticket (guest or staff)
   */
  app.get('/e/:slug/ticket/:id', async (req, res) => {
    try {
      const { slug, id } = req.params;
      const ticketId = parseInt(id, 10);
      const providedToken = req.query.token;
      const isStaff = isStaffForEvent(req, slug);

      if (isNaN(ticketId) || ticketId < 1) {
        return res.status(404).send('Not Found');
      }

      // Check event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found or expired');
      }

      // Get ticket
      const ticket = await getTicket(slug, ticketId);
      if (!ticket) {
        return res.status(404).send('Not Found');
      }

      // Authorization check
      if (!isStaff) {
        // Guest must provide valid token
        if (!providedToken || providedToken !== ticket.token) {
          return res.status(404).send('Not Found');
        }

        // Render guest ticket page
        const protocol = req.secure ? 'https' : 'http';
        const baseUrl = process.env.NODE_ENV === 'production' ? `https://${DOMAIN}` : `${protocol}://${req.get('host')}`;
        const ticketUrl = `${baseUrl}/e/${slug}/ticket/${ticketId}?token=${ticket.token}`;

        return res.render('guest-ticket', {
          slug,
          ticketId,
          ticketUrl,
          token: ticket.token
        });
      }

      // Staff view
      res.render('staff-ticket', {
        slug,
        ticketId,
        status: ticket.status,
        location: ticket.location
      });

    } catch (error) {
      console.error('Error fetching ticket:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  /**
   * GET /e/:slug/api/qr/:id - Generate QR code for ticket
   */
  app.get('/e/:slug/api/qr/:id', async (req, res) => {
    try {
      const { slug, id } = req.params;
      const ticketId = parseInt(id, 10);
      const token = req.query.token;

      if (isNaN(ticketId) || !token) {
        return res.status(400).send('Bad Request');
      }

      // Verify event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found');
      }

      // Verify token if not staff
      if (!isStaffForEvent(req, slug)) {
        const ticket = await getTicket(slug, ticketId);
        if (!ticket || ticket.token !== token) {
          return res.status(404).send('Not Found');
        }
      }

      // Generate QR code
      const protocol = req.secure ? 'https' : 'http';
      const baseUrl = process.env.NODE_ENV === 'production' ? `https://${DOMAIN}` : `${protocol}://${req.get('host')}`;
      const ticketUrl = `${baseUrl}/e/${slug}/ticket/${ticketId}?token=${token}`;

      const qrCodeBuffer = await QRCode.toBuffer(ticketUrl, {
        errorCorrectionLevel: 'H',
        type: 'png',
        width: 400,
        margin: 2
      });

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=31536000');
      res.send(qrCodeBuffer);

    } catch (error) {
      console.error('Error generating QR code:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // =============================================================================
  // STAFF ROUTES
  // =============================================================================

  /**
   * GET /e/:slug/staff - Staff interface (sets staff session)
   */
  app.get('/e/:slug/staff', async (req, res) => {
    try {
      const { slug } = req.params;

      // Check event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found or expired');
      }

      // Set staff session for this event
      req.session[`staff_${slug}`] = true;

      // Get capacity stats
      const stats = await getCapacityStats(slug);

      // Get ticket count
      const redis = getRedisClient();
      const ticketCount = parseInt(await redis.get(`event:${slug}:counter`) || 0, 10);

      res.render('staff-dashboard', {
        slug,
        eventName: event.name,
        stats: {
          ...stats,
          ticketsIssued: ticketCount
        }
      });

    } catch (error) {
      console.error('Error loading staff dashboard:', error);
      res.status(500).send('Internal Server Error');
    }
  });

  // =============================================================================
  // STAFF API ENDPOINTS
  // =============================================================================

  /**
   * Middleware: Require staff session for event
   */
  function requireStaffAuth(req, res, next) {
    const { slug } = req.params;

    if (!isStaffForEvent(req, slug)) {
      return res.status(401).json({ error: 'Staff authentication required' });
    }

    next();
  }

  /**
   * GET /e/:slug/api/status/:id - Get ticket status
   */
  app.get('/e/:slug/api/status/:id', requireStaffAuth, async (req, res) => {
    try {
      const { slug, id } = req.params;
      const ticketId = parseInt(id, 10);

      if (isNaN(ticketId) || ticketId < 1) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      const ticket = await getTicket(slug, ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (ticket.location) {
        res.json({
          status: 'checked_in',
          location: ticket.location
        });
      } else if (ticket.checkedOutAt) {
        res.json({
          status: 'checked_out'
        });
      } else {
        res.json({
          status: 'new'
        });
      }

    } catch (error) {
      console.error('Error fetching status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /e/:slug/api/check-in - Check in a coat
   */
  app.post('/e/:slug/api/check-in', requireStaffAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      const { ticketId } = req.body;

      if (!ticketId || isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      // Check event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      const ticket = await getTicket(slug, ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (ticket.location) {
        return res.status(400).json({
          error: 'Ticket already checked in',
          location: ticket.location
        });
      }

      // Get next available location
      const location = await getNextLocation(slug);
      if (!location) {
        console.log(`[CHECK-IN FAILED] Event: ${slug}, Wardrobe full`);
        return res.status(503).json({ error: 'Wardrobe full' });
      }

      // Get TTL from event
      const redis = getRedisClient();
      const ttl = await redis.ttl(`event:${slug}:meta`);

      // Update ticket with location
      await saveTicket(slug, ticketId, {
        token: ticket.token,
        location,
        createdAt: ticket.createdAt,
        checkedInAt: new Date().toISOString()
      }, ttl);

      console.log(`[CHECK-IN] Event: ${slug}, Ticket ${ticketId} → ${location}`);

      res.json({
        ticketId,
        location,
        status: 'checked_in'
      });

    } catch (error) {
      console.error('Error checking in:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * POST /e/:slug/api/check-out - Check out a coat
   */
  app.post('/e/:slug/api/check-out', requireStaffAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      const { ticketId } = req.body;

      if (!ticketId || isNaN(ticketId)) {
        return res.status(400).json({ error: 'Invalid ticket ID' });
      }

      const ticket = await getTicket(slug, ticketId);
      if (!ticket) {
        return res.status(404).json({ error: 'Ticket not found' });
      }

      if (!ticket.location) {
        return res.status(400).json({ error: 'Ticket not checked in' });
      }

      const location = ticket.location;

      // Get TTL from event
      const redis = getRedisClient();
      const ttl = await redis.ttl(`event:${slug}:meta`);

      // Return location to pool and clear from ticket
      await returnLocation(slug, location);
      await saveTicket(slug, ticketId, {
        token: ticket.token,
        location: '',
        createdAt: ticket.createdAt,
        checkedInAt: ticket.checkedInAt,
        checkedOutAt: new Date().toISOString()
      }, ttl);

      console.log(`[CHECK-OUT] Event: ${slug}, Ticket ${ticketId} from ${location}`);

      res.json({
        ticketId,
        status: 'checked_out'
      });

    } catch (error) {
      console.error('Error checking out:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  /**
   * GET /e/:slug/api/capacity - Get capacity stats
   */
  app.get('/e/:slug/api/capacity', requireStaffAuth, async (req, res) => {
    try {
      const { slug } = req.params;

      const stats = await getCapacityStats(slug);

      res.json(stats);

    } catch (error) {
      console.error('Error fetching capacity:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // =============================================================================
  // HEALTH CHECK
  // =============================================================================

  /**
   * GET /health - Health check endpoint
   */
  app.get('/health', async (req, res) => {
    try {
      const redis = getRedisClient();
      await redis.ping();
      res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
    } catch (error) {
      res.status(503).json({ status: 'unhealthy', error: error.message });
    }
  });

  // =============================================================================
  // ERROR HANDLERS
  // =============================================================================

  app.use((req, res) => {
    res.status(404).send('Not Found');
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
  });
}

module.exports = { setupRoutes };
