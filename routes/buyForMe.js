/**
 * routes/buyForMe.js — Buy-for-me concierge orders (Spec §4.10).
 *
 * Customer pastes a retailer URL → operator reviews + quotes →
 * customer pays → operator buys → retailer ships to Thapsus UK.
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import {
  sendBuyForMeQuoteEmail,
  sendBuyForMeRequestReceivedEmail,
  sendBuyForMeDeclinedEmail,
  sendBuyForMeAlternativeEmail,
} from '../utils/email.js';
import { notifyAdminsOfBuyForMe } from '../utils/buyForMeAdminNotify.js';
import { pushToAdmins } from './events.js';
import { notifyUser } from '../utils/realtimeNotify.js';

const router = express.Router();

/**
 * POST /api/buy-for-me — customer creates a request.
 *
 * PR 4: accepts an optional `retailer_id` from the picker. When present,
 * the server resolves the retailer's `base_url` and stores it as
 * `retailer_url` (the customer can still type a more specific item URL
 * — `retailer_url` from the body wins if both are sent). When absent,
 * `retailer_url` is required (the "Other" path).
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { retailer_id, retailer_url, item_name, size, qty, notes } = req.body;
    if (!item_name) {
      return res.status(400).json({ success: false, message: 'item_name is required' });
    }

    // Resolve final retailer_url. Item URL (retailer_url) wins; otherwise
    // fall back to the picker's base_url. At least one is required.
    let resolvedUrl = (typeof retailer_url === 'string' && retailer_url.trim().length > 0)
      ? retailer_url.trim()
      : null;
    if (!resolvedUrl && retailer_id) {
      const { rows } = await req.db.query(
        `SELECT base_url FROM retailers WHERE id = $1 AND is_active = true`,
        [retailer_id]
      );
      if (rows[0]) resolvedUrl = rows[0].base_url;
    }
    if (!resolvedUrl) {
      return res.status(400).json({
        success: false,
        message: 'Provide either retailer_id (picker) or retailer_url (item link)',
      });
    }

    const id = `BFM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    await req.db.query(
      `INSERT INTO buy_for_me_orders
         (id, user_id, retailer_url, item_name, size, qty, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_quote')`,
      [id, req.user.id, resolvedUrl, item_name, size || null,
       parseInt(qty, 10) || 1, notes || null]
    );
    // Notify admins (in-app row + email + SSE) — best-effort, must not
    // block the response. Audit D2.
    try {
      const { rows: ownerRows } = await req.db.query(
        `SELECT id, email, name FROM users WHERE id = $1`, [req.user.id]
      );
      const owner = ownerRows[0] || { id: req.user.id, email: null, name: null };
      await notifyAdminsOfBuyForMe(
        req.db, req,
        { id, item_name, retailer_url: resolvedUrl, qty: parseInt(qty, 10) || 1, notes: notes || null },
        owner
      );
      // Confirmation email to the customer (best-effort).
      if (owner.email) {
        try { await sendBuyForMeRequestReceivedEmail(owner.email, owner.name, id, item_name); }
        catch (mailErr) { console.error('BFM received email failed (non-fatal):', mailErr?.message); }
      }
    } catch (notifyErr) {
      console.error('BFM admin notify failed (non-fatal):', notifyErr?.message);
    }
    res.status(201).json({ success: true, order_id: id });
  } catch (err) {
    console.error('POST /buy-for-me error:', err);
    res.status(500).json({ success: false, message: 'Failed to create concierge order' });
  }
});

/** GET /api/buy-for-me — customer sees their orders */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM buy_for_me_orders WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET /buy-for-me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch concierge orders' });
  }
});

/**
 * GET /api/buy-for-me/queue — operator queue.
 * Declared before `/:id` so Express's pattern matcher doesn't shadow it.
 */
