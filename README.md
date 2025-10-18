# 🧥 Garderobe Digital - Free Ephemeral Coat Check Platform

**Create a temporary wardrobe management system for your event in 30 seconds. No registration. No cost. No hassle.**

## Overview

Garderobe Digital is a free, open-source platform that lets anyone instantly create a temporary NFC-based coat check system for their event. Perfect for clubs, festivals, parties, conferences, or any event that needs coat management.

### How It's Different

- ✅ **Single platform** that hosts multiple events
- ✅ **Zero registration** - just visit, create, and go
- ✅ **Zero persistence** - events auto-delete after 72 hours
- ✅ **Zero friction** - works on any smartphone without apps

## Quick Start (For Event Organizers)

### 1. Create Your Event

Visit **[garderobe.markwernsdorfer.com](http://garderobe.io)** and click "Create New Event":

1. Enter event name (optional)
2. Configure your location layout (e.g., Racks A-F, Spots 1-50)
3. Choose duration (12h, 24h, or 48h)
4. Click "Create Event"

### 2. Get Your URLs

You'll immediately receive two URLs:

```
📱 Guest URL:  https://garderobe.markwernsdorfer.com/e/abc123xyz789/new
👔 Staff URL:  https://garderobe.markwernsdorfer.com/e/abc123xyz789/staff
```

**⚠️ Save these now! We don't send emails or store accounts.**

### 3. Setup NFC Tags

1. Buy programmable NFC tags (NTAG213/215/216)
2. Write the **Guest URL** to your NFC tags
3. Place tags at your coat check counter

### 4. Brief Your Staff

1. Send them the **Staff URL**
2. Have them bookmark it on their phones
3. They keep the tab open during the event

### 5. You're Done!

- Guests tap NFC tags → Get digital tickets
- Staff scan QR codes → Check in/out coats
- System auto-deletes after event duration

## User Flows

### Guest Experience

```
1. Guest arrives at coat check
2. Taps phone on NFC tag
3. Browser opens ticket page instantly
4. Shows: Large ticket number (#142) + QR code
5. Guest saves page/screenshot
6. Later: Shows QR code to retrieve coat
```

**No app install. No registration. Works on iPhone and Android.**

### Staff Experience

```
1. Staff opens staff URL (bookmarked)
2. Ready-to-scan interface appears
3. Guest shows QR code
4. Staff phone camera scans code
5. Browser shows: "CHECK IN COAT #142" button
6. Tap button → Assigns location → "PLACE COAT IN C-15"
7. Later: Scan to retrieve → "GET COAT FROM C-15"
8. Tap "Check Out" → Location freed
```

**No special hardware. Just staff smartphones with cameras.**

## Features

### For Guests

- ⚡ **Instant tickets** - Tap NFC tag, get ticket in 1 second
- 🔒 **Secure** - Cryptographically secure tokens prevent fraud
- 📱 **Universal** - Works on all modern smartphones
- 💾 **No app needed** - Uses native browser
- 🎫 **Simple** - Just a number and QR code

### For Staff

- 📷 **Camera scanning** - Use phone camera to scan QR codes
- 🎯 **Automatic assignment** - System assigns next available location
- 📊 **Live statistics** - See capacity usage in real-time
- ⌨️ **Manual fallback** - Type ticket number if scanning fails
- 🔄 **Multi-staff** - Multiple staff can work simultaneously

### For Organizers

- ⏱️ **30-second setup** - Fastest coat check system ever
- 🔐 **Secure by design** - Unguessable event URLs
- 🗑️ **Auto-cleanup** - Events delete automatically
- 📈 **Scalable** - Handle hundreds of coats effortlessly

## Architecture

### The Clever Part: No Authentication Needed

Traditional systems use passwords to secure events. Garderobe Digital uses a different approach:

1. **Event Slug Security**: Each event gets a cryptographically random 16-character slug (e.g., `7k9m2pqr8x3n5t`)
2. **2^96 Possibilities**: Essentially unguessable
3. **Ephemeral Data**: All data auto-deletes after 24-48 hours
4. **Low Stakes**: Worst case is disruption of one event for a few hours
5. **No Personal Data**: Just coat locations, nothing sensitive

**Result**: Zero authentication complexity while maintaining security.

### Technical Stack

**Frontend:**

- Server-side rendered EJS templates
- Native camera for QR scanning (no libraries needed)
- Mobile-first responsive design

**Backend:**

- Node.js 18 + Express.js
- Redis for data storage (with TTL-based auto-deletion)
- Token-based authentication (no sessions as of v4.3.0)

**Deployment:**

- Docker + Docker Compose
- Optional Caddy for automatic HTTPS
- Single $5-10/month VPS can handle 100+ simultaneous events

### Data Model

All data is namespaced by event slug and has TTL set:

```redis
# Event metadata (expires after event duration)
event:{slug}:meta = {name, locationSchema, expiresAt, ...}

# Ticket counter
event:{slug}:counter = 142

# Individual tickets
event:{slug}:ticket:{id} = {token, location, createdAt, ...}

# Location pools
event:{slug}:available_locations = SET["A-1", "A-2", ..., "F-50"]
event:{slug}:used_locations = SET["C-15", "D-32", ...]
```

**All keys auto-expire with Redis TTL - no background cleanup needed!**

## Deployment (Self-Hosting)

Want to host your own instance? Easy!

### Quick Deploy

```bash
# 1. Clone repository
git clone https://github.com/wehnsdaefflae/garderobe.git
cd garderobe

# 2. Configure
cp .env.example .env
nano .env  # Set BASE_URL and DOMAIN

# 3. Deploy
docker-compose up -d

# 4. Access
open http://localhost:3000
```

### Production Deployment

```bash
# 1. Get a domain
# Point your DNS to your server

# 2. Update .env
DOMAIN=garderobe.yourdomain.com
BASE_URL=https://garderobe.yourdomain.com
NODE_ENV=production

# 3. Enable HTTPS (edit docker-compose.yml)
# Uncomment the caddy service

# 4. Deploy
docker-compose up -d

# 5. Done!
# Caddy automatically gets SSL cert from Let's Encrypt
```

### Requirements

- **Server**: Any VPS with 1GB RAM (Hetzner, DigitalOcean, etc.)
- **Cost**: $5-10/month
- **Capacity**: 100+ simultaneous events
- **Maintenance**: Zero (set it and forget it)

### Configuration

Edit `.env`:

```bash
# Server
PORT=3000
DOMAIN=garderobe.yourdomain.com
BASE_URL=https://garderobe.yourdomain.com

# Platform limits
MAX_ACTIVE_EVENTS=1000              # Total concurrent events
MAX_EVENTS_PER_HOUR_GLOBAL=100      # Platform-wide hourly limit
MAX_EVENTS_PER_IP_PER_HOUR=10       # Per-IP hourly limit
MAX_TICKETS_PER_EVENT=1000          # Per-event ticket limit

# Environment
NODE_ENV=production
```

## Security & Abuse Prevention

### Bot Protection

**Optical Illusion Challenge System** (No CAPTCHA required):

- Visual perception challenge on event creation using optical illusions
- Prevents automated bot attacks
- No external services or tracking
- Accessible and user-friendly

### Platform-Wide Limits

1. **Max 1000 active events** - Platform-wide capacity limit
2. **Max 100 events/hour** - Global hourly creation limit
3. **Max 10 events/hour per IP** - Per-IP rate limiting
4. **Max 1000 tickets per event** - Per-event capacity
5. **Max 20 challenges/hour per IP** - Challenge request limiting

### Security Headers

**HSTS** (Production only):

- Forces HTTPS for all connections
- 1-year duration with subdomains
- Preload eligible

**Content Security Policy**:

- Prevents XSS attacks
- Blocks unauthorized scripts
- Restricts resource loading

**Additional Headers**:

- X-Frame-Options: DENY (clickjacking protection)
- X-Content-Type-Options: nosniff (MIME sniffing protection)
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: Disables geolocation, microphone; allows camera (for QR scanning)

### Token-Based Authentication (v4.3.0+)

- Pure token-based authentication (no sessions, no cookies)
- Staff tokens passed in URL query parameters
- 32-character cryptographically secure tokens
- Simpler and more reliable across all browsers

### Data Protection

1. **Ephemeral Data**: All data auto-deletes (no permanent storage)
2. **No Personal Data**: System doesn't collect or store personal info
3. **Event Isolation**: Events are completely isolated by slug
4. **Cryptographic Tokens**: 64^16 possible combinations (unguessable)

### For More Details

See `SECURITY.md` for comprehensive security analysis, attack vector mitigation strategies, and incident response procedures.

### Monitoring

View system health:

```bash
# Check status
curl http://localhost:3000/health

# View logs
docker-compose logs -f app

# Monitor capacity
docker-compose logs app | grep "EVENT CREATED"
```

## FAQ

### For Event Organizers

**Q: How do I recover my event URLs if I lose them?**
A: You can't. There's no account system or email recovery. Save the URLs immediately when you create the event.

**Q: Can I extend my event duration?**
A: Not currently. Plan your event duration appropriately when creating.

**Q: What happens when the event expires?**
A: All data (tickets, locations, statistics) automatically deletes from Redis. No cleanup needed.

**Q: Can guests retrieve their tickets later?**
A: Yes, if they saved/bookmarked the ticket page or kept it in browser history.

**Q: What if someone shares the staff URL?**
A: Anyone with the staff URL can manage coats. Keep it private. If leaked, create a new event.

### For Self-Hosters

**Q: How many events can one instance handle?**
A: A small VPS (1GB RAM) can easily handle 100+ simultaneous events with thousands of tickets each.

**Q: Do I need to backup Redis?**
A: No! While Redis persists data to survive restarts, events are ephemeral by design and auto-delete after their duration. No manual backups needed.

**Q: Can I customize the UI?**
A: Yes! All views are in `src/views/`. Edit the EJS templates to match your branding.

**Q: Is Redis persistence needed?**
A: Yes, for reliability. Redis uses AOF (Append Only File) persistence to survive server restarts. TTL-based auto-deletion still works—data expires after event duration regardless of persistence.

### Technical

**Q: Why no PostgreSQL or MongoDB?**
A: Redis with TTL handles everything needed for ephemeral data. Simpler = more reliable.

**Q: How secure are the event slugs?**
A: 16-character base64url = ~95 bits of entropy = effectively unguessable.

**Q: What about GDPR/data privacy?**
A: System collects no personal data. Only coat locations and ticket numbers. All auto-deletes.

**Q: Can staff see other events?**
A: No. Staff tokens are unique per event. Complete isolation.

## Contributing

This is an open-source community project!

### Ways to Contribute

1. **Report Bugs**: Open an issue on GitHub
2. **Suggest Features**: Discuss in GitHub Discussions
3. **Submit PRs**: Improvements welcome
4. **Host Public Instances**: Run your own garderobe.io
5. **Spread the Word**: Tell event organizers about it

### Development Setup

```bash
# Install dependencies
npm install

# Start development mode (with auto-reload)
npm run dev

# Run tests
npm test                    # All tests
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests

# Test coverage
npm run test:coverage
```

### Code Style

- ES6+ JavaScript
- Functional where possible
- Comprehensive comments
- Error handling on all async operations
- Mobile-first design

## Roadmap

**Not planned:**

- ❌ User accounts (defeats the purpose)
- ❌ Permanent data storage (ephemeral is the point)
- ❌ Payment/billing (free forever)
- ❌ Mobile apps (web works perfectly)

## License

MIT License - Free to use, modify, and distribute.

## Credits

Built with ❤️ for the events community.

**Core Tech:**

- Node.js & Express.js
- Redis
- Docker & Caddy
- QR Code generation

**Inspired by:**

- The Berlin club scene
- Zero-friction user experiences
- Ephemeral design principles
- Open-source philosophy

## Support

### For Users

- **Documentation**: This README
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions

### For Developers

- **Development Guide**: See `CLAUDE.md`
- **Testing Guide**: See `TESTING.md`
- **Security Analysis**: See `SECURITY.md`
- **Changelog**: See `CHANGELOG.md`

## Community

- **GitHub**: https://github.com/wehnsdaefflae/garderobe
- **Documentation**: See project files (CLAUDE.md, TESTING.md, SECURITY.md)

---

**Version**: 4.3.0 (Staff View Fix & Architecture Improvement)
**Last Updated**: October 9, 2025
**Status**: ✅ Production Ready
