import express from 'express';
import { authMiddleware, isAdmin, optionalAuth } from '../middleware/auth.js';
import { sendInAppNotification } from '../utils/notifications.js';
import { isValidPackageStatus } from '../utils/orderStatuses.js';

const router = express.Router();

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
      `SELECT p.*, o.tracking_number, o.retailer
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

/** GET /api/tracking/:trackingNumber */
router.get('/:trackingNumber', optionalAuth, async (req, res) => {
  try {
    const db = req.db;
    const { trackingNumber } = req.params;

    // WhatsApp-flow tracking codes (TRK-####) first. Slim public
    // projection — status + timeline only, no customer PII, no amounts
    // beyond the pending delivery fee the recipient needs to know about.
    const waCode = trackingNumber.trim().toUpperCase().replace(/^TRK[\s-]?/, 'TRK-');
    if (/^TRK-\d+$/.test(waCode)) {
      const { rows } = await db.query(
        `SELECT tracking_code, status, delivery_fee_waived,
                delivery_fee_kes, delivery_fee_paid_at,
                paid_at, purchased_at, arrived_at, dispatched_at, delivered_at,
                created_at, updated_at
           FROM wa_orders WHERE tracking_code = $1`,
        [waCode]
      );
      const o = rows[0];
      if (!o) return res.status(404).json({ success: false, message: 'Tracking number not found' });
      return res.json({
        success: true,
        tracking: {
          tracking_number: o.tracking_code,
          status: o.status,
          timeline: {
            paid_at: o.paid_at,
            purchased_at: o.purchased_at,
            arrived_at: o.arrived_at,
            dispatched_at: o.dispatched_at,
            delivered_at: o.delivered_at,
          },
          delivery_fee_pending:
            o.status === 'delivery_fee_pending' && !o.delivery_fee_waived && !o.delivery_fee_paid_at
              ? Number(o.delivery_fee_kes) : null,
          created_at: o.created_at,
          updated_at: o.updated_at,
        },
      });
    }

    // Legacy tracking numbers (TC-YYYYMMDD-…) — the pre-WhatsApp flow;
    // kept until in-flight orders drain. Slim public projection: never
    // leak user_id, financial values, or insurance toggles. Audit T11.
    const result = await db.query(
      `SELECT id, tracking_number, retailer, status, description,
              weight_kg, dimensions_json, shipping_speed,
              hold_reason, hold_resolved_at,
              created_at, updated_at
       FROM orders WHERE tracking_number = $1`,
      [trackingNumber]
    );
    const order = result.rows[0];
    if (!order) return res.status(404).json({ success: false, message: 'Tracking number not found' });

    // Same slim projection on the package list — descriptions and weights
    // are useful to the recipient, IDs / cost data are not.
    const pkgs = await db.query(
      `SELECT id, description, weight_kg, status, warehouse_location, received_at
         FROM packages WHERE order_id = $1`,
      [order.id]
    );

    res.json({
      success: true,
      tracking: { ...order, dimensions_json: order.dimensions_json ? JSON.parse(order.dimensions_json) : null, packages: pkgs.rows }
    });
  } catch (error) {
    console.error('Tracking error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tracking information' });
  }
});

/** PUT /api/tracking/:id/status */
router.put('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, warehouse_location } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
    // packages.status v2 enum (matches database/migrations/002 + the
    // CHECK on production). Audit P5.1 hoisted the allowlist into
    // utils/orderStatuses.js — the legacy admin route accepted the
    // pre-v2 set (audit T26 fix) and the consolidated module keeps
    // the four call sites in lock-step with the live DB CHECK.
    if (!isValidPackageStatus(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const pkgRes = await db.query('SELECT * FROM packages WHERE id = $1', [id]);
    if (!pkgRes.rows[0]) return res.status(404).json({ success: false, message: 'Package not found' });

    const params = [status];
    const setClauses = ['status = $1', 'updated_at = NOW()'];
    if (warehouse_location) { params.push(warehouse_location); setClauses.push(`warehouse_location = $${params.length}`); }
    if (status === 'received_at_warehouse') setClauses.push('received_at = NOW()');
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
