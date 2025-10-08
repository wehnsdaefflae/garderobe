# Garderobe Digital: Technical Requirements Document

**Project:** Garderobe Digital - A "Zero-Material" NFC Wardrobe System  
**Version:** 3.1 (Final - Security Update)  
**Date:** October 8, 2025

## 1. Project Vision & Goal

The goal of this project is to create an ultra-modern, seamless, and elegant wardrobe check-in system for events in a city like Berlin. The system must align with a "no-friction" guest experience, requiring absolutely no pre-registration, app installation, or physical claim tickets.

The core interaction should feel magical: a guest taps their phone on a single point at the counter and receives a secure, digital claim ticket with a unique token. Staff can check in and retrieve coats by simply scanning a QR code with their own authenticated phone. The system must be fast, reliable, secure, and operationally efficient, especially during peak hours.

## 2. Core Principles & Non-Negotiable Constraints

- **Zero Physical Materials:** The system must function without requiring any consumable or persistent physical items beyond the staff's smartphones and a single NFC tag at the counter. No paper tickets, no plastic tokens, no dedicated barcode scanners.

- **Zero Guest Preparation:** Guests must not be required to install an app, create an account, or register in any way. The system must work natively on all modern smartphones (iOS and Android).

- **Minimal Setup & Deployment:** The entire system must be containerized (e.g., using Docker). Deployment should be achievable with a single command (docker-compose up). All configuration must be handled via environment variables.

- **Zero Maintenance:** The system must be "set it and forget it." It must not require database administration or manual backups. The data store must be configured for persistence to survive system restarts.

- **Security:** Each ticket must include a cryptographically secure token to prevent unauthorized access. Guests cannot access other tickets by guessing or incrementing ticket IDs.

## 3. System Architecture Overview

The system consists of three main components that communicate via a central web server:

1. **Guest Phone:** Interacts with the NFC tag and displays the digital ticket with a secure token.
2. **Web Server (API & Frontend):** The core logic. It generates IDs and tokens, serves the ticket page, handles authentication, and provides the staff interface.
3. **Staff Phone:** Used to scan guest QR codes and manage the check-in/retrieval process. Staff authenticate once at the start of their shift.

## 4. User Workflows

### 4.1. Guest Workflow: Acquiring a Ticket

