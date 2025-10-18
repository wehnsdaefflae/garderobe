# Testing Strategy - Garderobe Digital

This document outlines comprehensive testing strategies to catch issues like browser caching, authentication bugs, and state management problems **before** deploying to production.

## Testing Pyramid

```
        /\
       /  \      E2E Tests (Browser automation)
      /____\     Integration Tests (API testing)
     /      \    Unit Tests (Functions & middleware)
    /________\
```

---

## 1. Unit Tests

Unit tests verify individual functions and middleware in isolation.

### Recommended Framework

```bash
npm install --save-dev jest supertest
```

### Critical Test Cases

#### Authentication Middleware (`src/routes.js`)

**Test File**: `tests/unit/auth.test.js`

```javascript
const { requireStaffAuth } = require('../../src/routes');
const { getEvent } = require('../../src/event-manager');

jest.mock('../../src/event-manager');

describe('requireStaffAuth middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { params: { slug: 'test123' }, body: {}, query: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    next = jest.fn();
  });

  test('should reject request without staffToken', async () => {
    await requireStaffAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Staff authentication required'
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('should reject request with invalid staffToken', async () => {
    req.body.staffToken = 'wrong_token';
    getEvent.mockResolvedValue({ staffToken: 'correct_token' });

    await requireStaffAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Invalid staff token'
    });
  });

  test('should accept request with valid staffToken in body', async () => {
    req.body.staffToken = 'correct_token';
    getEvent.mockResolvedValue({ staffToken: 'correct_token' });

    await requireStaffAuth(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  test('should accept request with valid staffToken in query', async () => {
    req.query.staffToken = 'correct_token';
    getEvent.mockResolvedValue({ staffToken: 'correct_token' });

    await requireStaffAuth(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  test('should return 404 if event not found', async () => {
    req.body.staffToken = 'some_token';
    getEvent.mockResolvedValue(null);

    await requireStaffAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: 'Event not found'
    });
  });
});
```

#### Location Manager (`src/location-manager.js`)

**Test File**: `tests/unit/location-manager.test.js`

```javascript
const { getNextLocation, initializeLocationPool } = require('../../src/location-manager');
const { getRedisClient } = require('../../src/redis');

describe('Location Manager', () => {
  test('should generate correct number of locations for A-Z 1-99', () => {
    const locations = generateLocationPool('A-Z 1-99');
    expect(locations.length).toBe(26 * 99); // 2574 locations
    expect(locations).toContain('A-1');
    expect(locations).toContain('Z-99');
  });

  test('should handle concurrent location assignment atomically', async () => {
    // This tests the Lua script's atomicity
    const slug = 'test-event';
    await initializeLocationPool(slug, 'A-C 1-5', 48);

    // Simulate 10 concurrent requests
    const promises = Array(10).fill(null).map(() =>
      getNextLocation(slug)
    );

    const results = await Promise.all(promises);

    // All locations should be unique (no duplicates)
    const uniqueLocations = new Set(results);
    expect(uniqueLocations.size).toBe(10);
  });
});
```

#### Challenge System (`src/illusion-challenge.js`)

**Test File**: `tests/unit/illusion-challenge.test.js`

```javascript
const { generateIllusionChallenge, verifyIllusionChallenge } = require('../../src/illusion-challenge');

describe('Illusion Challenge System', () => {
  test('should generate valid optical illusion challenge', async () => {
    const challengeId = await generateIllusionChallenge('127.0.0.1');

    expect(challengeId).toBeDefined();
    expect(challengeId.length).toBeGreaterThan(0);
  });

  test('should verify correct answer', async () => {
    const challengeId = await generateIllusionChallenge('127.0.0.1');
    // Get challenge from Redis to find answer
    const redis = getRedisClient();
    const challengeData = await redis.hGetAll(`illusion_challenge:${challengeId}`);
    const correctAnswer = challengeData.answer;

    const result = await verifyIllusionChallenge(challengeId, correctAnswer);
    expect(result).toBe(true);
  });

  test('should reject incorrect answer', async () => {
    const challengeId = await generateIllusionChallenge('127.0.0.1');
    const result = await verifyIllusionChallenge(challengeId, 'wrong');
    expect(result).toBe(false);
  });

  test('should reject reuse of same challenge', async () => {
    const challengeId = await generateIllusionChallenge('127.0.0.1');
    const redis = getRedisClient();
    const challengeData = await redis.hGetAll(`illusion_challenge:${challengeId}`);

    await verifyIllusionChallenge(challengeId, challengeData.answer);

    // Second attempt should fail (one-time use)
    const result = await verifyIllusionChallenge(challengeId, challengeData.answer);
    expect(result).toBe(false);
  });
});
```

