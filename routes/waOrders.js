// routes/waOrders.js
//
// Operator API for the WhatsApp order pipeline (Quoting → Paid →
// Purchased → In Kenya → Delivered). Every mutation that talks money or
// status funnels through the shared helpers — quote math is computed
// server-side from the live USD→KES rate + settings markup, payments ride
// the same payments-table machinery as the legacy flow (Lipana STK or
// manual admin approval), and status changes go through
// utils/waOrderFlow.transition() so customer alerts can't be skipped.

import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getUsdToKesRate, FxRateUnavailableError } from '../utils/fx.js';
import { getWaSettings } from '../utils/waSettings.js';
import { transition, isValidEdge } from '../utils/waOrderFlow.js';
import { sendToContact } from '../utils/waSend.js';
import { extractTrackingCode, extractCustomerCode } from '../utils/waCodes.js';
import { createSignedDownloadUrl } from '../utils/supabaseAdmin.js';
import { receiptShortUrl } from '../utils/receiptLink.js';
import { markPaymentPaid } from '../utils/markPaymentPaid.js';
import {
  attachMpesaReference, ensureManualPayment, extractMpesaReference,
  findOpenOrderPayment, mpesaTill,
} from '../utils/waPayments.js';
import {
  initiateStkPush as lipanaInitiateStkPush,
  normalizeKenyanPhone,
  LipanaError,
} from '../utils/lipanaClient.js';

const router = express.Router();
const STAFF = requireRole('operator'); // admins pass via requireRole's bypass

const MPESA_TILL = mpesaTill();

/**
 * STK Push is only offered when an M-Pesa API provider is actually wired
 * up. Lipana withdrew service (regulatory), so production runs
 * MPESA_PROVIDER=manual: the customer pays the till and an admin approves
 * the payment by hand. Surfaced to the dashboard so the STK button hides.
 */
function stkAvailable() {
  return String(process.env.MPESA_PROVIDER || 'manual').toLowerCase().trim() === 'lipana';
}

const ORDER_SELECT = `
  SELECT o.*, c.phone, c.full_name, c.customer_code, c.delivery_address,
         c.mpesa_number
    FROM wa_orders o
    JOIN wa_contacts c ON c.id = o.contact_id`;

/**
 * GET /api/wa/orders?status=&q=&limit=&offset=
 * Pipeline board + global search. `q` matches TRK-/TC- codes (any
 * formatting), names, and phone digits.
 */
router.get('/', authMiddleware, STAFF, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 500);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const status = String(req.query.status || '').trim();
    const q = String(req.query.q || '').trim();

    const where = [];
    const params = [];
    if (status) {
      params.push(status.split(',').map((s) => s.trim()).filter(Boolean));
      where.push(`o.status = ANY($${params.length}::text[])`);
    }
    if (q) {
      const trk = extractTrackingCode(q);
      const tc = extractCustomerCode(q);
      if (trk) {
        params.push(trk);
        where.push(`o.tracking_code = $${params.length}`);
      } else if (tc) {
        params.push(tc);
        where.push(`c.customer_code = $${params.length}`);
      } else {
        params.push(`%${q}%`);
        where.push(`(c.full_name ILIKE $${params.length} OR c.phone LIKE $${params.length} OR c.customer_code ILIKE $${params.length} OR o.tracking_code ILIKE $${params.length})`);
      }
    }
    params.push(limit, offset);
    const { rows } = await req.db.query(
      `${ORDER_SELECT}
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY o.updated_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, orders: rows, limit, offset });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/orders');
    res.status(500).json({ success: false, message: 'Failed to load orders' });
  }
});

/**
 * GET /api/wa/orders/scan/:code — scanner/search resolver. Accepts a
 * TRK code in any formatting; returns the order for the detail screen.
 */
router.get('/scan/:code', authMiddleware, STAFF, async (req, res) => {
  try {
    const code = extractTrackingCode(req.params.code) || req.params.code.trim().toUpperCase();
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.tracking_code = $1`, [code]);
    if (!rows[0]) return res.status(404).json({ success: false, message: `No order with code ${code}` });
    res.json({ success: true, order: rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/orders/scan/:code');
    res.status(500).json({ success: false, message: 'Scan lookup failed' });
  }
});

