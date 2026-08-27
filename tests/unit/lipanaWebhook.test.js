import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Lipana client (signature verifier + the LipanaError class so the
// `instanceof` branch in the handler still works) and markPaymentPaid before
// importing the handler. Same recipe as stripeWebhook.test.js — the suite
// stays fully offline.
vi.mock('../../utils/lipanaClient.js', async () => {
  // Re-use the real LipanaError class so `instanceof` checks in the handler
  // see the same constructor identity. Everything else is a vi.fn spy.
  const actual = await vi.importActual('../../utils/lipanaClient.js');
  return {
    LipanaError: actual.LipanaError,
    verifyWebhookSignature: vi.fn(),
  };
});

vi.mock('../../utils/markPaymentPaid.js', () => ({
  markPaymentPaid: vi.fn(),
}));

import { lipanaWebhookHandler } from '../../routes/payments.js';
import { verifyWebhookSignature, LipanaError } from '../../utils/lipanaClient.js';
import { markPaymentPaid } from '../../utils/markPaymentPaid.js';

function makeRes() {
  const res = { statusCode: 200, jsonBody: undefined, sendBody: undefined };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json   = vi.fn((p) => { res.jsonBody = p; return res; });
  res.send   = vi.fn((p) => { res.sendBody = p; return res; });
  return res;
}

// dbQueryImpl: a single (sql, params) -> { rowCount, rows } function. The
// handler calls req.db.query at most twice per request: idempotency insert
// and payment lookup. Tests can return different shapes per call by using
// a closure over a counter.
function makeReq({ headers = {}, body, dbQueryImpl } = {}) {
  return {
    headers,
    body: body ?? Buffer.from(JSON.stringify({ event: 'payment.success', data: {} })),
    db: {
      query: vi.fn(dbQueryImpl ?? (async () => ({ rowCount: 1, rows: [] }))),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('lipanaWebhookHandler — pre-signature guards', () => {
  it('returns 401 if X-Lipana-Signature header is missing', async () => {
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.sendBody).toMatch(/Missing X-Lipana-Signature/);
    expect(verifyWebhookSignature).not.toHaveBeenCalled();
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  it('returns 401 if verifyWebhookSignature returns false', async () => {
    verifyWebhookSignature.mockReturnValue(false);
    const req = makeReq({ headers: { 'x-lipana-signature': 'tampered' } });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(401);
    expect(res.sendBody).toMatch(/Invalid signature/);
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  it('forwards LipanaError status when the verifier throws (e.g. webhook secret unset)', async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new LipanaError('LIPANA_WEBHOOK_SECRET is not configured.', {
        status: 503,
        code: 'lipana_webhook_not_configured',
      });
    });
    const req = makeReq({ headers: { 'x-lipana-signature': 'sig' } });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({
      success: false,
      error: 'lipana_webhook_not_configured',
      message: 'LIPANA_WEBHOOK_SECRET is not configured.',
    });
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  it('rethrows non-LipanaError exceptions from the verifier', async () => {
    verifyWebhookSignature.mockImplementation(() => {
      throw new Error('boom');
    });
    const req = makeReq({ headers: { 'x-lipana-signature': 'sig' } });
    const res = makeRes();

    await expect(lipanaWebhookHandler(req, res)).rejects.toThrow('boom');
    expect(req.db.query).not.toHaveBeenCalled();
  });
});

describe('lipanaWebhookHandler — payload parsing', () => {
  it('returns 400 on invalid JSON body', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from('not-json{'),
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.sendBody).toMatch(/Invalid JSON/);
    expect(req.db.query).not.toHaveBeenCalled();
  });

  it('returns 400 on malformed payload (no event)', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({ data: { transactionId: 'TX1' } })),
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.sendBody).toMatch(/Malformed payload/);
    expect(req.db.query).not.toHaveBeenCalled();
  });
});

describe('lipanaWebhookHandler — idempotency + lookup', () => {
  it('short-circuits with duplicate:true on replay (event already recorded as seen)', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.success',
        data: { transactionId: 'TX-REPLAY' },
      })),
      dbQueryImpl: async (sql) => (sql.includes('lipana_events_seen')
        ? { rows: [{ '?column?': 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 }),
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.jsonBody).toEqual({ received: true, duplicate: true });
    expect(req.db.query).toHaveBeenCalledTimes(1); // only the idempotency check
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  // The event id must be consumed AFTER processing, not before: the old
  // insert-first order meant a settlement failure left the payment
  // unpaid while the redelivery short-circuited as a duplicate forever.
  it('a settlement failure returns 500 and does NOT record the event, so Lipana redelivers', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    markPaymentPaid.mockResolvedValueOnce({ ok: false, reason: 'state-flip-failed' });
    const queries = [];
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.success',
        data: { transactionId: 'TX-FAIL' },
      })),
      dbQueryImpl: async (sql) => {
        queries.push(sql);
        if (sql.includes('lipana_events_seen') && sql.startsWith('SELECT')) return { rows: [] };
        if (sql.includes('FROM payments')) return { rows: [{ id: 'PAY-9', status: 'pending' }] };
        return { rows: [], rowCount: 1 };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.statusCode).toBe(500);
    expect(queries.some((sql) => sql.includes('INSERT INTO lipana_events_seen'))).toBe(false);
  });

  it('a successful settlement records the event as seen afterwards', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    markPaymentPaid.mockResolvedValueOnce({ ok: true });
    const queries = [];
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.success',
        data: { transactionId: 'TX-OK' },
      })),
      dbQueryImpl: async (sql) => {
        queries.push(sql);
        if (sql.includes('lipana_events_seen') && sql.startsWith('SELECT')) return { rows: [] };
        if (sql.includes('FROM payments')) return { rows: [{ id: 'PAY-10', status: 'pending' }] };
        return { rows: [], rowCount: 1 };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.jsonBody).toEqual({ received: true, ok: true });
    expect(queries.some((sql) => sql.includes('INSERT INTO lipana_events_seen'))).toBe(true);
  });

  it('returns no_payment when no matching payments row exists', async () => {
    verifyWebhookSignature.mockReturnValue(true);

    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.success',
        data: { transactionId: 'TX-ORPHAN' },
      })),
      dbQueryImpl: async () => {
        call += 1;
        if (call === 1) return { rowCount: 1 };           // idempotency insert ok
        return { rowCount: 0, rows: [] };                  // payments lookup: no match
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(res.jsonBody).toEqual({ received: true, no_payment: true });
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });
});

