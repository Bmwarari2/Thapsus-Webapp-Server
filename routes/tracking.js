import express from 'express';
import { authMiddleware, isAdmin, optionalAuth } from '../middleware/auth.js';
import { sendInAppNotification } from '../utils/notifications.js';

const router = express.Router();

/** GET /api/tracking/:trackingNumber */
router.get('/:trackingNumber', optionalAuth, async (req, res) => {
  try {
    const db = req.db;
    const { trackingNumber } = req.params;

    const result = await db.query(
      `SELECT id, user_id, tracking_number, retailer, market, status, description,
              weight_kg, dimensions_json, shipping_speed, insurance, declared_value,
              estimated_cost, actual_cost, customs_duty, created_at, updated_at
       FROM orders WHERE tracking_number = $1`,
      [trackingNumber]
    );
    const order = result.rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Tracking number not found' });

    const pkgs = await db.query('SELECT * FROM packages WHERE order_id = $1', [order.id]);

    res.json({
      success: true,
      tracking: { ...order, dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null, packages: pkgs.rows }
    });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tracking information' });
  }
});

/** GET /api/tracking/user/packages */
router.get('/user/packages', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const params = [userId];
    let conditions = 'WHERE p.user_id = $1';
    if (status) { params.push(status); conditions += ` AND p.status = $${params.length}`; }

    const countRes = await db.query(`SELECT COUNT(*) AS count FROM packages p ${conditions}`, params);
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const packages = await db.query(
      `SELECT p.*, o.tracking_number, o.retailer, o.market
       FROM packages p JOIN orders o ON p.order_id = o.id
       ${conditions} ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json({ success: true, packages: packages.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch packages' });
  }
});

/** PUT /api/tracking/:id/status */
router.put('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, warehouse_location } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
    const validStatuses = ['pending','received','consolidating','in_transit','customs','out_for_delivery','delivered','lost'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const pkgRes = await db.query('SELECT * FROM packages WHERE id = $1', [id]);
    if (!pkgRes.rows[0]) return res.status(404).json({ success: false, message: 'Package not found' });

    const params = [status];
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    if (warehouse_location) { params.push(warehouse_location); setClauses.push(`warehouse_location = $${params.length}`); }
    if (status === 'received') setClauses.push('received_at = NOW()');
    params.push(id);
    await db.query(`UPDATE packages SET ${setClauses.join(', ')} WHERE id = $${params.length}`, params);

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [pkgRes.rows[0].order_id]);
    sendInAppNotification(pkgRes.rows[0].user_id, `Package status updated to ${status}. Tracking: ${orderRes.rows[0].tracking_number}`);

    const updated = await db.query('SELECT * FROM packages WHERE id = $1', [id]);
    res.json({ success: true, message: 'Package status updated successfully', package: updated.rows[0] });
  } catch (error) {
    console.error('Update package status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update package status' });
  }
});

export default router;
