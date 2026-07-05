import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Real-Postgres integration tests for the influencer referral programme
// (migration 0002): admin code CRUD, the public landing lookup/click/signup,
// attribution on the created account, and conversion tracking + payout marks.
//
// Gated on TEST_DATABASE_URL — skipped on a laptop with no DB, enabled in CI
// (the integration job points it at the postgres:17 service container).
// Mirrors tests/integration/finance.test.js.

const SKIP = !process.env.TEST_DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const createdUserIds = new Set();
const createdCodes = new Set();
const createdEmails = new Set();

let admin; // { id, token }

async function makeAdmin() {
  const pool = getPool();
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const email = `vitest-inf-admin-${suffix}@test.thapsus.uk`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active)
     VALUES ($1,$2,'x','Vitest Inf Admin','+254700000000','admin',$3,$4,true)`,
    [id, email, `TC-${suffix}`, `RF${suffix}`]
  );
  createdUserIds.add(id);
  createdEmails.add(email);
  const token = jwt.sign({ id, email, role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  return { id, token };
}

function auth(req) { return req.set('Authorization', `Bearer ${admin.token}`); }

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
  admin = await makeAdmin();
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  // Users first would orphan nothing (conversions cascade off users/codes);
  // remove the signups we created, then the codes, then the admins.
  if (createdEmails.size) {
    await pool.query(`DELETE FROM users WHERE email = ANY($1::text[])`, [[...createdEmails]]);
  }
  if (createdUserIds.size) {
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[...createdUserIds]]);
  }
  if (createdCodes.size) {
    await pool.query(`DELETE FROM influencer_codes WHERE code = ANY($1::text[])`, [[...createdCodes]]);
  }
  await pool.end();
});

describe.skipIf(SKIP)('influencer — admin code management', () => {
  it('creates a code with a generated token and returns funnel fields', async () => {
    const r = await auth(request(app).post('/api/admin/influencers')).send({
      influencer_name: 'Aisha K.',
      influencer_contact: 'aisha@example.com',
      reward_per_order: 500,
      notes: 'IG campaign',
    });
    expect(r.status).toBe(201);
    expect(r.body.success).toBe(true);
    expect(r.body.influencer.code).toMatch(/^[A-Z0-9]{3,24}$/);
    expect(r.body.influencer.influencer_name).toBe('Aisha K.');
    expect(r.body.influencer.reward_per_order).toBe(500);
    expect(r.body.influencer.clicks).toBe(0);
    expect(r.body.influencer.signups).toBe(0);
    createdCodes.add(r.body.influencer.code);
  });

  it('honours a custom code and rejects a duplicate', async () => {
    const code = `TEST${randomUUID().slice(0, 6).toUpperCase()}`;
    const first = await auth(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Bee', code });
    expect(first.status).toBe(201);
    expect(first.body.influencer.code).toBe(code);
    createdCodes.add(code);

    const dupe = await auth(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Bee2', code });
    expect(dupe.status).toBe(409);
  });

  it('rejects a missing influencer_name', async () => {
    const r = await auth(request(app).post('/api/admin/influencers')).send({ code: 'NONAME1' });
    expect(r.status).toBe(400);
  });

  it('requires admin auth', async () => {
    const r = await request(app).get('/api/admin/influencers');
    expect(r.status).toBe(401);
  });
});

describe.skipIf(SKIP)('influencer — public landing', () => {
  let code;
  beforeAll(async () => {
    if (SKIP) return;
    const r = await auth(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Landing Star' });
    code = r.body.influencer.code;
    createdCodes.add(code);
  });

  it('lookup returns the influencer name for a live code', async () => {
    const r = await request(app).get(`/api/influencer/${code}`);
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(true);
    expect(r.body.influencer_name).toBe('Landing Star');
  });

  it('lookup returns valid:false for an unknown code', async () => {
    const r = await request(app).get('/api/influencer/NOPE999');
    expect(r.status).toBe(200);
    expect(r.body.valid).toBe(false);
  });

  it('click increments the counter', async () => {
    await request(app).post(`/api/influencer/${code}/click`);
    await request(app).post(`/api/influencer/${code}/click`);
    const r = await auth(request(app).get(`/api/admin/influencers/${code}`));
    expect(r.body.influencer.clicks).toBe(2);
  });

  it('lookup returns valid:false once the code is disabled', async () => {
    await auth(request(app).patch(`/api/admin/influencers/${code}`)).send({ is_active: false });
    const r = await request(app).get(`/api/influencer/${code}`);
    expect(r.body.valid).toBe(false);
    // re-enable for any later assertions
    await auth(request(app).patch(`/api/admin/influencers/${code}`)).send({ is_active: true });
  });
});

describe.skipIf(SKIP)('influencer — signup attribution + conversion', () => {
  let code;
  beforeAll(async () => {
    if (SKIP) return;
    const r = await auth(request(app).post('/api/admin/influencers')).send({ influencer_name: 'Convert Queen' });
    code = r.body.influencer.code;
    createdCodes.add(code);
  });

  it('creates an attributed account + buy-for-me requests from item links', async () => {
    const email = `vitest-inf-signup-${randomUUID().slice(0, 8)}@test.thapsus.uk`;
    createdEmails.add(email);
    const r = await request(app).post(`/api/influencer/${code}/signup`).send({
      name: 'Referred Shopper',
      email,
      phone: '+254711111111',
      password: 'PassPhrase!23',
      items: [
        { url: 'https://www.zara.com/thing', description: 'size M' },
        { url: 'nike.com/shoe' },
      ],
    });
    expect(r.status).toBe(201);
    expect(r.body.verification_required).toBe(true);
    expect(r.body.requests_created).toBe(2);

    const pool = getPool();
    // Account is stamped with the code.
    const u = await pool.query('SELECT id, influencer_code FROM users WHERE email = $1', [email]);
    expect(u.rows[0].influencer_code).toBe(code);
    createdUserIds.add(u.rows[0].id);

    // Two buy-for-me requests were created for that user.
    const bfm = await pool.query('SELECT retailer_url, item_name FROM buy_for_me_orders WHERE user_id = $1', [u.rows[0].id]);
    expect(bfm.rows.length).toBe(2);
    // A link without a description falls back to a readable "Item from host" label.
    expect(bfm.rows.some((x) => /Item from nike\.com/.test(x.item_name))).toBe(true);

    // The conversion was recorded and shows on the admin detail.
    const detail = await auth(request(app).get(`/api/admin/influencers/${code}`));
    expect(detail.body.influencer.signups).toBe(1);
    expect(detail.body.influencer.conversions).toBe(1);
    expect(detail.body.conversions.length).toBe(1);
    expect(detail.body.conversions[0].order_kind).toBe('buy_for_me');
    expect(detail.body.conversions[0].payout_status).toBe('unpaid');
  });

  it('rejects a duplicate email through the signup path (shared validation)', async () => {
    const email = `vitest-inf-dupe-${randomUUID().slice(0, 8)}@test.thapsus.uk`;
    createdEmails.add(email);
    const body = { name: 'Dupe', email, phone: '+254712222222', password: 'PassPhrase!23', items: [] };
    const first = await request(app).post(`/api/influencer/${code}/signup`).send(body);
    expect(first.status).toBe(201);
    const pool = getPool();
    const u = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (u.rows[0]) createdUserIds.add(u.rows[0].id);

    const dupe = await request(app).post(`/api/influencer/${code}/signup`).send(body);
    expect(dupe.status).toBe(409);
  });

  it('marks a conversion paid and back to unpaid', async () => {
    const detail = await auth(request(app).get(`/api/admin/influencers/${code}`));
    const conv = detail.body.conversions[0];
    expect(conv).toBeTruthy();

    const paid = await auth(request(app).post(`/api/admin/influencers/conversions/${conv.id}/pay`)).send({ paid: true });
    expect(paid.status).toBe(200);
    expect(paid.body.conversion.payout_status).toBe('paid');
    expect(paid.body.conversion.payout_at).toBeTruthy();

    const after = await auth(request(app).get(`/api/admin/influencers/${code}`));
    expect(after.body.influencer.unpaid_conversions).toBe(0);

    const unpaid = await auth(request(app).post(`/api/admin/influencers/conversions/${conv.id}/pay`)).send({ paid: false });
    expect(unpaid.body.conversion.payout_status).toBe('unpaid');
  });
});
