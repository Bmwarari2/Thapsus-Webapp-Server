// routes/payments.js
// Payments router — M-Pesa only (Stripe card payments removed in the lean
// rebuild). Per-payment row keyed by (target_kind, target_id). Providers,
// picked per-environment via MPESA_PROVIDER:
//   • 'lipana' (default once configured) — server fires an STK Push via
//     Lipana (lipana.dev). Customer enters their PIN on their phone.
//     Lipana webhook → markPaymentPaid().
//   • 'manual' (legacy) — server returns Till + reference, customer pays
//     manually then pastes the confirmation SMS into
//     POST /:id/mpesa-confirmation. Status flips to 'awaiting_review'
//     until an admin approves.
//
// Credit (referrals etc.) is auto-applied at create time: amount_due_kes =
// amount_gross_kes - min(credit_balance, amount_gross_kes). Locked into
// the payments row so a later credit-balance change can't double-spend.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { parseMpesaMessage } from '../utils/mpesaParser.js';
import { markPaymentPaid } from '../utils/markPaymentPaid.js';
import { getGbpToKesRate, FxRateUnavailableError } from '../utils/fx.js';
import {
  initiateStkPush as lipanaInitiateStkPush,
  verifyWebhookSignature as lipanaVerifyWebhookSignature,
  normalizeKenyanPhone,
  LipanaError,
} from '../utils/lipanaClient.js';

const router = express.Router();

const MPESA_TILL = process.env.MPESA_TILL_NUMBER || '5530500';

/** Which M-Pesa flow this environment is wired to. */
function mpesaProvider() {
  const raw = String(process.env.MPESA_PROVIDER || 'manual').toLowerCase().trim();
  return raw === 'lipana' ? 'lipana' : 'manual';
}

/**
 * Resolve which payment methods are available in this environment.
 * M-Pesa only — card payments were removed in the lean rebuild. The
 * `stripe: {enabled: false}` stub stays in the matrix so stale clients
 * that still read it simply hide the card button.
 *
 * Kill-switch via env var (Railway):
 *   PAYMENT_METHOD_MPESA_ENABLED  'true' | 'false'  (default: 'true')
 */
function resolvePaymentMethods() {
  const mpesaEnabled = process.env.PAYMENT_METHOD_MPESA_ENABLED === 'false' ? false : true;
  return {
    stripe: { enabled: false, publishable_key: null, apple_pay: false },
    mpesa:  { enabled: mpesaEnabled, till_number: MPESA_TILL, provider: mpesaProvider() },
  };
}