/** POST /api/wa/orders — create a quote-stage order from a conversation. */
router.post('/', authMiddleware, STAFF, async (req, res) => {
  try {
    const { contact_id, product_links, product_note } = req.body || {};
    if (!contact_id || typeof contact_id !== 'string') {
      return res.status(400).json({ success: false, message: 'contact_id is required' });
    }
    const links = Array.isArray(product_links)
      ? product_links.filter((l) => typeof l === 'string' && l.length < 2048).slice(0, 20)
      : [];
    const { rows: contactRows } = await req.db.query(
      `SELECT id FROM wa_contacts WHERE id = $1`, [contact_id]
    );
    if (!contactRows[0]) return res.status(404).json({ success: false, message: 'Contact not found' });

    const id = uuidv4();
    const { rows } = await req.db.query(
      `INSERT INTO wa_orders (id, contact_id, product_links, product_note)
       VALUES ($1, $2, $3::jsonb, $4) RETURNING *`,
      [id, contact_id, JSON.stringify(links), product_note || null]
    );
    res.status(201).json({ success: true, order: rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders');
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

/** GET /api/wa/orders/:id — order + contact + audit trail + payments. */
router.get('/:id', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const [{ rows: events }, { rows: payments }] = await Promise.all([
      req.db.query(
        `SELECT * FROM wa_order_events WHERE order_id = $1 ORDER BY created_at DESC LIMIT 50`,
        [order.id]
      ),
      req.db.query(
        `SELECT id, status, method, amount_due_kes, mpesa_provider, mpesa_reference,
                created_at, paid_at
           FROM payments WHERE target_kind = 'wa_order' AND target_id = $1
          ORDER BY created_at DESC`,
        [order.id]
      ),
    ]);
    res.json({ success: true, order, events, payments });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/orders/:id');
    res.status(500).json({ success: false, message: 'Failed to load order' });
  }
});

/**
 * POST /api/wa/orders/:id/quote  { usd_price }
 * Computes quote_kes = usd × live USD_KES rate × (1 + markup%/100),
 * snapshots the inputs onto the row, and sends the quote to the customer.
 */
router.post('/:id/quote', authMiddleware, STAFF, idempotency, async (req, res) => {
  try {
    const usd = Number(req.body?.usd_price);
    if (!Number.isFinite(usd) || usd <= 0 || usd > 1_000_000) {
      return res.status(400).json({ success: false, message: 'usd_price must be a positive number' });
    }
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!['quoting', 'quoted'].includes(order.status)) {
      return res.status(409).json({ success: false, message: `Cannot quote an order in status '${order.status}'` });
    }

    const [{ rate }, settings] = await Promise.all([
      getUsdToKesRate(req.db),
      getWaSettings(req.db),
    ]);
    const markup = settings.markup_pct;
    const quoteKes = Math.round(usd * rate * (1 + markup / 100));

    const { rows: updated } = await req.db.query(
      `UPDATE wa_orders
          SET usd_price = $2, fx_rate = $3, markup_pct = $4, quote_kes = $5,
              status = 'quoted', quoted_at = NOW(), updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [order.id, usd, rate, markup, quoteKes]
    );
    await req.db.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, actor_user_id, note)
       VALUES ($1, $2, $3, 'quoted', $4, $5)`,
      [uuidv4(), order.id, order.status, req.user.id, `Quoted $${usd} → KSh ${quoteKes}`]
    );

    await sendToContact(req.db, { id: order.contact_id, phone: order.phone }, {
      templateKey: 'quote',
      // Must cover every variable of the tc_quote template
      // (sentdm-templates.json) — WhatsApp rejects partial fills.
      templateParams: {
        usd_price: usd.toFixed(2),
        fx_rate: Number(rate).toFixed(2),
        markup_pct: String(markup),
        total_kes: quoteKes.toLocaleString('en-KE'),
      },
      text:
        `*Your quote is ready*\n` +
        `Item price: $${usd.toFixed(2)}\n` +
        `Exchange rate: 1 USD = ${Number(rate).toFixed(2)} KES\n` +
        `Service margin: ${markup}%\n` +
        `*Total: KSh ${quoteKes.toLocaleString('en-KE')}*\n\n` +
        `Reply *YES* to confirm and we'll send the M-Pesa payment details.`,
      sentBy: req.user.id,
    });

    res.json({ success: true, order: updated[0] });
  } catch (err) {
    if (err instanceof FxRateUnavailableError) {
      return res.status(err.status).json({ success: false, error: err.code, message: err.message });
    }
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/quote');
    res.status(500).json({ success: false, message: 'Failed to quote order' });
  }
});

/** POST /api/wa/orders/:id/confirm — operator confirms on the customer's behalf. */
router.post('/:id/confirm', authMiddleware, STAFF, async (req, res) => {
  try {
    const result = await transition(req.db, req.params.id, 'confirmed', {
      actorUserId: req.user.id,
      note: req.body?.note || 'Confirmed by operator',
      silent: true, // the payment prompt follows via request-payment
    });
    if (!result.ok) return res.status(409).json({ success: false, message: result.reason });
    res.json({ success: true, status: result.status });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/confirm');
    res.status(500).json({ success: false, message: 'Failed to confirm order' });
  }
});

/**
 * POST /api/wa/orders/:id/request-payment
 *   { method: 'stk' | 'manual', purpose?: 'order' | 'delivery_fee', phone? }
 *
 * 'stk'    → fires a Lipana STK push to the contact's M-Pesa number (or
 *            the phone override) and creates a pending payments row that
 *            the Lipana webhook settles.
 * 'manual' → creates an awaiting_review payments row and sends the
 *            customer till-payment instructions; the admin approves it in
 *            the payments queue ("Approve Payment" button).
 */
router.post('/:id/request-payment', authMiddleware, STAFF, idempotency, async (req, res) => {
  // Default to manual — STK only when a provider is genuinely configured.
  const method = (req.body?.method === 'stk' && stkAvailable()) ? 'stk' : 'manual';
  if (req.body?.method === 'stk' && !stkAvailable()) {
    return res.status(409).json({
      success: false,
      error: 'stk_unavailable',
      message: 'M-Pesa STK Push is not available — send till instructions and approve the payment manually.',
    });
  }
  const purpose = req.body?.purpose === 'delivery_fee' ? 'delivery_fee' : 'order';
  try {
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    let amountKes;
    if (purpose === 'order') {
      if (!['confirmed', 'quoted'].includes(order.status)) {
        return res.status(409).json({ success: false, message: `Cannot request order payment in status '${order.status}'` });
      }
      amountKes = Number(order.quote_kes);
    } else {
      if (!['in_kenya', 'delivery_fee_pending'].includes(order.status)) {
        return res.status(409).json({ success: false, message: `Cannot request the delivery fee in status '${order.status}'` });
      }
      if (order.delivery_fee_waived) {
        return res.status(409).json({ success: false, message: 'Delivery fee is waived for this order' });
      }
      amountKes = Number(order.delivery_fee_kes);
    }
    if (!Number.isFinite(amountKes) || amountKes <= 0) {
      return res.status(400).json({ success: false, message: 'Order has no payable amount' });
    }

    const phone = normalizeKenyanPhone(req.body?.phone || order.mpesa_number || order.phone);
    if (method === 'stk' && !phone) {
      return res.status(400).json({ success: false, message: 'No valid M-Pesa number on file — pass phone or use manual' });
    }

    // One live payment per order. A pending STK is a genuine conflict —
    // two prompts on one phone is a mess. A manual awaiting_review row is
    // not: the customer may already have one from confirming the quote on
    // WhatsApp, and re-sending them the till details is exactly what the
    // operator meant to do, so we reuse it.
    const existing = await findOpenOrderPayment(req.db, order.id);
    if (existing && (method === 'stk' || existing.status === 'pending')) {
      return res.status(409).json({
        success: false,
        message: `A ${existing.status} payment (${existing.id}) already exists for this order — approve, reject, or wait for it first.`,
        payment: existing,
      });
    }

    let paymentId;
    if (method === 'stk') {
      paymentId = `PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await req.db.query(
        `INSERT INTO payments
           (id, user_id, wa_contact_id, target_kind, target_id,
            amount_gross_kes, amount_credit_kes, amount_due_kes,
            currency, method, status, mpesa_provider, mpesa_phone_used)
         VALUES ($1, NULL, $2, 'wa_order', $3, $4, 0, $4, 'KES', 'mpesa', 'pending', 'lipana', $5)`,
        [paymentId, order.contact_id, order.id, amountKes, phone]
      );
    } else {
      const { payment } = await ensureManualPayment(req.db, {
        orderId: order.id,
        contactId: order.contact_id,
        amountKes,
        phone,
      });
      paymentId = payment.id;
    }

    const contact = { id: order.contact_id, phone: order.phone };
    if (method === 'stk') {
      let stk;
      try {
        stk = await lipanaInitiateStkPush({ phone, amountKes, idempotencyKey: paymentId });
      } catch (e) {
        // Roll the row back so the operator can retry cleanly.
        await req.db.query(`DELETE FROM payments WHERE id = $1 AND status = 'pending'`, [paymentId]);
        if (e instanceof LipanaError) {
          return res.status(e.status >= 400 && e.status < 600 ? e.status : 502)
            .json({ success: false, error: e.code, message: e.message });
        }
        throw e;
      }
      await req.db.query(
        `UPDATE payments
            SET lipana_transaction_id = $2, lipana_checkout_request_id = $3, updated_at = NOW()
          WHERE id = $1`,
        [paymentId, stk.transactionId, stk.checkoutRequestID]
      );
      await sendToContact(req.db, contact, {
        text:
          `We've sent an M-Pesa prompt for KSh ${amountKes.toLocaleString('en-KE')} to ` +
          `${phone.replace(/^254/, '0')} — just enter your PIN to complete the payment.`,
        sentBy: req.user.id,
      });
    } else {
      await sendToContact(req.db, contact, {
        text:
          `To pay KSh ${amountKes.toLocaleString('en-KE')}:\n` +
          `1. Lipa na M-Pesa, Buy Goods (Till)\n` +
          `2. Till number: *${MPESA_TILL}*\n` +
          `3. Amount: KSh ${amountKes.toLocaleString('en-KE')}\n\n` +
          `Reply here once you've paid and we'll confirm it right away.`,
        sentBy: req.user.id,
      });
    }

    res.status(201).json({ success: true, payment_id: paymentId, method, purpose, amount_kes: amountKes });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/request-payment');
    res.status(500).json({ success: false, message: 'Failed to request payment' });
  }
});

