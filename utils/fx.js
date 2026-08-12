// utils/fx.js
// Single source of truth for the live GBP→KES exchange rate.
//
// Audit P1.3: previously each money-side route inlined
// `Number(rr[0]?.rate || 165)` (or || 164.2). When the `exchange_rates`
// row was missing — fresh DB, accidentally deleted, schema drift — the
// silent fallback could miscalculate by 6 %+ vs spot, and the customer
// had no way to dispute. This helper throws instead, and the route
// converts to a 503 with a clear "FX rate unavailable" message.
//
// Why not just default? Because a Stripe payment locks the FX rate into
// the payments row at create time (`stripe_fx_rate_kes_gbp`). A wrong
// default rate is captured as truth on the receipt; the customer is
// then charged GBP-pence based on that wrong number, the M-Pesa
// suggested-invoice prefill drifts, and the audit trail says we knew
// the rate. Failing fast keeps every path consistent: an admin must
// set the rate via /admin/rates before any new payment can mint.

/**
 * Thrown when the GBP_KES row is missing or the persisted rate is
 * non-positive. Carries an HTTP-shaped 503 status so route handlers can
 * `if (e instanceof FxRateUnavailableError) res.status(e.status)…`.
 */
export class FxRateUnavailableError extends Error {
  constructor(message = 'GBP→KES exchange rate is not configured. An admin must set it under /admin/rates before payments can be created.') {
    super(message);
    this.name = 'FxRateUnavailableError';
    this.status = 503;
    this.code = 'fx_rate_unavailable';
  }
}

/**
 * Fetch the live GBP→KES rate from `exchange_rates`. Throws
 * FxRateUnavailableError when the row is absent or the value is
 * non-positive.
 *
 * @param {pg.Client | pg.Pool | { query: Function }} db — accept either
 *   a transactional client (so the read participates in a FOR UPDATE-
 *   bearing transaction) or a pool (for read-only call sites).
 * @returns {Promise<{ rate: number, updatedAt: string | null }>}
 */
export async function getGbpToKesRate(db) {
  const { rows } = await db.query(
    `SELECT rate, updated_at
       FROM exchange_rates
      WHERE currency_pair = 'GBP_KES'
      LIMIT 1`
  );
  if (!rows[0]) throw new FxRateUnavailableError();
  const rate = Number(rows[0].rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new FxRateUnavailableError(
      `GBP→KES rate stored in exchange_rates is invalid (got ${rows[0].rate}). An admin must set a positive rate under /admin/rates.`
    );
  }
  return { rate, updatedAt: rows[0].updated_at || null };
}

/**
 * Fetch the live USD→KES rate — the quoting currency for the WhatsApp
 * flow (Quote KES = USD × rate × (1 + markup%)). The row is maintained
 * daily by utils/fxRefresh.js (frankfurter.dev cross-rate). Same
 * fail-fast contract as the GBP helper: a missing/invalid row throws
 * rather than silently mis-quoting.
 */
export async function getUsdToKesRate(db) {
  const { rows } = await db.query(
    `SELECT rate, updated_at
       FROM exchange_rates
      WHERE currency_pair = 'USD_KES'
      LIMIT 1`
  );
  if (!rows[0]) {
    throw new FxRateUnavailableError(
      'USD→KES exchange rate is not configured. Trigger an FX refresh (admin → refresh rates) before quoting.'
    );
  }
  const rate = Number(rows[0].rate);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new FxRateUnavailableError(
      `USD→KES rate stored in exchange_rates is invalid (got ${rows[0].rate}). Trigger an FX refresh before quoting.`
    );
  }
  return { rate, updatedAt: rows[0].updated_at || null };
}
