import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { calculateShippingCost } from '../utils/pricing.js';
import { pushToUser, pushToAdmins } from './events.js';

const router = express.Router();

function generateTrackingNumber() {
  const date   = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const random = Math.random().toString(36).substr(2, 4).toUpperCase();
  return `SC-${date}-${random}`;
}

/** GET /api/orders */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const market = req.query.market;

    const params = [userId];
    let conditions = 'WHERE user_id = $1';
    if (status) { params.push(status); conditions += ` AND status = $${params.length}`; }
    if (market) { params.push(market); conditions += ` AND market = $${params.length}`; }

    const countResult = await db.query(`SELECT COUNT(*) AS count FROM orders ${conditions}`, params);
    const total      = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset     = (page - 1) * limit;

    params.push(limit, offset);
    const orders = await db.query(
      `SELECT * FROM orders ${conditions} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({
      success: true,
      orders: orders.rows.map(o => ({ ...o, dimensions_json: o.dimensions_json ? JSON.parse(o.dimensions_json) : null })),
      pagination: { page, limit, total, totalPages },
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/** POST /api/orders */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { retailer, market, description, weight_kg, dimensions, shipping_speed, insurance, declared_value } = req.body;

    if (!retailer || !market || !description)
      return res.status(400).json({ success: false, message: 'Missing required fields: retailer, market, description' });
    if (!['UK', 'USA', 'China'].includes(market))
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK, USA, or China' });
    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed))
      return res.status(400).json({ success: false, message: 'Invalid shipping speed.' });

    const costBreakdown = calculateShippingCost({
      weight_kg: weight_kg || 0, dimensions, market, shipping_speed: speed,
      insurance: insurance || false, declared_value: declared_value || 0,
    });

    const orderId        = uuidv4();
    const trackingNumber = generateTrackingNumber();

    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO orders (id, user_id, tracking_number, retailer, market, status, description,
          weight_kg, dimensions_json, shipping_speed, insurance, declared_value, estimated_cost)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12)`,
        [orderId, userId, trackingNumber, retailer, market, description,
          weight_kg || null, dimensions ? JSON.stringify(dimensions) : null,
          speed, insurance ? true : false, declared_value || 0, costBreakdown.total]
      );
      await db.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
        [uuidv4(), orderId, userId, description, weight_kg || null]
      );

      // referral reward check
      const refResult     = await db.query(
        `SELECT id, referrer_id, reward_amount FROM referrals WHERE referee_id = $1 AND status = 'pending' LIMIT 1`,
        [userId]
      );
      const pendingReferral = refResult.rows[0];
      if (pendingReferral) {
        const countRes = await db.query('SELECT COUNT(*) AS cnt FROM orders WHERE user_id = $1', [userId]);
        if (parseInt(countRes.rows[0].cnt) === 1) {
          const reward = pendingReferral.reward_amount || 50;
          await db.query(`UPDATE referrals SET status = 'completed', completed_at = NOW() WHERE id = $1`, [pendingReferral.id]);
          await db.query('UPDATE users  SET wallet_balance = wallet_balance + $1 WHERE id = $2', [reward, pendingReferral.referrer_id]);
          await db.query('UPDATE wallet SET balance = balance + $1, last_updated = NOW() WHERE user_id = $2', [reward, pendingReferral.referrer_id]);
          await db.query(
            `INSERT INTO transactions (id, user_id, type, amount, currency, payment_method, status)
             VALUES ($1,$2,'referral_reward',$3,'KES','system','completed')`,
            [uuidv4(), pendingReferral.referrer_id, reward]
          );
          // Push wallet update to referrer
          const walletRes = await db.query('SELECT balance FROM wallet WHERE user_id = $1', [pendingReferral.referrer_id]);
          pushToUser(pendingReferral.referrer_id, 'wallet_update', { balance: walletRes.rows[0]?.balance });
        }
      }

      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    const newOrder = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order    = { ...newOrder.rows[0], dimensions_json: newOrder.rows[0].dimensions_json ? JSON.parse(newOrder.rows[0].dimensions_json) : null, cost_breakdown: costBreakdown };

    // Push to the customer who placed the order + all admins
    pushToUser(userId, 'order_update', { action: 'created', order });
    pushToAdmins('admin_stats', { action: 'new_order', order });

    res.status(201).json({ success: true, message: 'Order created successfully', order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order' });
  }
});

/** GET /api/orders/:id */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db          = req.db;
    const { id }      = req.params;
    const userId      = req.user.id;
    const isAdminUser = req.user.role === 'admin';

    const result = isAdminUser
      ? await db.query('SELECT * FROM orders WHERE id = $1', [id])
      : await db.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);

    const order = result.rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    const pkgs = await db.query('SELECT * FROM packages WHERE order_id = $1', [id]);
    res.json({
      success: true,
      order: { ...order, dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null, packages: pkgs.rows },
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

/** PUT /api/orders/:id/status  (admin only) */
router.put('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, actual_cost, customs_duty } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
    const validStatuses = ['pending','received_at_warehouse','consolidating','in_transit','customs','out_for_delivery','delivered','cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const params = [status];
    let setClauses = ['status = $1', 'updated_at = NOW()'];
    if (actual_cost  !== undefined) { params.push(actual_cost);  setClauses.push(`actual_cost  = $${params.length}`); }
    if (customs_duty !== undefined) { params.push(customs_duty); setClauses.push(`customs_duty = $${params.length}`); }
    params.push(id);
    await db.query(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);

    const updated = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    const order   = updated.rows[0];

    // Push status change to the order's owner in real time
    if (order) {
      pushToUser(order.user_id, 'order_update', { action: 'status_changed', order });
      pushToAdmins('admin_stats', { action: 'order_status_changed', order });
    }

    res.json({ success: true, message: 'Order status updated', order });
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

export default router;