/**
 * POST /api/wa/orders/:id/mark-paid  { mpesa_reference?, note? }
 *
 * The manual-M-Pesa approval, on the order screen where the operator
 * already is. STK is gone, so "approving a payment" is really "I can see
 * this money on the till statement" — and the payments row it acts on may
 * not exist yet (a customer who confirms their quote on WhatsApp and pays
 * straight away never goes through request-payment). So: get-or-create the
 * awaiting_review row for whatever this order currently owes, stamp the
 * M-Pesa reference on it, then settle it through the same
 * markPaymentPaid state machine the admin queue uses — which mints the
 * tracking code, sends it, and pushes the PDF receipt.
 *
 * Admin-gated, matching routes/adminPayments.js: only admins settle money.
 */
router.post('/:id/mark-paid', authMiddleware, requireRole('admin'), idempotency, async (req, res) => {
  try {
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // Which money is outstanding is decided by the order's status — the
    // same rule markPaymentPaid uses when it flips the target row.
    let amountKes;
    if (['quoting', 'quoted', 'confirmed'].includes(order.status)) {
      amountKes = Number(order.quote_kes);
      if (!Number.isFinite(amountKes) || amountKes <= 0) {
        return res.status(409).json({ success: false, message: 'Quote the order before recording a payment' });
      }
    } else if (['in_kenya', 'delivery_fee_pending'].includes(order.status)) {
      if (order.delivery_fee_waived || order.delivery_fee_paid_at) {
        return res.status(409).json({ success: false, message: 'Nothing outstanding on this order' });
      }
      amountKes = Number(order.delivery_fee_kes);
      if (!Number.isFinite(amountKes) || amountKes <= 0) {
        return res.status(409).json({ success: false, message: 'No delivery fee set on this order' });
      }
    } else {
      return res.status(409).json({
        success: false,
        message: `Nothing to pay for on an order in status '${order.status}'`,
      });
    }

    const reference = extractMpesaReference(req.body?.mpesa_reference || '')
      || (typeof req.body?.mpesa_reference === 'string' && req.body.mpesa_reference.trim()
        ? req.body.mpesa_reference.trim().toUpperCase().slice(0, 32) : null);

    const { payment } = await ensureManualPayment(req.db, {
      orderId: order.id,
      contactId: order.contact_id,
      amountKes,
      phone: normalizeKenyanPhone(order.mpesa_number || order.phone),
    });
    if (payment.status === 'pending') {
      return res.status(409).json({
        success: false,
        message: 'An M-Pesa STK push is still pending on this order — wait for it to settle or fail.',
      });
    }
    if (reference) await attachMpesaReference(req.db, payment.id, reference);

    const result = await markPaymentPaid(req.db, payment.id, { adminUserId: req.user.id });
    if (!result.ok) {
      return res.status(409).json({ success: false, message: result.reason || 'Failed to record payment' });
    }
    await req.db.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, actor_user_id, note)
       VALUES ($1, $2, $3, $3, $4, $5)`,
      [uuidv4(), order.id, order.status, req.user.id,
       `Manual M-Pesa payment recorded${reference ? ` (ref ${reference})` : ''}${req.body?.note ? ` — ${String(req.body.note).slice(0, 200)}` : ''}`]
    );

    res.json({ success: true, payment_id: payment.id, already_paid: Boolean(result.alreadyPaid) });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/mark-paid');
    res.status(500).json({ success: false, message: 'Failed to record payment' });
  }
});

/**
 * POST /api/wa/orders/:id/advance  { to_status, note? }
 * Validated single-step pipeline moves; each fires its WhatsApp alert.
 * Payment-side statuses ('paid') can't be forced here — money moves via
 * the payments machinery (webhook / admin approve).
 */
router.post('/:id/advance', authMiddleware, STAFF, async (req, res) => {
  try {
    const to = String(req.body?.to_status || '').trim();
    if (!['quoted', 'confirmed', 'purchased', 'in_kenya', 'dispatched', 'delivered', 'cancelled'].includes(to)) {
      return res.status(400).json({ success: false, message: `to_status '${to}' is not operator-advanceable` });
    }
    if (to === 'dispatched') {
      // Guard: don't dispatch with an unsettled, unwaived fee.
      const { rows } = await req.db.query(
        `SELECT status, delivery_fee_waived, delivery_fee_paid_at, delivery_fee_kes
           FROM wa_orders WHERE id = $1`, [req.params.id]
      );
      const o = rows[0];
      if (o && o.status === 'delivery_fee_pending'
          && !o.delivery_fee_waived && !o.delivery_fee_paid_at && Number(o.delivery_fee_kes) > 0) {
        return res.status(409).json({
          success: false,
          message: 'Delivery fee is still unpaid — collect it or waive it before dispatching.',
        });
      }
    }
    const result = await transition(req.db, req.params.id, to, {
      actorUserId: req.user.id,
      note: req.body?.note || null,
    });
    if (!result.ok) return res.status(409).json({ success: false, message: result.reason });
    res.json({ success: true, status: result.status });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/advance');
    res.status(500).json({ success: false, message: 'Failed to advance order' });
  }
});

/** POST /api/wa/orders/:id/waive-fee — manual per-order fee waiver. */
router.post('/:id/waive-fee', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `UPDATE wa_orders
          SET delivery_fee_waived = true, updated_at = NOW()
        WHERE id = $1 AND status IN ('in_kenya', 'delivery_fee_pending')
        RETURNING id, status, tracking_code, contact_id`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) return res.status(409).json({ success: false, message: 'Order is not awaiting a delivery fee' });
    await req.db.query(
      `INSERT INTO wa_order_events (id, order_id, from_status, to_status, actor_user_id, note)
       VALUES ($1, $2, $3, $3, $4, 'Delivery fee waived')`,
      [uuidv4(), order.id, order.status, req.user.id]
    );
    const { rows: c } = await req.db.query(`SELECT id, phone FROM wa_contacts WHERE id = $1`, [order.contact_id]);
    if (c[0]) {
      await sendToContact(req.db, c[0], {
        text: `Good news — your delivery fee for ${order.tracking_code} has been waived. We'll dispatch your parcel shortly.`,
        sentBy: req.user.id,
      });
    }
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/waive-fee');
    res.status(500).json({ success: false, message: 'Failed to waive fee' });
  }
});

