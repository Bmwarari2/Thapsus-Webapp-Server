import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Real-Postgres integration tests for the /api/finance/* surface
// (Finance Management dashboard, migration 057).
//
// Gated on TEST_DATABASE_URL — skipped on a laptop with no DB, enabled in
// CI / on a throwaway Supabase branch. Mirrors tests/integration/auth.test.js.
//
// Covers: finance-access gating, manual money in/out entry with dual-currency
// normalisation, idempotent sync, and P&L totals.

const SKIP = !process.env.TEST_DATABASE_URL;

const JWT_SECRET = process.env.JWT_SECRET;
const createdUserIds = new Set();
const createdTxIds = new Set();

let financeAdmin; // { id, token }
let plainAdmin;   // { id, token } — admin WITHOUT can_manage_finances

async function makeUser({ canManageFinances }) {
  const pool = getPool();
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active, can_manage_finances)
     VALUES ($1,$2,'x','Vitest Finance','+254700000000','admin',$3,$4,true,$5)`,
    [id, `vitest-fin-${suffix}@test.thapsus.uk`, `TC-${suffix}`, `RF${suffix}`, canManageFinances]
  );
  createdUserIds.add(id);
  const token = jwt.sign(
    { id, email: `vitest-fin-${suffix}@test.thapsus.uk`, role: 'admin', can_manage_finances: canManageFinances },
    JWT_SECRET, { expiresIn: '1h' }
  );
  return { id, token };
}

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
  financeAdmin = await makeUser({ canManageFinances: true });
  plainAdmin = await makeUser({ canManageFinances: false });
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  if (createdTxIds.size) {
    await pool.query(`DELETE FROM finance_transactions WHERE id = ANY($1::text[])`, [[...createdTxIds]]);
  }
  if (createdUserIds.size) {
    await pool.query(`DELETE FROM finance_transactions WHERE created_by = ANY($1::text[])`, [[...createdUserIds]]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [[...createdUserIds]]);
  }
  await pool.end();
});

describe.skipIf(SKIP)('finance access gating', () => {
  it('rejects an admin without can_manage_finances with 403', async () => {
    const r = await request(app)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${plainAdmin.token}`);
    expect(r.status).toBe(403);
  });

  it('allows a selected finance admin with 200', async () => {
    const r = await request(app)
      .get('/api/finance/overview')
      .set('Authorization', `Bearer ${financeAdmin.token}`);
    expect(r.status).toBe(200);
    expect(r.body.success).toBe(true);
    expect(r.body.money_available).toBeTruthy();
    expect(r.body.profit_loss).toBeTruthy();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const r = await request(app).get('/api/finance/overview');
    expect(r.status).toBe(401);
  });
});

describe.skipIf(SKIP)('manual transactions', () => {
  it('records a GBP expense and normalises both currencies', async () => {
    const r = await request(app)
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${financeAdmin.token}`)
      .send({ direction: 'out', amount: 100, currency: 'GBP', description: 'Vitest rent', category_id: 'CAT-EXP-RENT' });
    expect(r.status).toBe(201);
    const tx = r.body.transaction;
    createdTxIds.add(tx.id);
    expect(tx.amount_minor).toBe(10000);          // £100 → 10000 pence
    expect(tx.amount_gbp_minor).toBe(10000);
    expect(Number(tx.amount_kes_minor)).toBeGreaterThan(10000); // KES side is larger
  });

  it('records a KES income entry', async () => {
    const r = await request(app)
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${financeAdmin.token}`)
      .send({ direction: 'in', amount: 5000, currency: 'KES', description: 'Vitest cash sale', category_id: 'CAT-INC-OTHER' });
    expect(r.status).toBe(201);
    const tx = r.body.transaction;
    createdTxIds.add(tx.id);
    expect(tx.amount_kes_minor).toBe(500000);     // 5000 KES → 500000 cents
    expect(Number(tx.amount_gbp_minor)).toBeGreaterThan(0);
  });

  it('rejects a non-positive amount', async () => {
    const r = await request(app)
      .post('/api/finance/transactions')
      .set('Authorization', `Bearer ${financeAdmin.token}`)
      .send({ direction: 'out', amount: 0, currency: 'GBP' });
    expect(r.status).toBe(400);
  });
});

describe.skipIf(SKIP)('sync idempotency', () => {
  it('does not create duplicate synced rows on a second run', async () => {
    await request(app).post('/api/finance/sync').set('Authorization', `Bearer ${financeAdmin.token}`).expect(200);
    const pool = getPool();
    const before = await pool.query(`SELECT COUNT(*)::int AS n FROM finance_transactions WHERE source <> 'manual'`);
    await request(app).post('/api/finance/sync').set('Authorization', `Bearer ${financeAdmin.token}`).expect(200);
    const after = await pool.query(`SELECT COUNT(*)::int AS n FROM finance_transactions WHERE source <> 'manual'`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});

describe.skipIf(SKIP)('reports', () => {
  it('returns a P&L with net = income − expense', async () => {
    const r = await request(app)
      .get('/api/finance/reports/pnl')
      .set('Authorization', `Bearer ${financeAdmin.token}`);
    expect(r.status).toBe(200);
    const rep = r.body.report;
    expect(rep.net_minor).toBe(rep.income_minor - rep.expense_minor);
  });

  it('exports a CSV', async () => {
    const r = await request(app)
      .get('/api/finance/reports/pnl/export?format=csv')
      .set('Authorization', `Bearer ${financeAdmin.token}`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toMatch(/csv/);
  });
});
