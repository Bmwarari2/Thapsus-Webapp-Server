import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import app from '../../server.js';
import { initializeDatabase, getPool } from '../../database/init.js';

// Regression net for the 2026-07 functionality audit (last-mile + cargo ops).
//
// Every failure fixed by that audit was invisible to the unit suite because
// it only reproduced against a real Postgres with the LIVE column types:
//   • last_mile_runs.id / pod_events.id are TEXT with NO default → INSERTs
//     that omitted id 500'd (run creation, POD capture, failed-delivery).
//   • ::run_status / ::customs_status / ::invoice_status enum casts — those
//     enum types do not exist on the live DB (the columns are TEXT+CHECK).
//   • ::uuid casts compared against TEXT columns (consolidations.id,
//     orders/packages.consolidation_id) → `operator does not exist:
//     text = uuid` (manifest, assign/remove-parcel, attach-to-shipping).
//   • refreshTotals read chargeable_kg off packages; it lives on orders.
//
// Gated on TEST_DATABASE_URL like the other integration suites.

const SKIP = !process.env.TEST_DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

const ids = { users: [], orders: [], runs: [], consolidations: [] };
let customer, operator, rider, agent; // { id, token }
let orderA, orderB;                   // { id, packageId }

function mint(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role, warehouse_id: user.warehouse_id },
    JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' }
  );
}

async function makeUser(role) {
  const pool = getPool();
  const id = randomUUID();
  const suffix = id.slice(0, 8);
  const email = `vitest-lm-${role}-${suffix}@test.thapsus.uk`;
  const warehouse_id = `TC-LM-${suffix}`;
  await pool.query(
    `INSERT INTO users (id, email, password_hash, name, phone, role, warehouse_id, referral_code, is_active, email_verified_at)
     VALUES ($1,$2,'x',$3,'+254700000000',$4,$5,$6,true,NOW())`,
    [id, email, `Vitest LM ${role}`, role, warehouse_id, `LM${suffix}`]
  );
  ids.users.push(id);
  return { id, email, role, warehouse_id, token: mint({ id, email, role, warehouse_id }) };
}

async function makeReceivedOrder() {
  // Customer registers the parcel, operator receives it — the same two
  // API calls production uses, so packages.status lands at
  // received_at_warehouse with a chargeable_kg on the parent order.
  const create = await request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${customer.token}`)
    .set('Idempotency-Key', `lm-test-${randomUUID()}`)
    .send({ retailer: 'Vitest Retail', description: 'regression parcel', weight_kg: 2, shipping_speed: 'economy' });
  expect(create.status).toBe(201);
  const orderId = create.body.order?.id || create.body.id;
  ids.orders.push(orderId);

  const recv = await request(app)
    .post(`/api/ops/parcels/${orderId}/receive`)
    .set('Authorization', `Bearer ${operator.token}`)
    .send({ weight_kg: 2.2, dimensions: { length: 20, width: 15, height: 10 } });
  expect(recv.status).toBe(200);

  const { rows } = await getPool().query('SELECT id FROM packages WHERE order_id = $1', [orderId]);
  return { id: orderId, packageId: rows[0]?.id };
}

beforeAll(async () => {
  if (SKIP) return;
  await initializeDatabase();
  customer = await makeUser('customer');
  operator = await makeUser('operator');
  rider    = await makeUser('rider');
  agent    = await makeUser('clearing_agent');
  orderA   = await makeReceivedOrder();
  orderB   = await makeReceivedOrder();
});

afterAll(async () => {
  if (SKIP) return;
  const pool = getPool();
  if (ids.runs.length) {
    await pool.query(`DELETE FROM pod_events WHERE run_id = ANY($1::text[])`, [ids.runs]);
    await pool.query(`DELETE FROM last_mile_run_parcels WHERE run_id = ANY($1::text[])`, [ids.runs]);
    await pool.query(`DELETE FROM last_mile_runs WHERE id = ANY($1::text[])`, [ids.runs]);
  }
  if (ids.consolidations.length) {
    await pool.query(`DELETE FROM pallets WHERE consolidation_id = ANY($1::text[])`, [ids.consolidations]);
    await pool.query(`DELETE FROM consolidations WHERE id = ANY($1::text[])`, [ids.consolidations]);
  }
  if (ids.orders.length) {
    await pool.query(`DELETE FROM customs_entries WHERE parcel_id = ANY($1::text[])`, [ids.orders]);
    await pool.query(`DELETE FROM parcel_items WHERE parcel_id = ANY($1::text[])`, [ids.orders]);
    await pool.query(`DELETE FROM packages WHERE order_id = ANY($1::text[])`, [ids.orders]);
    await pool.query(`DELETE FROM orders WHERE id = ANY($1::text[])`, [ids.orders]);
  }
  if (ids.users.length) {
    await pool.query(`DELETE FROM agent_invoices WHERE agent_id = ANY($1::text[])`, [ids.users]);
    await pool.query(`DELETE FROM users WHERE id = ANY($1::text[])`, [ids.users]);
  }
  await pool.end();
});

describe.skipIf(SKIP)('shipping consolidations (operator)', () => {
  let consId;

  it('creates a consolidation', async () => {
    const r = await request(app)
      .post('/api/consolidations')
      .set('Authorization', `Bearer ${operator.token}`)
      .set('Idempotency-Key', `lm-cons-${randomUUID()}`)
      .send({ week_start: '2026-06-29', cutoff_at: '2026-07-03T12:00:00Z' });
    expect(r.status).toBe(201);
    consId = r.body.consolidation_id;
    expect(consId).toBeTruthy();
    ids.consolidations.push(consId);
  });

  it('assigns and removes a parcel (refreshTotals must not 500)', async () => {
    const add = await request(app)
      .post(`/api/consolidations/${consId}/assign-parcel`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ parcel_id: orderA.packageId });
    expect(add.status).toBeLessThan(300);

    // totals must reflect the order's chargeable weight, not 500 on a
    // packages.chargeable_kg reference that doesn't exist.
    const { rows } = await getPool().query('SELECT total_parcels, total_kg FROM consolidations WHERE id = $1', [consId]);
    expect(Number(rows[0].total_parcels)).toBe(1);
    expect(Number(rows[0].total_kg)).toBeGreaterThan(0);

    const rm = await request(app)
      .post(`/api/consolidations/${consId}/remove-parcel`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ parcel_id: orderA.packageId });
    expect(rm.status).toBe(200);
  });

  it('bulk-assigns parcels and generates a manifest (no text=uuid cast failure)', async () => {
    const bulk = await request(app)
      .post(`/api/consolidations/${consId}/assign-parcels`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ parcel_ids: [orderA.packageId] });
    expect(bulk.status).toBeLessThan(300);

    const man = await request(app)
      .post(`/api/consolidations/${consId}/manifest`)
      .set('Authorization', `Bearer ${operator.token}`);
    expect(man.status).toBeLessThan(300);
  });

  it('rejects a status outside the DB CHECK list with 400, not 500', async () => {
    const r = await request(app)
      .patch(`/api/consolidations/${consId}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'cutoff' });
    expect(r.status).toBe(400);
  });
});

