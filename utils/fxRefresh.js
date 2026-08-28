// utils/fxRefresh.js
//
// Pulls live exchange rates from frankfurter.dev (ECB-blended, MIT-
// licensed, no API key, no quota) and upserts them into the
// `exchange_rates` table. The public PUT /api/admin/exchange-rates
// admin-override path is unchanged — this just keeps the rows fresh
// in between (and on first deploy of a new environment).
//
// Why Frankfurter:
//   - Native GBP base + KES coverage in one response, so we derive
//     all four <X>_KES rows from a single call (one division per
//     non-KES pair). exchangeratesapi.io free tier forces EUR base.
//   - 200+ currencies on v2 incl. KES. v1 doesn't carry KES, so the
//     URL below is pinned to v2 deliberately — DO NOT downgrade.
//   - No key / no plan tier means CI + staging + prod all hit the
//     same endpoint without secret management.
//
// Storage convention: this table stores `<from>_KES` rows (KES is
// always the quote currency) because every customer-facing surface
// renders in KES. The Frankfurter response is GBP-base, so we
// translate: GBP_KES = rates.KES directly; for X ∈ {USD, EUR, CNY}
// the cross-rate is `X_KES = rates.KES / rates.X`. routes/exchange.js
// reads these rows back as-is — keep the schema shape in sync.
//
// Freshness is decided by asking the database how old the stored rates
// are, not by counting elapsed process time — see startFxRefresh for why
// a 24-hour setInterval was the wrong instrument.
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
// Source codes we need from Frankfurter's response (GBP base). KES
// must be in this list because every <X>_KES cross-rate is derived
// from it. NON_KES_PAIRS drives the cross-rate division loop below.
const REQUIRED_CODES = ['USD', 'EUR', 'CNY', 'KES'];
const NON_KES_PAIRS = ['USD', 'EUR', 'CNY'];
const FETCH_TIMEOUT_MS = 10_000;
const WARMUP_MS = 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

// How often to CHECK, and how old the stored rates must be before a
// check turns into a fetch. These are not the same number on purpose —
// see startFxRefresh.
const TICK_MS = Math.max(1, Number(process.env.FX_CHECK_INTERVAL_MINUTES) || 30) * 60 * 1000;
const STALE_AFTER_MS = Math.max(1, Number(process.env.FX_STALE_AFTER_HOURS) || 12) * HOUR_MS;

// The pairs this job owns. A row outside this list (AED_KES, left over
// from the pre-rebuild schema) is not ours to age-check — otherwise one
// orphan would keep the whole table looking stale forever.
const MANAGED_PAIRS = ['GBP_KES', 'USD_KES', 'EUR_KES', 'CNY_KES'];

/**
 * How old is the freshest rate we manage? Infinity when we have never
 * written one, so a brand-new database refreshes immediately.
 *
 * @param {{ query: Function }} db
 * @returns {Promise<number>} milliseconds, or Infinity
 */
export async function rateAgeMs(db) {
  const { rows } = await db.query(
    `SELECT max(updated_at) AS newest FROM exchange_rates WHERE currency_pair = ANY($1)`,
    [MANAGED_PAIRS]
  );
  const newest = rows?.[0]?.newest;
  if (!newest) return Infinity;
  const at = new Date(newest).getTime();
  if (!Number.isFinite(at)) return Infinity;
  // A clock skew that puts the row in the future must not read as
  // "infinitely fresh" and wedge the job shut.
  return Math.max(0, Date.now() - at);
}