router.get('/queue', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT b.*, u.email, u.name, o.tracking_number AS parcel_tracking_number
         FROM buy_for_me_orders b
         JOIN users u ON u.id = b.user_id
         LEFT JOIN orders o ON o.id = b.parcel_id
        WHERE b.status IN ('pending_quote','quoted','paid','rejected','alternative_offered')
        ORDER BY
          CASE b.status
            WHEN 'paid'                THEN 0
            WHEN 'pending_quote'       THEN 1
            WHEN 'alternative_offered' THEN 2
            WHEN 'rejected'            THEN 3
            WHEN 'quoted'              THEN 4
            ELSE 5
          END,
          b.created_at ASC`
    );
    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET /buy-for-me/queue error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
  }
});

/** GET /api/buy-for-me/:id — single order detail (owner or operator/admin). */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await req.db.query(
      `SELECT * FROM buy_for_me_orders WHERE id = $1`, [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = rows[0];
    if (order.user_id !== req.user.id &&
        req.user.role !== 'operator' &&
        req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error('GET /buy-for-me/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch concierge order' });
  }
});

/**
 * POST /api/buy-for-me/:id/pay — DEPRECATED.
 * Kept as a 410 Gone so any stale client gets a clear "switch to /api/payments"
 * message instead of attempting to debit a wallet that no longer exists
 * (migration 028). The replacement flow is:
 *   POST /api/payments
 *     { target_kind: 'buy_for_me', target_id: <bfm_id>,
 *       method: 'stripe' | 'mpesa' }
 * which returns a Stripe client_secret OR M-Pesa Till instructions.
 */
router.post('/:id/pay', authMiddleware, async (_req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Wallet pay is removed. Use POST /api/payments with target_kind=buy_for_me.',
  });
});

/** POST /api/buy-for-me/:id/cancel — customer cancels a not-yet-purchased order. */
router.post('/:id/cancel', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT user_id, status FROM buy_for_me_orders WHERE id = $1`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = rows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (!['pending_quote', 'quoted'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot cancel an order in status '${order.status}'`,
      });
    }
    await req.db.query(
      `UPDATE buy_for_me_orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/cancel error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel concierge order' });
  }
});

/**
 * POST /api/buy-for-me/admin-create — admin creates a BFM on behalf of a
 * customer (e.g. when the customer placed the order via WhatsApp).
 *
 * Body: { user_id, retailer_id?|retailer_url, item_name, size?, qty?,
 *         notes?, estimate_gbp?, markup_pct? }
 *
 * If `estimate_gbp` is provided, the row starts at status='quoted' with
 * `quoted_at = NOW()` and the quote-ready email fires immediately — the
 * customer can accept + pay straight away. Otherwise the row enters the
 * regular operator queue at status='pending_quote' for normal triage.
 */
