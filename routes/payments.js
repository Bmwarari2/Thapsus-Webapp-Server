// routes/payments.js
// Customer-facing payments router. Replaces the legacy wallet-debit flow
// from buyForMe / consolidations / orders with a per-payment row keyed by
// (target_kind, target_id). Two methods supported:
//
//   stripe → server creates a Stripe PaymentIntent in GBP (UK account),
//            returns the client_secret for PaymentSheet. Stripe webhook
//            (POST /webhook) flips status when payment_intent.succeeded.
//
//   mpesa  → server returns Till instructions; customer pastes the M-Pesa
//            confirmation SMS into POST /:id/mpesa-confirmation. Status
//            flips to 'awaiting_review' until an admin approves.
//
// Credit (referrals etc.) is auto-applied at create time: amount_due_kes =
// amount_gross_kes - min(credit_balance, amount_gross_kes). Locked into
// the payments row so a later credit-balance change can't double-spend.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getStripe, stripePublishableKey, stripeWebhookSecret } from '../utils/stripeClient.js';
import { parseMpesaMessage } from '../utils/mpesaParser.js';
import { markPaymentPaid } from '../utils/markPaymentPaid.js';

const router = express.Router();

const MPESA_TILL = process.env.MPESA_TILL_NUMBER || '5530500';

/** GET /api/config/stripe — publishable key + Apple Pay flag for clients. */
router.get('/config/stripe', (_req, res) => {
  const pk = stripePublishableKey();
  if (!pk) return res.status(503).json({ success: false, message: 'Stripe not configured' });
  res.json({ success: true, publishable_key: pk, apple_pay: false });
});

