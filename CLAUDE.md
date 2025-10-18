# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Garderobe Digital is a free, ephemeral NFC-based coat check platform. It's designed as a **multi-tenant platform** (not per-event deployment) where anyone can instantly create a temporary coat check event at a central domain (garderobe.io). Events auto-delete after 72 hours using Redis TTL.

**Core Architecture Principle**: Security through unguessable URLs (~95 bits entropy) + ephemeral data + zero authentication complexity. No user accounts, no passwords for guests, staff authenticated via URL tokens.

## Development Commands & Testing

### Local Development
```bash
# Install dependencies
npm install

# Start development server (with auto-reload)
npm run dev

# Application runs on http://localhost:3000
```

**Local Development Requirements**:
- Redis must be running locally (via Docker: `docker run -d -p 6379:6379 redis:7-alpine`)
- Node.js 18+ required

### Testing
```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests only

# Run tests in watch mode (auto-rerun on file changes)
npm run test:watch

# Generate coverage report
npm run test:coverage
```

### Production Deployment
```bash
# Start all services (app, Redis, Caddy)
docker-compose up -d

# View logs
docker-compose logs -f app

# Stop services
docker-compose down

# Health check
curl http://localhost:3000/health
```

### Testing Production Features
```bash
# Generate self-signed SSL certificates for local testing
mkdir -p ssl
openssl req -x509 -newkey rsa:4096 -nodes -keyout ssl/key.pem -out ssl/cert.pem -days 365

# Start server - HTTPS will be available on port 3443
npm start
```

## High-Level Architecture

### Security Model: No Traditional Authentication

The platform uses **cryptographic URL slugs and tokens** instead of passwords:
- **Event slugs**: 16-char base64url (~95 bits entropy) = effectively unguessable
- **Ticket tokens**: 16-char base64url per ticket (guest retrieval)
- **Staff tokens**: 32-char base64url per event (staff access)

**Pure Token-Based Authentication (v4.3.0)**: No sessions, no cookies for authentication. Staff token passed in URL query params, validated on every request. Simpler and more reliable than session-based auth.

### Data Flow & Key Interactions

**Event Creation Flow**:
1. User visits `/new` → Gets optical illusion challenge (bot prevention)
2. Submits form → `POST /api/events` → Validates challenge
3. Server checks platform limits (1000 active events, 100/hour global, 10/hour per IP)
4. Generates slug + staff token → Creates event in Redis with TTL
5. Initializes location pool (all available)
6. Returns `/event-created/:slug` with guest URL and staff URL

**Guest Flow** (NFC tap → Ticket):
1. NFC tag contains guest URL: `/e/:slug/new`
2. Server atomically increments counter (`INCR event:${slug}:counter`)
3. Generates secure token, stores ticket with TTL matching event
4. Redirects to `/e/:slug/ticket/:id?token=xxx`
5. Guest sees large ticket number + QR code (for later retrieval)

**Staff Flow** (Scanning & Check-in):
1. Staff opens `/e/:slug/staff?token=xxx` → Validates staffToken, shows dashboard
2. Scans guest's QR code → Loads `/e/:slug/ticket/:id?token=xxx&staffToken=xxx`
3. Server validates staffToken, renders skeleton HTML (no status/buttons yet)
4. JavaScript fetches fresh status from `/e/:slug/api/status/:id?staffToken=xxx`
5. Client-side renders correct buttons based on API response (Check In / Check Out)
6. Staff taps "Check In" → `POST /e/:slug/api/check-in` with staffToken in body
7. Server atomically pops location from available pool (Lua script in location-manager.js)
8. Updates ticket with location, client reloads status, displays "PLACE COAT IN C-15"

**Critical**: Location assignment uses **Lua scripts** (location-manager.js:33-95) to ensure atomicity - prevents race conditions when multiple staff work simultaneously.

**Architecture Note (v4.3.0)**: Staff ticket view uses **client-side data fetching** instead of server-side rendering for status. This prevents browser caching issues (bfcache) where cached HTML shows outdated status when rescanning tickets. Server renders static skeleton, JavaScript fetches fresh data via API on every page load. This is the correct pattern for dynamic data with client-side navigation.

### Redis Data Model

All keys namespaced by event slug, all have TTL matching event duration:

```
event:{slug}:meta                    # HASH: name, locationSchema, staffToken, expiresAt
event:{slug}:counter                 # INTEGER: Next ticket ID (atomic)
event:{slug}:ticket:{id}             # HASH: token, location, createdAt, checkedInAt
event:{slug}:available_locations     # SET: ["A-1", "A-2", ...] (atomic pop)
event:{slug}:used_locations          # SET: ["C-15"] (tracking)
event:{slug}:active                  # Marker: "1" (for cleanup)

active_events                        # SET: [slug1, slug2] (platform capacity)
ratelimit:events:{ip}                # INTEGER: Event creation count (expires 1h)
challenge:{id}                       # HASH: answer, expiresAt (5 min TTL)
ratelimit:challenges:{ip}            # INTEGER: Challenge requests (expires 1h)
```

**No background cleanup needed** - Redis TTL handles everything. Redis configured with `maxmemory 2gb`, `allkeys-lru` eviction policy, and AOF persistence (`--appendonly yes --appendfsync everysec`) to survive restarts while preserving TTL-based expiration.

### File Organization