router.post('/admin-create', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  try {
    const {
      user_id, retailer_id, retailer_url, item_name, size, qty, notes,
      estimate_gbp, markup_pct,
    } = req.body || {};

    if (!user_id || typeof user_id !== 'string') {
      return res.status(400).json({ success: false, message: 'user_id is required' });
    }
    if (!item_name || typeof item_name !== 'string') {
      return res.status(400).json({ success: false, message: 'item_name is required' });
    }

    // Resolve retailer_url: explicit URL wins; otherwise look up the
    // picker id (PR 4 catalog).
    let resolvedUrl = (typeof retailer_url === 'string' && retailer_url.trim().length > 0)
      ? retailer_url.trim()
      : null;
    if (!resolvedUrl && retailer_id) {
      const { rows } = await req.db.query(
        `SELECT base_url FROM retailers WHERE id = $1 AND is_active = true`,
        [retailer_id]
      );
      if (rows[0]) resolvedUrl = rows[0].base_url;
    }
    if (!resolvedUrl) {
      return res.status(400).json({
        success: false,
        message: 'Provide either retailer_id (picker) or retailer_url (item link)',
      });
    }

    const { rows: ownerRows } = await req.db.query(
      `SELECT id, email, name FROM users WHERE id = $1`, [user_id]
    );
    if (ownerRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    const owner = ownerRows[0];

    // Optional pre-quote — admin can set estimate_gbp + markup_pct in
    // the same call so the customer doesn't have to wait for an
    // operator round-trip.
    const hasQuote = estimate_gbp != null && Number.isFinite(Number(estimate_gbp)) && Number(estimate_gbp) > 0;
    const estimateNum = hasQuote ? Number(estimate_gbp) : null;
    const markupNum   = hasQuote
      ? (Number.isFinite(Number(markup_pct)) ? Number(markup_pct) : 10)
      : null;

    const id = `BFM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    await req.db.query(
      `INSERT INTO buy_for_me_orders
         (id, user_id, retailer_url, item_name, size, qty, notes,
          status, estimate_gbp, markup_pct, quoted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               $8, $9, $10, ${hasQuote ? 'NOW()' : 'NULL'})`,
      [
        id, user_id, resolvedUrl, item_name, size || null,
        parseInt(qty, 10) || 1, notes || null,
        hasQuote ? 'quoted' : 'pending_quote',
        estimateNum, markupNum,
      ]
    );

    // Fire the customer's quote-ready email if we pre-quoted. Best-effort
    // — a mail outage shouldn't roll back the row creation.
    if (hasQuote && owner.email) {
      try {
        await sendBuyForMeQuoteEmail(
          owner.email, owner.name, id, item_name, estimateNum, markupNum
        );
      } catch (mailErr) {
        console.error('Admin BFM quote email failed (non-fatal):', mailErr.message);
      }
    }

    // Notify the rest of the admin team — even though one admin just
    // created the row themselves, the others may want to see it land.
    try {
      await notifyAdminsOfBuyForMe(
        req.db, req,
        { id, item_name, retailer_url: resolvedUrl, qty: parseInt(qty, 10) || 1, notes: notes || null },
        owner
      );
    } catch (notifyErr) {
      console.error('BFM admin notify (admin-create) failed (non-fatal):', notifyErr?.message);
    }

    res.status(201).json({
      success: true,
      order_id: id,
      pre_quoted: hasQuote,
    });
  } catch (err) {
    console.error('POST /buy-for-me/admin-create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create concierge order' });
  }
});

/**
 * POST /api/buy-for-me/:id/quote — operator sets the quote.
 *
 * Atomic single-write that flips status pending_quote → quoted, stamps
 * quoted_at, and dispatches the "quote ready" email. Replaces the previous
 * generic PATCH for this transition so we have a single place to wire the
 * notification (PATCH stays for back-office tweaks like markup-only edits
 * that shouldn't re-fire the email).
 */
router.post('/:id/quote', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { id } = req.params;
    const { estimate_gbp, markup_pct, notes } = req.body || {};
    const estimateNum = Number(estimate_gbp);
    if (!Number.isFinite(estimateNum) || estimateNum <= 0) {
      return res.status(400).json({ success: false, message: 'estimate_gbp must be a positive number' });
    }
    const markupNum = Number.isFinite(Number(markup_pct)) ? Number(markup_pct) : 10;

    const { rows } = await req.db.query(
      `UPDATE buy_for_me_orders
          SET estimate_gbp = $1,
              markup_pct   = $2,
              notes        = COALESCE($3, notes),
              status       = 'quoted',
              quoted_at    = NOW(),
              updated_at   = NOW()
        WHERE id = $4
          AND status IN ('pending_quote', 'quoted')
        RETURNING id, item_name, user_id, estimate_gbp, markup_pct`,
      [estimateNum, markupNum, notes || null, id]
    );
    if (rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Order not found or not quotable' });
    }
    const updated = rows[0];

    // Fan out to email — log + ignore failures so a mail outage never blocks
    // the operator's quote action.
    try {
      const { rows: userRows } = await req.db.query(
        `SELECT email, name FROM users WHERE id = $1`, [updated.user_id]
      );
      const u = userRows[0];
      if (u?.email) {
        await sendBuyForMeQuoteEmail(
          u.email, u.name, updated.id, updated.item_name,
          updated.estimate_gbp, updated.markup_pct
        );
      }
    } catch (mailErr) {
      console.error('BFM quote email failed (non-fatal):', mailErr.message);
    }

    // Live update + push so the customer sees the quote without a refresh.
    await notifyUser(req.db, updated.user_id, {
      type: 'buy_for_me_update',
      data: { action: 'quoted', orderId: updated.id },
      push: {
        title: '💬 Your quote is ready',
        body: `${updated.item_name} — tap to review and accept.`,
        url: '/buy-for-me',
        tag: `bfm-${updated.id}`,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/quote error:', err);
    res.status(500).json({ success: false, message: 'Failed to send quote' });
  }
});

/**
 * POST /api/buy-for-me/:id/accept — DEPRECATED (wallet path removed).
 * The /accept verb survives only for the optional acceptance note. The
 * customer's actual money flow is now POST /api/payments with
 * target_kind='buy_for_me'. The note can be passed to that endpoint via
 * a follow-up call once the payment is created. We keep this endpoint as
 * a 410 Gone so any stale client gets a clear redirect message.
 */
router.post('/:id/accept', authMiddleware, async (_req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Wallet accept is removed. Use POST /api/payments with target_kind=buy_for_me.',
  });
});

/**
 * POST /api/buy-for-me/:id/reject — customer rejects a quote with a reason.
 *
 * Reason is required (operator needs to know why so they can re-quote with
 * a cheaper alternative). Status flips quoted → rejected; the operator
 * queue's "rejected" filter surfaces them for follow-up.
 */
router.post('/:id/reject', authMiddleware, async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }
    const { rows } = await req.db.query(
      `SELECT user_id, status FROM buy_for_me_orders WHERE id = $1`, [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = rows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status !== 'quoted') {
      return res.status(409).json({
        success: false,
        message: `Cannot reject an order in status '${order.status}'`,
      });
    }
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET status = 'rejected',
              customer_decision_reason = $2,
              decided_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, reason]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/reject error:', err);
    res.status(500).json({ success: false, message: 'Failed to reject quote' });
  }
});

/**
 * POST /api/buy-for-me/:id/admin-reject — operator/admin declines a request.
 *
 * Distinct from the customer reject above: staff can decline a request the
 * customer hasn't seen a quote for (e.g. prohibited item, can't be sourced).
 * Reason is required and surfaced on the customer's order card. Allowed from
 * any not-yet-paid state; paid/purchased orders must be cancelled/refunded
 * through the payments flow instead.
 */
router.post('/:id/admin-reject', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  try {
    const reason = (req.body?.reason || '').trim();
    if (reason.length < 3) {
      return res.status(400).json({ success: false, message: 'reason is required' });
    }
    const { rows } = await req.db.query(
      `SELECT b.user_id, b.status, b.item_name, u.email, u.name
         FROM buy_for_me_orders b JOIN users u ON u.id = b.user_id
        WHERE b.id = $1`, [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = rows[0];
    if (!['pending_quote', 'quoted', 'alternative_offered'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot decline an order in status '${order.status}'`,
      });
    }
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET status = 'rejected',
              admin_decision_reason = $2,
              decided_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, reason]
    );

    // Email the customer the reason (best-effort).
    if (order.email) {
      try { await sendBuyForMeDeclinedEmail(order.email, order.name, req.params.id, order.item_name, reason); }
      catch (mailErr) { console.error('BFM decline email failed (non-fatal):', mailErr?.message); }
    }

    // Live update + push so the customer's BFM list reflects it immediately.
    await notifyUser(req.db, order.user_id, {
      type: 'buy_for_me_update',
      data: { action: 'rejected', orderId: req.params.id, reason },
      push: {
        title: 'Update on your request',
        body: `${order.item_name} — we couldn't proceed. Tap for details.`,
        url: '/buy-for-me',
        tag: `bfm-${req.params.id}`,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/admin-reject error:', err);
    res.status(500).json({ success: false, message: 'Failed to decline request' });
  }
});

