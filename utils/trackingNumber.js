// utils/trackingNumber.js
//
// Single source of truth for `orders.tracking_number` minting. Live DB
// holds a unique index (`orders_tracking_number_key`) on the column, so
// a colliding INSERT throws Postgres 23505. The original generators
// (routes/orders.js, routes/admin.js, utils/markPaymentPaid.js) had
// none of the following safeguards and would surface a 500 to the
// customer / admin / Stripe webhook on collision:
//
//   • the admin.js generator used `Math.random().toString(36).substr(2,4)`
//     — only 4 base-36 chars (~1.7M codes/day), well within birthday-
//     collision range across the daily volume.
//   • the orders.js + markPaymentPaid.js generators used
//     crypto.randomBytes(4) → 8 hex chars (~4B codes/day), much safer
//     but still non-zero — a single collision becomes a permanent
//     "Failed to create order" error for the customer because the
//     same date+hex is regenerated on retry.
//
// `generateUniqueTrackingNumber` mints with crypto.randomBytes(4) and
// pre-checks the table; on a (vanishingly rare) hit it re-rolls.
// Caller still must handle the 23505 path post-INSERT in case of a
// race with a concurrent insert — the wrapper below
// (`insertWithUniqueTrackingNumber`) does that for the common case.

import crypto from 'node:crypto';

const PG_UNIQUE_VIOLATION = '23505';
const MAX_GENERATION_RETRIES = 5;

/**
 * Mint a tracking number that does NOT already exist in `orders`.
 *
 * Pre-checks the candidate against the table; if it's already taken
 * (vanishingly rare with 8 hex chars) re-roll. Pass the same db client
 * the calling transaction is using so the SELECT honours the surrounding
 * transaction snapshot.
 *
 * Even with this pre-check there's a TOCTOU window between the SELECT
 * and the eventual INSERT — concurrent inserts can both see the
 * candidate as free. Callers must wrap the INSERT in a try/catch and
 * retry on Postgres 23505; `insertWithUniqueTrackingNumber` below does
 * that automatically.
 *
 * @param {pg.PoolClient|pg.Pool} db
 * @returns {Promise<string>} e.g. "TC-20260504-1A2B3C4D"
 */
export async function generateUniqueTrackingNumber(db) {
  for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
    const candidate = mintCandidate();
    const { rows } = await db.query(
      `SELECT 1 FROM orders WHERE tracking_number = $1 LIMIT 1`,
      [candidate]
    );
    if (rows.length === 0) return candidate;
  }
  throw new Error(
    `generateUniqueTrackingNumber: ${MAX_GENERATION_RETRIES} attempts all collided — investigate the random source`
  );
}

/**
 * INSERT a row that includes the tracking_number column, retrying on
 * the unique-violation race (Postgres 23505).
 *
 * The caller supplies a function that takes the freshly-minted
 * `trackingNumber` and runs the INSERT (returning the pg `result`).
 * On 23505 the wrapper re-mints and retries up to MAX_GENERATION_RETRIES
 * times. Anything else propagates.
 *
 * @template T
 * @param {pg.PoolClient|pg.Pool} db
 * @param {(trackingNumber: string) => Promise<T>} doInsert
 * @returns {Promise<{ trackingNumber: string, result: T }>}
 */
export async function insertWithUniqueTrackingNumber(db, doInsert) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
    const trackingNumber = await generateUniqueTrackingNumber(db);
    try {
      const result = await doInsert(trackingNumber);
      return { trackingNumber, result };
    } catch (err) {
      // Only retry the unique-violation race on tracking_number itself.
      // A 23505 on a *different* unique constraint (e.g. duplicate
      // payments mpesa_reference, customs_entries parcel_id) means the
      // caller has its own bug — bubble that out unchanged.
      if (err && err.code === PG_UNIQUE_VIOLATION && isTrackingNumberConflict(err)) {
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('insertWithUniqueTrackingNumber: exhausted retries');
}

function mintCandidate() {
  const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TC-${date}-${random}`;
}

function isTrackingNumberConflict(err) {
  // pg surfaces the offending constraint on err.constraint and the
  // offending column on err.column. Live DB names the unique index
  // `orders_tracking_number_key` (auto-generated when the column was
  // declared UNIQUE in the original schema). If pg_node ever loses
  // that detail (older drivers don't always populate it), fall back
  // to err.detail substring sniffing.
  if (err.constraint && err.constraint.includes('tracking_number')) return true;
  if (err.column === 'tracking_number') return true;
  if (typeof err.detail === 'string' && err.detail.includes('tracking_number')) return true;
  return false;
}
