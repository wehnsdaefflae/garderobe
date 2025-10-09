# Project Structure - Garderobe Digital v4.0

Clean, simple, ephemeral platform architecture.

## Directory Structure

```
wardrobe_system/
├── .env                      # Environment configuration
├── .env.example              # Template
├── .gitignore               # Git ignore rules
├── .dockerignore            # Docker ignore rules
├── LICENSE                  # MIT License
│
├── README.md                # Main documentation
├── REQUIREMENTS.md          # Original requirements (v4.0)
├── CHANGELOG.md             # Version history
├── DEPLOYMENT.md            # Deployment guide
├── PROJECT.md               # This file
│
├── package.json             # Node.js dependencies
├── Dockerfile               # App container
├── docker-compose.yml       # Multi-container orchestration
├── Caddyfile               # Reverse proxy config
│
├── src/
│   ├── server.js            # Main entry point
│   ├── routes.js            # All HTTP routes
│   ├── redis.js             # Redis client
│   ├── event-manager.js     # Event lifecycle
│   ├── location-manager.js  # Location pools
│   │
│   ├── views/               # EJS templates
│   │   ├── index.ejs        # Landing page
│   │   ├── new-event.ejs    # Event creation form
│   │   ├── event-created.ejs # Success page
│   │   ├── guest-ticket.ejs  # Guest ticket display
│   │   ├── staff-dashboard.ejs # Staff interface
│   │   └── staff-ticket.ejs   # Staff actions
│   │
│   └── public/              # Static files
│       └── robots.txt       # Search engine rules
```

## File Purposes

### Root Configuration

- **`.env`** - Environment variables (SECRET!)
- **`.env.example`** - Template for configuration
- **`package.json`** - Node.js project definition
- **`docker-compose.yml`** - Service orchestration
- **`Dockerfile`** - Application container build
- **`Caddyfile`** - HTTPS reverse proxy config

### Documentation

- **`README.md`** - Complete user guide
- **`REQUIREMENTS.md`** - Original specification
- **`CHANGELOG.md`** - Version history
- **`DEPLOYMENT.md`** - Production setup guide
- **`PROJECT.md`** - This structure overview

### Source Code

**`src/server.js`** - Express app initialization
- Connects to Redis
- Sets up security headers
- Loads routes
- Starts HTTP server

**`src/routes.js`** - All HTTP endpoints
- Landing page
- Event creation
- Guest ticket generation
- Staff interface
- API endpoints

**`src/event-manager.js`** - Event operations
- Create events with unique slugs
- Store metadata with TTL
- Check event existence
- Auto-expiration handling

**`src/location-manager.js`** - Location pool management
- Parse location schemas
- Initialize location sets
- Atomic assignment/return
- Capacity statistics

**`src/redis.js`** - Redis client wrapper
- Connection management
- Error handling
- Graceful shutdown

### Views (EJS Templates)

**`index.ejs`** - Landing page (`/`)
- Platform introduction
- "Create Event" call-to-action
- Feature highlights

**`new-event.ejs`** - Event creation (`/new`)
- Event configuration form
- Location schema inputs
- Duration selection

**`event-created.ejs`** - Success page (`/event-created/:slug`)
- Guest URL with copy button
- Staff URL with copy button
- QR code for NFC programming
- Setup instructions

**`guest-ticket.ejs`** - Guest ticket (`/e/:slug/ticket/:id`)
- Large ticket number
- QR code for staff scanning
- Warning messages
- Save instructions

**`staff-dashboard.ejs`** - Staff interface (`/e/:slug/staff`)
- Scan prompt
- Manual ticket lookup
- Event statistics
- Capacity display

**`staff-ticket.ejs`** - Staff actions (`/e/:slug/ticket/:id`)
- Ticket status display
- Check-in button
- Location display
- Check-out button

## Data Flow

### Event Creation
```
User → / → Click "Create" → /new → Fill form
→ POST /api/events → Generate slug → Store in Redis
→ /event-created/:slug → Display URLs
```