---

## 2. Integration Tests (API Testing)

Integration tests verify API endpoints work correctly end-to-end.

### Recommended Framework

```bash
npm install --save-dev jest supertest
```

### Critical Test Cases

**Test File**: `tests/integration/api.test.js`

```javascript
const request = require('supertest');
const express = require('express');
const { setupRoutes } = require('../../src/routes');
const { initRedis, closeRedis } = require('../../src/redis');

let app;

beforeAll(async () => {
  app = express();
  app.use(express.json());
  await initRedis();
  setupRoutes(app);
});

afterAll(async () => {
  await closeRedis();
});

describe('Staff Ticket Status API', () => {
  let slug, staffToken, ticketId, guestToken;

  beforeEach(async () => {
    // Create event
    const eventResponse = await request(app)
      .post('/api/events')
      .send({
        eventName: 'Test Event',
        locationSchema: 'A-C 1-10',
        duration: 12,
        challengeId: 'test',
        answer: '42'
      });

    slug = eventResponse.body.slug;
    staffToken = eventResponse.body.staffToken;

    // Create ticket
    const ticketResponse = await request(app)
      .get(`/e/${slug}/new`)
      .redirects(1);

    const ticketUrl = ticketResponse.request.path;
    const match = ticketUrl.match(/ticket\/(\d+)\?token=([^&]+)/);
    ticketId = match[1];
    guestToken = match[2];
  });

  test('GET /e/:slug/api/status/:id should return ticket status', async () => {
    const response = await request(app)
      .get(`/e/${slug}/api/status/${ticketId}`)
      .query({ staffToken });

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('new');
    expect(response.body.location).toBeNull();
  });

  test('GET /e/:slug/api/status/:id should require staffToken', async () => {
    const response = await request(app)
      .get(`/e/${slug}/api/status/${ticketId}`);

    expect(response.status).toBe(401);
  });

  test('POST /e/:slug/api/check-in should assign location', async () => {
    const response = await request(app)
      .post(`/e/${slug}/api/check-in`)
      .send({ ticketId, staffToken });

    expect(response.status).toBe(200);
    expect(response.body.location).toMatch(/^[A-C]-([1-9]|10)$/);

    // Verify status changed
    const statusResponse = await request(app)
      .get(`/e/${slug}/api/status/${ticketId}`)
      .query({ staffToken });

    expect(statusResponse.body.status).toBe('checked_in');
    expect(statusResponse.body.location).toBe(response.body.location);
  });

  test('POST /e/:slug/api/check-out should mark ticket as returned', async () => {
    // Check in first
    await request(app)
      .post(`/e/${slug}/api/check-in`)
      .send({ ticketId, staffToken });

    // Check out
    const response = await request(app)
      .post(`/e/${slug}/api/check-out`)
      .send({ ticketId, staffToken });

    expect(response.status).toBe(200);

    // Verify status
    const statusResponse = await request(app)
      .get(`/e/${slug}/api/status/${ticketId}`)
      .query({ staffToken });

    expect(statusResponse.body.status).toBe('checked_out');
  });

  test('should prevent double check-in', async () => {
    await request(app)
      .post(`/e/${slug}/api/check-in`)
      .send({ ticketId, staffToken });

    const response = await request(app)
      .post(`/e/${slug}/api/check-in`)
      .send({ ticketId, staffToken });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/already checked in/i);
  });
});

describe('Token-based Authentication', () => {
  test('staff endpoints should accept token in query params', async () => {
    // Create event...
    const response = await request(app)
      .get(`/e/${slug}/api/status/${ticketId}`)
      .query({ staffToken });

    expect(response.status).toBe(200);
  });

  test('staff endpoints should accept token in request body', async () => {
    const response = await request(app)
      .post(`/e/${slug}/api/check-in`)
      .send({ ticketId, staffToken });

    expect(response.status).toBe(200);
  });
});
```

---

## 3. End-to-End Tests (Browser Automation)

E2E tests catch browser-specific issues like caching, state management, and navigation bugs.

### Recommended Framework

```bash
npm install --save-dev playwright @playwright/test
```

### Critical Test Cases

**Test File**: `tests/e2e/staff-flow.spec.js`

