import { describe, it, expect, vi, beforeEach } from 'vitest';
import { idempotency } from '../../middleware/idempotency.js';

// Let the middleware's internal async IIFE settle before asserting.
const flush = () => new Promise((r) => setImmediate(r));

function makeRes() {
  const res = { statusCode: 200, jsonBody: undefined, headers: {} };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json   = vi.fn((p) => { res.jsonBody = p; return res; });
  res.set    = vi.fn((k, v) => { res.headers[k] = v; return res; });
  return res;
}

function makeReq({ key, body = {}, dbImpl, user = { id: 'u1' }, method = 'POST', url = '/api/orders' } = {}) {
  const headers = key ? { 'idempotency-key': key } : {};
  return {
    method,
    originalUrl: url,
    body,
    user,
    get: (h) => headers[String(h).toLowerCase()],
    db: { query: vi.fn(dbImpl ?? (async () => ({ rowCount: 1, rows: [] }))) },
  };
}

beforeEach(() => vi.clearAllMocks());

describe('idempotency middleware', () => {
  it('passes through untouched when no key is present', async () => {
    const req = makeReq({ key: null });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.db.query).not.toHaveBeenCalled();
  });

  it('first request: reserves the key, then persists the response on res.json', async () => {
    const dbImpl = async (sql) => {
      if (/INSERT INTO request_idempotency/.test(sql)) return { rowCount: 1, rows: [{ idempotency_key: 'k1' }] };
      if (/UPDATE request_idempotency/.test(sql)) return { rowCount: 1 };
      return { rowCount: 0, rows: [] };
    };
    const req = makeReq({ key: 'k1', dbImpl });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1); // handler runs

    // Simulate the handler responding 201.
    res.status(201).json({ success: true, id: 'order-1' });
    await flush();

    const updates = req.db.query.mock.calls.filter(([sql]) => /UPDATE request_idempotency/.test(sql));
    expect(updates).toHaveLength(1);
    const [, params] = updates[0];
    expect(params[0]).toBe('k1');
    expect(params[1]).toBe(201);
    expect(JSON.parse(params[2])).toEqual({ success: true, id: 'order-1' });
    expect(res.jsonBody).toEqual({ success: true, id: 'order-1' }); // still reaches the client
  });

  it('replay of a completed key returns the cached response without running the handler', async () => {
    const dbImpl = async (sql) => {
      if (/INSERT INTO request_idempotency/.test(sql)) return { rowCount: 0, rows: [] }; // conflict
      if (/SELECT/.test(sql)) return { rows: [{
        status_code: 201,
        response_body: { success: true, id: 'order-1' },
        completed_at: new Date(),
        created_at: new Date(),
      }] };
      return { rowCount: 0, rows: [] };
    };
    const req = makeReq({ key: 'k1', dbImpl });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled(); // handler is skipped — no duplicate side effects
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({ success: true, id: 'order-1' });
    expect(res.headers['Idempotent-Replay']).toBe('true');
  });

  it('replay while the original is still in flight returns 409', async () => {
    const dbImpl = async (sql) => {
      if (/INSERT INTO request_idempotency/.test(sql)) return { rowCount: 0, rows: [] };
      if (/SELECT/.test(sql)) return { rows: [{ status_code: null, response_body: null, completed_at: null, created_at: new Date() }] };
      return { rowCount: 0, rows: [] };
    };
    const req = makeReq({ key: 'k1', dbImpl });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(409);
    expect(res.jsonBody.code).toBe('idempotency_in_progress');
  });

  it('fails open: a reservation DB error lets the request proceed', async () => {
    const dbImpl = async () => { throw new Error('db down'); };
    const req = makeReq({ key: 'k1', dbImpl });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('takes over a stale in-flight reservation (crash recovery)', async () => {
    const old = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
    const dbImpl = async (sql) => {
      if (/INSERT INTO request_idempotency/.test(sql)) return { rowCount: 0, rows: [] };
      if (/SELECT/.test(sql)) return { rows: [{ status_code: null, response_body: null, completed_at: null, created_at: old }] };
      if (/UPDATE request_idempotency/.test(sql)) return { rowCount: 1 };
      return { rowCount: 0, rows: [] };
    };
    const req = makeReq({ key: 'k1', dbImpl });
    const res = makeRes();
    const next = vi.fn();

    idempotency(req, res, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1); // proceeds after takeover
  });
});
