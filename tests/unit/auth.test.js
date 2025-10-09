/**
 * Authentication Tests - Token-based authentication (no sessions)
 * Tests for v4.3.0 session removal and pure token-based auth
 */

const request = require('supertest');
const express = require('express');
const path = require('path');
const { initRedis, closeRedis } = require('../../src/redis');
const { setupRoutes } = require('../../src/routes');
const { createEvent, buildLocationSchema } = require('../../src/event-manager');
const { initializeLocations } = require('../../src/location-manager');

let app;

beforeAll(async () => {
  // Initialize test app
  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Set up EJS view engine (required for template rendering)
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '../../src/views'));

  // Connect to Redis
  await initRedis();

  // Setup routes
  setupRoutes(app);
});

afterAll(async () => {
  // Cleanup
  await closeRedis();
});

describe('Token-based Staff Authentication', () => {
  let slug, staffToken;

  beforeEach(async () => {
    // Build location schema in correct format (A-C:1-10)
    const locationSchema = buildLocationSchema('A', 'C', 1, 10);

    // Create a test event
    const event = await createEvent({
      eventName: 'Auth Test Event',
      locationSchema,
      durationHours: 12
    });
    slug = event.slug;
    staffToken = event.staffToken;

    // Initialize location pool (just like the app does after createEvent)
    await initializeLocations(slug, locationSchema, event.ttlSeconds);
  });

  describe('requireStaffAuth middleware', () => {
    test('should reject API request without staffToken', async () => {
      const response = await request(app)
        .get(`/e/${slug}/api/status/1`);

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('authentication required');
    });

    test('should reject API request with invalid staffToken', async () => {
      const response = await request(app)
        .get(`/e/${slug}/api/status/1`)
        .query({ staffToken: 'invalid_token_123' });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid staff token');
    });

    test('should accept API request with valid staffToken in query', async () => {
      // First create a ticket
      const ticketResponse = await request(app)
        .get(`/e/${slug}/new`);

      // Get ticket ID from redirect
      const ticketUrl = ticketResponse.headers.location;
      const ticketId = ticketUrl.match(/ticket\/(\d+)/)[1];

      // Now access status with staffToken
      const response = await request(app)
        .get(`/e/${slug}/api/status/${ticketId}`)
        .query({ staffToken });

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('new');
    });

    test('should accept API request with valid staffToken in body', async () => {
      // Create ticket
      const ticketResponse = await request(app)
        .get(`/e/${slug}/new`);

      const ticketUrl = ticketResponse.headers.location;
      const ticketId = parseInt(ticketUrl.match(/ticket\/(\d+)/)[1]);

      // Check in with staffToken in body
      const response = await request(app)
        .post(`/e/${slug}/api/check-in`)
        .send({ ticketId, staffToken });

      expect(response.status).toBe(200);
      expect(response.body.location).toMatch(/^[A-C]-([1-9]|10)$/);
    });
  });

  describe('No Session Dependencies', () => {
    test('should work without any session cookies', async () => {
      // Create ticket
      const ticketResponse = await request(app)
        .get(`/e/${slug}/new`);

      const ticketUrl = ticketResponse.headers.location;
      const ticketId = ticketUrl.match(/ticket\/(\d+)/)[1];

      // Access status API without cookies, only token
      const response = await request(app)
        .get(`/e/${slug}/api/status/${ticketId}`)
        .query({ staffToken })
        .set('Cookie', ''); // Explicitly no cookies

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('new');
    });

    test('staff dashboard should work with token in URL', async () => {
      const response = await request(app)
        .get(`/e/${slug}/staff`)
        .query({ token: staffToken });

      expect(response.status).toBe(200);
      expect(response.text).toContain('Staff Dashboard');
    });
  });

  describe('Event Isolation', () => {
    test('staffToken from one event should not work for another', async () => {
      // Create second event
      const locationSchema2 = buildLocationSchema('A', 'C', 1, 10);
      const event2 = await createEvent({
        eventName: 'Second Event',
        locationSchema: locationSchema2,
        durationHours: 12
      });

      // Create ticket in first event
      const ticketResponse = await request(app)
        .get(`/e/${slug}/new`);

      const ticketUrl = ticketResponse.headers.location;
      const ticketId = ticketUrl.match(/ticket\/(\d+)/)[1];

      // Try to access with wrong event's staffToken
      const response = await request(app)
        .get(`/e/${slug}/api/status/${ticketId}`)
        .query({ staffToken: event2.staffToken });

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid staff token');
    });
  });
});

describe('Guest Ticket Access', () => {
  test('guests can access their tickets with guestToken only', async () => {
    // Create event
    const locationSchema = buildLocationSchema('A', 'C', 1, 10);
    const event = await createEvent({
      eventName: 'Guest Test Event',
      locationSchema,
      durationHours: 12
    });

    // Create ticket
    const ticketResponse = await request(app)
      .get(`/e/${event.slug}/new`);

    const ticketUrl = ticketResponse.headers.location;
    const match = ticketUrl.match(/ticket\/(\d+)\?token=([^&]+)/);
    const ticketId = match[1];
    const guestToken = match[2];

    // Access ticket page as guest
    const response = await request(app)
      .get(`/e/${event.slug}/ticket/${ticketId}`)
      .query({ token: guestToken });

    expect(response.status).toBe(200);
    expect(response.text).toContain(`#${ticketId}`);
  });

  test('guests cannot access tickets without valid token', async () => {
    const locationSchema = buildLocationSchema('A', 'C', 1, 10);
    const event = await createEvent({
      eventName: 'Guest Test Event 2',
      locationSchema,
      durationHours: 12
    });

    // Try to access non-existent ticket
    const response = await request(app)
      .get(`/e/${event.slug}/ticket/999`)
      .query({ token: 'invalid_token' });

    expect(response.status).toBe(404);
  });
});