/** GET /api/payments/methods — payment-method matrix for clients. */
router.get('/methods', (_req, res) => {
  res.json({ success: true, methods: resolvePaymentMethods() });
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
 * Body: { target_kind: 'consolidation'|'buy_for_me',
 *         target_id: string,
 *         method: 'mpesa',
 *         apply_credit?: boolean (default true) }
 *
 * Validates ownership + status of the target, computes amount_due after
 * credit, and returns the next-step payload:
 *   mpesa → { payment_id, paybill, account, amount_due_kes } (manual)
 *           or STK-push details (lipana)
 */
router.post('/', authMiddleware, async (req, res) => {
  const { target_kind, target_id, method, apply_credit = true, phone: rawPhone } = req.body || {};

  // For mpesa+lipana the customer's phone is required up-front so we can
  // fire the STK push. Validate now (before opening the transaction) so a
  // bad input returns a clean 400 without holding a connection.
  const provider = method === 'mpesa' ? mpesaProvider() : null;
  let normalizedPhone = null;
  if (method === 'mpesa' && provider === 'lipana') {
    normalizedPhone = normalizeKenyanPhone(rawPhone);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        error: 'invalid_phone',
        message: 'Enter a valid Kenyan M-Pesa number (e.g. 0712 345 678).',
      });
    }
  }
  // 'order' was retired 2026-05-04 (audit P1.1) — see loadTarget for the
  // rationale. The kind stays valid in the DB CHECK for backwards
  // compatibility with existing rows but new payments may only target
  // consolidation invoices or buy-for-me orders.
  if (!['consolidation','buy_for_me'].includes(target_kind)) {
    return res.status(400).json({
      success: false,
      message: 'target_kind must be consolidation or buy_for_me',
    });
  }
  if (!target_id || typeof target_id !== 'string') {
    return res.status(400).json({ success: false, message: 'Missing target_id' });
  }
  if (method !== 'mpesa') {
    return res.status(400).json({ success: false, message: 'method must be mpesa' });
  }
  // Enforce the per-environment kill-switch. Same matrix surfaces via
  // GET /api/payments/methods so the client can hide the button
  // up-front; this 409 is the belt-and-braces check for stale clients.
  const enabledMethods = resolvePaymentMethods();
  if (!enabledMethods.mpesa.enabled) {
    return res.status(409).json({ success: false, message: 'M-Pesa payments are not available right now. Please try again later.' });
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
      const existing = existingRows[0];
      return res.json({ success: true, payment: serializePayment(existing),
                        ...nextStep(existing) });
    }

    // Cancel ALL prior pending/awaiting_review rows for this target so the
    // Transactions list doesn't show them as visual duplicates.
    await client.query(
      `UPDATE payments
          SET status = 'cancelled',
              rejection_reason = COALESCE(rejection_reason, 'Superseded by new payment attempt'),
              updated_at = NOW()
        WHERE target_kind = $1 AND target_id = $2 AND user_id = $3
          AND status IN ('pending','awaiting_review')`,
      [target_kind, target_id, req.user.id]
    );

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
    const { rows: insertedRows } = await client.query(
      `INSERT INTO payments
        (id, user_id, target_kind, target_id,
         amount_gross_kes, amount_credit_kes, amount_due_kes,
         currency, method, status,
         mpesa_provider, mpesa_phone_used)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'KES',$8,'pending',$9,$10)
       RETURNING *`,
      [paymentId, req.user.id, target_kind, target_id,
       target.amount_kes, creditApplied, amountDueKes,
       method, provider, normalizedPhone]
    );
    let payment = insertedRows[0];

    // amount_due == 0 (credit fully covers it) short-circuits straight
    // to paid — no STK push, no SMS paste.
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

    // M-Pesa + Lipana: fire the STK push BEFORE commit so a Lipana
    // failure rolls back the payment row. Lipana's response carries the
    // ws_CO_… checkoutRequestID + the Lipana TXN id — both stamped onto
    // the payment row so the iOS poller can match by id and the
    // webhook can match by lipana_transaction_id.
    let lipanaInit = null;
    if (method === 'mpesa' && provider === 'lipana') {
      try {
        lipanaInit = await lipanaInitiateStkPush({
          phone: normalizedPhone,
          amountKes: amountDueKes,
          idempotencyKey: paymentId,
        });
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        if (e instanceof LipanaError) {
          return res.status(e.status >= 400 && e.status < 600 ? e.status : 502).json({
            success: false,
            error:   e.code,
            message: e.message,
          });
        }
        throw e;
      }
      const { rows: stamped } = await client.query(
        `UPDATE payments
            SET lipana_transaction_id      = $2,
                lipana_checkout_request_id = $3,
                updated_at                 = NOW()
          WHERE id = $1
          RETURNING *`,
        [paymentId, lipanaInit.transactionId, lipanaInit.checkoutRequestID]
      );
      payment = stamped[0] || payment;
    }

    await client.query('COMMIT');
    return res.json({
      success: true,
      payment: serializePayment(payment),
      ...nextStep(payment, lipanaInit),
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // Audit P1.3: surface FX outages as a clean 503 so the client
    // renders a "temporarily unavailable" banner instead of a generic 500.
    if (err instanceof FxRateUnavailableError) {
      return res.status(503).json({
        success: false,
        error: err.code,
        message: err.message,
      });
    }
    if (err instanceof LipanaError) {
      return res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({
        success: false,
        error: err.code,
        message: err.message,
      });
    }
    logRouteError(req, res, err, 'POST /api/payments');
    // Don't echo `err.message` to clients — the catch arm runs on
    // unexpected throws (transient DB failures etc.) and those
    // messages can include internal details.
    res.status(500).json({ success: false, message: 'Failed to create payment' });
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

    // Audit P1.2: pre-check the reference against existing
    // paid/awaiting_review rows. The DB has a partial unique index
    // (`uq_payments_mpesa_ref`, migration 032) that backstops this — but
    // the index would surface as a generic 500; the explicit lookup
    // gives the customer a clear "this SMS was already used" message
    // and lets us include the reference in the response.
    const dup = await req.db.query(
      `SELECT id FROM payments
        WHERE mpesa_reference = $1
          AND status IN ('paid','awaiting_review')
          AND id <> $2
        LIMIT 1`,
      [parsed.reference, id]
    );
    if (dup.rows[0]) {
      return res.status(409).json({
        success: false,
        error: 'mpesa_reference_already_used',
        message: `This M-Pesa reference (${parsed.reference}) has already been submitted. If you genuinely paid twice, contact support.`,
      });
    }

    try {
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
    } catch (e) {
      // 23505 = unique_violation. Race against another concurrent paste
      // of the same reference (extremely unlikely but possible if the
      // customer mashes Submit twice). Translate to the same 409 shape
      // as the pre-check.
      if (e && e.code === '23505') {
        return res.status(409).json({
          success: false,
          error: 'mpesa_reference_already_used',
          message: `This M-Pesa reference (${parsed.reference}) has already been submitted.`,
        });
      }
      throw e;
    }
    res.json({ success: true, message: 'Submitted — an admin will review your payment shortly.' });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/payments/:id/mpesa-confirmation');
    res.status(500).json({ success: false, message: 'Failed to submit confirmation' });
  }
});