/** GET /api/me/credit — running KES credit balance for the auth'd user. */
router.get('/me/credit', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT balance_kes, updated_at
         FROM user_credits WHERE user_id = $1`,
      [req.user.id]
    );
    const balance = rows[0]?.balance_kes ?? 0;
    res.json({ success: true, balance_kes: Number(balance), updated_at: rows[0]?.updated_at ?? null });
  } catch (err) {
    logRouteError(req, res, err, 'GET /me/credit');
    res.status(500).json({ success: false, message: 'Failed to load credit balance' });
  }
});

/**
 * POST /api/payments
 * Body: { target_kind: 'order'|'consolidation'|'buy_for_me',
 *         target_id: string,
 *         method: 'stripe'|'mpesa',
 *         apply_credit?: boolean (default true) }
 *
 * Validates ownership + status of the target, computes amount_due after
 * credit, and returns the next-step payload:
 *   stripe → { payment_id, client_secret, amount_pence_gbp, fx_rate_kes_gbp }
 *   mpesa  → { payment_id, paybill, account, amount_due_kes }
 */
router.post('/', authMiddleware, async (req, res) => {
  const { target_kind, target_id, method, apply_credit = true } = req.body || {};
  if (!['order','consolidation','buy_for_me'].includes(target_kind)) {
    return res.status(400).json({ success: false, message: 'Invalid target_kind' });
  }
  if (!target_id || typeof target_id !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing target_id' });
  }
  if (!['stripe','mpesa'].includes(method)) {
    return res.status(400).json({ success: false, message: 'method must be stripe or mpesa' });
  }

  const client = await req.db.connect();
  try {
    await client.query('BEGIN');

    // Resolve gross amount + ownership for each target_kind.
    const target = await loadTarget(client, target_kind, target_id);
    if (!target.ok) {
      await client.query('ROLLBACK');
      return res.status(target.status).json({ success: false, message: target.message });
    }
    if (target.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!Number.isFinite(target.amount_kes) || target.amount_kes <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Target has no payable amount' });
    }

    // Idempotency: if there's already a pending/awaiting_review payment for this
    // target by the same user, return it instead of stacking duplicates.
    const { rows: existingRows } = await client.query(
      `SELECT * FROM payments
        WHERE target_kind = $1 AND target_id = $2 AND user_id = $3
          AND status IN ('pending','awaiting_review')
        ORDER BY created_at DESC LIMIT 1`,
      [target_kind, target_id, req.user.id]
    );
    if (existingRows[0] && existingRows[0].method === method) {
      await client.query('ROLLBACK');
      return res.json({ success: true, payment: serializePayment(existingRows[0]),
                        ...nextStep(existingRows[0]) });
    }

    // Apply credit (read FOR UPDATE so a concurrent payment can't double-spend).
    let creditApplied = 0;
    if (apply_credit) {
      const { rows: cr } = await client.query(
        `SELECT balance_kes FROM user_credits WHERE user_id = $1 FOR UPDATE`,
        [req.user.id]
      );
      const credit = Number(cr[0]?.balance_kes ?? 0);
      creditApplied = Math.min(credit, target.amount_kes);
    }
    const amountDueKes = target.amount_kes - creditApplied;

    // Build the payment row.
    const paymentId = `PAY-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    let stripePi = null;
    let stripePence = null;
    let fxRate = null;

    if (method === 'stripe') {
      // FX KES → GBP. Lock the rate into the payment row so the customer
      // can't be re-quoted mid-flow.
      const { rows: rr } = await client.query(
        `SELECT rate FROM exchange_rates WHERE currency_pair = 'GBP_KES' LIMIT 1`
      );
      const gbpToKes = Number(rr[0]?.rate || 165);
      fxRate = gbpToKes;
      // Stripe charges in pence GBP. Round up so we never under-charge.
      const gbp = amountDueKes / gbpToKes;
      stripePence = Math.max(50, Math.ceil(gbp * 100)); // £0.50 minimum (Stripe floor)

      // Create the PaymentIntent BEFORE inserting so a Stripe failure rolls
      // back cleanly. Idempotency-key on paymentId means safe to retry.
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.create({
        amount: stripePence,
        currency: 'gbp',
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          payment_id: paymentId,
          user_id: req.user.id,
          target_kind,
          target_id,
        },
      }, { idempotencyKey: paymentId });
      stripePi = intent.id;
    }

    const { rows: insertedRows } = await client.query(
      `INSERT INTO payments
        (id, user_id, target_kind, target_id,
         amount_gross_kes, amount_credit_kes, amount_due_kes,
         currency, method, status,
         stripe_payment_intent_id, stripe_amount_pence_gbp, stripe_fx_rate_kes_gbp)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'KES',$8,'pending',$9,$10,$11)
       RETURNING *`,
      [paymentId, req.user.id, target_kind, target_id,
       target.amount_kes, creditApplied, amountDueKes,
       method, stripePi, stripePence, fxRate]
    );
    const payment = insertedRows[0];

    // For Stripe with amount_due == 0 (credit fully covers it), short-circuit
    // to paid immediately — no need to invoke Stripe at all.
    if (amountDueKes === 0) {
      await client.query('COMMIT');
      const result = await markPaymentPaid(req.db, paymentId);
      const { rows: refreshed } = await req.db.query(`SELECT * FROM payments WHERE id = $1`, [paymentId]);
      return res.json({
        success: true,
        payment: serializePayment(refreshed[0]),
        fully_covered_by_credit: true,
        target_paid: result.ok,
      });
    }

    await client.query('COMMIT');
    return res.json({
      success: true,
      payment: serializePayment(payment),
      ...nextStep(payment),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    logRouteError(req, res, err, 'POST /api/payments');
    res.status(500).json({ success: false, message: err.message || 'Failed to create payment' });
  } finally {
    client.release();
  }
});

/**
 * POST /api/payments/:id/mpesa-confirmation
 * Body: { message_raw: string }
 * Customer pastes the M-Pesa confirmation SMS. We parse it client-side-ish
 * (regex), store raw + parsed fields, flip status to 'awaiting_review'.
 */