```javascript
const { test, expect } = require('@playwright/test');

test.describe('Staff Ticket Scanning Flow', () => {
  let eventSlug, staffToken, ticketUrl;

  test.beforeEach(async ({ page }) => {
    // Create event
    await page.goto('http://localhost:3000/new');
    await page.fill('input[name="eventName"]', 'E2E Test Event');
    await page.selectOption('select[name="duration"]', '12');

    // Solve challenge
    const challengeText = await page.textContent('.challenge-question');
    const answer = eval(challengeText.replace('What is', '').replace('?', ''));
    await page.fill('input[name="answer"]', answer.toString());

    await page.click('button[type="submit"]');
    await page.waitForURL('**/event-created/**');

    // Extract URLs
    const staffUrl = await page.locator('text=/staff\\?token=/').textContent();
    staffToken = new URL(staffUrl).searchParams.get('token');
    eventSlug = new URL(staffUrl).pathname.split('/')[2];

    // Create ticket
    await page.goto(`http://localhost:3000/e/${eventSlug}/new`);
    await page.waitForURL('**/ticket/**');
    ticketUrl = page.url();
  });

  test('should show correct status when scanning new ticket', async ({ page }) => {
    // Staff views ticket
    const staffTicketUrl = `${ticketUrl}&staffToken=${staffToken}`;
    await page.goto(staffTicketUrl);

    // Wait for client-side data load
    await page.waitForSelector('.btn-checkin');

    const statusLabel = await page.textContent('.ticket-status');
    expect(statusLabel).toContain('Ready for Check-In');

    const checkInButton = await page.textContent('.btn-checkin');
    expect(checkInButton).toContain('Check In Coat');
  });

  test('should show correct status when rescanning checked-in ticket (REGRESSION TEST)', async ({ page }) => {
    // Staff scans and checks in ticket
    await page.goto(`${ticketUrl}&staffToken=${staffToken}`);
    await page.waitForSelector('.btn-checkin');
    await page.click('.btn-checkin');

    // Wait for check-in to complete
    await page.waitForSelector('.location-display', { timeout: 5000 });
    const location = await page.textContent('.location-display');
    expect(location).toMatch(/^[A-Z]-\d+$/);

    // Navigate away (simulate scanning another ticket)
    await page.goto(`http://localhost:3000/e/${eventSlug}/staff?token=${staffToken}`);

    // Go back (this would trigger bfcache if not fixed)
    await page.goBack();

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // CRITICAL: Should show checkout button, NOT check-in button
    await page.waitForSelector('.btn-checkout', { timeout: 5000 });

    const statusLabel = await page.textContent('.ticket-status');
    expect(statusLabel).toContain('Checked In');

    const checkoutButton = await page.textContent('.btn-checkout');
    expect(checkoutButton).toContain('Check Out Coat');
  });

  test('should fetch fresh data even when HTML is cached', async ({ page, context }) => {
    // Check in ticket
    await page.goto(`${ticketUrl}&staffToken=${staffToken}`);
    await page.waitForSelector('.btn-checkin');
    await page.click('.btn-checkin');
    await page.waitForSelector('.location-display');

    // Open same URL in new tab (would use cached HTML)
    const newPage = await context.newPage();
    await newPage.goto(`${ticketUrl}&staffToken=${staffToken}`);

    // Should still fetch fresh status via API
    await newPage.waitForSelector('.btn-checkout', { timeout: 5000 });

    const status = await newPage.textContent('.ticket-status');
    expect(status).toContain('Checked In');
  });

  test('should handle check-in to check-out flow correctly', async ({ page }) => {
    await page.goto(`${ticketUrl}&staffToken=${staffToken}`);

    // Check in
    await page.waitForSelector('.btn-checkin');
    await page.click('.btn-checkin');

    // Verify location displayed
    await page.waitForSelector('.location-display');
    const location = await page.textContent('.location-display');

    // Checkout button should appear after delay
    await page.waitForSelector('.btn-checkout', { timeout: 5000 });
    await page.click('.btn-checkout');

    // Should redirect to dashboard
    await page.waitForURL(`**/e/${eventSlug}/staff?token=${staffToken}`);
  });
});

test.describe('Authentication Edge Cases', () => {
  test('should reject access without staffToken', async ({ page }) => {
    // Try to access staff endpoint without token
    await page.goto('http://localhost:3000/e/fake-slug/api/status/1');

    const response = await page.waitForResponse('**/api/status/**');
    expect(response.status()).toBe(401);
  });

  test('should work with staffToken in URL query', async ({ page }) => {
    // This tests that token-based auth works across navigation
    // (No session cookies needed)
  });
});
```

---

## 4. Visual Regression Tests (Optional)

Catch UI bugs by comparing screenshots.

### Recommended Framework

```bash
npm install --save-dev @playwright/test
```

**Test File**: `tests/visual/ui.spec.js`

```javascript
const { test, expect } = require('@playwright/test');