/** GET /api/wa/orders/:id/receipt — 7-day signed download URL. */
router.get('/:id/receipt', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT receipt_path FROM wa_orders WHERE id = $1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    if (!rows[0].receipt_path) return res.status(404).json({ success: false, message: 'No receipt generated yet' });
    const signed = await createSignedDownloadUrl('receipts', rows[0].receipt_path, 7 * 24 * 3600);
    if (!signed?.signedUrl) return res.status(502).json({ success: false, message: 'Failed to sign receipt URL' });
    res.json({ success: true, url: signed.signedUrl });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/orders/:id/receipt');
    res.status(500).json({ success: false, message: 'Failed to load receipt' });
  }
});

/**
 * POST /api/wa/orders/:id/receipt/resend — regenerate (if needed) and
 * re-push the receipt to the customer. Backstop for post-paid hook
 * failures.
 */
router.post('/:id/receipt/resend', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rows } = await req.db.query(`${ORDER_SELECT} WHERE o.id = $1`, [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const { rows: payRows } = await req.db.query(
      `SELECT * FROM payments
        WHERE target_kind = 'wa_order' AND target_id = $1 AND status = 'paid'
        ORDER BY paid_at DESC LIMIT 1`,
      [order.id]
    );
    if (!payRows[0]) return res.status(409).json({ success: false, message: 'No settled payment on this order yet' });

    const contact = {
      id: order.contact_id, phone: order.phone,
      full_name: order.full_name, customer_code: order.customer_code,
    };
    const { generateAndStoreReceipt } = await import('../utils/receiptPdf.js');
    const path = await generateAndStoreReceipt({ order, contact, payment: payRows[0] });
    await req.db.query(
      `UPDATE wa_orders SET receipt_path = $2, updated_at = NOW() WHERE id = $1`,
      [order.id, path]
    );
    // Short /r/ link — the signed Supabase URL is ~600 chars of JWT and
    // looks like spam on WhatsApp. The redirect re-signs on each click.
    const url = receiptShortUrl(order);
    await sendToContact(req.db, contact, {
      templateKey: 'receipt',
      templateParams: { tracking_code: order.tracking_code || '', receipt_url: url },
      text: `Here's your receipt for ${order.tracking_code}: ${url}`,
      sentBy: req.user.id,
    });
    res.json({ success: true, path, url });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/orders/:id/receipt/resend');
    res.status(500).json({ success: false, message: 'Failed to resend receipt' });
  }
});

export default router;