router.post('/:id/mpesa-confirmation', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { message_raw } = req.body || {};
  if (typeof message_raw !== 'string' || message_raw.length < 20) {
    return res.status(400).json({ success: false, message: 'Paste the full M-Pesa SMS (must include the 10-char reference and Ksh amount).' });
  }
  try {
    const { rows } = await req.db.query(`SELECT * FROM payments WHERE id = $1`, [id]);
    const payment = rows[0];
    if (!payment) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (payment.user_id !== req.user.id) return res.status(403).json({ success: false, message: 'Access denied' });
    if (payment.method !== 'mpesa') return res.status(400).json({ success: false, message: 'Payment method is not M-Pesa' });
    if (!['pending','awaiting_review'].includes(payment.status)) {
      return res.status(409).json({ success: false, message: `Cannot submit confirmation for status '${payment.status}'` });
    }

    const parsed = parseMpesaMessage(message_raw);
    if (!parsed.ok) {
      return res.status(400).json({ success: false, message: parsed.reason });
    }

    await req.db.query(
      `UPDATE payments
          SET status = 'awaiting_review',
              mpesa_message_raw = $2,
              mpesa_reference = $3,
              mpesa_phone = $4,
              mpesa_message_amount_kes = $5,
              updated_at = NOW()
        WHERE id = $1`,
      [id, message_raw, parsed.reference, parsed.phone, parsed.amountKes]
    );
    res.json({ success: true, message: 'Submitted — an admin will review your payment shortly.' });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/payments/:id/mpesa-confirmation');
    res.status(500).json({ success: false, message: 'Failed to submit confirmation' });
  }
});

/** GET /api/payments — customer's recent payments (any status). */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM payments WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, payments: rows.map(serializePayment) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/payments');
    res.status(500).json({ success: false, message: 'Failed to load payments' });
  }
});

/** GET /api/payments/:id — single payment detail (owner or staff). */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(`SELECT * FROM payments WHERE id = $1`, [req.params.id]);
    const p = rows[0];
    if (!p) return res.status(404).json({ success: false, message: 'Payment not found' });
    if (p.user_id !== req.user.id &&
        !['operator','clearing_agent','admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, payment: serializePayment(p) });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/payments/:id');
    res.status(500).json({ success: false, message: 'Failed to load payment' });
  }
});

// ─── Helpers ───────────────────────────────────────────────────────────────

async function loadTarget(client, kind, id) {
  switch (kind) {
    case 'order': {
      const { rows } = await client.query(
        `SELECT id, user_id, COALESCE(actual_cost, estimated_cost, 0)::bigint AS amount_kes, status
           FROM orders WHERE id = $1 FOR UPDATE`, [id]
      );
      if (!rows[0]) return { ok: false, status: 404, message: 'Order not found' };
      return { ok: true, user_id: rows[0].user_id, amount_kes: Number(rows[0].amount_kes), target_status: rows[0].status };
    }
    case 'consolidation': {
      const { rows } = await client.query(
        `SELECT id, user_id, COALESCE(invoice_amount, 0)::bigint AS amount_kes, status
           FROM customer_consolidations WHERE id = $1 FOR UPDATE`, [id]
      );
      if (!rows[0]) return { ok: false, status: 404, message: 'Consolidation invoice not found' };
      if (rows[0].status !== 'invoiced') {
        return { ok: false, status: 409, message: `Consolidation status is '${rows[0].status}', not 'invoiced'` };
      }
      return { ok: true, user_id: rows[0].user_id, amount_kes: Number(rows[0].amount_kes), target_status: rows[0].status };
    }
    case 'buy_for_me': {
      const { rows } = await client.query(
        `SELECT id, user_id, estimate_gbp, COALESCE(markup_pct, 10) AS markup_pct, status
           FROM buy_for_me_orders WHERE id = $1 FOR UPDATE`, [id]
      );
      if (!rows[0]) return { ok: false, status: 404, message: 'Concierge order not found' };
      if (rows[0].status !== 'quoted') {
        return { ok: false, status: 409, message: `Cannot pay an order in status '${rows[0].status}'` };
      }
      const { rows: rr } = await client.query(
        `SELECT rate FROM exchange_rates WHERE currency_pair = 'GBP_KES' LIMIT 1`
      );
      const gbpToKes = Number(rr[0]?.rate || 165);
      const totalGbp = Number(rows[0].estimate_gbp) * (1 + Number(rows[0].markup_pct) / 100);
      const amountKes = Math.ceil(totalGbp * gbpToKes);
      return { ok: true, user_id: rows[0].user_id, amount_kes: amountKes, target_status: rows[0].status };
    }
  }
  return { ok: false, status: 400, message: 'Unknown target_kind' };
}