describe('lipanaWebhookHandler — event routing', () => {
  it('payment.success with matching row → calls markPaymentPaid', async () => {
    verifyWebhookSignature.mockReturnValue(true);
    markPaymentPaid.mockResolvedValue({ ok: true });

    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.success',
        data: { transactionId: 'TX-OK' },
      })),
      dbQueryImpl: async () => {
        call += 1;
        if (call === 1) return { rowCount: 1 };
        return { rows: [{ id: 'pay_77', status: 'pending' }] };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(markPaymentPaid).toHaveBeenCalledWith(req.db, 'pay_77');
    expect(res.jsonBody).toEqual({ received: true, ok: true });
  });

  it('payment.failed → UPDATE payments status=failed, no markPaymentPaid', async () => {
    verifyWebhookSignature.mockReturnValue(true);

    const queries = [];
    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.failed',
        data: { transactionId: 'TX-FAIL' },
      })),
      dbQueryImpl: async (sql, params) => {
        queries.push({ sql, params });
        call += 1;
        if (call === 1) return { rowCount: 1 };
        if (call === 2) return { rows: [{ id: 'pay_fail', status: 'pending' }] };
        return { rowCount: 1 };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, failed: true });
    // Third query is the failed-update.
    const failedSql = queries[2].sql;
    expect(failedSql).toMatch(/UPDATE payments/i);
    expect(failedSql).toMatch(/'failed'/);
    expect(queries[2].params).toEqual(['pay_fail']);
  });

  it('payment.timeout → same path as failed (only flips non-terminal rows)', async () => {
    verifyWebhookSignature.mockReturnValue(true);

    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'transaction.timeout',
        data: { transactionId: 'TX-TIMEOUT' },
      })),
      dbQueryImpl: async () => {
        call += 1;
        if (call === 1) return { rowCount: 1 };
        if (call === 2) return { rows: [{ id: 'pay_to', status: 'pending' }] };
        return { rowCount: 1 };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, failed: true });
  });

  it('payment.initiated → no-op (already pending)', async () => {
    verifyWebhookSignature.mockReturnValue(true);

    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'payment.initiated',
        data: { transactionId: 'TX-INIT' },
      })),
      dbQueryImpl: async () => {
        call += 1;
        if (call === 1) return { rowCount: 1 };
        return { rows: [{ id: 'pay_init', status: 'pending' }] };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, ignored: 'payment.initiated' });
  });

  it('unknown event type is acknowledged with ignored:<type>', async () => {
    verifyWebhookSignature.mockReturnValue(true);

    let call = 0;
    const req = makeReq({
      headers: { 'x-lipana-signature': 'sig' },
      body: Buffer.from(JSON.stringify({
        event: 'something.weird',
        data: { transactionId: 'TX-WEIRD' },
      })),
      dbQueryImpl: async () => {
        call += 1;
        if (call === 1) return { rowCount: 1 };
        return { rows: [{ id: 'pay_w', status: 'pending' }] };
      },
    });
    const res = makeRes();

    await lipanaWebhookHandler(req, res);

    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, ignored: 'something.weird' });
  });
});
