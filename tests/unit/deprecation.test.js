import { describe, it, expect, vi } from 'vitest';
import { deprecate } from '../../middleware/deprecation.js';

function makeRes() {
  const headers = {};
  return {
    headers,
    setHeader: vi.fn((name, value) => { headers[name] = value }),
  };
}

function makeReq({ method = 'GET', url = '/api/consolidation/foo', userId, ip } = {}) {
  return {
    method,
    originalUrl: url,
    user: userId ? { id: userId } : undefined,
    ip,
  };
}

describe('deprecate({ replacement, sunset })', () => {
  it('rejects sunset that is not a Date', () => {
    expect(() => deprecate({ replacement: '/x', sunset: '2026-05-23' }))
      .toThrowError(/sunset must be a Date/);
  });

  it('sets Deprecation, Sunset, and Link headers on every request', () => {
    const sunset = new Date('2026-05-23T00:00:00Z');
    const mw = deprecate({ replacement: '/api/consolidations', sunset });

    const req = makeReq();
    const res = makeRes();
    const next = vi.fn();

    mw(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
    expect(res.setHeader).toHaveBeenCalledWith('Sunset', sunset.toUTCString());
    expect(res.setHeader).toHaveBeenCalledWith(
      'Link',
      '</api/consolidations>; rel="successor-version"'
    );
    expect(next).toHaveBeenCalledOnce();
  });

  it('logs to console.warn the first time a (caller, path) is seen, and stays quiet after', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mw = deprecate({
      replacement: '/api/consolidations',
      sunset: new Date('2026-05-23T00:00:00Z'),
    });

    const req = makeReq({ ip: '203.0.113.7' });
    const res = makeRes();
    const next = vi.fn();

    mw(req, res, next);
    mw(req, res, next);
    mw(req, res, next);

    // One warning per unique caller × path, regardless of repeat hits.
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/\[deprecation\]/);
    expect(warn.mock.calls[0][0]).toMatch(/use \/api\/consolidations/);
    expect(warn.mock.calls[0][0]).toMatch(/caller=203\.0\.113\.7/);

    warn.mockRestore();
  });

  it('separates the dedupe key by user id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mw = deprecate({
      replacement: '/api/consolidations',
      sunset: new Date('2026-05-23T00:00:00Z'),
    });

    mw(makeReq({ userId: 'user-A' }), makeRes(), vi.fn());
    mw(makeReq({ userId: 'user-A' }), makeRes(), vi.fn()); // duplicate
    mw(makeReq({ userId: 'user-B' }), makeRes(), vi.fn()); // new caller, warn

    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0][0]).toMatch(/caller=user-A/);
    expect(warn.mock.calls[1][0]).toMatch(/caller=user-B/);

    warn.mockRestore();
  });

  it('separates the dedupe key by full URL (so /a and /a/b warn independently)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mw = deprecate({
      replacement: '/api/consolidations',
      sunset: new Date('2026-05-23T00:00:00Z'),
    });

    mw(makeReq({ url: '/api/consolidation/list', ip: '1.1.1.1' }), makeRes(), vi.fn());
    mw(makeReq({ url: '/api/consolidation/123', ip: '1.1.1.1' }), makeRes(), vi.fn());

    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});
