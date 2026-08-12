import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import crypto, { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Real-Postgres integration tests for the /api/auth/* surface (audit H-1).
//
// Gated on TEST_DATABASE_URL. When unset the suite is skipped — the unit
// runs stay green on a developer laptop with no DB. Set TEST_DATABASE_URL
// in CI / on a throwaway Supabase branch to enable.
//
// Customer self-registration was retired with the WhatsApp-first rebuild
// (customers onboard on WhatsApp; the webapp signs in staff only), so
// users are seeded directly via SQL — the same recipe roleMatrix.test.js
// uses — and the retired endpoints are asserted to 410.

const SKIP = !process.env.TEST_DATABASE_URL;

const createdEmails = new Set();

function mintEmail() {
  const e = `vitest-${randomUUID()}@test.thapsus.uk`;
  createdEmails.add(e);
  return e;
}

/** Seed an active, email-verified staff user directly. */
async function seedUser({ role = 'operator', password = 'PassPhrase!23' } = {}) {
  const email = mintEmail();
  const id = randomUUID();
  await getPool().query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id,
                        language_pref, referral_code, is_active, email_verified_at)
     VALUES ($1, $2, $3, $4, '+254700000000', $5, $6, 'en', $7, true, NOW())`,
    [id, email, bcrypt.hashSync(password, 10), 'Vitest Staff', role,
     `TC-${id.slice(0, 4).toUpperCase()}`, `REF${id.slice(0, 9).toUpperCase()}`]
  );
  return { id, email, password };
}

async function loginToken(email, password) {
  const r = await request(app).post('/api/auth/login').send({ email, password });
  expect(r.status).toBe(200);
  return r.body.token;
}

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  if (createdEmails.size) {
    await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[...createdEmails]]);
  }
  await pool.end();
});

describe.skipIf(SKIP)('retired self-registration surface', () => {
  it.each(['/api/auth/register', '/api/auth/verify-email', '/api/auth/resend-verification'])(
    'POST %s returns 410 Gone', async (path) => {
      const r = await request(app).post(path).send({});
      expect(r.status).toBe(410);
      expect(r.body.success).toBe(false);
      expect(r.body.message).toMatch(/WhatsApp/i);
    }
  );
});

describe.skipIf(SKIP)('POST /api/auth/login', () => {
  it('issues a token for valid staff credentials', async () => {
    const { email, password } = await seedUser();
    const r = await request(app).post('/api/auth/login').send({ email, password });
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.token).toBeTruthy();
    expect(r.body.user.email).toBe(email.toLowerCase());
    // Password must never be echoed back.
    expect(r.body.user).not.toHaveProperty('password');
    expect(r.body.user).not.toHaveProperty('password_hash');
  });

  it('rejects an unverified account with 403 (verification gate)', async () => {
    const { email, password, id } = await seedUser();
    await getPool().query(`UPDATE users SET email_verified_at = NULL WHERE id = $1`, [id]);
    const r = await request(app).post('/api/auth/login').send({ email, password });
    expect(r.status).toBe(403);
    expect(r.body.success).toBe(false);
  });

  it('returns 401 for a wrong password (and runs the dummy-hash so timing is symmetrical)', async () => {
    const { email } = await seedUser();
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
  it('returns the authenticated user when given a valid Bearer token', async () => {
    const { email, password } = await seedUser();
    const token = await loginToken(email, password);
    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body?.user?.email).toBe(email.toLowerCase());
  });

  it('rejects requests with no Authorization header', async () => {
    const r = await request(app).get('/api/auth/me');
    expect(r.status).toBe(401);
  });

  it('rejects requests after logout (revoked_tokens entry inserted)', async () => {
    const { email, password } = await seedUser();
    const token = await loginToken(email, password);

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
  it('does NOT return refreshed_token when the token is fresh', async () => {
    const { email, password } = await seedUser();
    const token = await loginToken(email, password);
    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body).not.toHaveProperty('refreshed_token');
  });

  it('returns refreshed_token when iat is older than the refresh threshold', async () => {
    const { email, id: userId } = await seedUser();

    // Make sure the password_changed_at gate doesn't reject our forged
    // old-iat token.
    await getPool().query(
      `UPDATE users SET password_changed_at = '2000-01-01T00:00:00Z' WHERE id = $1`,
      [userId]
    );

    const oldIat = Math.floor(Date.now() / 1000) - 25 * 3600;
    // NB: explicit iat/exp claims in the payload — jsonwebtoken's
    // noTimestamp option would strip the iat we're trying to forge.
    const oldToken = jwt.sign(
      { id: userId, email, role: 'operator', iat: oldIat, exp: oldIat + 7 * 24 * 3600 },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const r = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    expect(r.status).toBe(200);
    expect(r.body.refreshed_token).toBeTruthy();

    const decoded = jwt.verify(r.body.refreshed_token, process.env.JWT_SECRET);
    expect(decoded.id).toBe(userId);
    expect(decoded.email).toBe(email.toLowerCase());
    expect(decoded.iat).toBeGreaterThan(oldIat);
  });

  it('the refreshed token is itself accepted on a follow-up /me call', async () => {
    const { email, id: userId } = await seedUser();
    await getPool().query(
      `UPDATE users SET password_changed_at = '2000-01-01T00:00:00Z' WHERE id = $1`,
      [userId]
    );
    const oldIat = Math.floor(Date.now() / 1000) - 25 * 3600;
    const oldToken = jwt.sign(
      { id: userId, email, role: 'operator', iat: oldIat, exp: oldIat + 7 * 24 * 3600 },
      process.env.JWT_SECRET,
      { algorithm: 'HS256' }
    );

    const first = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`);
    const refreshed = first.body.refreshed_token;
    expect(refreshed).toBeTruthy();

    const second = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${refreshed}`);
    expect(second.status).toBe(200);
    expect(second.body).not.toHaveProperty('refreshed_token');
  });
});

describe.skipIf(SKIP)('GET /api/auth/reset-context', () => {
  async function mintResetToken(userId) {
    const plaintext = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(plaintext).digest();
    await getPool().query(
      `INSERT INTO password_reset_tokens (id, user_id, token_sha256, expires_at)
       VALUES ($1, $2, $3, NOW() + interval '1 hour')`,
      [randomUUID(), userId, hash]
    );
    return plaintext;
  }

  it('returns the account email for a valid token (username for password managers)', async () => {
    const { email, id } = await seedUser();
    const token = await mintResetToken(id);
    const r = await request(app).get('/api/auth/reset-context').query({ token });
    expect(r.status).toBe(200);
    expect(r.body.email).toBe(email.toLowerCase());
  });

  it('returns email: null for an unknown/expired token (no leak, no error)', async () => {
    const r = await request(app).get('/api/auth/reset-context').query({ token: 'not-a-real-token' });
    expect(r.status).toBe(200);
    expect(r.body.email).toBeNull();
  });

  it('returns email: null when no token is supplied', async () => {
    const r = await request(app).get('/api/auth/reset-context');
    expect(r.status).toBe(200);
    expect(r.body.email).toBeNull();
  });
});
