import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Real-Postgres integration tests for the influencer accounts + analytics
// layer (migration 0003): admin provisioning of an influencer login, visit
// tracking, visit→signup conversion, and the self-serve dashboard endpoint.
// Gated on TEST_DATABASE_URL; runs in CI against the postgres:17 container.

const SKIP = !process.env.TEST_DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const createdUserIds = new Set();
const createdCodes = new Set();
const createdEmails = new Set();

let admin;

async function makeAdmin() {
  const pool = getPool();
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const email = `vitest-infa-admin-${suffix}@test.thapsus.uk`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active)
     VALUES ($1,$2,'x','Vitest InfA Admin','+254700000000','admin',$3,$4,true)`,
    [id, email, `TC-${suffix}`, `RF${suffix}`]
  );
  createdUserIds.add(id); createdEmails.add(email);
  return { id, token: jwt.sign({ id, email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' }) };
}
const authAdmin = (req) => req.set('Authorization', `Bearer ${admin.token}`);

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
  admin = await makeAdmin();
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  if (createdEmails.size) await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [[...createdEmails]]);
  if (createdUserIds.size) await pool.query('DELETE FROM users WHERE id = ANY($1::text[])', [[...createdUserIds]]);
  if (createdCodes.size) await pool.query('DELETE FROM influencer_codes WHERE code = ANY($1::text[])', [[...createdCodes]]);
  await pool.end();
});

describe.skipIf(SKIP)('influencer account provisioning', () => {
  it('creates an influencer login, links the code, and returns a setup link', async () => {
    const mk = await authAdmin(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Dash Star' });
    const code = mk.body.influencer.code;
    createdCodes.add(code);

    const email = `vitest-inf-owner-${randomUUID().slice(0, 8)}@test.thapsus.uk`;
    createdEmails.add(email);
    const r = await authAdmin(request(app).post(`/api/admin/influencers/${code}/account`)).send({ email });
    expect(r.status).toBe(201);
    expect(r.body.created).toBe(true);
    expect(r.body.setup_link).toMatch(/\/reset-password\?token=/);
    expect(r.body.account.role).toBe('influencer');
    createdUserIds.add(r.body.account.id);

    const pool = getPool();
    const u = await pool.query('SELECT role FROM users WHERE id = $1', [r.body.account.id]);
    expect(u.rows[0].role).toBe('influencer');
    const c = await pool.query('SELECT owner_user_id FROM influencer_codes WHERE code = $1', [code]);
    expect(c.rows[0].owner_user_id).toBe(r.body.account.id);
  });

  it('rejects linking an email that belongs to a non-influencer account', async () => {
    const mk = await authAdmin(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Clash' });
    const code = mk.body.influencer.code;
    createdCodes.add(code);

    // Seed a plain customer, then try to hand their email a dashboard.
    const pool = getPool();
    const custId = randomUUID();
    const custEmail = `vitest-inf-existingcust-${custId.slice(0, 8)}@test.thapsus.uk`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active)
       VALUES ($1,$2,'x','Existing Cust','+254700000000','customer',$3,$4,true)`,
      [custId, custEmail, `TC-${custId.slice(0, 4)}`, `RFX${custId.slice(0, 6)}`]
    );
    createdUserIds.add(custId); createdEmails.add(custEmail);

    const r = await authAdmin(request(app).post(`/api/admin/influencers/${code}/account`)).send({ email: custEmail });
    expect(r.status).toBe(409);
  });
});

describe.skipIf(SKIP)('visit tracking + dashboard', () => {
  let code; let influencerToken; let influencerId;

  beforeAll(async () => {
    if (SKIP) return;
    const mk = await authAdmin(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Metrics Queen', reward_per_order: 500 });
    code = mk.body.influencer.code;
    createdCodes.add(code);
    const email = `vitest-inf-metrics-${randomUUID().slice(0, 8)}@test.thapsus.uk`;
    createdEmails.add(email);
    const prov = await authAdmin(request(app).post(`/api/admin/influencers/${code}/account`)).send({ email });
    influencerId = prov.body.account.id;
    createdUserIds.add(influencerId);
    influencerToken = jwt.sign({ id: influencerId, email, role: 'influencer' }, JWT_SECRET, { expiresIn: '1h' });
  });

  it('records visits and converts one via signup, reflected in the dashboard', async () => {
    // Two link opens.
    const v1 = await request(app).post(`/api/influencer/${code}/visit`);
    const v2 = await request(app).post(`/api/influencer/${code}/visit`);
    expect(v1.body.visit_id).toBeTruthy();
    expect(v2.body.visit_id).toBeTruthy();

    // One of them converts to a signup (with an item link → an order).
    const custEmail = `vitest-inf-cust-${randomUUID().slice(0, 8)}@test.thapsus.uk`;
    createdEmails.add(custEmail);
    const su = await request(app).post(`/api/influencer/${code}/signup`).send({
      name: 'Converting Customer', email: custEmail, phone: '+254712345678',
      password: 'PassPhrase!23', visit_id: v1.body.visit_id,
      items: [{ url: 'https://store.com/thing' }],
    });
    expect(su.status).toBe(201);
    const pool = getPool();
    const cust = await pool.query('SELECT id FROM users WHERE email = $1', [custEmail]);
    createdUserIds.add(cust.rows[0].id);

    // The originating visit is now flagged converted.
    const ev = await pool.query('SELECT converted FROM influencer_link_events WHERE id = $1', [v1.body.visit_id]);
    expect(ev.rows[0].converted).toBe(true);

    // Dashboard reflects the funnel.
    const d = await request(app).get('/api/influencer-portal/dashboard')
      .set('Authorization', `Bearer ${influencerToken}`);
    expect(d.status).toBe(200);
    expect(d.body.totals.opens).toBeGreaterThanOrEqual(2);
    expect(d.body.totals.signups).toBeGreaterThanOrEqual(1);
    expect(d.body.totals.orders).toBeGreaterThanOrEqual(1);
    expect(d.body.totals.opened_not_signed_up).toBeGreaterThanOrEqual(1);
    expect(d.body.totals.earnings).toBeGreaterThanOrEqual(500);
    expect(d.body.links.length).toBe(1);
    expect(d.body.links[0].code).toBe(code);
    expect(Array.isArray(d.body.timeseries)).toBe(true);
    expect(d.body.timeseries.length).toBe(30);
    // Today's bucket should carry the opens we just generated.
    expect(d.body.timeseries[d.body.timeseries.length - 1].opens).toBeGreaterThanOrEqual(2);
  });

  it('denies the dashboard to a non-influencer role', async () => {
    const pool = getPool();
    const id = randomUUID();
    const email = `vitest-inf-plaincust-${id.slice(0, 8)}@test.thapsus.uk`;
    await pool.query(
      `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active)
       VALUES ($1,$2,'x','Plain Cust','+254700000000','customer',$3,$4,true)`,
      [id, email, `TC-${id.slice(0, 4)}`, `RFC${id.slice(0, 6)}`]
    );
    createdUserIds.add(id); createdEmails.add(email);
    const custToken = jwt.sign({ id, email, role: 'customer' }, JWT_SECRET, { expiresIn: '1h' });
    const r = await request(app).get('/api/influencer-portal/dashboard').set('Authorization', `Bearer ${custToken}`);
    expect(r.status).toBe(403);
  });
});