function nextStep(payment) {
  if (payment.method === 'stripe') {
    return {
      next: {
        kind: 'stripe',
        client_secret: null, // re-fetch via Stripe API if needed; the create endpoint already returned it
        amount_pence_gbp: payment.stripe_amount_pence_gbp,
        fx_rate_kes_gbp: payment.stripe_fx_rate_kes_gbp,
      },
    };
  }
  return {
    next: {
      kind: 'mpesa',
      paybill: MPESA_TILL,
      account: payment.id,                // customer pastes payment id as the M-Pesa account ref
      amount_due_kes: Number(payment.amount_due_kes),
    },
  };
}

function serializePayment(p) {
  if (!p) return null;
  return {
    id: p.id,
    user_id: p.user_id,
    target_kind: p.target_kind,
    target_id: p.target_id,
    amount_gross_kes: Number(p.amount_gross_kes),
    amount_credit_kes: Number(p.amount_credit_kes),
    amount_due_kes: Number(p.amount_due_kes),
    currency: p.currency,
    method: p.method,
    status: p.status,
    stripe_payment_intent_id: p.stripe_payment_intent_id,
    stripe_amount_pence_gbp: p.stripe_amount_pence_gbp ? Number(p.stripe_amount_pence_gbp) : null,
    stripe_fx_rate_kes_gbp: p.stripe_fx_rate_kes_gbp ? Number(p.stripe_fx_rate_kes_gbp) : null,
    mpesa_reference: p.mpesa_reference,
    mpesa_phone: p.mpesa_phone,
    rejection_reason: p.rejection_reason,
    created_at: p.created_at,
    paid_at: p.paid_at,
  };
}

// ─── Stripe webhook ────────────────────────────────────────────────────────
// MOUNTED SEPARATELY via app.post('/api/payments/stripe/webhook',
// express.raw({type:'application/json'}), ...) in server.js — Stripe signature
// verification needs the raw bytes, which means it MUST be registered before
// express.json() runs. The handler is exported here so server.js can mount it
// at the right spot without re-importing Stripe.
export async function stripeWebhookHandler(req, res) {
  const secret = stripeWebhookSecret();
  if (!secret) {
    return res.status(503).json({ success: false, message: 'Stripe webhook not configured' });
  }
  const sig = req.headers['stripe-signature'];
  if (!sig) return res.status(400).send('Missing stripe-signature header');

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[stripe-webhook] signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Idempotency: skip if we've already processed this Stripe event id.
  try {
    const { rowCount } = await req.db.query(
      `INSERT INTO stripe_events_seen (event_id, event_type)
       VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
      [event.id, event.type]
    );
    if (rowCount === 0) {
      return res.json({ received: true, duplicate: true });
    }
  } catch (e) {
    console.warn('[stripe-webhook] idempotency check failed:', e.message);
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      const paymentId = intent.metadata?.payment_id;
      if (!paymentId) {
        console.warn('[stripe-webhook] payment_intent.succeeded with no metadata.payment_id', intent.id);
        return res.json({ received: true, no_payment_id: true });
      }
      const result = await markPaymentPaid(req.db, paymentId, {
        stripeChargeId: intent.latest_charge || null,
      });
      if (!result.ok) console.warn('[stripe-webhook] markPaid failed:', result.reason);
      return res.json({ received: true, ok: result.ok });
    }
    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const paymentId = intent.metadata?.payment_id;
      if (paymentId) {
        await req.db.query(
          `UPDATE payments SET status = 'failed', updated_at = NOW()
            WHERE id = $1 AND status IN ('pending','awaiting_review')`,
          [paymentId]
        );
      }
      return res.json({ received: true });
    }
    default:
      // ignore other event types
      return res.json({ received: true, ignored: event.type });
  }
}

export default router;