/**
 * GET /api/payments — customer's payments, paginated + filterable.
 *
 * Query:
 *   status   optional CSV filter, e.g. ?status=paid,awaiting_review
 *   limit    default 20, max 100
 *   offset   default 0
 *   group    'target' to collapse rows by (target_kind, target_id) — picks
 *            the row with the highest status priority (paid > awaiting_review
 *            > pending > failed > rejected > cancelled), tie-broken by most
 *            recent. Each row gains `attempts_count` = total payments rows
 *            for that target. Customer-facing surfaces use this; admin
 *            views omit it for full history.
 *
 * Each row is enriched with `target_label` (tracking number / item name /
 * consolidation prefix) via a LATERAL lookup so the client doesn't have
 * to do a second round-trip for the human-readable name.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 20, 1), 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const statusCsv = String(req.query.status || '').trim();
    const statusList = statusCsv
      ? statusCsv.split(',').map(s => s.trim()).filter(Boolean)
      : null;
    const groupMode = String(req.query.group || '').trim();

    const params = [req.user.id];
    let where = `WHERE p.user_id = $1`;
    if (statusList && statusList.length > 0) {
      params.push(statusList);
      where += ` AND p.status = ANY($${params.length}::text[])`;
    }
    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    // Status priority for the dedupe winner: paid first.
    const priorityCase = `
      CASE p.status
        WHEN 'paid'             THEN 0
        WHEN 'awaiting_review'  THEN 1
        WHEN 'pending'          THEN 2
        WHEN 'failed'           THEN 3
        WHEN 'rejected'         THEN 4
        WHEN 'cancelled'        THEN 5
        ELSE 6
      END`;

    const baseSelect = `p.*,
              COALESCE(
                CASE p.target_kind
                  WHEN 'order'         THEN (SELECT tracking_number FROM orders WHERE id = p.target_id)
                  WHEN 'consolidation' THEN (SELECT substring(id::text, 1, 8) FROM customer_consolidations WHERE id::text = p.target_id)
                  WHEN 'buy_for_me'    THEN (SELECT item_name FROM buy_for_me_orders WHERE id = p.target_id)
                END,
                p.target_id
              ) AS target_label`;

    const sql = groupMode === 'target'
      ? `WITH winners AS (
           SELECT DISTINCT ON (p.target_kind, p.target_id) ${baseSelect},
                  COUNT(*) OVER (PARTITION BY p.target_kind, p.target_id) AS attempts_count
             FROM payments p
            ${where}
            ORDER BY p.target_kind, p.target_id, ${priorityCase}, p.created_at DESC
         )
         SELECT * FROM winners
          ORDER BY paid_at DESC NULLS LAST, created_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`
      : `SELECT ${baseSelect}
           FROM payments p
          ${where}
          ORDER BY p.created_at DESC
          LIMIT $${limitIdx} OFFSET $${offsetIdx}`;

    const { rows } = await req.db.query(sql, params);
    res.json({
      success: true,
      payments: rows.map(r => ({
        ...serializePayment(r),
        target_label: r.target_label,
        ...(r.attempts_count != null ? { attempts_count: Number(r.attempts_count) } : {}),
      })),
      limit, offset, group: groupMode || null,
    });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/payments');
    res.status(500).json({ success: false, message: 'Failed to load payments' });
  }
});

/**
 * GET /api/payments/me/credit/ledger — paginated credit ledger for the
 * auth'd user. Mirrors the payments list shape (limit/offset).
 */
