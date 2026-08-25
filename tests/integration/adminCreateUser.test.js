import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

// Adding an admin failed outright: the Team screen sends name, email,
// password and role, while this endpoint required a phone and ignored the
// password entirely. Every attempt came back "Name, email, and phone are
// required" for a field the form does not have.
const SKIP = !process.env.TEST_DATABASE_URL;
let app, token, pool;
const madeUserIds = [];

// Seeds its own admin rather than leaning on seed-dev's, so the suite does
// not depend on a fixture password that lives in another file.
beforeAll(async () => {
  if (SKIP) return;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  ({ default: app } = await import('../../server.js'));
  pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });

  const id = randomUUID();
  const email = `vitest-admin-${id}@test.thapsus.uk`;
  const password = 'PassPhrase!23';
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id,
                        language_pref, referral_code, is_active, email_verified_at)
     VALUES ($1, $2, $3, 'Vitest Admin', '+254700000000', 'admin', $4, 'en', $5, true, NOW())`,
    [id, email, bcrypt.hashSync(password, 10), `TC-AD-${id.slice(0, 6)}`,
      `REFAD${id.slice(0, 8).toUpperCase()}`]
  );
  madeUserIds.push(id);
  const login = await request(app).post('/api/auth/login').send({ email, password });
  expect(login.status).toBe(200);
  token = login.body.token;
});

afterAll(async () => {
  if (SKIP || !pool) return;
  if (madeUserIds.length) {
    await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [madeUserIds]);
  }
  await pool.end();
});

const uniq = () => `staff-${Date.now()}-${Math.floor(Math.random() * 1e6)}@thapsus.uk`;
const create = async (body) => {
  const r = await request(app).post('/api/admin/users/create')
    .set('Authorization', `Bearer ${token}`).send(body);
  if (r.body?.user?.id) madeUserIds.push(r.body.user.id);
  return r;
};

describe.skipIf(SKIP)('POST /api/admin/users/create', () => {
  it('creates an admin from what the Team form actually sends', async () => {
    const email = uniq();
    const r = await create({ name: 'New Admin', email, password: 'temp-pass-1234', role: 'admin' });
    expect(r.status).toBe(201);
    expect(r.body.user).toMatchObject({ email, role: 'admin' });
    // Handed back so it can be passed on; only the hash is stored.
    expect(r.body.temp_password).toBe('temp-pass-1234');
    expect(r.body.generated_password).toBe(false);
  });

  it('lets that admin sign in with the password the admin chose', async () => {
    // The point of the whole change: no email, no reset link, they just
    // sign in with what they were told.
    const email = uniq();
    await create({ name: 'Sign In', email, password: 'handed-over-99', role: 'admin' });
    const login = await request(app).post('/api/auth/login')
      .send({ email, password: 'handed-over-99' });
    expect(login.status).toBe(200);
  });

  it('generates a password when the field is left blank', async () => {
    const email = uniq();
    const r = await create({ name: 'Generated', email, role: 'operator' });
    expect(r.status).toBe(201);
    expect(r.body.generated_password).toBe(true);
    expect(r.body.temp_password).toEqual(expect.any(String));
    const login = await request(app).post('/api/auth/login')
      .send({ email, password: r.body.temp_password });
    expect(login.status).toBe(200);
  });

  it('mints no setup token, because nothing emails one', async () => {
    const email = uniq();
    const r = await create({ name: 'No Token', email, password: 'temp-pass-1234', role: 'operator' });
    const { rows } = await pool.query(
      'SELECT count(*)::int AS n FROM password_reset_tokens WHERE user_id = $1', [r.body.user.id]);
    expect(rows[0].n).toBe(0);
  });

  it('still requires a name and an email', async () => {
    expect((await create({ email: uniq(), role: 'admin' })).status).toBe(400);
    expect((await create({ name: 'No Email', role: 'admin' })).status).toBe(400);
  });

  it('turns away a password too short to be worth handing over', async () => {
    const r = await create({ name: 'Short', email: uniq(), password: 'abc', role: 'admin' });
    expect(r.status).toBe(400);
    expect(r.body.message).toMatch(/at least 8/i);
  });

  it('rejects a duplicate email rather than shadowing the account', async () => {
    const email = uniq();
    await create({ name: 'First', email, password: 'temp-pass-1234', role: 'admin' });
    const second = await create({ name: 'Second', email, password: 'temp-pass-1234', role: 'admin' });
    expect(second.status).toBe(409);
  });
});
