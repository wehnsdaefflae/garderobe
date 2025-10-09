require('dotenv').config();
const express = require('express');
const https = require('https');
const fs = require('fs');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const crypto = require('crypto');
const path = require('path');

const { initRedis, getRedisClient, closeRedis } = require('./redis');
const { setupRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// Security headers middleware
app.use((req, res, next) => {
  // HSTS - Force HTTPS (only in production)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // Content Security Policy
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://unpkg.com; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
    "media-src 'self' blob:; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'"
  );

  // X-Frame-Options - Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // X-Content-Type-Options - Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // X-XSS-Protection - Enable XSS filter
  res.setHeader('X-XSS-Protection', '1; mode=block');

  // Referrer-Policy - Control referrer information
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions-Policy - Disable unnecessary features (allow camera for QR scanning)
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');

  next();
});

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// =============================================================================
// STARTUP
// =============================================================================

async function startServer() {
  try {
    console.log('Starting Garderobe Digital Platform...');

    // Initialize Redis
    console.log('Connecting to Redis...');
    await initRedis();
    const redis = getRedisClient();

    // Setup session store and middleware
    console.log('Setting up session management...');
    const sessionStore = new RedisStore({ client: redis });

    const sessionMiddleware = session({
      store: sessionStore,
      secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        sameSite: 'lax' // Allows cookies on QR code scans while maintaining CSRF protection
      },
      name: 'garderobe.sid'
    });

    // Apply session middleware
    app.use(sessionMiddleware);

    // Setup all routes (must be done after session middleware)
    console.log('Setting up routes...');
    setupRoutes(app);

    // Start HTTP server (always)
    app.listen(PORT, () => {
      console.log(`✓ HTTP Server running on port ${PORT}`);
    });

    // Start HTTPS server if certificates are available
    const certPath = path.join(__dirname, '..', 'ssl', 'cert.pem');
    const keyPath = path.join(__dirname, '..', 'ssl', 'key.pem');

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      const httpsOptions = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };

      https.createServer(httpsOptions, app).listen(HTTPS_PORT, () => {
        console.log(`✓ HTTPS Server running on port ${HTTPS_PORT}`);
      });

      const baseUrl = process.env.BASE_URL || `https://192.168.0.200:${HTTPS_PORT}`;

      console.log('='.repeat(70));
      console.log('🧥  GARDEROBE DIGITAL - Free Ephemeral Coat Check Platform');
      console.log('='.repeat(70));
      console.log(`✓ HTTP:  http://localhost:${PORT}`);
      console.log(`✓ HTTPS: https://192.168.0.200:${HTTPS_PORT} (for camera access)`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Base URL: ${baseUrl}`);
      console.log('='.repeat(70));
      console.log(`\nPlatform URL: ${baseUrl}`);
      console.log(`⚠️  You'll need to accept the self-signed certificate warning`);
      console.log('='.repeat(70));
      console.log('\n✅ Platform ready! Anyone can create events now.\n');
    } else {
      const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

      console.log('='.repeat(70));
      console.log('🧥  GARDEROBE DIGITAL - Free Ephemeral Coat Check Platform');
      console.log('='.repeat(70));
      console.log(`✓ HTTP Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`⚠️  HTTPS not available - SSL certificates not found`);
      console.log(`⚠️  Camera access may not work in some browsers`);
      console.log('='.repeat(70));
      console.log(`\nPlatform URL: ${baseUrl}`);
      console.log('='.repeat(70));
      console.log('\n✅ Platform ready! Anyone can create events now.\n');
    }

    // Graceful shutdown handlers
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Shutting down gracefully...`);
      try {
        await closeRedis();
        console.log('✓ Redis connection closed');
        console.log('✓ Shutdown complete');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    console.error('❌ Failed to start server:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the application
startServer();
