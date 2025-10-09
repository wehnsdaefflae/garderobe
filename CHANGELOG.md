# Changelog - Garderobe Digital

## [4.3.0] - 2025-10-09 - Staff View Fix & Architecture Improvement 🔧

### Critical Bug Fix

**Staff View Caching Issue (Resolved):**
- ✅ Fixed staff seeing wrong ticket status when rescanning already-checked-in tickets
- ✅ Browser was caching server-rendered HTML, showing outdated "Check In Coat" button
- ✅ **Root cause:** Server-side rendering of dynamic data + aggressive browser caching (bfcache)
- ✅ **Solution:** Architectural change to client-side data fetching

### Architecture Changes

**Ticket Status Rendering:**
- ✅ Server now renders static skeleton only (no status, no buttons)
- ✅ JavaScript fetches fresh status from `/e/:slug/api/status/:id` API on page load
- ✅ Status and buttons rendered client-side based on API response
- ✅ **Result:** Even if HTML is cached, data is always fresh from API

**Staff Authentication:**
- ✅ Enhanced `requireStaffAuth` middleware to accept staffToken in body/query as fallback
- ✅ All staff API endpoints (check-in, check-out, status) now support token-based auth
- ✅ Works reliably even when session cookies aren't preserved across navigation

### UX Improvements

**Check-In Flow:**
- ✅ After check-in: Shows prominent location display "Place coat in C-15"
- ✅ Checkout button appears after 2 seconds (staff can scan next ticket or check out immediately)
- ✅ Removed confusing UI states that restored old content after actions

### Code Cleanup

**Removed Failed Attempts:**
- ❌ Cache-control headers (didn't prevent browser caching)
- ❌ Pageshow event listeners (unreliable across browsers)
- ❌ Server-side status passing to templates (caused the bug)
- ✅ Cleaner codebase with correct separation of concerns

### Technical Details

**Modified Files:**
- `src/routes.js` - Removed status/location from staff-ticket template rendering, kept debug logging
- `src/routes.js` - Enhanced `requireStaffAuth` middleware with token fallback (lines 738-768)
- `src/views/staff-ticket.ejs` - Complete rewrite: skeleton HTML + client-side API fetching
- `src/views/staff-ticket.ejs` - Improved check-in/checkout flow with better state management

**Key Insight:**
Modern browsers aggressively cache pages for back/forward navigation (bfcache). No amount of cache headers reliably prevents this. The correct solution is **separating data from presentation** - render static HTML, fetch dynamic data client-side via API. This is how SPAs avoid caching issues.

### Breaking Changes

None. Fully backward compatible. All functionality preserved, just more reliable.

---

## [4.2.0] - 2025-10-09 - Mobile Features & Fixes 📱

### Features Added

**PWA Features:**
- ✅ "Save QR Code" button on guest tickets - downloads QR as PNG image
- ✅ Screenshot instructions for ticket saving
- ✅ Service worker for offline ticket caching
- ✅ App icons (192x192 and 512x512) with gradient + coat emoji
- ✅ Manifest.json for PWA support

**UI Improvements:**
- ✅ Version number automatically displayed on landing page (reads from package.json)
- ✅ Staff URL now shows first on Event Created page (prioritized for organizers)
- ✅ "Built in Berlin with ❤️" added to footer
- ✅ GitHub link corrected to https://github.com/wehnsdaefflae/garderobe

**Mobile Camera Scanning:**
- ✅ html5-qrcode library now served locally (367KB, no CDN dependency)
- ✅ Camera permission policy changed to `camera=(self)` for QR scanning
- ✅ Loading states and error messages for scanner
- ✅ Better error handling when camera fails to initialize

### Fixes

**Session Cookie Fix (Critical):**
- ✅ Changed `sameSite: 'strict'` to `sameSite: 'lax'` in session cookies
- ✅ Staff can now scan guest QR codes and see staff view with check-in/out buttons
- ✅ Session cookies now work across QR code scans and camera app navigation
- ✅ CSRF protection maintained while allowing legitimate cross-context navigation

**Data Persistence:**
- ✅ Redis AOF persistence enabled (`--appendonly yes --appendfsync everysec`)
- ✅ `redis_data` volume added for data survival across server restarts
- ✅ TTL-based expiration still works (events auto-delete after duration)
- ✅ Documentation updated to clarify persistence vs. ephemeral design

### Technical Changes

**Deployment:**
- ✅ `deploy-remote.sh` script for easy remote deployment from local machine
- ✅ Automatic HTTPS with Caddy and Let's Encrypt
- ✅ Environment variable configuration via `.env`

**Security:**
- ✅ Updated SECURITY.md to reflect camera permission change
- ✅ CSP updated to allow local html5-qrcode script

**Documentation:**
- ✅ README.md updated with Redis persistence explanation
- ✅ CLAUDE.md created for AI assistant context
- ✅ Automatic version management (single source of truth in package.json)

### Modified Files

- `package.json` - Version bump to 4.2.0, automatic version in views
- `src/server.js` - Session cookie sameSite changed to 'lax', camera permissions
- `src/routes.js` - Version passed to landing page
- `src/views/index.ejs` - Dynamic version display, corrected GitHub link, Berlin attribution
- `src/views/event-created.ejs` - Staff URL shown first
- `src/views/guest-ticket.ejs` - Save QR button, screenshot instructions, simplified PWA
- `src/views/staff-dashboard.ejs` - Local html5-qrcode script, better error handling
- `docker-compose.yml` - Redis persistence with AOF and volume
- `deploy-remote.sh` - Remote deployment script
- `CLAUDE.md` - AI context documentation
- `README.md` - Redis persistence FAQ updates
- `SECURITY.md` - Camera permission documentation

### New Files

- `src/public/html5-qrcode.min.js` - QR scanner library (367KB)
- `src/public/manifest.json` - PWA manifest
- `src/public/icon-192.png` - App icon 192x192
- `src/public/icon-512.png` - App icon 512x512
- `src/public/sw.js` - Service worker for offline support
- `deploy-remote.sh` - Remote deployment automation
- `CLAUDE.md` - Development documentation for AI

### Breaking Changes

None. Fully backward compatible.

---

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
