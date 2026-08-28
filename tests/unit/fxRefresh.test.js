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

import { refreshFxRatesFromFrankfurter, startFxRefresh, rateAgeMs } from '../../utils/fxRefresh.js';
import { cacheInvalidate } from '../../utils/cache.js';

// ageHours: how old the stored rates are when the job asks. null means
// the table has never been written, which is a fresh database.
function makePool({ ageHours = null } = {}) {
  return {
    query: vi.fn().mockImplementation(async (sql) => {
      if (/^BEGIN|^COMMIT|^ROLLBACK/.test(sql)) return { rowCount: 0 };
      if (/INSERT INTO exchange_rates/.test(sql)) return { rowCount: 1 };
      if (/max\(updated_at\)/.test(sql)) {
        return { rows: [{ newest: ageHours === null ? null : new Date(Date.now() - ageHours * 3600_000) }] };
      }
      return { rowCount: 0, rows: [] };
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

describe('rateAgeMs', () => {
  const pool = (newest) => ({ query: async () => ({ rows: [{ newest }] }) });

  it('reports Infinity when nothing has ever been written', async () => {
    expect(await rateAgeMs(pool(null))).toBe(Infinity);
  });

  it('measures from the newest managed row', async () => {
    const age = await rateAgeMs(pool(new Date(Date.now() - 3 * 3600_000)));
    expect(age / 3600_000).toBeCloseTo(3, 1);
  });

  // A row stamped in the future must not read as infinitely fresh and
  // wedge the job shut until somebody notices the rates are a week old.
  it('clamps a future timestamp to zero rather than going negative', async () => {
    expect(await rateAgeMs(pool(new Date(Date.now() + 9_000_000)))).toBe(0);
  });

  it('treats an unparseable timestamp as stale', async () => {
    expect(await rateAgeMs(pool('not-a-date'))).toBe(Infinity);
  });

  // AED_KES is a leftover from the pre-rebuild schema that this job has
  // never written. Age-checking it would make the table look permanently
  // stale and refetch on every tick.
  it('asks only about the pairs this job owns', async () => {
    const query = vi.fn(async () => ({ rows: [{ newest: new Date() }] }));
    await rateAgeMs({ query });
    expect(query.mock.calls[0][1][0]).toEqual(['GBP_KES', 'USD_KES', 'EUR_KES', 'CNY_KES']);
  });
});

// The old schedule was a 60s warm-up plus a 24h setInterval. Railway
// replaced the container on every deploy — every few hours through
// August — so the interval was reset long before it could fire, and
// every refresh the service ever did was the boot-time one. The moment
// deploys stopped, the rates would have been resting on a timer that had
// never once run to term. So the schedule now asks the database how old
// the rates are instead of counting elapsed process time.
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

  it('fetches on a fresh database ~60s after start', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const handle = startFxRefresh(makePool({ ageHours: null }));
    expect(handle).toBeInstanceOf(Function);

    await vi.advanceTimersByTimeAsync(59_000);
    expect(fetch).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetch).toHaveBeenCalledOnce();
    handle?.();
  });

  // The point of the rewrite: a restart no longer costs a day's freshness
  // in either direction. Rates written an hour ago are left alone…
  it('does not call Frankfurter when the stored rates are still fresh', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const handle = startFxRefresh(makePool({ ageHours: 1 }));

    await vi.advanceTimersByTimeAsync(61_000);
    expect(fetch).not.toHaveBeenCalled();
    // …and stay left alone tick after tick.
    await vi.advanceTimersByTimeAsync(4 * 30 * 60 * 1000);
    expect(fetch).not.toHaveBeenCalled();
    handle?.();
  });

  it('fetches once the stored rates pass the staleness threshold', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const handle = startFxRefresh(makePool({ ageHours: 13 }));

    await vi.advanceTimersByTimeAsync(61_000);
    expect(fetch).toHaveBeenCalledOnce();
    handle?.();
  });

  // A container that stays up for a week must still refresh daily, which
  // is the case the 24h interval was meant to cover and never reached.
  it('keeps checking every half hour, with no deploy in between', async () => {
    vi.useFakeTimers();
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const pool = makePool({ ageHours: 13 });
    const handle = startFxRefresh(pool);

    await vi.advanceTimersByTimeAsync(61_000);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(3);
    handle?.();
  });

  // Frankfurter timing out is the failure this job has actually seen —
  // five times in August. The next tick must retry rather than the job
  // going quiet until tomorrow, and a throw must not kill the timer.
  it('retries on the next tick after a failure', async () => {
    vi.useFakeTimers();
    fetch.mockRejectedValueOnce(new Error('network down'));
    fetch.mockResolvedValue({ ok: true, status: 200, json: async () => OK_PAYLOAD });
    const handle = startFxRefresh(makePool({ ageHours: 20 }));

    await vi.advanceTimersByTimeAsync(61_000);
    expect(fetch).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(fetch).toHaveBeenCalledTimes(2);
    handle?.();
  });

  it('survives the age query itself failing', async () => {
    vi.useFakeTimers();
    const pool = { query: vi.fn().mockRejectedValue(new Error('db gone')) };
    const handle = startFxRefresh(pool);

    await vi.advanceTimersByTimeAsync(61_000);
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
    expect(pool.query).toHaveBeenCalledTimes(2);   // still ticking
    handle?.();
  });
});
