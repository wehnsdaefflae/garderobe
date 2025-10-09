const crypto = require('crypto');
const os = require('os');
const QRCode = require('qrcode');
const { version } = require('../package.json');
const { getRedisClient } = require('./redis');
const { createEvent, getEvent, eventExists, buildLocationSchema } = require('./event-manager');
const { initializeLocations, getNextLocation, returnLocation, getCapacityStats } = require('./location-manager');
const { generateChallenge, storeChallenge, verifyChallenge, checkChallengeRateLimit } = require('./challenge');

const MAX_EVENTS_PER_IP_PER_HOUR = parseInt(process.env.MAX_EVENTS_PER_IP_PER_HOUR, 10) || 10;
const MAX_TICKETS_PER_EVENT = parseInt(process.env.MAX_TICKETS_PER_EVENT, 10) || 1000;
const MAX_ACTIVE_EVENTS = parseInt(process.env.MAX_ACTIVE_EVENTS, 10) || 1000;
const MAX_EVENTS_PER_HOUR_GLOBAL = parseInt(process.env.MAX_EVENTS_PER_HOUR_GLOBAL, 10) || 100;

/**
 * Check if IP is a private network address
 */
function isPrivateIp(ip) {
  const parts = ip.split('.').map(Number);
  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

/**
 * Get the first non-internal IPv4 address (LAN IP)
 * Prioritizes private IP addresses (192.168.x.x, 10.x.x.x, 172.16-31.x.x)
 */
function getLocalNetworkIp() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }

  // Prioritize private IPs for local testing
  const privateIp = addresses.find(isPrivateIp);
  if (privateIp) {
    return privateIp;
  }

  // Fall back to first available IP or localhost
  return addresses[0] || 'localhost';
}

/**
 * Get base URL for the application
 * Uses BASE_URL from environment if set, otherwise auto-detects from request
 * If accessed via localhost, uses LAN IP instead for device compatibility
 */
