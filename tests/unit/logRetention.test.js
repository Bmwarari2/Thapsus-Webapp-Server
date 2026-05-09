import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startLogRetention } from '../../utils/logRetention.js';

// startLogRetention returns a cancel handle and queues a setTimeout +
// setInterval. We use vitest's fake timers to assert on what would
// happen WITHOUT actually waiting 60 seconds + 24 hours per test.

function makePool({ rowCount = 7 } = {}) {
  return {
    query: vi.fn().mockResolvedValue({ rowCount }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  // Restore the env to a known-clean baseline so a previous test's
  // override doesn't leak into the next.
  delete process.env.LOG_RETENTION_ERROR_DAYS;
  delete process.env.LOG_RETENTION_ADMIN_DAYS;
  delete process.env.LOG_RETENTION_EMAIL_DAYS;
});

describe('startLogRetention — scheduling', () => {
  it('returns null and does no work when pool is missing', async () => {
    const handle = startLogRetention(null);
    expect(handle).toBeNull();
  });

  it('schedules the first prune ~60s after start, then every 24h', async () => {
    const pool = makePool();
    const handle = startLogRetention(pool);
    expect(handle).toBeInstanceOf(Function);

    // Nothing has run yet.
    expect(pool.query).not.toHaveBeenCalled();

    // 59s in — still nothing.
    await vi.advanceTimersByTimeAsync(59_000);
    expect(pool.query).not.toHaveBeenCalled();

    // 60s in — first prune fires (one query per configured table = 3).
    await vi.advanceTimersByTimeAsync(2_000);
    expect(pool.query).toHaveBeenCalledTimes(3);

    pool.query.mockClear();

    // Then 24h passes — recurring prune fires another batch of 3.
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
    expect(pool.query).toHaveBeenCalledTimes(3);

    handle?.();
  });

  it('cancels the timers when the returned handle is invoked', async () => {
    const pool = makePool();
    const stop = startLogRetention(pool);
    expect(stop).toBeInstanceOf(Function);

    stop();

    // After cancel, neither the warmup nor the recurring tick should fire.
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);
    expect(pool.query).not.toHaveBeenCalled();
  });
});

describe('startLogRetention — env-driven retention windows', () => {
  it('skips a table when its env var is set to 0', async () => {
    process.env.LOG_RETENTION_ADMIN_DAYS = '0';
    const pool = makePool();
    const stop = startLogRetention(pool);

    await vi.advanceTimersByTimeAsync(61_000);

    // Two prunes should have run — admin_logs is skipped.
    expect(pool.query).toHaveBeenCalledTimes(2);
    const targets = pool.query.mock.calls.map((c) => c[0]);
    expect(targets.some((s) => s.includes('error_logs'))).toBe(true);
    expect(targets.some((s) => s.includes('email_logs'))).toBe(true);
    expect(targets.some((s) => s.includes('admin_logs'))).toBe(false);

    stop();
  });

  it('falls back to the default when env var is invalid', async () => {
    process.env.LOG_RETENTION_ERROR_DAYS = 'definitely-not-a-number';
    const pool = makePool();
    const stop = startLogRetention(pool);

    // Spy on console.warn just for this test so the warning doesn't
    // pollute the test output.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await vi.advanceTimersByTimeAsync(61_000);

    // Default 30-day window passed as the parameter — we look at the
    // params array on the error_logs query.
    const errorCall = pool.query.mock.calls.find((c) => c[0].includes('error_logs'));
    expect(errorCall?.[1]).toEqual(['30']);
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    stop();
  });

  it('passes the configured days as a string parameter (parameterised query)', async () => {
    process.env.LOG_RETENTION_ERROR_DAYS = '14';
    const pool = makePool();
    const stop = startLogRetention(pool);

    await vi.advanceTimersByTimeAsync(61_000);

    const errorCall = pool.query.mock.calls.find((c) => c[0].includes('error_logs'));
    expect(errorCall?.[0]).toMatch(/DELETE FROM error_logs[\s\S]+\$1/);
    expect(errorCall?.[1]).toEqual(['14']);

    stop();
  });

  it('does not crash if a single table prune throws', async () => {
    const pool = {
      // Every other call rejects.
      query: vi.fn()
        .mockRejectedValueOnce(new Error('nope'))
        .mockResolvedValue({ rowCount: 1 }),
    };
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const stop = startLogRetention(pool);
    await vi.advanceTimersByTimeAsync(61_000);

    // All three table prunes were attempted even though the first failed.
    expect(pool.query).toHaveBeenCalledTimes(3);
    expect(err).toHaveBeenCalled();

    err.mockRestore();
    log.mockRestore();
    stop();
  });
});
