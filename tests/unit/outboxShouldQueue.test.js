import { describe, it, expect } from 'vitest';
import { shouldQueue } from '../../client/src/lib/outbox.js';

// Pure-function predicate tests for the Web Outbox queue gate.
// IndexedDB-backed enqueue/list/flush logic isn't covered here —
// it lives in the browser and would need a fake-indexeddb shim
// (e.g. `fake-indexeddb`) to run under vitest's node env. For
// now we lock down the predicate that decides what gets queued,
// since that's where the security/UX trade-offs live.

function err({ method = 'POST', url = '/x', response = undefined, replay = false } = {}) {
  return {
    config: { method, url, _outboxReplay: replay },
    response,
  };
}

describe('outbox shouldQueue', () => {
  it('returns false for null / undefined', () => {
    expect(shouldQueue(null)).toBe(false);
    expect(shouldQueue(undefined)).toBe(false);
  });

  it('returns true for a network-failed POST', () => {
    expect(shouldQueue(err({ method: 'POST' }))).toBe(true);
  });

  it('returns true for PUT, PATCH, DELETE', () => {
    for (const m of ['PUT', 'PATCH', 'DELETE']) {
      expect(shouldQueue(err({ method: m }))).toBe(true);
    }
  });

  it('returns false for GET / HEAD (idempotent reads should not be queued)', () => {
    expect(shouldQueue(err({ method: 'GET' }))).toBe(false);
    expect(shouldQueue(err({ method: 'HEAD' }))).toBe(false);
  });

  it('returns false when the server actually responded (any status)', () => {
    for (const status of [200, 201, 400, 401, 404, 500]) {
      expect(shouldQueue(err({ response: { status } }))).toBe(false);
    }
  });

  it('returns false for /auth/* routes (would trap user in sign-in loop)', () => {
    expect(shouldQueue(err({ url: '/auth/login' }))).toBe(false);
    expect(shouldQueue(err({ url: '/api/auth/me' }))).toBe(false);
    expect(shouldQueue(err({ url: '/auth/logout' }))).toBe(false);
  });

  it('returns false on replays (avoids re-queueing already-queued items)', () => {
    expect(shouldQueue(err({ replay: true }))).toBe(false);
  });

  it('handles uppercase + lowercase method values', () => {
    expect(shouldQueue(err({ method: 'post' }))).toBe(true);
    expect(shouldQueue(err({ method: 'Patch' }))).toBe(true);
  });

  it('returns false when config is missing', () => {
    expect(shouldQueue({ })).toBe(false);
  });
});