1. The guest arrives at the wardrobe and taps their smartphone on the central NFC tag.
2. The NFC tag contains a URL to the "new ticket" endpoint (e.g., https://garderobe.berlin/new).
3. The server generates:
   - A new, unique, sequential ID (e.g., `142`)
   - A cryptographically secure random token (e.g., `7k9m2pqr`)
4. The server immediately redirects the guest's browser to a permanent, unique URL for that ticket (e.g., https://garderobe.berlin/ticket/142?token=7k9m2pqr).
5. The guest's phone displays the ticket page, showing:
   - Their ticket number in a large font
   - A scannable QR code (containing the full URL with token)
   - A clear warning message: "This is your only way to retrieve your coat. Do not close this page or share this screen."

### 4.2. Staff Authentication

1. At the start of their shift, staff navigate to https://garderobe.berlin/staff on their phone.
2. They enter a simple password (configured via environment variable).
3. The system sets a session cookie, marking them as authenticated. They keep this browser tab open for their shift.

### 4.3. Staff Workflow: Coat Drop-Off

1. The guest presents their phone screen with the QR code.
2. The staff member scans the QR code using their authenticated phone's camera.
3. The staff phone loads the ticket URL (including the security token), which displays the ticket's status (e.g., "TICKET #142: READY FOR CHECK-IN") and a large "CHECK IN COAT" button.
4. The staff member taps the button. The system assigns the ticket to the next available physical location (e.g., Rack C, Spot 15) and displays it prominently: "PLACE COAT #142 IN C-15".
5. The staff member places the coat in the assigned location.

### 4.4. Staff Workflow: Coat Retrieval

1. The guest returns and shows their ticket's QR code (from their browser history or saved page).
2. The staff member scans the QR code.
3. The staff phone loads the ticket URL, which looks up the ticket's location and displays it: "RETRIEVE COAT #142 FROM C-15", along with a "Check Out" button.
4. The staff member retrieves the coat.
5. After handing the coat to the guest, the staff member taps the "Check Out" button to complete the transaction and free up the location.

## 5. Detailed Technical Requirements

### 5.1. Backend / API

**ID and Token Generation (GET /new):**
- Must generate a new, unique, sequential ID using an atomic increment command (e.g., Redis INCR) to prevent race conditions.
- Must generate a cryptographically secure random token (minimum 16 characters, alphanumeric). Use a secure random function (e.g., Node.js `crypto.randomBytes()`, Python `secrets.token_urlsafe()`).
- It must respond with an HTTP 302 redirect to `/ticket/{id}?token={token}`.

**Authentication & Session Management:**
- **POST /staff/login:** Validates a password (from `STAFF_PASSWORD` env var) and sets a secure, HTTP-only session cookie.
- Session lifetime should be configured for a standard shift (e.g., 12 hours).

**Data Storage:**
- A simple, zero-maintenance key-value store is required. Redis is the preferred choice.
- Crucially, the data store must be configured for data persistence (e.g., Redis AOF or RDB snapshots) to ensure no data is lost on restart.
- The store needs to hold:
  - Global counter for the next ticket ID
  - Ticket ID → Ticket Data mapping, where Ticket Data is an object containing:
    - `token`: The security token (string)
    - `location`: The physical location (string, or null if not checked in)
  - Set/list of available locations

**Location Logic:**
- Location schema must be configurable via an environment variable (e.g., `LOCATION_SCHEMA="A-F:1-50"`).
- The system must track and assign the next available spot in a logical order.

**Guest Ticket Access (GET /ticket/{id}):**
- **For unauthenticated users (guests):**
  - Requires `?token=xxx` query parameter.
  - Validates that the token matches the stored token for the given ticket ID.
  - If token is invalid or missing, return HTTP 404 (do not reveal whether the ticket exists).
  - If valid, serve the guest ticket page.
- **For authenticated staff users:**
  - Token parameter is not required (staff authentication is sufficient).
  - Serve the staff action page based on ticket status.

**Staff API Endpoints (All require authentication):**

- **GET /api/status/{id}:** 
  - A "safe" endpoint that returns the current status of a ticket.
  - Requires staff authentication.
  - Does NOT require the token parameter.
  - Returns: `{ "status": "new" }` or `{ "status": "checked_in", "location": "C-15" }`.

- **POST /api/check-in:** 
  - Requires staff authentication.
  - Accepts `{ "ticketId": 142 }`.
  - Assigns the next available location, saves the mapping, and returns the assigned location.
  - Returns: `{ "ticketId": 142, "location": "C-15", "status": "checked_in" }`.
  - If all locations are full, returns an error: `{ "error": "Wardrobe full" }`.

- **POST /api/check-out:** 
  - Requires staff authentication.
  - Accepts `{ "ticketId": 142 }`.
  - Clears the location mapping and returns the location to the available pool.
  - Returns: `{ "ticketId": 142, "status": "checked_out" }`.

### 5.2. Frontend - Guest Ticket Page (/ticket/{id}?token=xxx)

**For Unauthenticated Users (Guests):**
- Must be a clean, high-contrast, mobile-first page.
- Display the Ticket ID in a very large, easily readable font (e.g., 120px+).
- Display a QR code encoding the full ticket URL with token (e.g., https://garderobe.berlin/ticket/142?token=7k9m2pqr).
- **Include a prominent warning message:**
  - "**Save this page!** This is your only way to retrieve your coat."
  - "Do not close this page. You can find it in your browser history."
  - "Do not share this screen with anyone."
- Optional: Include a "Add to Home Screen" or "Bookmark this page" suggestion for iOS/Android.
- The page must contain no external trackers or unnecessary scripts to ensure fast loading and respect guest privacy.

### 5.3. Frontend - Staff Interface

**Login Page (/staff):**
- A simple password form.
- Clear branding: "Garderobe Digital - Staff Login"

**Ticket Action Page (GET /ticket/{id} for authenticated staff):**
- This page fetches the ticket's status from `GET /api/status/{id}`.
- Based on the status, it displays the correct context and action button:
  - **New ticket:** "TICKET #142: READY FOR CHECK-IN" + large "CHECK IN COAT" button (green background)
  - **Checked in:** "TICKET #142: CHECKED IN" + "RETRIEVE COAT FROM C-15" message + "Check Out" button (blue background)
  - **Checked out:** "TICKET #142: ALREADY CHECKED OUT" message (gray background)
- Buttons trigger the corresponding POST API calls.
- Upon a successful action, provide clear visual and haptic feedback (a slight vibration) to the staff's phone.
- Display results prominently after actions:
  - After check-in: "PLACE COAT #142 IN C-15" (large, bold text)
  - After lookup: "RETRIEVE COAT #142 FROM C-15" (large, bold text)

**Manual Entry Fallback:**
- A small link or button ("Can't Scan?") should be present at the bottom of the staff interface.
- This opens a dialog where a staff member can manually type in a ticket number to look it up.
- This triggers the same lookup flow as scanning.

**Logout Button:**
- Present in the corner of staff pages for end-of-shift logout.

### 5.4. Deployment & Configuration

**Containerization:**
- The entire application must be containerized in a `docker-compose.yml` file for single-command deployment (`docker-compose up -d`).
- The compose file should include:
  - The web application container
  - Redis container with persistence enabled (volume mount for data)

**Environment Variables (.env file):**
- `STAFF_PASSWORD`: Password for staff login.
- `LOCATION_SCHEMA`: Physical location configuration (e.g., "A-F:1-50").
- `SESSION_SECRET`: Secret key for session cookies (must be cryptographically random).
- `SESSION_DURATION_HOURS`: Defaults to 12.
- `REDIS_URL`: Connection string for the data store (e.g., "redis://redis:6379").
- `PORT`: Port for the web server (default: 3000).
- `DOMAIN`: Domain name for the application (e.g., "garderobe.berlin"), used for generating absolute URLs.

**SSL/TLS:**
- Must be configured for production use (e.g., via a Caddy or Nginx reverse proxy).
- Recommended: Use Caddy for automatic HTTPS with Let's Encrypt.

**Redis Persistence:**
- Redis must be configured with either AOF (Append-Only File) or RDB snapshots.
- In `docker-compose.yml`, mount a volume for Redis data: `./data/redis:/data`.

## 6. Additional Considerations

**Error Handling:**
- If all physical locations are full, the API must return an error, and the staff interface must clearly display: "⚠️ WARDROBE FULL - NO AVAILABLE SPOTS"
- If a guest attempts to access a ticket with an invalid token, return a generic 404 page (do not reveal that the ticket ID exists).
- If staff scan a ticket that has already been checked out, display: "TICKET #142: ALREADY CHECKED OUT" and do not show action buttons.

**Concurrency:**
- The system must safely handle multiple staff members working simultaneously.
- Use Redis transactions (MULTI/EXEC) or Lua scripts to ensure atomic check-in and check-out operations.
- The location assignment must be atomic to prevent two staff members from assigning the same location.

**Token Security:**
- Tokens must be at least 16 characters and use a cryptographically secure random generator.
- Tokens should be URL-safe (alphanumeric, no special characters).
- Consider using a hash-based approach (e.g., HMAC) if preferred, but simple random tokens are sufficient for this use case.

**Guest Experience:**
- The ticket page should be designed to work well when bookmarked or added to the home screen on iOS/Android.
- Consider adding a `<meta name="apple-mobile-web-app-capable" content="yes">` tag for better iOS experience.
- The QR code should be large enough to be easily scannable even in low light conditions.

**Staff Experience:**
- The staff interface should auto-focus on the scan input after each action to prepare for the next scan.
- Consider adding sound feedback (optional, configurable) in addition to haptic feedback.
- The manual entry fallback should be quick and not require switching pages.

**Performance:**
- All API endpoints should respond in under 100ms under normal load.
- The guest ticket page should load in under 1 second on 3G connections.
- Redis operations should use pipelining where appropriate to minimize round trips.

**Monitoring (Optional but Recommended):**
- Log all check-in and check-out events with timestamps.
- Track metrics: total tickets issued, average retrieval time, current capacity usage.
- These logs can help optimize the location schema for future events.