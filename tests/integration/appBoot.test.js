import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../../server.js';

// Smoke tests that prove server.js can be imported under vitest without
// booting (no listen, no DB connection, no admin bootstrap) and that the
// assembled middleware chain still serves requests. These run in every
// suite — no TEST_DATABASE_URL gating required, because nothing in this
// path actually queries the database.

describe('app boot — middleware chain', () => {
  it('returns the JSON 404 envelope for an unknown /api/* route', async () => {
    const r = await request(app).get('/api/__definitely_not_a_route__');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({
      success: false,
      message: 'Route not found',
      path: '/api/__definitely_not_a_route__',
    });
  });

  it('serves the receipt redirect ahead of the SPA fallback', async () => {
    // A malformed token must 404 from routes/receiptRedirect.js, not fall
    // through to index.html — that ordering is easy to break in server.js.
    const r = await request(app).get('/r/not-a-real-token');
    expect(r.status).toBe(404);
    expect(r.text).toMatch(/receipt link is not valid/i);
  });

  it('echoes a fresh X-Request-Id when none is supplied', async () => {
    const r = await request(app).get('/api/__nope__');
    const id = r.headers['x-request-id'];
    expect(typeof id).toBe('string');
    // UUIDv4 format (8-4-4-4-12 hex with version + variant bits)
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[14][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('honours an incoming X-Request-Id when it matches the validation regex', async () => {
    const incoming = 'gha-job-1234_abcDEF.42';
    const r = await request(app)
      .get('/api/__nope__')
      .set('X-Request-Id', incoming);
    expect(r.headers['x-request-id']).toBe(incoming);
  });

  it('falls back to a fresh id when the incoming X-Request-Id contains spaces', async () => {
    const r = await request(app)
      .get('/api/__nope__')
      .set('X-Request-Id', 'has spaces and is invalid');
    expect(r.headers['x-request-id']).not.toBe('has spaces and is invalid');
    expect(r.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('rejects oversized JSON bodies above the 200kb global limit (audit M-5)', async () => {
    // Build a body just over 200kb. The global limit is 200kb post-W1.3.
    const big = 'a'.repeat(220 * 1024);
    const r = await request(app)
      .post('/api/__nope__')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ blob: big }));
    // Express body-parser returns 413 when the request exceeds the limit.
    expect(r.status).toBe(413);
  });

  it('rejects payloads with too many keys via sanitize middleware (audit T25)', async () => {
    const fat = {};
    for (let i = 0; i < 300; i++) fat[`k${i}`] = 'v';
    const r = await request(app)
      .post('/api/__nope__')
      .send(fat);
    expect(r.status).toBe(413);
    expect(r.body?.success).toBe(false);
    expect(r.body?.message).toMatch(/key count/i);
  });
});