test('staff ticket view should match snapshot', async ({ page }) => {
  await page.goto('http://localhost:3000/e/test/ticket/1?token=xxx&staffToken=yyy');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot('staff-ticket-new.png');
});
```

---

## 5. Performance Tests

Verify system handles concurrent requests correctly.

**Test File**: `tests/performance/concurrent.test.js`

```javascript
const { test } = require('@playwright/test');

test('should handle 50 concurrent check-ins without race conditions', async ({ page, context }) => {
  // Create event with 100 locations
  // Create 50 tickets
  // Check in all 50 tickets concurrently
  // Verify all get unique locations

  const promises = tickets.map(async (ticketId) => {
    const page = await context.newPage();
    const response = await page.request.post(checkInUrl, {
      data: { ticketId, staffToken }
    });
    return response.json();
  });

  const results = await Promise.all(promises);
  const locations = results.map(r => r.location);
  const uniqueLocations = new Set(locations);

  // All locations should be unique (Lua script atomicity)
  expect(uniqueLocations.size).toBe(50);
});
```

---

## 6. Running Tests

### NPM Scripts

Add to `package.json`:

```json
{
  "scripts": {
    "test": "jest",
    "test:unit": "jest tests/unit",
    "test:integration": "jest tests/integration",
    "test:e2e": "playwright test",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  }
}
```

### CI/CD Integration

**`.github/workflows/test.yml`**:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      redis:
        image: redis:7-alpine
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'

      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration

      - name: Install Playwright
        run: npx playwright install --with-deps

      - run: npm run test:e2e

      - uses: actions/upload-artifact@v3
        if: failure()
        with:
          name: playwright-screenshots
          path: test-results/
```

---

## 7. What These Tests Would Have Caught

### Browser Caching Bug (v4.3.0)

**The Issue**: Staff rescanning checked-in tickets saw "Check In" button instead of "Check Out"

**Test That Would Catch It**:
```javascript
test('should show correct status when rescanning checked-in ticket (REGRESSION TEST)', async ({ page }) => {
  // Check in ticket
  await page.click('.btn-checkin');

  // Navigate away and back (triggers bfcache)
  await page.goBack();

  // CRITICAL: Should show checkout button, NOT check-in button
  await page.waitForSelector('.btn-checkout', { timeout: 5000 });
});
```

**Why It Works**: Playwright simulates real browser behavior including bfcache. This test would have failed before the fix, forcing us to discover the issue.

### Session vs Token Auth Confusion

**The Issue**: Mixed authentication methods (sessions + tokens) caused complexity

**Test That Would Catch It**:
```javascript
test('should work without session cookies (token-only auth)', async ({ page, context }) => {
  // Disable cookies entirely
  await context.clearCookies();

  // Should still work with token in URL
  await page.goto(`${ticketUrl}?staffToken=${staffToken}`);
  await page.waitForSelector('.btn-checkin');
});
```

### Location Assignment Race Conditions

**The Issue**: Multiple staff checking in tickets at same time could get duplicate locations

**Test That Would Catch It**:
```javascript
test('concurrent check-ins should get unique locations', async () => {
  const promises = Array(20).fill(null).map(() =>
    checkInTicket(slug, ticketId, staffToken)
  );

  const results = await Promise.all(promises);
  const locations = results.map(r => r.location);
  expect(new Set(locations).size).toBe(20); // All unique
});
```

---

## 8. Recommended Testing Schedule

- **Pre-commit**: Run unit tests (`npm run test:unit`)
- **Pre-push**: Run integration tests (`npm run test:integration`)
- **CI/CD**: Run all tests including E2E
- **Pre-release**: Manual smoke testing + full E2E suite

---

## 9. Test Coverage Goals

- **Unit Tests**: 80%+ coverage for business logic
- **Integration Tests**: All API endpoints
- **E2E Tests**: All critical user flows (create event, check-in, check-out)

---

## 10. Quick Start

```bash
# Install test dependencies
npm install --save-dev jest supertest playwright @playwright/test

# Create test structure
mkdir -p tests/{unit,integration,e2e}

# Run tests
npm run test:all
```

---

## Summary

These tests would have caught:
1. ✅ Browser caching bug (E2E test with navigation)
2. ✅ Authentication issues (integration tests)
3. ✅ Race conditions (concurrent tests)
4. ✅ State management bugs (E2E flow tests)

**Investment**: 2-3 days to write comprehensive test suite
**Payoff**: Catch 90% of bugs before production deployment
