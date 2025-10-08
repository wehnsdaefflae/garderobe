# Changelog - Garderobe Digital

## [4.0.1] - 2025-10-08 - Security Hardened ✅

### Security Improvements

**Bot Protection:**
- ✅ Custom math challenge system (no external CAPTCHA services)
- ✅ Simple arithmetic challenges (addition, subtraction, multiplication)
- ✅ 5-minute challenge TTL with one-time use
- ✅ Challenge rate limiting (20 requests/hour per IP)

**Platform Limits:**
- ✅ Global active events limit (1000 max)
- ✅ Global hourly creation limit (100 events/hour platform-wide)
- ✅ Per-IP hourly limit (10 events/hour per IP)
- ✅ Per-event ticket limit (1000 tickets per event)

**Security Headers:**
- ✅ HSTS header (production only): `max-age=31536000; includeSubDomains; preload`
- ✅ Content Security Policy (CSP) - Prevents XSS attacks
- ✅ X-Frame-Options: DENY - Prevents clickjacking
- ✅ X-Content-Type-Options: nosniff - Prevents MIME sniffing
- ✅ X-XSS-Protection: 1; mode=block
- ✅ Referrer-Policy: strict-origin-when-cross-origin
- ✅ Permissions-Policy - Disables geolocation, camera, microphone

**Session Security:**
- ✅ SameSite=Strict cookies for CSRF protection
- ✅ HTTP-only cookies (already implemented)
- ✅ Secure flag in production (already implemented)

### New Files

- `src/challenge.js` - Math challenge generation and verification system
- `SECURITY.md` - Comprehensive security analysis and documentation

### Modified Files

- `src/server.js` - Added security headers middleware
- `src/routes.js` - Integrated challenge system and global platform limits
- `src/views/new-event.ejs` - Added challenge UI to event creation form
- `.env` and `.env.example` - Added platform limit configuration
- `docker-compose.yml` - Added new environment variables
- `README.md` - Updated security documentation

### Attack Mitigation Summary

All critical attack vectors addressed:
- ✅ Event creation bot attacks → Math challenge + multi-layer rate limiting
- ✅ Platform resource exhaustion → Global active events limit
- ✅ Cross-site scripting (XSS) → CSP headers
- ✅ Man-in-the-middle (MITM) → HSTS headers
- ✅ Cross-site request forgery (CSRF) → SameSite cookies
- ✅ Clickjacking → X-Frame-Options header

**Status:** Production ready with defense-in-depth security.

---

## [4.0.0] - 2025-10-08 - Platform Edition 🎉

### Complete Redesign

Garderobe Digital is now a free, open, ephemeral platform where anyone can create temporary coat check systems for their events in 30 seconds.

### Features

**Platform:**
- Landing page for instant event creation
- Multi-tenant architecture with event slug isolation
- Auto-expiring events (12h, 24h, or 48h)
- Zero registration, zero cost, zero friction

**Security:**
- Cryptographically secure 16-character event slugs
- Session-based staff detection per event
- Rate limiting (10 events/hour/IP)
- Ticket limits (1000 per event)

**Tech Stack:**
- Node.js 18 + Express.js
- Redis with TTL-based auto-deletion
- Docker + Docker Compose
- EJS templates

**URL Structure:**
- Landing: `/`
- Create event: `/new`
- Guest URL: `/e/{slug}/new`
- Staff URL: `/e/{slug}/staff`
- Tickets: `/e/{slug}/ticket/{id}?token=xxx`

---

**Version:** 4.0.0
**License:** MIT
