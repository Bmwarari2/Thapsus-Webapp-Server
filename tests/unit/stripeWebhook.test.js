import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the Stripe SDK + secret accessor BEFORE importing the handler so the
// vi.mock hoisting catches the import inside routes/payments.js. We don't
// touch the real Stripe library or env vars — every signature decision is
// driven by a `constructEvent` mock we control per-test.
vi.mock('../../utils/stripeClient.js', () => ({
  getStripe: vi.fn(),
  stripeWebhookSecret: vi.fn(),
}));

// markPaymentPaid is the post-success side-effect entry point. We mock it
// to assert that valid signed webhooks reach it (and that bad signatures
// never do).
vi.mock('../../utils/markPaymentPaid.js', () => ({
  markPaymentPaid: vi.fn(),
}));

import { stripeWebhookHandler } from '../../routes/payments.js';
import { getStripe, stripeWebhookSecret } from '../../utils/stripeClient.js';
import { markPaymentPaid } from '../../utils/markPaymentPaid.js';

function makeRes() {
  const res = { statusCode: 200, jsonBody: undefined, sendBody: undefined };
  res.status = vi.fn((code) => { res.statusCode = code; return res; });
  res.json   = vi.fn((p) => { res.jsonBody = p; return res; });
  res.send   = vi.fn((p) => { res.sendBody = p; return res; });
  return res;
}

function makeReq({ headers = {}, body = Buffer.from('{}'), dbQueryImpl } = {}) {
  return {
    headers,
    body,
    db: {
      query: vi.fn(dbQueryImpl ?? (async () => ({ rowCount: 1, rows: [] }))),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('stripeWebhookHandler — pre-signature guards', () => {
  it('returns 503 if STRIPE_WEBHOOK_SECRET is unset', async () => {
    stripeWebhookSecret.mockReturnValue(null);
    const req = makeReq();
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.jsonBody).toEqual({ success: false, message: 'Stripe webhook not configured' });
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  it('returns 400 if stripe-signature header is missing', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    const req = makeReq({ headers: {} });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.sendBody).toMatch(/Missing stripe-signature/);
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });

  it('returns 400 if signature verification throws', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => { throw new Error('No signatures found'); }),
      },
    });
    const req = makeReq({ headers: { 'stripe-signature': 'tampered' } });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.statusCode).toBe(400);
    expect(res.sendBody).toMatch(/Webhook Error/);
    expect(req.db.query).not.toHaveBeenCalled();
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });
});

describe('stripeWebhookHandler — idempotency', () => {
  it('short-circuits with duplicate:true when stripe_events_seen already has the event id', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_replay',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_x', metadata: { payment_id: 'pay_1' } } },
        })),
      },
    });

    const req = makeReq({
      headers: { 'stripe-signature': 't=1,v1=ok' },
      // Idempotency insert returns rowCount: 0 → already-seen replay.
      dbQueryImpl: async () => ({ rowCount: 0 }),
    });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(res.jsonBody).toEqual({ received: true, duplicate: true });
    // Only the idempotency insert ran — no payment side-effects.
    expect(req.db.query).toHaveBeenCalledTimes(1);
    expect(markPaymentPaid).not.toHaveBeenCalled();
  });
});

describe('stripeWebhookHandler — event routing', () => {
  it('payment_intent.succeeded → calls markPaymentPaid with the right ids', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_ok',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_ok',
              latest_charge: 'ch_ok',
              metadata: { payment_id: 'pay_42' },
            },
          },
        })),
      },
    });
    markPaymentPaid.mockResolvedValue({ ok: true });

    const req = makeReq({ headers: { 'stripe-signature': 't=1,v1=ok' } });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(markPaymentPaid).toHaveBeenCalledWith(
      req.db,
      'pay_42',
      { stripeChargeId: 'ch_ok' },
    );
    expect(res.jsonBody).toEqual({ received: true, ok: true });
  });

  it('payment_intent.succeeded with missing metadata.payment_id is reported, not crashed', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_nopay',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_nopay', metadata: {} } },
        })),
      },
    });

    const req = makeReq({ headers: { 'stripe-signature': 't=1,v1=ok' } });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, no_payment_id: true });
  });

  it('payment_intent.payment_failed → updates payments table, does NOT call markPaymentPaid', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_fail',
          type: 'payment_intent.payment_failed',
          data: { object: { id: 'pi_fail', metadata: { payment_id: 'pay_fail' } } },
        })),
      },
    });

    const req = makeReq({ headers: { 'stripe-signature': 't=1,v1=ok' } });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    // First DB call is the idempotency insert; second is the failed-update.
    expect(req.db.query).toHaveBeenCalledTimes(2);
    const failedUpdateCall = req.db.query.mock.calls[1];
    expect(failedUpdateCall[0]).toMatch(/UPDATE payments/i);
    expect(failedUpdateCall[0]).toMatch(/'failed'/);
    expect(failedUpdateCall[1]).toEqual(['pay_fail']);
    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true });
  });

  it('unknown event type is acknowledged with ignored:<type>, no DB writes beyond idempotency', async () => {
    stripeWebhookSecret.mockReturnValue('whsec_test');
    getStripe.mockReturnValue({
      webhooks: {
        constructEvent: vi.fn(() => ({
          id: 'evt_other',
          type: 'customer.created',
          data: { object: {} },
        })),
      },
    });

    const req = makeReq({ headers: { 'stripe-signature': 't=1,v1=ok' } });
    const res = makeRes();

    await stripeWebhookHandler(req, res);

    expect(req.db.query).toHaveBeenCalledTimes(1); // only idempotency insert
    expect(markPaymentPaid).not.toHaveBeenCalled();
    expect(res.jsonBody).toEqual({ received: true, ignored: 'customer.created' });
  });
});
