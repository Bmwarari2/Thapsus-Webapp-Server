import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Real-Postgres integration tests for the /api/auth/* surface (audit H-1).
//
// Gated on TEST_DATABASE_URL. When unset the suite is skipped — the unit
// runs (sanitize, stripe, lipana, appBoot) stay green on a developer
// laptop with no DB. Set TEST_DATABASE_URL in CI / on a throwaway
// Supabase branch to enable.
//
// Each test mints a unique email so the suite is replay-safe and
// concurrent. afterAll cleans up rows we created.

const SKIP = !process.env.TEST_DATABASE_URL;
const SKIP_MSG = SKIP ? '⚠ TEST_DATABASE_URL not set — skipping' : '';

const createdEmails = new Set();

function mintEmail() {
  const e = `vitest-${randomUUID()}@test.thapsus.uk`;
  createdEmails.add(e);
  return e;
}

// Sign-up no longer returns a JWT (email-verification gate, migration 004):
// the account must consume its verification token first. The plaintext token
// is only delivered by email in production, but the row keeps a plaintext
// copy during the grace period — read it straight from the DB and redeem it
// through the real endpoint so the whole flow is exercised.
async function verifyEmailFor(userId) {
  const { rows } = await getPool().query(
    `SELECT token FROM email_verification_tokens
      WHERE user_id = $1 AND used = false
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  expect(rows[0]?.token).toBeTruthy();
  const r = await request(app).post('/api/auth/verify-email').send({ token: rows[0].token });
  expect(r.status).toBe(200);
  return r.body; // same auth bundle /login returns: { token, user, ... }
}

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
});

afterAll(async () => {
  if (SKIP) return;
  // Clean up every user row we created. Cascade clears related tables.
  const pool = getPool();
  if (createdEmails.size) {
    const emails = [...createdEmails];
    await pool.query(
      `DELETE FROM users WHERE email = ANY($1::text[])`,
      [emails]
    );
  }
  await pool.end();
});

describe.skipIf(SKIP)('POST /api/auth/register', () => {
  it('creates a new customer and requires email verification (no auto sign-in)', async () => {
    const email = mintEmail();
    const r = await request(app)
      .post('/api/auth/register')
      .send({
        email,
        password: 'PassPhrase!23',
        name: 'Vitest User',
        phone: '+254700000000',
      });

    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    // Email-verification gate: sign-up must NOT hand out a session token.
    expect(r.body.verification_required).toBe(true);
    expect(r.body.token).toBeUndefined();
    expect(r.body.user.email).toBe(email.toLowerCase());
    expect(r.body.user.role).toBe('customer');
    // Password must never be echoed back.
    expect(r.body.user).not.toHaveProperty('password');
    expect(r.body.user).not.toHaveProperty('password_hash');
  });

  it('verify-email consumes the token and returns a working auth bundle', async () => {
    const email = mintEmail();
    const reg = await request(app).post('/api/auth/register').send({
      email, password: 'PassPhrase!23', name: 'Verify Flow', phone: '+254700000003',
    });
    expect(reg.status).toBe(201);

    const bundle = await verifyEmailFor(reg.body.user.id);
    expect(bundle.token).toBeTruthy();
    expect(bundle.user.email).toBe(email.toLowerCase());

    // The token from verify-email must be a real session.
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bundle.token}`);
    expect(me.status).toBe(200);

    // A second redemption of the same token must fail (one-shot).
    const { rows } = await getPool().query(
      `SELECT token FROM email_verification_tokens WHERE user_id = $1`,
      [reg.body.user.id]
    );
    const again = await request(app).post('/api/auth/verify-email').send({ token: rows[0].token });
    expect(again.status).toBe(400);
  });

  it('rejects passwords shorter than 8 characters', async () => {
    const r = await request(app)
      .post('/api/auth/register')
      .send({
        email: mintEmail(),
        password: 'short',
        name: 'Vitest User',
        phone: '+254700000001',
      });
    expect(r.status).toBeGreaterThanOrEqual(400);
    expect(r.status).toBeLessThan(500);
    expect(r.body.success).toBe(false);
  });

  it('rejects duplicate email registrations', async () => {
    const email = mintEmail();
    const body = { email, password: 'PassPhrase!23', name: 'Dup', phone: '+254700000002' };

    const first = await request(app).post('/api/auth/register').send(body);
    expect(first.status).toBe(201);

    const dup = await request(app).post('/api/auth/register').send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.success).toBe(false);
  });
});

describe.skipIf(SKIP)('POST /api/auth/login', () => {
  it('rejects an unverified account with 403 (email-verification gate)', async () => {
    const email = mintEmail();
    const password = 'PassPhrase!23';
    await request(app).post('/api/auth/register').send({
      email, password, name: 'Unverified Login', phone: '+254700000009',
    });

    const r = await request(app).post('/api/auth/login').send({ email, password });
    expect(r.status).toBe(403);
    expect(r.body.success).toBe(false);
  });

  it('issues a token for valid credentials once the email is verified', async () => {
    const email = mintEmail();
    const password = 'PassPhrase!23';
    const reg = await request(app).post('/api/auth/register').send({
      email, password, name: 'Login Test', phone: '+254700000010',
    });
    await verifyEmailFor(reg.body.user.id);

    const r = await request(app).post('/api/auth/login').send({ email, password });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.token).toBeTruthy();
  });

  it('returns 401 for a wrong password (and runs the dummy-hash so timing is symmetrical)', async () => {
    const email = mintEmail();
    await request(app).post('/api/auth/register').send({
      email, password: 'PassPhrase!23', name: 'Wrong PW', phone: '+254700000011',
    });

    const r = await request(app).post('/api/auth/login').send({
      email, password: 'WRONGwrongWRONG',
    });
    expect(r.status).toBe(401);
    expect(r.body.success).toBe(false);
  });

  it('returns 401 for a nonexistent email (no account-enumeration leak)', async () => {
    const r = await request(app).post('/api/auth/login').send({
      email: `noone-${randomUUID()}@test.thapsus.uk`,
      password: 'whatever',
    });
    expect(r.status).toBe(401);
    expect(r.body.success).toBe(false);
  });
});

describe.skipIf(SKIP)('GET /api/auth/me + token revocation', () => {
  async function registerAndToken() {
    const email = mintEmail();
    const password = 'PassPhrase!23';
    const reg = await request(app).post('/api/auth/register').send({
      email, password, name: 'Me Test', phone: '+254700000020',
    });
    const bundle = await verifyEmailFor(reg.body.user.id);
    return { email, password, token: bundle.token };
  }

  it('returns the authenticated user when given a valid Bearer token', async () => {
    const { email, token } = await registerAndToken();
    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body?.user?.email).toBe(email.toLowerCase());
  });

  it('rejects requests with no Authorization header', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('rejects requests after logout (revoked_tokens entry inserted)', async () => {
    const { token } = await registerAndToken();

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${token}`);
    expect(logout.status).toBe(200);

    const after = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(after.status).toBe(401);
  });
});

// Audit W6.1 — silent refresh: /me returns a freshly-signed token in
// `refreshed_token` when the presented JWT's iat is older than
// JWT_REFRESH_AFTER_SECONDS (24h default). Tested with a forged-iat
// token signed using the same JWT_SECRET (provided by tests/setup.js).
describe.skipIf(SKIP)('GET /api/auth/me — silent refresh (W6.1)', () => {
  async function registerAndUser() {
    const email = mintEmail();
    const reg = await request(app).post('/api/auth/register').send({
      email, password: 'PassPhrase!23', name: 'Refresh', phone: '+254700000030',
    });
    await verifyEmailFor(reg.body.user.id);
    return { email, userId: reg.body.user.id };
  }

  it('does NOT return refreshed_token when the token is fresh', async () => {
    const email = mintEmail();
    const reg = await request(app).post('/api/auth/register').send({
      email, password: 'PassPhrase!23', name: 'Fresh', phone: '+254700000031',
    });
    const bundle = await verifyEmailFor(reg.body.user.id);
    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${bundle.token}`);
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('refreshed_token');
  });

  it('returns refreshed_token when iat is older than the refresh threshold', async () => {
    const { email, userId } = await registerAndUser();

    // Make sure the password_changed_at gate doesn't reject our forged
    // old-iat token. Setting it far in the past (the column is NOT NULL)
    // means the middleware/auth.js check `iat + 5 < pwd_changed_epoch` is
    // false for any iat we pick.
    await getPool().query(
      `UPDATE users SET password_changed_at = '2000-01-01T00:00:00Z' WHERE id = $1`,
      [userId]
    );

    // Forge a token with iat 25 hours ago. Same JWT_SECRET as the
    // server (set by tests/setup.js).
    const oldIat = Math.floor(Date.now() / 1000) - 25 * 3600;
    // NB: explicit iat/exp claims in the payload — jsonwebtoken's
    // noTimestamp option would strip the iat we're trying to forge.
    const oldToken = jwt.sign(
      { id: userId, email, role: 'customer', iat: oldIat, exp: oldIat + 7 * 24 * 3600 },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const r = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${oldToken}`);

    expect(r.status).toBe(200);
    expect(r.body.refreshed_token).toBeTruthy();

    // The new token must verify against the same secret.
    const decoded = jwt.verify(r.body.refreshed_token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(userId);
    expect(decoded.email).toBe(email.toLowerCase());
    expect(decoded.role).toBe('customer');
    // And its iat must be fresher than the forged one.
    expect(decoded.iat).toBeGreaterThan(oldIat);
  });

  it('the refreshed token is itself accepted on a follow-up /me call', async () => {
    const { email, userId } = await registerAndUser();
    await getPool().query(
      `UPDATE users SET password_changed_at = '2000-01-01T00:00:00Z' WHERE id = $1`,
      [userId]
    );
    const oldIat = Math.floor(Date.now() / 1000) - 25 * 3600;
    // NB: explicit iat/exp claims in the payload — jsonwebtoken's
    // noTimestamp option would strip the iat we're trying to forge.
    const oldToken = jwt.sign(
      { id: userId, email, role: 'customer', iat: oldIat, exp: oldIat + 7 * 24 * 3600 },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const first = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    const refreshed = first.body.refreshed_token;
    expect(refreshed).toBeTruthy();

    const second = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${refreshed}`);
    expect(second.status).toBe(200);
    // The freshly-issued token shouldn't itself trigger another refresh.
    expect(second.body).not.toHaveProperty('refreshed_token');
  });
});