/**
 * Fetch GBP-base rates from Frankfurter and upsert the four
 * `<from>_KES` rows (GBP_KES, USD_KES, EUR_KES, CNY_KES) into
 * `exchange_rates`. Single transaction so a partial network failure
 * mid-write can't leave a row stale-by-half.
 *
 * Returns:
 *   { ok: true,  rates: { GBP_KES, USD_KES, EUR_KES, CNY_KES }, rateDate }
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

  // Frankfurter v2 /rates response is a flat array of rows:
  //   [{ date: "YYYY-MM-DD", base: "GBP", quote: "USD", rate: 1.36 }, ...]
  // Some endpoints (or future tweaks) might envelope it as
  // `{ data: [...] }` — tolerate both. Per-quote date can differ
  // (Frankfurter publishes whatever each central bank last quoted),
  // so we pick the most recent date across the four pairs we care
  // about as the reported rateDate.
  const rows = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : null);
  if (!rows) {
    const err = 'Frankfurter response was not an array of rate rows';
    await logError({ level: 'warn', source: 'fx-refresh', message: err, meta: { keys: Object.keys(payload || {}).slice(0, 10) } });
    return { ok: false, error: err };
  }

  const byQuote = new Map();
  for (const row of rows) {
    if (row && typeof row === 'object' && typeof row.quote === 'string') {
      byQuote.set(row.quote, row);
    }
  }

  // Validate every required source code is present + numeric BEFORE
  // computing cross-rates. A NaN here would otherwise propagate
  // silently into the persisted rows.
  const src = {};
  const dates = [];
  for (const code of REQUIRED_CODES) {
    const row = byQuote.get(code);
    const v = Number(row?.rate);
    if (!Number.isFinite(v) || v <= 0) {
      const err = `Frankfurter response missing/invalid rate for ${code}`;
      await logError({ level: 'warn', source: 'fx-refresh', message: err, meta: { code, raw: row?.rate } });
      return { ok: false, error: err };
    }
    src[code] = v;
    if (row?.date) dates.push(row.date);
  }
  // ISO YYYY-MM-DD strings sort lexicographically the same as
  // chronologically, so plain max() over the four works.
  const rateDate = dates.length ? dates.sort().at(-1) : null;

  // Derive <from>_KES form. GBP_KES is the direct Frankfurter value;
  // every other pair divides KES-against-GBP by source-against-GBP
  // to get source-against-KES.
  const ratesOut = { GBP_KES: src.KES };
  for (const code of NON_KES_PAIRS) {
    ratesOut[`${code}_KES`] = src.KES / src[code];
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
 * Keep the FX rows fresh, whether or not anybody deploys.
 *
 * This used to be a 60-second warm-up run plus a 24-hour setInterval.
 * The interval is the part that never earned its keep: Railway replaces
 * the container on every deploy, and through August that happened every
 * few hours, so the timer was reset long before it could fire. Every
 * refresh the service has ever done was the boot-time one. The moment
 * deploys stop — which is exactly when nobody is watching — the rates
 * would have been resting on a timer that had never once run to term.
 *
 * So the schedule no longer measures elapsed process time. It ticks
 * often (default 30 min) and asks the database a question instead: how
 * old is the newest rate we manage? Only a stale answer costs a network
 * call. That is self-healing — a restart at any point in the cycle is
 * picked up within one tick — and it is idempotent, so two instances
 * racing cost one redundant fetch rather than a wrong number.
 *
 * Frankfurter publishes ECB rates once per working day, so a 12-hour
 * staleness threshold means at most two calls a day. There is no key and
 * no quota; the cost of checking is a single indexed query.
 *
 * Gated by FX_REFRESH_ENABLED (default-on). FX_CHECK_INTERVAL_MINUTES
 * and FX_STALE_AFTER_HOURS override the two numbers above.
 *
 * Returns a cancel handle the caller wires into the SIGTERM/SIGINT path.
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

  const refresh = async (why) => {
    const result = await refreshFxRatesFromFrankfurter(pool);
    if (result.ok) {
      console.log(`[fx-refresh] updated 4 pair(s) from Frankfurter (rate date ${result.rateDate || 'unknown'}, ${why})`);
    } else {
      // Left deliberately quiet at warn level: the existing rows stand,
      // and the next tick retries in TICK_MS rather than tomorrow.
      console.warn(`[fx-refresh] refresh failed (${why}): ${result.error}`);
    }
  };

  // One tick. Never throws — a bad tick must not kill the timer.
  const tick = async () => {
    try {
      const age = await rateAgeMs(pool);
      if (age < STALE_AFTER_MS) return;   // silent: this is the common case
      await refresh(age === Infinity ? 'no rates on file' : `${Math.round(age / HOUR_MS)}h old`);
    } catch (e) {
      console.error('[fx-refresh] tick failed:', e?.message);
    }
  };

  const first = setTimeout(tick, WARMUP_MS);
  if (typeof first.unref === 'function') first.unref();

  const recurring = setInterval(tick, TICK_MS);
  if (typeof recurring.unref === 'function') recurring.unref();

  return () => {
    clearTimeout(first);
    clearInterval(recurring);
  };
}