function getBaseUrl(req) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, ''); // Remove trailing slash
  }

  // Auto-detect from request
  const protocol = req.secure ? 'https' : 'http';
  let host = req.get('host');

  // Replace localhost/127.0.0.1 with actual network IP for device access
  if (host.startsWith('localhost') || host.startsWith('127.0.0.1')) {
    const networkIp = getLocalNetworkIp();
    const port = host.includes(':') ? host.split(':')[1] : '';
    host = port ? `${networkIp}:${port}` : networkIp;
  }

  return `${protocol}://${host}`;
}

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

  console.log(`[GET TICKET] Slug: ${slug}, ID: ${ticketId}, Redis data:`, data);

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
    res.render('index', { version });
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
        spotEnd
      } = req.body;

      // Validation
      if (!rackStart || !rackEnd || !spotStart || !spotEnd) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const spotStartNum = parseInt(spotStart, 10);
      const spotEndNum = parseInt(spotEnd, 10);
      const durationHours = 72; // Fixed duration: 72 hours (3 days)

      if (rackStart > rackEnd) {
        return res.status(400).json({ error: 'Invalid rack range' });
      }

      if (spotStartNum > spotEndNum || spotStartNum < 1) {
        return res.status(400).json({ error: 'Invalid spot range' });
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

      const baseUrl = getBaseUrl(req);

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
        staffToken: event.staffToken,
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

      const baseUrl = getBaseUrl(req);
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

  /**
   * GET /api/qr-staff/:slug - Generate QR code for staff URL
   */
  app.get('/api/qr-staff/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const { token } = req.query;

      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found');
      }

      // Validate staff token
      if (!token || token !== event.staffToken) {
        return res.status(403).send('Invalid staff token');
      }

      const baseUrl = getBaseUrl(req);
      const staffUrl = `${baseUrl}/e/${slug}/staff?token=${token}`;

      const qrCodeBuffer = await QRCode.toBuffer(staffUrl, {
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
      const baseUrl = getBaseUrl(req);
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
      const staffToken = req.query.staffToken;

      // Check if staff token is valid
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found or expired');
      }

      const isStaff = staffToken && staffToken === event.staffToken;

      // Debug logging
      console.log(`[TICKET VIEW] Slug: ${slug}, Ticket: ${ticketId}, IsStaff: ${isStaff}, StaffToken provided: ${!!staffToken}`);

      if (isNaN(ticketId) || ticketId < 1) {
        return res.status(404).send('Not Found');
      }

      // Get ticket
      const ticket = await getTicket(slug, ticketId);
      if (!ticket) {
        return res.status(404).send('Not Found');
      }

      // Staff always gets staff view (priority over token)
      if (isStaff) {
        console.log(`[TICKET VIEW] Rendering STAFF view for ticket ${ticketId}, Status: ${ticket.status}, Location: ${ticket.location}, Ticket data:`, ticket);
        return res.render('staff-ticket', {
          slug,
          ticketId,
          staffToken: event.staffToken
        });
      }

      console.log(`[TICKET VIEW] Rendering GUEST view for ticket ${ticketId}`);

      // Not staff - guest must provide valid token
      if (!providedToken || providedToken !== ticket.token) {
        // No token - offer staff login
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access Ticket - Garderobe Digital</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
                color: #fff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .card {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 40px;
                max-width: 400px;
                text-align: center;
              }
              h1 { font-size: 24px; margin-bottom: 20px; }
              p { margin-bottom: 30px; opacity: 0.9; line-height: 1.6; }
              .btn {
                display: block;
                width: 100%;
                padding: 16px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: #fff;
                text-decoration: none;
                border-radius: 12px;
                font-weight: 600;
                font-size: 16px;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>🎫 Staff Access Required</h1>
              <p>To view and manage this ticket, please access the staff dashboard first.</p>
              <a href="/e/${slug}/staff?returnTo=/e/${slug}/ticket/${ticketId}" class="btn">
                Go to Staff Dashboard
              </a>
            </div>
          </body>
          </html>
        `);
      }

      // Render guest ticket page
      const baseUrl = getBaseUrl(req);
      const ticketUrl = `${baseUrl}/e/${slug}/ticket/${ticketId}?token=${ticket.token}`;

      res.render('guest-ticket', {
        slug,
        ticketId,
        ticketUrl,
        token: ticket.token
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

      // Verify token (allow staff or guest with valid token)
      const ticket = await getTicket(slug, ticketId);
      if (!ticket || ticket.token !== token) {
        return res.status(404).send('Not Found');
      }

      // Generate QR code
      const baseUrl = getBaseUrl(req);
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
   * GET /e/:slug/staff - Staff interface (validates staff token)
   */
  app.get('/e/:slug/staff', async (req, res) => {
    try {
      const { slug } = req.params;
      const { token, returnTo } = req.query;

      // Check event exists
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).send('Event not found or expired');
      }

      // Validate staff token
      if (!token || token !== event.staffToken) {
        return res.status(403).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Access Denied - Garderobe Digital</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                background: linear-gradient(135deg, #1a202c 0%, #2d3748 100%);
                color: #fff;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .card {
                background: rgba(255, 255, 255, 0.1);
                border-radius: 20px;
                padding: 40px;
                max-width: 400px;
                text-align: center;
              }
              h1 { font-size: 24px; margin-bottom: 20px; color: #ef4444; }
              p { margin-bottom: 30px; opacity: 0.9; line-height: 1.6; }
            </style>
          </head>
          <body>
            <div class="card">
              <h1>🚫 Access Denied</h1>
              <p>Invalid or missing staff authentication token. Only authorized staff can access this page.</p>
              <p><small>If you're staff, use the URL from the event creation page.</small></p>
            </div>
          </body>
          </html>
        `);
      }

      // Redirect if returnTo specified (add staff token to URL)
      if (returnTo) {
        const separator = returnTo.includes('?') ? '&' : '?';
        return res.redirect(`${returnTo}${separator}staffToken=${token}`);
      }

      // Get capacity stats
      const stats = await getCapacityStats(slug);

      // Get ticket count
      const redis = getRedisClient();
      const ticketCount = parseInt(await redis.get(`event:${slug}:counter`) || 0, 10);

      res.render('staff-dashboard', {
        slug,
        eventName: event.name,
        staffToken: event.staffToken,
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
   * Middleware: Require staff token authentication
   * Checks staffToken in body or query parameters
   */
  async function requireStaffAuth(req, res, next) {
    const { slug } = req.params;
    const staffToken = req.body.staffToken || req.query.staffToken;

    if (!staffToken) {
      return res.status(401).json({ error: 'Staff authentication required' });
    }

    try {
      const event = await getEvent(slug);
      if (!event) {
        return res.status(404).json({ error: 'Event not found' });
      }

      if (staffToken !== event.staffToken) {
        return res.status(401).json({ error: 'Invalid staff token' });
      }

      // Valid staff token - proceed
      return next();

    } catch (error) {
      console.error('Error validating staff token:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
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