### Guest Flow
```
NFC Tap → /e/:slug/new → Generate ticket + token
→ Store in Redis → Redirect to /e/:slug/ticket/:id?token=xxx
→ Display ticket with QR code
```

### Staff Flow
```
Open /e/:slug/staff?token=xxx → Validate staff token
→ Scan QR → /e/:slug/ticket/:id?token=xxx&staffToken=xxx
→ Detect staff token → Show action buttons
→ POST /e/:slug/api/check-in (with staffToken) → Assign location
→ Display location to staff
```

## Redis Schema

```
# Event metadata (expires with event)
event:{slug}:meta = HASH {name, locationSchema, expiresAt, ...}

# Ticket counter
event:{slug}:counter = INTEGER

# Tickets
event:{slug}:ticket:{id} = HASH {token, location, createdAt, ...}

# Locations
event:{slug}:available_locations = SET ["A-1", "A-2", ...]
event:{slug}:used_locations = SET ["C-15", "D-32", ...]

# Active events (global)
active_events = SET [slug1, slug2, ...]

# Rate limiting
ratelimit:events:{ip} = INTEGER (expires: 1 hour)
```

## Key Features

### No Traditional Authentication
- Security through unguessable slugs (~95 bits entropy)
- Staff detected via URL tokens per event
- No passwords, no login forms, no sessions

### Ephemeral Data
- All Redis keys have TTL
- Auto-deletion after event expires
- No persistent storage needed

### Rate Limiting
- 10 events per IP per hour
- 1000 tickets per event max
- Configurable limits

### Atomic Operations
- Lua scripts for location assignment
- No race conditions
- Safe concurrent access

## Environment Variables

```bash
# Required (for production)
DOMAIN=garderobe.io
BASE_URL=https://garderobe.io

# Optional
PORT=3000
NODE_ENV=production
REDIS_URL=redis://redis:6379
MAX_EVENTS_PER_IP_PER_HOUR=10
MAX_TICKETS_PER_EVENT=1000
MAX_ACTIVE_EVENTS=1000
MAX_EVENTS_PER_HOUR_GLOBAL=100
```

## Quick Commands

```bash
# Development
npm install
npm run dev

# Production
docker-compose up -d

# Logs
docker-compose logs -f app

# Health check
curl http://localhost:3000/health

# Stop
docker-compose down
```

## Dependencies

**Runtime:**
- express - Web framework
- redis - Data store client
- qrcode - QR code generation
- ejs - Template engine
- dotenv - Environment config

**Dev:**
- nodemon - Auto-reload in development
- jest - Testing framework
- supertest - HTTP testing

## URLs Reference

```
Landing:          /
Create event:     /new
Event success:    /event-created/:slug

Guest ticket:     /e/:slug/new
Guest view:       /e/:slug/ticket/:id?token=xxx

Staff interface:  /e/:slug/staff?token=xxx
Staff view:       /e/:slug/ticket/:id?token=xxx&staffToken=xxx

API:
- POST /api/events
- GET /api/qr-event/:slug
- GET /e/:slug/api/qr/:id
- GET /e/:slug/api/status/:id
- POST /e/:slug/api/check-in
- POST /e/:slug/api/check-out
- GET /e/:slug/api/capacity

Health:           /health
```

## Security Model

1. **Event Isolation** - Each event completely separated
2. **Slug Security** - 16 chars base64url = unguessable
3. **Token Security** - 16 chars per guest ticket, 32 chars per staff token
4. **Token-Based Auth** - No sessions, no cookies for authentication (v4.3.0+)
5. **Rate Limiting** - Prevent abuse
6. **Ephemeral Data** - Nothing stored long-term
7. **No Personal Data** - GDPR compliant

## Design Principles

- **Simple** - Minimal code, maximum clarity
- **Ephemeral** - Data auto-deletes
- **Scalable** - Handle 100+ events on small VPS
- **Secure** - Unguessable URLs, no auth complexity
- **Free** - Open source, community-hosted
- **Friction-free** - 30-second setup, no registration

---

**Version:** 4.3.0
**License:** MIT
**Last Updated:** October 9, 2025
