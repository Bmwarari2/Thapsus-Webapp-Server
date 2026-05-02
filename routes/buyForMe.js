/**
 * routes/buyForMe.js — Buy-for-me concierge orders (Spec §4.10).
 *
 * Customer pastes a retailer URL → operator reviews + quotes →
 * customer pays → operator buys → retailer ships to Thapsus UK.
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { sendBuyForMeQuoteEmail } from '../utils/email.js';

const router = express.Router();

/** POST /api/buy-for-me — customer creates a request */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { retailer_url, item_name, size, qty, notes } = req.body;
    if (!retailer_url || !item_name) {
      return res.status(400).json({ success: false, message: 'retailer_url and item_name are required' });
    }
    const id = `BFM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
    await req.db.query(
      `INSERT INTO buy_for_me_orders
         (id, user_id, retailer_url, item_name, size, qty, notes, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending_quote')`,
      [id, req.user.id, retailer_url, item_name, size || null,
       parseInt(qty, 10) || 1, notes || null]
    );
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
      `SELECT b.*, u.email, u.name
         FROM buy_for_me_orders b
         JOIN users u ON u.id = b.user_id
        WHERE b.status IN ('pending_quote','quoted','paid','rejected')
        ORDER BY
          CASE b.status
            WHEN 'pending_quote' THEN 0
            WHEN 'rejected'      THEN 1
            WHEN 'quoted'        THEN 2
            WHEN 'paid'          THEN 3
            ELSE 4
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
 * POST /api/buy-for-me/:id/pay — customer accepts a quote and pays from wallet.
 * Atomically debits wallet by (estimate_gbp * (1 + markup_pct/100)) — converted
 * via current GBP→KES rate — and flips status to 'paid'. Insufficient balance
 * fails with 402.
 */
router.post('/:id/pay', authMiddleware, async (req, res) => {
  const client = await req.db.connect();
  try {
    await client.query('BEGIN');

    const { rows: orderRows } = await client.query(
      `SELECT * FROM buy_for_me_orders WHERE id = $1 FOR UPDATE`,
      [req.params.id]
    );
    if (orderRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = orderRows[0];
    if (order.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status !== 'quoted') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Cannot pay an order in status '${order.status}'`,
      });
    }
    if (!order.estimate_gbp || order.estimate_gbp <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Quote not set' });
    }

    const markup = (order.markup_pct || 0) / 100;
    const totalGbp = order.estimate_gbp * (1 + markup);

    const { rows: rateRows } = await client.query(
      `SELECT rate FROM exchange_rates WHERE currency_pair = 'GBP_KES' LIMIT 1`
    );
    const gbpToKes = rateRows[0]?.rate || 165;
    const totalKes = Math.round(totalGbp * gbpToKes);

    const { rows: walletRows } = await client.query(
      `SELECT balance FROM wallet WHERE user_id = $1 FOR UPDATE`,
      [req.user.id]
    );
    const balance = walletRows[0]?.balance || 0;
    if (balance < totalKes) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance. Need KES ${totalKes.toLocaleString()}, have KES ${balance.toLocaleString()}.`,
      });
    }

    await client.query(
      `UPDATE wallet SET balance = balance - $1, last_updated = NOW() WHERE user_id = $2`,
      [totalKes, req.user.id]
    );
    await client.query(
      `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, status)
       VALUES ($1, $2, 'payment', $3, 'KES', 'wallet', 'completed')`,
      [
        `TXN-BFM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
        req.user.id,
        -totalKes,
      ]
    );
    await client.query(
      `UPDATE buy_for_me_orders SET status = 'paid', updated_at = NOW() WHERE id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');
    res.json({
      success: true,
      paid_kes: totalKes,
      paid_gbp: totalGbp,
      new_balance_kes: balance - totalKes,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /buy-for-me/:id/pay error:', err);
    res.status(500).json({ success: false, message: 'Failed to pay concierge order' });
  } finally {
    client.release();
  }
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

    res.json({ success: true });
  } catch (err) {
    console.error('POST /buy-for-me/:id/quote error:', err);
    res.status(500).json({ success: false, message: 'Failed to send quote' });
  }
});

/**
 * POST /api/buy-for-me/:id/accept — customer accepts a quote.
 *
 * Thin wrapper over /pay that also captures an optional acceptance note
 * (e.g. "please buy size M instead"). Accepts the same wallet rules as
 * /pay so older clients pointing at /pay continue to work unchanged.
 */
router.post('/:id/accept', authMiddleware, async (req, res) => {
  const client = await req.db.connect();
  try {
    await client.query('BEGIN');
    const { rows: orderRows } = await client.query(
      `SELECT * FROM buy_for_me_orders WHERE id = $1 FOR UPDATE`, [req.params.id]
    );
    if (orderRows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Concierge order not found' });
    }
    const order = orderRows[0];
    if (order.user_id !== req.user.id) {
      await client.query('ROLLBACK');
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (order.status !== 'quoted') {
      await client.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        message: `Cannot accept an order in status '${order.status}'`,
      });
    }
    if (!order.estimate_gbp || order.estimate_gbp <= 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'Quote not set' });
    }
    const markup  = (order.markup_pct || 0) / 100;
    const totalGbp = order.estimate_gbp * (1 + markup);
    const { rows: rateRows } = await client.query(
      `SELECT rate FROM exchange_rates WHERE currency_pair = 'GBP_KES' LIMIT 1`
    );
    const gbpToKes = rateRows[0]?.rate || 165;
    const totalKes = Math.round(totalGbp * gbpToKes);
    const { rows: walletRows } = await client.query(
      `SELECT balance FROM wallet WHERE user_id = $1 FOR UPDATE`, [req.user.id]
    );
    const balance = walletRows[0]?.balance || 0;
    if (balance < totalKes) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        success: false,
        message: `Insufficient wallet balance. Need KES ${totalKes.toLocaleString()}, have KES ${balance.toLocaleString()}.`,
      });
    }
    await client.query(
      `UPDATE wallet SET balance = balance - $1, last_updated = NOW() WHERE user_id = $2`,
      [totalKes, req.user.id]
    );
    await client.query(
      `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, status)
       VALUES ($1, $2, 'payment', $3, 'KES', 'wallet', 'completed')`,
      [`TXN-BFM-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, req.user.id, -totalKes]
    );
    await client.query(
      `UPDATE buy_for_me_orders
          SET status = 'paid',
              customer_decision_reason = $2,
              decided_at = NOW(),
              updated_at = NOW()
        WHERE id = $1`,
      [req.params.id, req.body?.reason || null]
    );
    await client.query('COMMIT');
    res.json({
      success: true,
      paid_kes: totalKes,
      paid_gbp: totalGbp,
      new_balance_kes: balance - totalKes,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('POST /buy-for-me/:id/accept error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept quote' });
  } finally {
    client.release();
  }
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
