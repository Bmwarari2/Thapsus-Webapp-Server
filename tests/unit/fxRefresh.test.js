import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// errorLogger imports getPool() which transitively wakes up the
// database init module. Stub it before importing fxRefresh so the test
// has no real network/DB dependency.
vi.mock('../../utils/errorLogger.js', () => ({
  logError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../utils/cache.js', () => ({
  cacheInvalidate: vi.fn(),
}));

import { refreshFxRatesFromFrankfurter, startFxRefresh } from '../../utils/fxRefresh.js';
import { cacheInvalidate } from '../../utils/cache.js';

function makePool() {
  return {
    query: vi.fn().mockImplementation(async (sql) => {
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql)) return { rowCount: 0 };
      if (/INSERT INTO exchange_rates/.test(sql)) return { rowCount: 1 };
      return { rowCount: 0 };
    }),
  };
}

// Frankfurter /v2/rates response — flat array, one row per quote.
// Real responses include ~180 currencies; here we include only the four
// we read plus a few decoys to mimic the noise.
const OK_PAYLOAD = [
  { date: '2026-05-08', base: 'GBP', quote: 'AED', rate: 4.9964 },
  { date: '2026-05-11', base: 'GBP', quote: 'USD', rate: 1.3605 },
  { date: '2026-05-11', base: 'GBP', quote: 'EUR', rate: 1.1565 },
  { date: '2026-05-11', base: 'GBP', quote: 'CNY', rate: 9.2506 },
  { date: '2026-05-11', base: 'GBP', quote: 'KES', rate: 175.69 },
  { date: '2026-05-11', base: 'GBP', quote: 'CAD', rate: 1.8599 },
];

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  cacheInvalidate.mockClear();
  delete process.env.FX_REFRESH_ENABLED;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('refreshFxRatesFromFrankfurter', () => {
  it('upserts the four <X>_KES pairs and busts the cache on success', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const pool = makePool();

    const result = await refreshFxRatesFromFrankfurter(pool);

    expect(result.ok).toBe(true);
    expect(result.rateDate).toBe('2026-05-11');
    // GBP_KES is the direct Frankfurter value; the others are cross-rates
    // (KES-per-GBP / X-per-GBP = KES-per-X). Tolerance is wide because
    // these are floats — exact arithmetic isn't the point of the test.
    expect(result.rates.GBP_KES).toBeCloseTo(175.69, 4);
    expect(result.rates.USD_KES).toBeCloseTo(175.69 / 1.3605, 4);
    expect(result.rates.EUR_KES).toBeCloseTo(175.69 / 1.1565, 4);
    expect(result.rates.CNY_KES).toBeCloseTo(175.69 / 9.2506, 4);

    // BEGIN + 4 upserts + COMMIT = 6 queries.
    const inserts = pool.query.mock.calls.filter(([sql]) => /INSERT INTO exchange_rates/.test(sql));
    expect(inserts).toHaveLength(4);
    const pairs = inserts.map(([, params]) => params[0]).sort();
    expect(pairs).toEqual(['CNY_KES', 'EUR_KES', 'GBP_KES', 'USD_KES']);
    // updated_by is hardcoded to NULL in SQL; the params are [pair, rate] only.
    expect(inserts[0][1]).toHaveLength(2);

    expect(cacheInvalidate).toHaveBeenCalledOnce();
  });

  it('tolerates the {data:[...]} envelope shape', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: OK_PAYLOAD }) });
    const pool = makePool();
    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(true);
    expect(result.rates.GBP_KES).toBeCloseTo(175.69, 4);
  });

  it('returns ok:false and does NOT upsert when Frankfurter returns HTTP 500', async () => {
    fetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const pool = makePool();

    const result = await refreshFxRatesFromFrankfurter(pool);

    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
    const inserts = pool.query.mock.calls.filter(([sql]) => /INSERT INTO exchange_rates/.test(sql));
    expect(inserts).toHaveLength(0);
    expect(cacheInvalidate).not.toHaveBeenCalled();
  });

  it('returns ok:false when fetch throws (network error)', async () => {
    fetch.mockRejectedValue(new Error('ECONNRESET'));
    const pool = makePool();
    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/ECONNRESET/);
    expect(cacheInvalidate).not.toHaveBeenCalled();
  });

  it('returns ok:false when a required pair is missing from the response', async () => {
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ([
        { date: '2026-05-11', base: 'GBP', quote: 'USD', rate: 1.3605 },
        { date: '2026-05-11', base: 'GBP', quote: 'EUR', rate: 1.1565 },
        // CNY + KES deliberately absent.
      ]),
    });
    const pool = makePool();
    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CNY|KES/);
    const inserts = pool.query.mock.calls.filter(([sql]) => /INSERT INTO exchange_rates/.test(sql));
    expect(inserts).toHaveLength(0);
  });

  it('returns ok:false when a rate is non-numeric or non-positive', async () => {
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ([
        { date: '2026-05-11', base: 'GBP', quote: 'USD', rate: 1.36 },
        { date: '2026-05-11', base: 'GBP', quote: 'EUR', rate: 1.15 },
        { date: '2026-05-11', base: 'GBP', quote: 'CNY', rate: 0 },
        { date: '2026-05-11', base: 'GBP', quote: 'KES', rate: 175.69 },
      ]),
    });
    const pool = makePool();
    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CNY/);
  });

  it('returns ok:false when payload is not an array', async () => {
    fetch.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ base: 'GBP', date: '2026-05-11', rates: { USD: 1.36, KES: 175 } }),
    });
    const pool = makePool();
    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not an array/);
  });

  it('rolls back the transaction when an upsert fails', async () => {
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const pool = {
      query: vi.fn().mockImplementation(async (sql) => {
        if (/^BEGIN/.test(sql)) return { rowCount: 0 };
        if (/INSERT INTO exchange_rates/.test(sql)) throw new Error('unique constraint busted');
        if (/^ROLLBACK/.test(sql)) return { rowCount: 0 };
        return { rowCount: 0 };
      }),
    };

    const result = await refreshFxRatesFromFrankfurter(pool);
    expect(result.ok).toBe(false);
    const rollbacks = pool.query.mock.calls.filter(([sql]) => /^ROLLBACK/.test(sql));
    expect(rollbacks).toHaveLength(1);
    expect(cacheInvalidate).not.toHaveBeenCalled();
  });

  it('returns ok:false when db is missing', async () => {
    const result = await refreshFxRatesFromFrankfurter(null);
    expect(result.ok).toBe(false);
  });
});

describe('startFxRefresh', () => {
  it('returns null and skips when FX_REFRESH_ENABLED=false', () => {
    process.env.FX_REFRESH_ENABLED = 'false';
    const handle = startFxRefresh(makePool());
    expect(handle).toBeNull();
  });

  it('returns null and skips when pool is missing', () => {
    const handle = startFxRefresh(null);
    expect(handle).toBeNull();
  });

  it('schedules first refresh ~60s after start, then every 24h', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const pool = makePool();
    const handle = startFxRefresh(pool);
    expect(handle).toBeInstanceOf(Function);

    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);

    handle?.();
  });
});