**Core Logic**:
- `src/server.js` - Express setup, security headers, startup (no sessions as of v4.3.0)
- `src/routes.js` - All HTTP endpoints (guest, staff, API) with token-based auth
- `src/event-manager.js` - Event CRUD, slug generation
- `src/location-manager.js` - Atomic location assignment (Lua scripts)
- `src/illusion-challenge.js` - Optical illusion challenge bot prevention
- `src/redis.js` - Redis client wrapper

**Views** (EJS templates in `src/views/`):
- `index.ejs` - Landing page
- `new-event.ejs` - Event creation form (includes optical illusion challenge)
- `event-created.ejs` - Success page with URLs + QR codes
- `guest-ticket.ejs` - Guest ticket display (large number + QR)
- `staff-dashboard.ejs` - Staff interface (scan prompt + stats)
- `staff-ticket.ejs` - Staff actions (check in/out buttons)

### Security Features (v4.0.1)

**Bot Prevention** (illusion-challenge.js):
- Optical illusion challenge on event creation (no external CAPTCHA service)
- Multiple challenge types: Müller-Lyer, Ponzo, Horizontal-Vertical, Ebbinghaus, etc.
- 5-minute TTL, one-time use, rate limited (20/hour per IP)
- SVG-based visual puzzles asking users to identify correct proportions

**Platform Limits** (routes.js:11-12):
- Max 1000 active events globally
- Max 100 events created per hour (platform-wide)
- Max 10 events per IP per hour
- Max 1000 tickets per event

**Security Headers** (server.js:14-50):
- HSTS (production only): Forces HTTPS
- CSP: Prevents XSS, restricts resource loading
- X-Frame-Options: DENY (clickjacking prevention)
- X-Content-Type-Options: nosniff (MIME sniffing prevention)
- See SECURITY.md for complete threat model

### Common Development Patterns

**Adding a new API endpoint**:
1. Add route in `routes.js` (use `requireStaffAuth` middleware if staff-only)
2. Get event/ticket data with `getEvent(slug)` or `getTicket(slug, ticketId)`
3. Validate input, check conditions
4. Use Redis operations with TTL preservation:
   ```javascript
   const ttl = await redis.ttl(`event:${slug}:meta`);
   await redis.set(key, value);
   await redis.expire(key, ttl);
   ```
5. Return JSON for API endpoints, render EJS for pages

**Modifying location logic**:
- All location operations in `location-manager.js`
- Use Lua scripts for atomic operations (see `getNextLocation`)
- Never use multiple Redis commands for assignment - race condition risk

**Testing staff authentication (v4.3.0+)**:
- Pure token-based: No sessions, no cookies for auth
- Staff token stored in `event:${slug}:meta` hash
- `requireStaffAuth` middleware checks `staffToken` in body or query params
- All staff endpoints require valid staffToken matching event's staffToken
- Staff can view any ticket in their event by passing staffToken (no guest token needed)
- Token passed via URL query `?staffToken=xxx` or request body `{ staffToken: 'xxx' }`

**Working with TTL**:
- All event-related keys must have same TTL as event
- Get TTL from meta key: `await redis.ttl('event:${slug}:meta')`
- Apply to new keys immediately after creation
- Never set permanent keys for event data

## Environment Variables

Required for production:
- `BASE_URL` - Full platform URL (e.g., `https://garderobe.io`)
- `DOMAIN` - Domain for Caddy HTTPS (e.g., `garderobe.io`)

Optional configuration:
- `NODE_ENV=production` - Enables HSTS header
- `PORT=3000` - HTTP port
- `REDIS_URL=redis://redis:6379` - Redis connection
- `MAX_ACTIVE_EVENTS=1000` - Platform capacity
- `MAX_EVENTS_PER_HOUR_GLOBAL=100` - Platform-wide hourly limit
- `MAX_EVENTS_PER_IP_PER_HOUR=10` - Per-IP rate limit
- `MAX_TICKETS_PER_EVENT=1000` - Per-event ticket limit

## Important Constraints

**Never Add**:
- User accounts or persistent authentication (defeats the "zero friction" purpose)
- Permanent data storage (everything must be ephemeral)
- Email/SMS features without explicit request (KISS principle)
- External dependencies for core features (must work self-hosted)

**Always Maintain**:
- Redis TTL on all event-related keys
- Atomic operations for location assignment
- Security headers in production
- Token validation on guest ticket access
- Staff token validation for staff endpoints (no sessions)

**Mobile-First Design**:
- All views must work on small screens (primary use case)
- Large touch targets (buttons 44px+ height)
- High contrast for low-light environments (clubs, events)
- QR codes sized for easy scanning

## Debugging Tips

Check event exists and TTL:
```bash
redis-cli
> EXISTS event:abc123xyz789:meta
> TTL event:abc123xyz789:meta
> HGETALL event:abc123xyz789:meta
```

View active events and capacity:
```bash
> SCARD active_events
> SMEMBERS active_events
```

Check location pool state:
```bash
> SCARD event:abc123xyz789:available_locations
> SCARD event:abc123xyz789:used_locations
```

Monitor event creation:
```bash
docker-compose logs -f app | grep "EVENT CREATED"
```

Test rate limiting:
```bash
> GET ratelimit:events:192.168.1.100
> TTL ratelimit:events:192.168.1.100
```

## Related Documentation

- `README.md` - User guide, deployment instructions, feature overview
- `PROJECT.md` - Detailed file structure, data flow diagrams, URL reference
- `SECURITY.md` - Comprehensive threat analysis, attack vectors, mitigations
- `TESTING.md` - Comprehensive testing strategy (unit, integration, E2E tests)
- `REQUIREMENTS.md` - Original technical specification (v3.1)
