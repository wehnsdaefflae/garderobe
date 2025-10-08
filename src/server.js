require('dotenv').config();
const express = require('express');
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const crypto = require('crypto');
const path = require('path');

const { initRedis, getRedisClient, closeRedis } = require('./redis');
const { setupRoutes } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;

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
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self'; " +
    "connect-src 'self'; " +
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

  // Permissions-Policy - Disable unnecessary features
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

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
        sameSite: 'strict' // CSRF protection
      },
      name: 'garderobe.sid'
    });

    // Apply session middleware
    app.use(sessionMiddleware);

    // Setup all routes (must be done after session middleware)
    console.log('Setting up routes...');
    setupRoutes(app);

    // Start server
    app.listen(PORT, () => {
      console.log('='.repeat(70));
      console.log('🧥  GARDEROBE DIGITAL - Free Ephemeral Coat Check Platform');
      console.log('='.repeat(70));
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ Domain: ${process.env.DOMAIN || 'garderobe.io'}`);
      console.log('='.repeat(70));
      console.log(`\nPlatform URL: http${process.env.NODE_ENV === 'production' ? 's' : ''}://${process.env.DOMAIN || 'localhost:' + PORT}`);
      console.log('='.repeat(70));
      console.log('\n✅ Platform ready! Anyone can create events now.\n');
    });

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