describe.skipIf(SKIP)('last-mile runs and POD (operator + rider)', () => {
  let runId;

  it('creates a run (last_mile_runs.id supplied by the server)', async () => {
    const r = await request(app)
      .post('/api/last-mile/runs')
      .set('Authorization', `Bearer ${operator.token}`)
      .set('Idempotency-Key', `lm-run-${randomUUID()}`)
      .send({ rider_id: rider.id, zone: 'Vitest Zone', run_date: '2026-07-02', parcel_ids: [orderA.id, orderB.id] });
    expect(r.status).toBe(201);
    runId = r.body.run_id || r.body.id || r.body.run?.id;
    expect(runId).toBeTruthy();
    ids.runs.push(runId);
  });

  it('activates the run (planned → in_progress flips parcels to out_for_delivery)', async () => {
    const r = await request(app)
      .patch(`/api/last-mile/runs/${runId}`)
      .set('Authorization', `Bearer ${operator.token}`)
      .send({ status: 'in_progress' });
    expect(r.status).toBe(200);

    const { rows } = await getPool().query('SELECT status FROM orders WHERE id = $1', [orderA.id]);
    expect(rows[0].status).toBe('out_for_delivery');
  });

  it('rejects a POD without photo (422)', async () => {
    const r = await request(app)
      .post(`/api/last-mile/rider/runs/${runId}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', `lm-pod-nophoto-${randomUUID()}`)
      .send({ parcel_id: orderA.id });
    expect(r.status).toBe(422);
  });

  it('records a delivered POD (pod_events.id supplied, no ::run_status cast)', async () => {
    const r = await request(app)
      .post(`/api/last-mile/rider/runs/${runId}/pod`)
      .set('Authorization', `Bearer ${rider.token}`)
      .set('Idempotency-Key', `lm-pod-${randomUUID()}`)
      .send({
        parcel_id: orderA.id,
        photo_url: 'https://example.com/pod.jpg',
        signature_url: 'https://example.com/sig.png',
        recipient_name: 'Vitest Recipient',
      });
    expect(r.status).toBeLessThan(300);

    const { rows } = await getPool().query(
      `SELECT id, result FROM pod_events WHERE run_id = $1 AND parcel_id = $2`,
      [runId, orderA.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBeTruthy();
    expect(rows[0].result).toBe('delivered');
  });

  it('records a failed delivery attempt without 500', async () => {
    const r = await request(app)
      .post(`/api/last-mile/rider/runs/${runId}/fail`)
      .set('Authorization', `Bearer ${rider.token}`)
      .send({ parcel_id: orderB.id, reason: 'Recipient unavailable' });
    expect(r.status).toBeLessThan(300);

    const { rows } = await getPool().query(
      `SELECT id, result FROM pod_events WHERE run_id = $1 AND parcel_id = $2 AND result = 'failed'`,
      [runId, orderB.id]
    );
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBeTruthy();
  });
});

describe.skipIf(SKIP)('customs entries + agent invoices (clearing agent)', () => {
  it('creates a customs entry (status is TEXT, not a customs_status enum)', async () => {
    const r = await request(app)
      .post('/api/customs/entries')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ parcel_id: orderA.id, entry_no: `E-${Date.now()}`, cif_kes: 10000, duty_kes: 1000, vat_kes: 1600 });
    expect(r.status).toBeLessThan(300);
  });

  it('rejects an invalid customs status with 400, not 500', async () => {
    const r = await request(app)
      .post('/api/customs/entries')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ parcel_id: orderA.id, status: 'not-a-real-status' });
    expect(r.status).toBe(400);
  });

  it('submits an agent invoice (status is TEXT, not an invoice_status enum)', async () => {
    const r = await request(app)
      .post('/api/agent-invoices')
      .set('Authorization', `Bearer ${agent.token}`)
      .send({ invoice_no: `INV-${Date.now()}`, amount_kes: 5000 });
    expect(r.status).toBe(201);
    expect(r.body.invoice_id).toBeTruthy();
  });
});
