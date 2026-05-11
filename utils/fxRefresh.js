// utils/fxRefresh.js
//
// Pulls live exchange rates from frankfurter.dev (ECB-blended, MIT-
// licensed, no API key, no quota) and upserts them into the
// `exchange_rates` table. The public PUT /api/admin/exchange-rates
// admin-override path is unchanged — this just keeps the rows fresh
// in between (and on first deploy of a new environment).
//
// Why Frankfurter:
//   - Native GBP base, so we map response → our rows with no cross-
//     rate math (exchangeratesapi.io free tier forces EUR base).
//   - 200+ currencies on v2 incl. KES. v1 doesn't carry KES, so the
//     URL below is pinned to v2 deliberately — DO NOT downgrade.
//   - No key / no plan tier means CI + staging + prod all hit the
//     same endpoint without secret management.
//
// Failure mode is deliberately silent for the cron path: if Frankfurter
// is down or returns a malformed response we log to `error_logs` and
// leave the existing rows untouched. The admin-set values from
// PUT /api/admin/exchange-rates remain the source of truth until the
// next successful refresh — keeping payment maths consistent rather
// than zeroing out and breaking checkout.
//
// The manual refresh endpoint (POST /api/admin/exchange-rates/refresh)
// surfaces the failure object so an operator clicking "refresh now"
// sees a clear error instead of silent no-op.

import { logError } from './errorLogger.js';
import { cacheInvalidate } from './cache.js';
import { EXCHANGE_RATES_CACHE_KEY_EXPORT } from '../routes/exchange.js';

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2/rates?base=GBP';
const PAIRS = ['USD', 'EUR', 'CNY', 'KES'];
const FETCH_TIMEOUT_MS = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WARMUP_MS = 60 * 1000;

/**
 * Fetch GBP-base rates from Frankfurter and upsert the four pairs we
 * care about (GBP→USD/EUR/CNY/KES) into `exchange_rates`. Single
 * transaction so a partial network failure mid-write can't leave a
 * row stale-by-half.
 *
 * Returns:
 *   { ok: true,  rates: { GBP_USD, GBP_EUR, GBP_CNY, GBP_KES }, rateDate }
 *   { ok: false, error: string, status?: number }
 *
 * Never throws — caller (scheduler or admin route) decides what to
 * do with the failure.
 *
 * @param {{ query: Function }} db - pg pool or client
 */
export async function refreshFxRatesFromFrankfurter(db) {
  if (!db) {
    return { ok: false, error: 'db pool not provided' };
  }

  let payload;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(FRANKFURTER_URL, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const err = `Frankfurter HTTP ${res.status}`;
      await logError({ level: 'warn', source: 'fx-refresh', message: err, statusCode: res.status });
      return { ok: false, error: err, status: res.status };
    }
    payload = await res.json();
  } catch (e) {
    const msg = e?.name === 'AbortError'
      ? `Frankfurter fetch timed out after ${FETCH_TIMEOUT_MS}ms`
      : `Frankfurter fetch failed: ${e?.message || String(e)}`;
    await logError({ level: 'warn', source: 'fx-refresh', message: msg, stack: e?.stack });
    return { ok: false, error: msg };
  }

  // Frankfurter v2 response shape:
  //   { base: "GBP", date: "YYYY-MM-DD", rates: { USD: 1.36, KES: 175.69, ... } }
  // The /v2/rates root response wraps it as either the above object
  // directly or `{ data: { ... } }` depending on filters; both shapes
  // are tolerated here so an upstream format tweak doesn't silently
  // break us.
  const body = payload?.data ?? payload;
  const ratesIn = body?.rates;
  const rateDate = body?.date || null;

  if (!ratesIn || typeof ratesIn !== 'object') {
    const err = 'Frankfurter response missing rates object';
    await logError({ level: 'warn', source: 'fx-refresh', message: err, meta: { payload } });
    return { ok: false, error: err };
  }

  const ratesOut = {};
  for (const code of PAIRS) {
    const v = Number(ratesIn[code]);
    if (!Number.isFinite(v) || v <= 0) {
      const err = `Frankfurter response missing/invalid rate for ${code}`;
      await logError({ level: 'warn', source: 'fx-refresh', message: err, meta: { code, raw: ratesIn[code] } });
      return { ok: false, error: err };
    }
    ratesOut[`GBP_${code}`] = v;
  }

  // updated_by is a TEXT FK to users(id) with ON DELETE SET NULL —
  // for system writes we leave it NULL so the row is plainly
  // distinguishable from an admin override. The admin_logs table
  // is the audit trail for actor-attributed writes; auto-refresh
  // intentionally doesn't write there to avoid 365 noisy rows/year.
  try {
    await db.query('BEGIN');
    try {
      for (const [pair, rate] of Object.entries(ratesOut)) {
        await db.query(
          `INSERT INTO exchange_rates (currency_pair, rate, updated_by, updated_at)
           VALUES ($1, $2, NULL, NOW())
           ON CONFLICT (currency_pair) DO UPDATE
              SET rate = EXCLUDED.rate,
                  updated_by = NULL,
                  updated_at = NOW()`,
          [pair, rate]
        );
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
  } catch (e) {
    const msg = `Failed to persist refreshed FX rates: ${e?.message || String(e)}`;
    await logError({ level: 'error', source: 'fx-refresh', message: msg, stack: e?.stack });
    return { ok: false, error: msg };
  }

  cacheInvalidate(EXCHANGE_RATES_CACHE_KEY_EXPORT);

  return { ok: true, rates: ratesOut, rateDate };
}

/**
 * Start the daily FX refresh job. Returns a cancel handle the caller
 * wires into the SIGTERM/SIGINT shutdown path so the timer doesn't
 * keep the event loop alive during graceful shutdown.
 *
 * Gated by FX_REFRESH_ENABLED env (default-on). Set FX_REFRESH_ENABLED=false
 * to disable — useful for dev/staging without outbound, or to silence
 * the job temporarily without redeploying.
 *
 * First refresh fires after WARMUP_MS (60s) so a fresh Railway deploy
 * doesn't slam Frankfurter at boot. After that, every 24h — Frankfurter
 * itself only updates daily, so faster cadence buys nothing.
 */
export function startFxRefresh(pool) {
  if (process.env.FX_REFRESH_ENABLED === 'false') {
    console.log('[fx-refresh] disabled via FX_REFRESH_ENABLED=false');
    return null;
  }
  if (!pool) {
    console.warn('[fx-refresh] no pool provided — skipping');
    return null;
  }

  const run = async () => {
    const result = await refreshFxRatesFromFrankfurter(pool);
    if (result.ok) {
      console.log(`[fx-refresh] updated 4 pair(s) from Frankfurter (rate date ${result.rateDate || 'unknown'})`);
    } else {
      console.warn(`[fx-refresh] refresh failed: ${result.error}`);
    }
  };

  const first = setTimeout(() => { run().catch((e) => console.error('[fx-refresh] crashed:', e?.message)); }, WARMUP_MS);
  if (typeof first.unref === 'function') first.unref();

  const recurring = setInterval(() => { run().catch((e) => console.error('[fx-refresh] crashed:', e?.message)); }, DAY_MS);
  if (typeof recurring.unref === 'function') recurring.unref();

  return () => {
    clearTimeout(first);
    clearInterval(recurring);
  };
}