router.get('/me/credit/ledger', authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(Math.max(parseInt(req.query.limit, 10)  || 50, 1), 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const { rows } = await req.db.query(
      `SELECT id, delta_kes, reason, source_id, note, created_at
         FROM credit_ledger
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );
    res.json({
      success: true,
      entries: rows.map(r => ({
        id: r.id,
        delta_kes: Number(r.delta_kes),
        reason: r.reason,
        source_id: r.source_id,
        note: r.note,
        created_at: r.created_at,
      })),
      limit, offset,
    });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/payments/me/credit/ledger');
    res.status(500).json({ success: false, message: 'Failed to load credit ledger' });
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
      // RETIRED 2026-05-04 (audit P1.1).
      //
      // The previous implementation read `orders.estimated_cost` as KES, but
      // `routes/orders.js` stores that field in GBP (from
      // `calculateShippingCost(...).total`). A direct order-pay would have
      // settled a £X invoice for KSh X — a ~165× under-charge.
      //
      // Production never reached this branch (iOS / webapp only POST
      // `target_kind` ∈ {consolidation, buy_for_me}). Customer shipping
      // charges flow through `customer_consolidations` invoices instead.
      //
      // Re-enable only with an FX-aware design that mirrors the buy_for_me
      // branch: read the GBP amount, convert at the live `exchange_rates`
      // row, lock the snapshot into the payments row.
      return {
        ok: false,
        status: 503,
        message: 'Order payments are routed through consolidation invoices. Use target_kind=consolidation.',
      };
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
      // Audit P1.3: hard-fail when GBP_KES row absent. The BFM total is
      // computed in GBP from the operator's quote; any miscalculation
      // here is locked into payments.amount_gross_kes and the customer
      // pays whatever falls out, so a silent fallback is unacceptable.
      const { rate: gbpToKes } = await getGbpToKesRate(client);
      const totalGbp = Number(rows[0].estimate_gbp) * (1 + Number(rows[0].markup_pct) / 100);
      const amountKes = Math.ceil(totalGbp * gbpToKes);
      return { ok: true, user_id: rows[0].user_id, amount_kes: amountKes, target_status: rows[0].status };
    }
  }
  return { ok: false, status: 400, message: 'Unknown target_kind' };
}

/** Build the next-step payload returned to the client. */
function nextStep(payment, lipanaInit = null) {
  // M-Pesa: branch on provider. Lipana = STK push already kicked off.
  // Manual = legacy paste-the-SMS instructions.
  if (payment.mpesa_provider === 'lipana' || lipanaInit) {
    return {
      next: {
        kind: 'mpesa_stk',
        amount_due_kes:             Number(payment.amount_due_kes),
        lipana_transaction_id:      lipanaInit?.transactionId
                                      ?? payment.lipana_transaction_id ?? null,
        lipana_checkout_request_id: lipanaInit?.checkoutRequestID
                                      ?? payment.lipana_checkout_request_id ?? null,
        message: lipanaInit?.message
          ?? 'STK push sent. Check your phone and enter your M-Pesa PIN.',
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
    mpesa_reference: p.mpesa_reference,
    mpesa_phone: p.mpesa_phone,
    mpesa_provider: p.mpesa_provider || null,
    mpesa_phone_used: p.mpesa_phone_used || null,
    lipana_transaction_id: p.lipana_transaction_id || null,
    lipana_checkout_request_id: p.lipana_checkout_request_id || null,
    rejection_reason: p.rejection_reason,
    created_at: p.created_at,
    paid_at: p.paid_at,
  };
}

// ─── Lipana webhook ───────────────────────────────────────────────────────
// MOUNTED SEPARATELY in server.js with express.raw({type:'application/json'})
// — HMAC-SHA256 verification needs the unparsed bytes, so it MUST be
// registered before express.json() runs.
//
// Lipana fires `event: payment.success | payment.failed | payment.initiated`
// with a `data` block keyed by `transactionId`. We match payments by
// `lipana_transaction_id` and call markPaymentPaid() on success — same
// code path as admin-approve, so post-paid hooks (target flip,
// credit-ledger debit, receipt email) are identical regardless of method.
//
// Idempotency: lipana_events_seen short-circuits replays. The unique
// partial index on lipana_transaction_id (migration 038) is the
// belt-and-braces guard against a missing event_id.
export async function lipanaWebhookHandler(req, res) {
  const signature = req.headers['x-lipana-signature'];
  if (!signature) return res.status(401).send('Missing X-Lipana-Signature');

  let verified = false;
  try {
    verified = lipanaVerifyWebhookSignature(req.body, signature);
  } catch (e) {
    if (e instanceof LipanaError) {
      console.error('[lipana-webhook] verify failed:', e.message);
      return res.status(e.status).json({ success: false, error: e.code, message: e.message });
    }
    throw e;
  }
  if (!verified) {
    console.warn('[lipana-webhook] signature mismatch');
    return res.status(401).send('Invalid signature');
  }

  let payload;
  try {
    const text = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');
    payload = JSON.parse(text);
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  const event = payload?.event;
  const data  = payload?.data ?? payload?.result ?? {};
  // Lipana's response shape has drifted from their docs — accept the
  // same field-name variants we tolerate in lipanaClient.js so the
  // webhook can still match a row even when only one id was stamped.
  const transactionId =
       data.transactionId
    ?? data.transaction_id
    ?? data.txnId
    ?? data.txn_id
    ?? data.id
    ?? payload?.transactionId
    ?? payload?.transaction_id
    ?? null;
  const checkoutRequestID =
       data.checkoutRequestID
    ?? data.checkoutRequestId
    ?? data.checkout_request_id
    ?? data.checkoutRequest
    ?? payload?.checkoutRequestID
    ?? payload?.checkoutRequestId
    ?? payload?.checkout_request_id
    ?? null;
  // Lipana docs don't currently advertise an event id, so we fall back
  // to whichever id is present + event type. That still de-dupes the
  // common case (two `payment.success` redeliveries for the same TXN).
  const dedupeKey = transactionId || checkoutRequestID;
  const eventId = payload?.id || payload?.event_id
    || (dedupeKey ? `${event}:${dedupeKey}` : null);

  if (!event || !eventId) {
    return res.status(400).send('Malformed payload');
  }

  // Idempotency — CHECK first, RECORD only after the event is handled.
  // The previous order (insert-then-process) consumed the event id
  // before doing the work: a settlement failure (DB blip, hook throw)
  // left the row unpaid, and Lipana's redelivery then short-circuited
  // as a duplicate forever — money received, payment stuck 'pending'.
  // Two concurrent deliveries both passing this check is harmless:
  // markPaymentPaid is FOR UPDATE + already-paid idempotent.
  try {
    const { rows: seen } = await req.db.query(
      `SELECT 1 FROM lipana_events_seen WHERE event_id = $1`,
      [eventId]
    );
    if (seen.length > 0) {
      return res.json({ received: true, duplicate: true });
    }
  } catch (e) {
    console.warn('[lipana-webhook] idempotency check failed:', e.message);
    // Don't 500 on the idempotency table — fall through and let the
    // payment lookup short-circuit if we've already paid this one.
  }
  const recordSeen = async () => {
    try {
      await req.db.query(
        `INSERT INTO lipana_events_seen (event_id, event_type)
         VALUES ($1, $2) ON CONFLICT (event_id) DO NOTHING`,
        [eventId, event]
      );
    } catch (e) {
      console.warn('[lipana-webhook] could not record event as seen:', e.message);
    }
  };

  if (!transactionId && !checkoutRequestID) {
    await recordSeen();
    return res.json({ received: true, no_transaction_id: true });
  }

  // Match on either id — older rows might have had only one stamped
  // before the lipanaClient extraction was made lenient. Matching by
  // either keeps webhooks settling correctly.
  const { rows } = await req.db.query(
    `SELECT id, status FROM payments
      WHERE ($1::text IS NOT NULL AND lipana_transaction_id      = $1)
         OR ($2::text IS NOT NULL AND lipana_checkout_request_id = $2)
      LIMIT 1`,
    [transactionId, checkoutRequestID]
  );
  const payment = rows[0];
  if (!payment) {
    // Stray webhook — STK was initiated outside our app (Lipana
    // dashboard test, manual curl, another integration). Logged at
    // info level: it's expected noise on a live webhook URL, not a
    // real failure mode for our customers.
    console.info(`[lipana-webhook] orphan ${event} for TXN ${transactionId || '∅'} / CR ${checkoutRequestID || '∅'} — no matching payment row`);
    await recordSeen();
    return res.json({ received: true, no_payment: true });
  }

  switch (event) {
    case 'payment.success':
    case 'transaction.success': {
      const result = await markPaymentPaid(req.db, payment.id);
      if (!result.ok && !result.alreadyPaid) {
        // Money moved but our settlement failed. 500 so Lipana
        // redelivers (the event is deliberately NOT recorded as seen),
        // and page staff — this used to be a console line and a
        // permanently stuck 'pending' row.
        console.warn('[lipana-webhook] markPaid failed:', result.reason);
        import('../utils/waStaffAlert.js')
          .then(({ notifyStaff }) => notifyStaff(req.db, {
            title: 'STK payment settlement failed',
            detail: `Payment ${payment.id}: money confirmed by Lipana but settlement failed (${result.reason}). Will retry on redelivery.`,
            dedupeKey: `lipana-settle-failed:${payment.id}`,
          }))
          .catch(() => {});
        return res.status(500).json({ received: false, error: 'settlement_failed' });
      }
      await recordSeen();
      return res.json({ received: true, ok: result.ok || result.alreadyPaid === true });
    }
    case 'payment.failed':
    case 'transaction.failed':
    case 'payment.cancelled':
    case 'transaction.cancelled':
    // Daraja STK Push expires after ~60 s if the customer doesn't enter
    // their PIN — Lipana surfaces that as `transaction.timeout`. Treat
    // it the same as failed/cancelled: flip non-terminal rows so the
    // iOS poller stops at the next tick instead of waiting out its
    // 90 s budget, and the Transactions list shows the correct state.
    case 'payment.timeout':
    case 'transaction.timeout': {
      // Only flip non-terminal rows — we don't want a stray "failed"
      // event re-opening a payment that already settled.
      await req.db.query(
        `UPDATE payments SET status = 'failed', updated_at = NOW()
          WHERE id = $1 AND status IN ('pending','awaiting_review')`,
        [payment.id]
      );
      await recordSeen();
      return res.json({ received: true, failed: true });
    }
    case 'payment.initiated':
    case 'transaction.initiated':
      // No-op — we already inserted as 'pending'.
      await recordSeen();
      return res.json({ received: true, ignored: event });
    default:
      await recordSeen();
      return res.json({ received: true, ignored: event });
  }
}

export default router;