/**
 * POST /api/buy-for-me/:id/suggest-alternative — operator/admin offers an
 * alternative product when the requested one is unavailable. The customer can
 * then accept (re-queues for a quote), decline, or counter with their own link.
 */
router.post('/:id/suggest-alternative', authMiddleware, requireRole('admin', 'operator'), async (req, res) => {
  try {
    const alternativeUrl  = (req.body?.alternative_url || '').trim();
    const alternativeNote = (req.body?.alternative_note || '').trim();
    if (!alternativeUrl && !alternativeNote) {
      return res.status(400).json({ success: false, message: 'Provide an alternative link and/or note' });
    }
    const { rows } = await req.db.query(
      `SELECT b.user_id, b.status, b.item_name, u.email, u.name
         FROM buy_for_me_orders b JOIN users u ON u.id = b.user_id
        WHERE b.id = $1`, [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = rows[0];
    if (!['pending_quote', 'quoted', 'alternative_offered'].includes(order.status)) {
      return res.status(409).json({
        success: false,
        message: `Cannot suggest an alternative for an order in status '${order.status}'`,
      });
    }
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET status = 'alternative_offered',
              alternative_url = $2,
              alternative_note = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, alternativeUrl || null, alternativeNote || null]
    );

    if (order.email) {
      try { await sendBuyForMeAlternativeEmail(order.email, order.name, req.params.id, order.item_name, alternativeUrl, alternativeNote); }
      catch (mailErr) { console.error('BFM alternative email failed (non-fatal):', mailErr?.message); }
    }
    await notifyUser(req.db, order.user_id, {
      type: 'buy_for_me_update',
      data: { action: 'alternative_offered', orderId: req.params.id },
      push: {
        title: '🔄 We found an alternative',
        body: `${order.item_name} wasn't available — tap to review our suggestion.`,
        url: '/buy-for-me',
        tag: `bfm-${req.params.id}`,
      },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/suggest-alternative error:', err);
    res.status(500).json({ success: false, message: 'Failed to suggest alternative' });
  }
});

/**
 * Customer responses to an alternative offer. All require the caller to own
 * the order and the order to be in 'alternative_offered'.
 *   accept  → re-queue the alternative URL for an operator quote
 *   decline → mark rejected with a reason
 *   counter → customer supplies their own link; re-queue that instead
 */
async function loadOwnedAlternative(req, res) {
  const { rows } = await req.db.query(
    `SELECT user_id, status, item_name, alternative_url FROM buy_for_me_orders WHERE id = $1`,
    [req.params.id]
  );
  if (rows.length === 0) { res.status(404).json({ success: false, message: 'Concierge order not found' }); return null; }
  const order = rows[0];
  if (order.user_id !== req.user.id) { res.status(403).json({ success: false, message: 'Access denied' }); return null; }
  if (order.status !== 'alternative_offered') {
    res.status(409).json({ success: false, message: 'No alternative is pending on this order' }); return null;
  }
  return order;
}

router.post('/:id/alternative/accept', authMiddleware, async (req, res) => {
  try {
    const order = await loadOwnedAlternative(req, res);
    if (!order) return;
    // Swap in the alternative as the item to source and send it back to the
    // operator queue for a fresh quote.
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET retailer_url = COALESCE($2, retailer_url),
              status = 'pending_quote',
              alternative_url = NULL,
              alternative_note = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, order.alternative_url]
    );
    pushToAdmins('admin_stats', { action: 'new_buy_for_me_request', orderId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/alternative/accept error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept alternative' });
  }
});

router.post('/:id/alternative/decline', authMiddleware, async (req, res) => {
  try {
    const order = await loadOwnedAlternative(req, res);
    if (!order) return;
    const reason = (req.body?.reason || 'Declined the suggested alternative').toString().trim().slice(0, 500);
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET status = 'rejected',
              customer_decision_reason = $2,
              alternative_url = NULL,
              alternative_note = NULL,
              decided_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, reason]
    );
    pushToAdmins('admin_stats', { action: 'buy_for_me_alternative_declined', orderId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/alternative/decline error:', err);
    res.status(500).json({ success: false, message: 'Failed to decline alternative' });
  }
});

router.post('/:id/alternative/counter', authMiddleware, async (req, res) => {
  try {
    const order = await loadOwnedAlternative(req, res);
    if (!order) return;
    const url = (req.body?.retailer_url || '').trim();
    if (!url) return res.status(400).json({ success: false, message: 'A link is required' });
    await req.db.query(
      `UPDATE buy_for_me_orders
          SET retailer_url = $2,
              status = 'pending_quote',
              alternative_url = NULL,
              alternative_note = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, url]
    );
    pushToAdmins('admin_stats', { action: 'new_buy_for_me_request', orderId: req.params.id });
    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/alternative/counter error:', err);
    res.status(500).json({ success: false, message: 'Failed to send your link' });
  }
});

/** PATCH /api/buy-for-me/:id — operator quotes / advances status */
router.patch('/:id', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['estimate_gbp','markup_pct','status','notes'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        params.push(req.body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ success: false, message: 'No updatable fields' });
    sets.push(`updated_at = NOW()`);
    params.push(id);
    await req.db.query(
      `UPDATE buy_for_me_orders SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /buy-for-me/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update concierge order' });
  }
});

export default router;
