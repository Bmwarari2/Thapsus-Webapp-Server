/**
 * routes/buyForMe.js — Buy-for-me concierge orders (Spec §4.10).
 *
 * Customer pastes a retailer URL → operator reviews + quotes →
 * customer pays → operator buys → retailer ships to Thapsus UK.
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';

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

/** GET /api/buy-for-me/queue — operator queue */
router.get('/queue', authMiddleware, requireRole('operator'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT b.*, u.email, u.name
         FROM buy_for_me_orders b
         JOIN users u ON u.id = b.user_id
        WHERE b.status IN ('pending_quote','quoted','paid')
        ORDER BY b.created_at ASC`
    );
    res.json({ success: true, orders: rows });
  } catch (err) {
    console.error('GET /buy-for-me/queue error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
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
