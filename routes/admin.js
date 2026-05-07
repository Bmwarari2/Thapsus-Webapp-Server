import express from 'express';
import crypto from 'crypto';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { sendAdminPasswordResetEmail, sendPaymentRequestEmail, sendOrderCreatedEmail, sendWelcomeAccountEmail, sendPaymentReminderEmail, sendPaymentReceiptEmail, sendOrderUpdatedEmail, emailConfigStatus } from '../utils/email.js';
import { calculateShippingCost, ELECTRONICS_HANDLING, HS_TIERS } from '../utils/pricing.js';
import { sendInAppNotification } from '../utils/notifications.js';
import { pushToUser, pushToAdmins } from './events.js';
import { logRouteError } from '../utils/errorLogger.js';
import { insertWithUniqueTrackingNumber } from '../utils/trackingNumber.js';
import { isValidOrderStatus } from '../utils/orderStatuses.js';
import { cacheInvalidate } from '../utils/cache.js';
import { EXCHANGE_RATES_CACHE_KEY_EXPORT } from './exchange.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_change_this_in_production';

function generateWarehouseId() {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let id = 'TC-';
  for (let i = 0; i < 4; i++) id += chars.charAt(Math.floor(Math.random() * chars.length));
  return id;
}

function generateReferralCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'TC';
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

/**
 * Maps a `orders.status` value to its v2 `packages.status` counterpart so
 * admin-side bulk/edit endpoints can keep the parcel row in sync. Without
 * this, marking an order received leaves the package at 'pre_registered'
 * and operators never see it in the "Ready to consolidate" list.
 *
 * Returns null when there's no sensible package-side equivalent (e.g.
 * statuses that only describe an order's billing/admin state).
 */
function mapOrderStatusToPackage(orderStatus) {
  switch (orderStatus) {
    case 'pending':                return 'pre_registered';
    case 'received_at_warehouse':  return 'received_at_warehouse';
    case 'consolidating':          return 'manifested';
    case 'in_transit':             return 'in_transit';
    case 'customs':                return 'awaiting_duty_payment';
    case 'out_for_delivery':       return 'out_for_delivery';
    case 'delivered':              return 'delivered';
    case 'cancelled':              return 'abandoned';
    default:                       return null;
  }
}

const router = express.Router();

/** GET /api/admin/users */
router.get('/users', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const search = req.query.search || '';
    const role = req.query.role;

    const params = [];
    let conditions = 'WHERE 1=1';
    if (search) {
      const s = `%${search}%`;
      params.push(s, s, s);
      conditions += ` AND (email ILIKE $${params.length - 2} OR name ILIKE $${params.length - 1} OR phone ILIKE $${params.length})`;
    }
    if (role) { params.push(role); conditions += ` AND role = $${params.length}`; }

    const countRes = await db.query(`SELECT COUNT(*) AS count FROM users ${conditions}`, params);
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    params.push(limit, offset);

    const users = await db.query(
      `SELECT id, email, name, phone, role, warehouse_id, referral_code, is_active, created_at
       FROM users ${conditions} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, users: users.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
});

/** GET /api/admin/users/search */
router.get('/users/search', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { q } = req.query;
    if (!q || q.length < 2) return res.status(400).json({ success: false, message: 'Search query must be at least 2 characters' });
    const s = `%${q}%`;
    const customers = await db.query(
      `SELECT id, email, name, phone, warehouse_id FROM users
       WHERE role = 'customer' AND is_active = true AND (email ILIKE $1 OR name ILIKE $2) LIMIT 10`,
      [s, s]
    );
    res.json({ success: true, customers: customers.rows });
  } catch (error) {
    console.error('Search customers error:', error);
    res.status(500).json({ success: false, message: 'Failed to search customers' });
  }
});

/** GET /api/admin/users/:id */
router.get('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userRes = await db.query(
      `SELECT id, email, name, phone, role, warehouse_id, language_pref, referral_code,
              is_active, delivery_address, admin_notes, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

    const ordersRes = await db.query(
      `SELECT
         id, tracking_number, retailer, market, status,
         estimated_cost, actual_cost, customs_duty,
         weight_kg, dimensions_json, shipping_speed, insurance,
         declared_value, electronics_item, order_notes, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [id]
    );

    const orders = ordersRes.rows.map((o) => {
      const dims = o.dimensions_json ? JSON.parse(o.dimensions_json) : null;
      let cost_breakdown = null;
      try {
        cost_breakdown = calculateShippingCost({
          weight_kg: o.weight_kg || 0,
          dimensions: dims,
          market: o.market,
          shipping_speed: o.shipping_speed || 'economy',
          insurance: o.insurance || false,
          declared_value: o.declared_value || 0,
          electronics_item: o.electronics_item || null,
        });
      } catch (_) { /* leave cost_breakdown as null on error */ }
      return { ...o, dimensions_json: dims, cost_breakdown };
    });

    const transactions = await db.query(
      `SELECT id, type, amount, currency, payment_method, status, created_at
       FROM transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10`, [id]
    );
    const refStats = await db.query(
      `SELECT COUNT(*) AS total_referrals,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_referrals,
        SUM(CASE WHEN status='completed' THEN reward_amount ELSE 0 END) AS total_earned
       FROM referrals WHERE referrer_id = $1`, [id]
    );

    res.json({
      success: true,
      user: { ...userRes.rows[0], ordersCount: orders.length, orders },
      recentTransactions: transactions.rows,
      referralStats: refStats.rows[0],
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user details' });
  }
});

/** PUT /api/admin/users/:id */
router.put('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { role, is_active, delivery_address, admin_notes } = req.body;

    if (id === adminId && is_active === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const userCheck = await db.query('SELECT id, email, name, is_active FROM users WHERE id = $1', [id]);
    if (!userCheck.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

    const params = [];
    const updates = [];
    if (role !== undefined) {
      if (!['customer','admin','operator','clearing_agent','rider'].includes(role))
        return res.status(400).json({ success: false, message: 'Invalid role' });
      params.push(role); updates.push(`role = $${params.length}`);
    }
    if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
    if (delivery_address !== undefined) { params.push(delivery_address || null); updates.push(`delivery_address = $${params.length}`); }
    if (admin_notes !== undefined) { params.push(admin_notes || null); updates.push(`admin_notes = $${params.length}`); }
    if (updates.length === 0) return res.status(400).json({ success: false, message: 'Provide at least one field to update' });
    updates.push('updated_at = NOW()');
    params.push(id);
    await db.query(`UPDATE users SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    const userInfo = userCheck.rows[0];
    if (is_active !== undefined) {
      const action = is_active ? 'reactivate_user' : 'deactivate_user';
      await db.query(
        'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
        [uuidv4(), adminId, action, JSON.stringify({
          user_id: id, email: userInfo.email, name: userInfo.name,
          previous_status: userInfo.is_active, new_status: is_active
        })]
      );
    }

    const updated = await db.query(
      'SELECT id, email, name, phone, role, warehouse_id, is_active, delivery_address, admin_notes FROM users WHERE id = $1', [id]
    );
    res.json({ success: true, message: 'User updated successfully', user: updated.rows[0] });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
});

/** DELETE /api/admin/users/:id */
router.delete('/users/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;

    if (id === adminId) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account' });
    }

    const userRes = await db.query('SELECT id, email, name, role FROM users WHERE id = $1', [id]);
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const user = userRes.rows[0];

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM ticket_messages WHERE sender_id = $1', [id]);
      await client.query('DELETE FROM tickets WHERE user_id = $1', [id]);
      await client.query('DELETE FROM notifications WHERE user_id = $1', [id]);
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [id]);
      await client.query('DELETE FROM packages WHERE user_id = $1', [id]);
      await client.query('DELETE FROM orders WHERE user_id = $1', [id]);
      await client.query('DELETE FROM transactions WHERE user_id = $1', [id]);
      // wallet table dropped in migration 028 (PR A). Replacement
      // user_credits has ON DELETE CASCADE on users(id), so the
      // user_credits + credit_ledger rows clean up automatically when
      // the users row goes — no explicit DELETE needed here.
      await client.query('UPDATE referrals SET referee_id = NULL WHERE referee_id = $1', [id]);
      await client.query('DELETE FROM referrals WHERE referrer_id = $1', [id]);
      await client.query('UPDATE users SET referred_by = NULL WHERE referred_by = $1', [id]);
      await client.query('DELETE FROM users WHERE id = $1', [id]);
      await client.query(
        'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
        [uuidv4(), adminId, 'delete_user', JSON.stringify({
          deleted_user_id: id, deleted_user_email: user.email,
          deleted_user_name: user.name, deleted_user_role: user.role
        })]
      );
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      message: `User ${user.name} (${user.email}) has been permanently deleted`,
      deleted_user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
});

/** POST /api/admin/test-email */
router.post('/test-email', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { to } = req.body;
    const recipientEmail = to || req.user.email;
    const emailConfig = {
      GMAIL_CLIENT_ID:     process.env.GMAIL_CLIENT_ID     ? '***set***' : '(NOT SET)',
      GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? '***set***' : '(NOT SET)',
      GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN ? '***set***' : '(NOT SET)',
      GMAIL_SENDER_EMAIL:  process.env.GMAIL_SENDER_EMAIL  || '(NOT SET)',
    };
    const missing = [];
    if (!process.env.GMAIL_CLIENT_ID)     missing.push('GMAIL_CLIENT_ID');
    if (!process.env.GMAIL_CLIENT_SECRET) missing.push('GMAIL_CLIENT_SECRET');
    if (!process.env.GMAIL_REFRESH_TOKEN) missing.push('GMAIL_REFRESH_TOKEN');
    if (!process.env.GMAIL_SENDER_EMAIL)  missing.push('GMAIL_SENDER_EMAIL');
    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing environment variables: ${missing.join(', ')}. Set them in Railway → Variables.`,
        email_config: emailConfig,
        help: 'To set up Gmail API: 1) Go to https://console.cloud.google.com → Enable Gmail API → Create OAuth 2.0 credentials. 2) Use https://developers.google.com/oauthplayground to generate a refresh token. 3) Add variables to Railway.'
      });
    }
    const { sendPasswordResetEmail } = await import('../utils/email.js');
    await sendPasswordResetEmail(recipientEmail, 'Thapsus Cargo Admin', 'https://www.thapsus.uk/test-only-link');
    res.json({ success: true, message: `Test email sent successfully to ${recipientEmail}`, email_config: emailConfig });
  } catch (error) {
    console.error('Test email error:', error);
    res.status(500).json({ success: false, message: `Email failed: ${error.message}` });
  }
});

/** GET /api/admin/referrals/stats */
router.get('/referrals/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const stats = await db.query(
      `SELECT COUNT(*) AS total_referrals,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending_referrals,
        SUM(CASE WHEN status='completed' THEN reward_amount ELSE 0 END) AS total_rewards_paid
       FROM referrals`
    );
    const topReferrers = await db.query(
      `SELECT u.id, u.name, u.email, u.referral_code,
        COUNT(r.id) AS total_referrals,
        SUM(CASE WHEN r.status='completed' THEN 1 ELSE 0 END) AS completed_referrals,
        SUM(CASE WHEN r.status='completed' THEN r.reward_amount ELSE 0 END) AS total_earned
       FROM users u JOIN referrals r ON r.referrer_id = u.id
       GROUP BY u.id ORDER BY total_referrals DESC LIMIT 10`
    );
    const s = stats.rows[0];
    res.json({
      success: true,
      stats: { total_referrals: parseInt(s.total_referrals)||0, completed_referrals: parseInt(s.completed_referrals)||0,
        pending_referrals: parseInt(s.pending_referrals)||0, total_rewards_paid: parseFloat(s.total_rewards_paid)||0 },
      top_referrers: topReferrers.rows
    });
  } catch (error) {
    console.error('Get referral stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referral statistics' });
  }
});

/** GET /api/admin/referrals */
router.get('/referrals', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const status = req.query.status;
    const search = req.query.search || '';
    const params = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND r.status = $${params.length}`; }
    if (search) {
      const s = `%${search}%`;
      params.push(s, s, s);
      where += ` AND (referrer.name ILIKE $${params.length-2} OR referrer.email ILIKE $${params.length-1} OR referrer.referral_code ILIKE $${params.length})`;
    }
    const countRes = await db.query(`SELECT COUNT(*) AS c FROM referrals r JOIN users referrer ON r.referrer_id = referrer.id ${where}`, params);
    const total = parseInt(countRes.rows[0].c);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const referrals = await db.query(
      `SELECT r.id, r.referral_code, r.status, r.reward_amount, r.created_at, r.completed_at,
        referrer.id AS referrer_id, referrer.name AS referrer_name, referrer.email AS referrer_email,
        referrer.referral_code AS referrer_code,
        referee.id AS referee_id, referee.name AS referee_name, referee.email AS referee_email,
        referee.created_at AS referee_joined_at,
        (SELECT COUNT(*) FROM orders WHERE user_id = r.referee_id) AS referee_orders_count
       FROM referrals r
       JOIN users referrer ON r.referrer_id = referrer.id
       LEFT JOIN users referee ON r.referee_id = referee.id
       ${where} ORDER BY r.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      referrals: referrals.rows.map(r => ({
        id: r.id, referral_code: r.referral_code, status: r.status, reward_amount: r.reward_amount,
        created_at: r.created_at, completed_at: r.completed_at || null,
        referrer: { id: r.referrer_id, name: r.referrer_name, email: r.referrer_email, referral_code: r.referrer_code },
        referee: { id: r.referee_id || null, name: r.referee_name || 'Unknown', email: r.referee_email || '',
          joined_at: r.referee_joined_at || null, orders_count: parseInt(r.referee_orders_count) || 0,
          first_order_placed: parseInt(r.referee_orders_count) > 0 }
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get referrals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch referrals' });
  }
});

/** GET /api/admin/orders */
router.get('/orders', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const status = req.query.status;
    const market = req.query.market;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const params = [];
    let conditions = 'WHERE 1=1';
    if (status) { params.push(status); conditions += ` AND o.status = $${params.length}`; }
    if (market) { params.push(market); conditions += ` AND o.market = $${params.length}`; }
    if (startDate) { params.push(startDate); conditions += ` AND DATE(o.created_at) >= $${params.length}`; }
    if (endDate) { params.push(endDate); conditions += ` AND DATE(o.created_at) <= $${params.length}`; }
    const countRes = await db.query(`SELECT COUNT(*) AS count FROM orders o ${conditions}`, params);
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    params.push(limit, offset);
    const orders = await db.query(
      `SELECT o.id, o.tracking_number, o.retailer, o.market, o.status,
              o.estimated_cost, o.actual_cost, o.created_at, o.description,
              o.weight_kg, o.dimensions_json, o.shipping_speed, o.insurance,
              o.declared_value, o.customs_duty, o.electronics_item, o.order_notes, o.user_id,
              u.name, u.email
       FROM orders o JOIN users u ON o.user_id = u.id
       ${conditions} ORDER BY o.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({
      success: true,
      orders: orders.rows.map(o => ({ ...o, dimensions_json: o.dimensions_json ? JSON.parse(o.dimensions_json) : null })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/** PUT /api/admin/orders/bulk-update */
router.put('/orders/bulk-update', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { order_ids, status } = req.body;
    if (!order_ids || !Array.isArray(order_ids) || order_ids.length === 0)
      return res.status(400).json({ success: false, message: 'order_ids array is required' });
    if (!status) return res.status(400).json({ success: false, message: 'status is required' });
    if (!isValidOrderStatus(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

    const updatePlaceholders = order_ids.map((_, i) => `$${i + 2}`).join(',');
    await db.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id IN (${updatePlaceholders})`, [status, ...order_ids]);

    // Cascade to packages so the operator's "Ready to consolidate" KPI
    // reflects the admin's status change. iOS observes packages.status, so
    // updating orders alone hid these parcels from the consolidation flow.
    const pkgStatus = mapOrderStatusToPackage(status);
    if (pkgStatus) {
      await db.query(
        `UPDATE packages SET status = $1, updated_at = NOW() WHERE order_id IN (${updatePlaceholders})`,
        [pkgStatus, ...order_ids]
      );
    }

    const selectPlaceholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
    const updated = await db.query(`SELECT * FROM orders WHERE id IN (${selectPlaceholders})`, order_ids);

    // Log NPS invitations when an order transitions into delivered. This is
    // the canonical "we offered a survey for parcel X" record so iOS doesn't
    // have to rely on UserDefaults across devices and admins can compute
    // response rate (responded_at / created_at).
    //
    // Batched into a single multi-row INSERT — for a 100-order bulk
    // status change that's 1 round-trip instead of 100. ON CONFLICT
    // DO NOTHING handles re-applying the same status (e.g. admin
    // re-marks a delivered order as delivered).
    if (status === 'delivered') {
      const inviteRows = updated.rows.filter((o) => !!o.user_id);
      if (inviteRows.length > 0) {
        const placeholders = inviteRows
          .map((_, i) => `($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`)
          .join(', ');
        const params = inviteRows.flatMap((o) => [
          `NPSI-${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${o.id.slice(0, 4)}`,
          o.user_id,
          o.id,
        ]);
        await db.query(
          `INSERT INTO nps_invitations (id, user_id, order_id)
           VALUES ${placeholders}
           ON CONFLICT (order_id) DO NOTHING`,
          params
        );
      }
    }

    // Push real-time SSE notification to each order's owner
    for (const order of updated.rows) {
      pushToUser(order.user_id, 'order_update', { action: 'status_changed', order });
    }
    pushToAdmins('admin_stats', { action: 'bulk_status_changed', count: updated.rows.length, status });

    res.json({ success: true, message: `Updated ${updated.rows.length} orders`, updated_count: updated.rows.length, orders: updated.rows });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk update orders' });
  }
});

/** PUT /api/admin/orders/:id/edit — Admin can edit order details (weight, dimensions, etc.) */
router.put('/orders/:id/edit', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { weight_kg, dimensions, actual_cost, customs_duty, status, description, retailer, electronics_item, order_notes } = req.body;

    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];

    let costBreakdown = null;
    const params = [];
    const updates = [];

    if (weight_kg !== undefined) { params.push(weight_kg); updates.push(`weight_kg = $${params.length}`); }
    if (dimensions !== undefined) { params.push(JSON.stringify(dimensions)); updates.push(`dimensions_json = $${params.length}`); }
    if (actual_cost !== undefined) { params.push(actual_cost); updates.push(`actual_cost = $${params.length}`); }
    if (customs_duty !== undefined) { params.push(customs_duty); updates.push(`customs_duty = $${params.length}`); }
    if (status !== undefined) {
      if (!isValidOrderStatus(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
      params.push(status); updates.push(`status = $${params.length}`);
    }
    if (description !== undefined) { params.push(description); updates.push(`description = $${params.length}`); }
    if (retailer !== undefined) { params.push(retailer); updates.push(`retailer = $${params.length}`); }
    if (order_notes !== undefined) { params.push(order_notes || null); updates.push(`order_notes = $${params.length}`); }
    if (electronics_item !== undefined) {
      const validElectronics = Object.keys(ELECTRONICS_HANDLING);
      if (electronics_item !== null && electronics_item !== '' && !validElectronics.includes(electronics_item)) {
        return res.status(400).json({ success: false, message: `Invalid electronics_item. Valid values: ${validElectronics.join(', ')}` });
      }
      params.push(electronics_item || null);
      updates.push(`electronics_item = $${params.length}`);
    }

    if (updates.length === 0) return res.status(400).json({ success: false, message: 'No fields to update' });

    updates.push('updated_at = NOW()');

    // Recalculate estimated cost if weight or electronics_item changed
    if (weight_kg !== undefined || electronics_item !== undefined) {
      const dims = dimensions || (order.dimensions_json ? JSON.parse(order.dimensions_json) : null);
      const effectiveWeight = weight_kg !== undefined ? weight_kg : order.weight_kg;
      const effectiveElectronics = electronics_item !== undefined ? (electronics_item || null) : (order.electronics_item || null);
      costBreakdown = calculateShippingCost({
        weight_kg: effectiveWeight, dimensions: dims, market: order.market,
        shipping_speed: order.shipping_speed || 'economy',
        insurance: order.insurance || false,
        declared_value: order.declared_value || 0,
        electronics_item: effectiveElectronics,
      });
      params.push(costBreakdown.total);
      updates.push(`estimated_cost = $${params.length}`);
    }

    params.push(id);
    await db.query(`UPDATE orders SET ${updates.join(', ')} WHERE id = $${params.length}`, params);

    // Also update the package weight if weight changed
    if (weight_kg !== undefined) {
      await db.query('UPDATE packages SET weight_kg = $1, updated_at = NOW() WHERE order_id = $2', [weight_kg, id]);
    }

    // Cascade status to the package row so iOS observers see it. Without
    // this an admin-side mark-received leaves packages.status='pre_registered'
    // and operators can't pick the parcel up for consolidation.
    if (status !== undefined) {
      const pkgStatus = mapOrderStatusToPackage(status);
      if (pkgStatus) {
        await db.query(
          'UPDATE packages SET status = $1, updated_at = NOW() WHERE order_id = $2',
          [pkgStatus, id]
        );
      }
    }

    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, 'edit_order', JSON.stringify({ order_id: id, tracking_number: order.tracking_number, changes: req.body })]);

    const updated = await db.query(
      `SELECT o.*, u.name, u.email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1`, [id]
    );
    const updatedOrder = updated.rows[0];

    // Ensure we have a fresh cost breakdown for the email
    if (!costBreakdown) {
      const dims = updatedOrder.dimensions_json
        ? JSON.parse(updatedOrder.dimensions_json)
        : null;
      try {
        costBreakdown = calculateShippingCost({
          weight_kg: updatedOrder.weight_kg || 0,
          dimensions: dims,
          market: updatedOrder.market,
          shipping_speed: updatedOrder.shipping_speed || 'economy',
          insurance: updatedOrder.insurance || false,
          declared_value: updatedOrder.declared_value || 0,
          electronics_item: updatedOrder.electronics_item || null,
        });
      } catch (_) { /* non-fatal — skip email breakdown if pricing fails */ }
    }

    if (costBreakdown) {
      const emailOrder = {
        user_id: updatedOrder.user_id,
        shipping_cost: costBreakdown.breakdown.base_shipping.amount,
        handling_fee:
          (costBreakdown.breakdown.electronics_handling?.amount || 0) +
          (costBreakdown.breakdown.handling_fee?.amount || 0),
        insurance_fee: costBreakdown.breakdown.insurance.amount,
        customs_duty:
          updatedOrder.customs_duty ??
          costBreakdown.breakdown.customs_estimate?.amount ??
          0,
        estimated_cost: costBreakdown.total,
        actual_cost: updatedOrder.actual_cost,
      };

      const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
      sendOrderUpdatedEmail(
        updatedOrder.email,
        updatedOrder.name,
        updatedOrder.tracking_number,
        updatedOrder.retailer,
        updatedOrder.market,
        updatedOrder.description,
        updatedOrder.shipping_speed || 'economy',
        emailOrder,
        `${frontendUrl}/orders`
      ).catch((err) =>
        console.warn('Order updated email failed (non-fatal):', err.message)
      );
    }

    // Push update to customer
    pushToUser(updatedOrder.user_id, 'order_update', { action: 'order_edited', order: updatedOrder });
    pushToAdmins('admin_stats', { action: 'order_edited', order: updatedOrder });

    res.json({ success: true, message: 'Order updated successfully', order: { ...updatedOrder, dimensions_json: updatedOrder.dimensions_json ? JSON.parse(updatedOrder.dimensions_json) : null } });
  } catch (error) {
    console.error('Edit order error:', error);
    logRouteError(req, res, error, 'Edit order error');
    res.status(500).json({ success: false, message: 'Failed to edit order' });
  }
});

/** GET /api/admin/stats */
router.get('/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const [userStats, orderStats, marketStats, statusStats, revenueStats, referralStats, newUsersToday, newOrdersToday, activeOrders, recentOrders] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN role='customer' THEN 1 ELSE 0 END) AS customers, SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins, SUM(CASE WHEN is_active=true THEN 1 ELSE 0 END) AS active_users FROM users`),
      db.query(`SELECT COUNT(*) AS total_orders, SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='in_transit' THEN 1 ELSE 0 END) AS in_transit, AVG(estimated_cost) AS avg_estimated_cost, SUM(estimated_cost) AS total_estimated_value FROM orders`),
      db.query(`SELECT market, COUNT(*) AS count, SUM(estimated_cost) AS value FROM orders GROUP BY market`),
      db.query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
      // Exclude referral_reward credits from all revenue figures so referral bonuses
      // are not double-counted as income — they are user wallet credits, not cash inflows.
      db.query(`SELECT
        COUNT(*) AS total_transactions,
        SUM(CASE WHEN status='completed' AND type NOT IN ('referral_reward','referral_credit') THEN amount ELSE 0 END) AS total_revenue,
        SUM(CASE WHEN type='deposit'  AND status='completed' AND type NOT IN ('referral_reward','referral_credit') THEN amount ELSE 0 END) AS deposits,
        SUM(CASE WHEN type='payment'  AND status='completed' THEN amount ELSE 0 END) AS payments,
        SUM(CASE WHEN type IN ('referral_reward','referral_credit') AND status='completed' THEN amount ELSE 0 END) AS referral_credits_issued
        FROM transactions`),
      db.query(`SELECT COUNT(*) AS total_referrals, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_referrals, SUM(CASE WHEN status='completed' THEN reward_amount ELSE 0 END) AS total_rewards_paid FROM referrals`),
      // New users registered today
      db.query(`SELECT COUNT(*) AS count FROM users WHERE DATE(created_at) = CURRENT_DATE`),
      // New orders created today
      db.query(`SELECT COUNT(*) AS count FROM orders WHERE DATE(created_at) = CURRENT_DATE`),
      // Active orders (not delivered, not cancelled)
      db.query(`SELECT COUNT(*) AS count FROM orders WHERE status NOT IN ('delivered', 'cancelled')`),
      // Recent orders with daily counts (last 14 days)
      db.query(`SELECT DATE(created_at) AS date, COUNT(*) AS count, SUM(estimated_cost) AS revenue FROM orders WHERE created_at >= NOW() - INTERVAL '14 days' GROUP BY DATE(created_at) ORDER BY date ASC`)
    ]);
    res.json({
      success: true,
      stats: {
        users: { ...userStats.rows[0], new_today: parseInt(newUsersToday.rows[0].count) || 0 },
        orders: { ...orderStats.rows[0], new_today: parseInt(newOrdersToday.rows[0].count) || 0, active_orders: parseInt(activeOrders.rows[0].count) || 0 },
        markets: marketStats.rows,
        order_statuses: statusStats.rows,
        revenue: revenueStats.rows[0],
        referrals: referralStats.rows[0],
        daily_orders: recentOrders.rows
      }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/admin/revenue-summary
 *
 * Money Thapsus has actually earned, per the new payments-table model
 * (post-wallet rip in mig 028).
 *
 *   - 10% of every paid Buy-for-me order's `estimate_gbp`. Recognised
 *     once the BFM lifecycle is past the customer-paid milestone, i.e.
 *     status ∈ {paid, purchased, received, shipped}. Cancelled / rejected
 *     are excluded.
 *   - 100% of every customer-facing consolidation invoice that has been
 *     marked paid (`customer_consolidations.invoice_status='paid'`). This
 *     covers both standalone admin-issued invoices and invoices attached
 *     to a real shipping consolidation.
 *
 * Excludes per-parcel pricing-tier line items and pass-through cost — those
 * are not Thapsus margin. Currency is GBP throughout because both source
 * tables store pounds.
 */
router.get('/revenue-summary', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const [bfmRow, invoiceRow, monthly] = await Promise.all([
      db.query(`
        SELECT COALESCE(SUM(estimate_gbp) * 0.10, 0)::float AS commission_gbp,
               COUNT(*)::int AS paid_count
          FROM buy_for_me_orders
         WHERE status = ANY (ARRAY['paid','purchased','received','shipped'])
           AND estimate_gbp IS NOT NULL
      `),
      db.query(`
        SELECT COALESCE(SUM(invoice_amount), 0)::float AS revenue_gbp,
               COUNT(*)::int AS paid_count
          FROM customer_consolidations
         WHERE invoice_status = 'paid'
           AND COALESCE(invoice_currency, 'GBP') = 'GBP'
      `),
      db.query(`
        WITH bfm AS (
          SELECT to_char(date_trunc('month', COALESCE(decided_at, updated_at, created_at)), 'YYYY-MM') AS month,
                 COALESCE(SUM(estimate_gbp), 0) * 0.10 AS bfm_gbp
            FROM buy_for_me_orders
           WHERE status = ANY (ARRAY['paid','purchased','received','shipped'])
             AND estimate_gbp IS NOT NULL
             AND COALESCE(decided_at, updated_at, created_at) >= NOW() - INTERVAL '12 months'
           GROUP BY 1
        ), inv AS (
          SELECT to_char(date_trunc('month', COALESCE(invoice_paid_at, updated_at, created_at)), 'YYYY-MM') AS month,
                 COALESCE(SUM(invoice_amount), 0) AS invoice_gbp
            FROM customer_consolidations
           WHERE invoice_status = 'paid'
             AND COALESCE(invoice_currency, 'GBP') = 'GBP'
             AND COALESCE(invoice_paid_at, updated_at, created_at) >= NOW() - INTERVAL '12 months'
           GROUP BY 1
        )
        SELECT COALESCE(b.month, i.month) AS month,
               COALESCE(b.bfm_gbp, 0)::float AS buy_for_me_gbp,
               COALESCE(i.invoice_gbp, 0)::float AS invoice_gbp
          FROM bfm b FULL OUTER JOIN inv i USING (month)
         ORDER BY month ASC
      `)
    ]);
    const bfm = Number(bfmRow.rows[0].commission_gbp || 0);
    const inv = Number(invoiceRow.rows[0].revenue_gbp || 0);
    res.json({
      success: true,
      summary: {
        buy_for_me_commission_gbp: bfm,
        buy_for_me_paid_count: bfmRow.rows[0].paid_count || 0,
        invoice_revenue_gbp: inv,
        invoice_paid_count: invoiceRow.rows[0].paid_count || 0,
        total_revenue_gbp: bfm + inv,
      },
      by_month: monthly.rows.map(r => ({
        month: r.month,
        buy_for_me_gbp: Number(r.buy_for_me_gbp || 0),
        invoice_gbp: Number(r.invoice_gbp || 0),
        total_gbp: Number(r.buy_for_me_gbp || 0) + Number(r.invoice_gbp || 0),
      })),
    });
  } catch (error) {
    logRouteError(req, res, error, 'Get revenue summary error');
    res.status(500).json({ success: false, message: 'Failed to fetch revenue summary' });
  }
});

/** GET /api/admin/revenue */
router.get('/revenue', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const params = [];
    // Exclude referral credits from revenue reporting — they are wallet bonuses, not cash income.
    let filter = "WHERE status = 'completed' AND type NOT IN ('referral_reward','referral_credit')";
    if (startDate) { params.push(startDate); filter += ` AND DATE(created_at) >= $${params.length}`; }
    if (endDate) { params.push(endDate); filter += ` AND DATE(created_at) <= $${params.length}`; }
    const revenue = await db.query(`SELECT DATE(created_at) AS date, payment_method, type, COUNT(*) AS count, SUM(amount) AS total FROM transactions ${filter} GROUP BY DATE(created_at), payment_method, type ORDER BY date DESC`, params);
    const summary = await db.query(`SELECT payment_method, SUM(CASE WHEN type='deposit' THEN amount ELSE 0 END) AS deposits, SUM(CASE WHEN type='payment' THEN amount ELSE 0 END) AS payments, SUM(amount) AS total FROM transactions ${filter} GROUP BY payment_method`, params);
    res.json({ success: true, revenue: revenue.rows, summary: summary.rows });
  } catch (error) {
    console.error('Get revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch revenue data' });
  }
});

/** GET /api/admin/revenue/export */
router.get('/revenue/export', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const params = [];
    let filter = "WHERE t.status = 'completed'";
    if (startDate) { params.push(startDate); filter += ` AND DATE(t.created_at) >= $${params.length}`; }
    if (endDate) { params.push(endDate); filter += ` AND DATE(t.created_at) <= $${params.length}`; }
    const transactions = await db.query(
      `SELECT t.id, u.email, u.name, DATE(t.created_at) AS date, t.created_at::time AS time,
              t.type, t.amount, t.currency, t.payment_method, t.payment_reference, t.status
       FROM transactions t JOIN users u ON t.user_id = u.id ${filter} ORDER BY t.created_at DESC`, params
    );
    const headers = ['ID','Email','Name','Date','Time','Type','Amount','Currency','Payment Method','Reference','Status'];
    const csvRows = [headers.join(',')];
    transactions.rows.forEach(row => {
      csvRows.push([row.id, `"${row.email}"`, `"${row.name}"`, row.date, row.time, row.type, row.amount, row.currency, row.payment_method, `"${row.payment_reference || ''}"`, row.status].join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="revenue-export.csv"');
    res.send(csvRows.join('\n'));
  } catch (error) {
    console.error('Export revenue error:', error);
    res.status(500).json({ success: false, message: 'Failed to export revenue data' });
  }
});

/** GET /api/admin/logs */
router.get('/logs', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const countRes = await db.query('SELECT COUNT(*) AS count FROM admin_logs');
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const logs = await db.query(
      `SELECT al.id, al.action, al.details, al.created_at, u.email AS admin_email, u.name AS admin_name
       FROM admin_logs al LEFT JOIN users u ON al.admin_id = u.id
       ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]
    );
    res.json({ success: true, logs: logs.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch logs' });
  }
});

/** POST /api/admin/users/:id/reset-password */
router.post('/users/:id/reset-password', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const userRes = await db.query('SELECT id, name, email FROM users WHERE id = $1', [id]);
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const user = userRes.rows[0];
    await db.query('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);
    const token = crypto.randomBytes(32).toString('hex');
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 3600000).toISOString();
    await db.query('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1,$2,$3,$4)', [tokenId, user.id, token, expiresAt]);
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    sendAdminPasswordResetEmail(user.email, user.name, `${frontendUrl}/reset-password?token=${token}`).catch(console.error);
    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'admin_reset_user_password', JSON.stringify({ user_id: id, user_email: user.email })]);
    res.json({ success: true, message: `Password reset email sent to ${user.email}` });
  } catch (error) {
    console.error('Admin reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to send password reset email' });
  }
});

/** GET /api/admin/exchange-rates */
router.get('/exchange-rates', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const rates = await db.query('SELECT currency_pair, rate, updated_at FROM exchange_rates');
    const ratesObj = {};
    let latestUpdate = null;
    rates.rows.forEach(r => {
      ratesObj[r.currency_pair] = parseFloat(r.rate);
      if (!latestUpdate || r.updated_at > latestUpdate) latestUpdate = r.updated_at;
    });
    if (rates.rows.length === 0) Object.assign(ratesObj, { USD_KES: 130.5, GBP_KES: 164.2, EUR_KES: 142.8, CNY_KES: 18.2 });
    res.json({ success: true, rates: ratesObj, updated_at: latestUpdate });
  } catch (error) {
    console.error('Get exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch exchange rates' });
  }
});

/** PUT /api/admin/exchange-rates */
router.put('/exchange-rates', authMiddleware, isAdmin, async (req, res) => {
  const db = req.db;
  const { rates } = req.body;
  const adminId = req.user.id;
  // Validate UP FRONT so the early-return 400s carry a useful message
  // for the admin without going through the transaction's catch arm.
  // This way, the only thing that lands in the unexpected-error path
  // below is genuine infrastructure failure, which we redact.
  if (!rates || typeof rates !== 'object') {
    return res.status(400).json({ success: false, message: 'rates object is required' });
  }
  const validPairs = ['USD_KES','GBP_KES','EUR_KES','CNY_KES'];
  for (const [pair, rate] of Object.entries(rates)) {
    if (!validPairs.includes(pair)) {
      return res.status(400).json({ success: false, message: `Invalid currency pair: ${pair}` });
    }
    if (typeof rate !== 'number' || rate <= 0) {
      return res.status(400).json({ success: false, message: `Invalid rate for ${pair}` });
    }
  }
  try {
    await db.query('BEGIN');
    try {
      for (const [pair, rate] of Object.entries(rates)) {
        await db.query(
          `INSERT INTO exchange_rates (currency_pair, rate, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
           ON CONFLICT (currency_pair) DO UPDATE SET rate = EXCLUDED.rate, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [pair, rate, adminId]
        );
      }
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'update_exchange_rates', JSON.stringify(rates)]);

    // Bust the in-process cache so /exchange/rates and /exchange/convert
    // see the new rates immediately on the next call rather than waiting
    // out the 60-second TTL.
    cacheInvalidate(EXCHANGE_RATES_CACHE_KEY_EXPORT);

    res.json({ success: true, message: 'Exchange rates updated successfully', rates });
  } catch (error) {
    // Real PG error (constraint, connection drop, etc.) — log it
    // server-side; never echo error.message back to the admin.
    console.error('Set exchange rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update exchange rates' });
  }
});

/** POST /api/admin/orders/create-for-client */
router.post('/orders/create-for-client', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const {
      customer_email, customer_name, retailer, market, description,
      weight_kg, dimensions, shipping_speed, insurance, declared_value,
      electronics_item = null, hs_tier = null,
    } = req.body;

    if (!customer_email && !customer_name)
      return res.status(400).json({ success: false, message: 'customer_email or customer_name is required' });

    if (electronics_item && !ELECTRONICS_HANDLING[electronics_item]) {
      return res.status(400).json({ success: false, message: `Invalid electronics_item. Valid values: ${Object.keys(ELECTRONICS_HANDLING).join(', ')}` });
    }

    const tier = hs_tier || (electronics_item ? 'electronics' : 'general');
    if (!HS_TIERS[tier]) {
      return res.status(400).json({ success: false, message: `Invalid hs_tier. Valid values: ${Object.keys(HS_TIERS).join(', ')}` });
    }

    let customerRes;
    if (customer_email)
      customerRes = await db.query("SELECT id, email, name FROM users WHERE email = $1 AND role = 'customer'", [customer_email]);
    if (!customerRes?.rows[0] && customer_name)
      customerRes = await db.query("SELECT id, email, name FROM users WHERE name ILIKE $1 AND role = 'customer'", [`%${customer_name}%`]);
    if (!customerRes?.rows[0])
      return res.status(404).json({ success: false, message: 'Customer not found.' });
    const customer = customerRes.rows[0];

    if (!retailer || !market || !description)
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    if (!['UK','China'].includes(market))
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK or China' });
    const speed = shipping_speed || 'economy';
    if (!['economy','express'].includes(speed))
      return res.status(400).json({ success: false, message: 'Invalid shipping speed' });

    let rates_gbp = null;
    try {
      const ratesRes = await db.query('SELECT market, rate_gbp FROM shipping_rates');
      if (ratesRes.rows.length) {
        rates_gbp = {};
        ratesRes.rows.forEach(r => { rates_gbp[r.market] = parseFloat(r.rate_gbp); });
      }
    } catch (_) { /* table may not exist yet */ }

    const costBreakdown = calculateShippingCost({
      weight_kg: weight_kg || 0,
      dimensions,
      market,
      shipping_speed: speed,
      insurance: insurance || false,
      declared_value: declared_value || 0,
      electronics_item,
      hs_tier: tier,
      rates_gbp,
    });

    const customsEstimate = costBreakdown.breakdown?.customs_estimate?.amount ?? 0;

    const orderForEmail = {
      user_id: customer.id,
      shipping_cost: costBreakdown.breakdown.base_shipping.amount,
      handling_fee:
        (costBreakdown.breakdown.electronics_handling?.amount || 0) +
        (costBreakdown.breakdown.handling_fee?.amount || 0),
      insurance_fee: costBreakdown.breakdown.insurance.amount,
      customs_duty: customsEstimate,
      estimated_cost: costBreakdown.total,
      actual_cost: null,
    };

    const orderId = uuidv4();

    // Use a dedicated client for proper transaction isolation
    const client = await db.connect();
    let trackingNumber;
    try {
      await client.query('BEGIN');
      // Audit P2.4: previous generator was
      // `Math.random().toString(36).substr(2, 4)` — only 4 base-36 chars
      // (~1.7M codes/day, well within birthday-collision range across
      // daily volume), and a collision threw a 500 to the admin because
      // nothing retried on the unique-index violation. Shared helper
      // mints with crypto.randomBytes(4) → 8 hex chars (~4B/day) and
      // re-issues the INSERT on Postgres 23505.
      ({ trackingNumber } = await insertWithUniqueTrackingNumber(client, (tn) =>
        client.query(
          `INSERT INTO orders (
             id, user_id, tracking_number, retailer, market, status,
             description, weight_kg, dimensions_json, shipping_speed,
             insurance, declared_value, estimated_cost, customs_duty,
             electronics_item, hs_tier
           )
           VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            orderId, customer.id, tn, retailer, market, description,
            weight_kg || null, dimensions ? JSON.stringify(dimensions) : null,
            speed, insurance ? true : false, declared_value || 0, costBreakdown.total,
            customsEstimate, electronics_item || null, tier,
          ]
        )
      ));
      // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
      // 'pending' is no longer valid — the equivalent intake state is 'pre_registered'.
      await client.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES ($1,$2,$3,$4,$5,'pre_registered')`,
        [uuidv4(), orderId, customer.id, description, weight_kg || null]
      );
      await client.query(
        'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
        [uuidv4(), adminId, 'create_order_for_client', JSON.stringify({
          order_id: orderId, tracking_number: trackingNumber,
          customer_id: customer.id, customer_email: customer.email,
          electronics_item: electronics_item || null,
        })]
      );

      // Referral reward check — same logic as user-created orders
      const refResult = await client.query(
        `SELECT id, referrer_id, reward_amount FROM referrals WHERE referee_id = $1 AND status = 'pending' LIMIT 1`,
        [customer.id]
      );
      const pendingReferral = refResult.rows[0];
      if (pendingReferral) {
        const countRes = await client.query('SELECT COUNT(*) AS cnt FROM orders WHERE user_id = $1', [customer.id]);
        if (parseInt(countRes.rows[0].cnt) === 1) {
          const reward = 50;
          await client.query(
            `UPDATE referrals SET status = 'completed', completed_at = NOW(), reward_amount = $1 WHERE id = $2`,
            [reward, pendingReferral.id]
          );
          // Wallet replaced by user_credits + credit_ledger (PR A / migration 028).
          // Mirror the orders.js reward path so the admin "create order for client"
          // flow grants the same KES 50 credit to both parties.
          for (const beneficiary of [pendingReferral.referrer_id, customer.id]) {
            await client.query(
              `INSERT INTO user_credits (user_id, balance_kes, updated_at)
               VALUES ($1, 0, NOW())
               ON CONFLICT (user_id) DO NOTHING`,
              [beneficiary]
            );
            await client.query(
              `UPDATE user_credits SET balance_kes = balance_kes + $1, updated_at = NOW() WHERE user_id = $2`,
              [reward, beneficiary]
            );
            await client.query(
              `INSERT INTO credit_ledger (id, user_id, delta_kes, reason, source_id, note)
               VALUES ($1, $2, $3, 'referral', $4, $5)`,
              [`CRD-RFR-${pendingReferral.id}-${beneficiary === pendingReferral.referrer_id ? 'A' : 'B'}`,
               beneficiary, reward, pendingReferral.id,
               `Referral reward (admin-created order) ${pendingReferral.id}`]
            );
          }
          pushToUser(pendingReferral.referrer_id, 'credit_update', { delta_kes: reward });
          pushToUser(customer.id, 'credit_update', { delta_kes: reward });
        }
      }

      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    sendInAppNotification(customer.id, `A new order (${trackingNumber}) has been created for you by Thapsus Cargo.`);

    const elecCfg = electronics_item ? ELECTRONICS_HANDLING[electronics_item] : null;
    let handlingFeeNote = '';
    if (elecCfg) {
      const feeKes = (elecCfg.fee_gbp * 164).toLocaleString();
      handlingFeeNote = `\n\nElectronics Handling Fee:\nYour order includes a £${elecCfg.fee_gbp} (≈ KES ${feeKes}) handling fee for ${elecCfg.label}. This covers the specialist handling, packaging inspection, and processing required for this category of item. A minimum chargeable weight of 1 kg applies.`;
    }

    const appUrl = process.env.APP_URL || 'https://www.thapsus.uk';
    sendOrderCreatedEmail(
      customer.email,
      customer.name,
      trackingNumber,
      retailer,
      market,
      description + handlingFeeNote,
      speed,
      `${appUrl}/orders`,
      orderForEmail
    ).catch((err) => console.warn('Order created email failed (non-fatal):', err.message));

    res.status(201).json({
      success: true,
      message: `Order created for ${customer.name} (${customer.email})`,
      order: {
        id: orderId, tracking_number: trackingNumber,
        customer: { id: customer.id, name: customer.name, email: customer.email },
        retailer, market, description, weight_kg, dimensions,
        shipping_speed: speed, insurance, declared_value,
        status: 'pending', estimated_cost: costBreakdown.total,
        cost_breakdown: costBreakdown,
        electronics_item: electronics_item || null,
      }
    });
  } catch (error) {
    console.error('Create order for client error:', error);
    res.status(500).json({ success: false, message: 'Failed to create order for client' });
  }
});

/** DELETE /api/admin/orders/:id */
router.delete('/orders/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    await db.query('BEGIN');
    try {
      await db.query('DELETE FROM packages WHERE order_id = $1', [id]);
      await db.query('DELETE FROM orders WHERE id = $1', [id]);
      await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'delete_order', JSON.stringify({ order_id: id, tracking_number: order.tracking_number, user_id: order.user_id })]);
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    sendInAppNotification(order.user_id, `Order ${order.tracking_number} has been deleted by an administrator.`);
    res.json({ success: true, message: `Order ${order.tracking_number} deleted successfully` });
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete order' });
  }
});

/** POST /api/admin/orders/:id/cancel */
router.post('/orders/:id/cancel', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { reason } = req.body;
    const orderRes = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    if (order.status === 'delivered') return res.status(400).json({ success: false, message: 'Cannot cancel a delivered order' });
    if (order.status === 'cancelled') return res.status(400).json({ success: false, message: 'Order is already cancelled' });
    await db.query('BEGIN');
    try {
      await db.query(`UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [id]);
      // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
      // 'lost' was renamed to 'abandoned' under the v2 PackageStatus enum.
      await db.query(`UPDATE packages SET status = 'abandoned', updated_at = NOW() WHERE order_id = $1`, [id]);
      await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'cancel_order', JSON.stringify({ order_id: id, tracking_number: order.tracking_number, reason: reason || 'No reason provided' })]);
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    sendInAppNotification(order.user_id, `Order ${order.tracking_number} has been cancelled.${reason ? ` Reason: ${reason}` : ''}`);
    const updated = await db.query('SELECT * FROM orders WHERE id = $1', [id]);
    res.json({ success: true, message: `Order ${order.tracking_number} cancelled successfully`, order: updated.rows[0] });
  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel order' });
  }
});

/** POST /api/admin/orders/:id/request-payment */
router.post('/orders/:id/request-payment', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { amount, notes } = req.body;
    const orderRes = await db.query(
      `SELECT o.*, u.email, u.name AS customer_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1`,
      [id]
    );
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    const paymentAmount = amount || order.actual_cost || order.estimated_cost;
    if (!paymentAmount || paymentAmount <= 0)
      return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';

    // Send in-app notification first (always works, no external dependency)
    sendInAppNotification(
      order.user_id,
      `Payment of KES ${paymentAmount.toLocaleString()} requested for order ${order.tracking_number}.${notes ? ` Note: ${notes}` : ''}`
    );

    // Log the action regardless of email outcome
    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, 'request_payment', JSON.stringify({
        order_id: id, tracking_number: order.tracking_number,
        customer_email: order.email, amount: paymentAmount, notes: notes || ''
      })]
    );

    // Attempt to send email — surface failures to the admin instead of swallowing them
    let emailWarning = null;
    try {
      await sendPaymentRequestEmail(
        order.email,
        order.customer_name,
        order.tracking_number,
        paymentAmount,
        notes || '',
        `${frontendUrl}/pay/${id}?amount=${paymentAmount}`,
        order
      );
    } catch (emailErr) {
      console.error('Payment request email failed:', emailErr.message || emailErr);
      emailWarning = `Email delivery failed: ${emailErr.message || 'Unknown error'}. In-app notification was sent.`;
    }

    res.json({
      success: true,
      message: emailWarning
        ? `In-app notification sent to ${order.customer_name}, but email to ${order.email} failed.`
        : `Payment request of KES ${paymentAmount.toLocaleString()} sent to ${order.email}`,
      email_warning: emailWarning || null,
      payment_request: {
        order_id: id, tracking_number: order.tracking_number,
        customer: { email: order.email, name: order.customer_name },
        amount: paymentAmount, currency: 'KES'
      }
    });
  } catch (error) {
    console.error('Request payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment request' });
  }
});

/**
 * GET /api/admin/email-config
 * Reports whether the Gmail OAuth credentials are configured. Lets the iOS
 * admin Console flag the integration without exposing secret values.
 */
router.get('/email-config', authMiddleware, isAdmin, async (req, res) => {
  try {
    res.json({ success: true, ...emailConfigStatus() });
  } catch (error) {
    console.error('Email config error:', error);
    res.status(500).json({ success: false, message: 'Failed to read email config' });
  }
});

/**
 * POST /api/admin/users/:id/resend-welcome
 * Issues a fresh setup token for the user and re-sends the welcome email. Used
 * when the original welcome email failed (Gmail outage, typo, spam folder).
 */
router.post('/users/:id/resend-welcome', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userRes = await db.query(
      `SELECT id, email, name, role, warehouse_id FROM users WHERE id = $1`, [id]
    );
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const user = userRes.rows[0];

    // Invalidate any prior unused setup tokens, mint a new one (24h).
    await db.query(
      `UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false`,
      [id]
    );
    const tokenId   = uuidv4();
    const setupTok  = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    await db.query(
      `INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)`,
      [tokenId, id, setupTok, expiresAt]
    );

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    try {
      await sendWelcomeAccountEmail(
        user.email,
        user.name,
        user.warehouse_id,
        user.role,
        `${frontendUrl}/reset-password?token=${setupTok}`
      );
      res.json({ success: true, email_status: 'sent', message: `Welcome email re-sent to ${user.email}` });
    } catch (err) {
      console.warn('Resend welcome failed:', err.message);
      res.status(502).json({
        success: false,
        email_status: 'failed',
        message: `Email service rejected the send: ${err.message}`
      });
    }
  } catch (error) {
    console.error('Resend welcome error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend welcome email' });
  }
});

/** POST /api/admin/users/create */
router.post('/users/create', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const { name, email, phone, role } = req.body;
    if (!name || !email || !phone)
      return res.status(400).json({ success: false, message: 'Name, email, and phone are required' });
    const accountRole = role || 'customer';
    if (!['customer', 'admin', 'operator', 'clearing_agent', 'rider'].includes(accountRole))
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be one of: customer, admin, operator, clearing_agent, rider'
      });
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0)
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    const userId        = uuidv4();
    const warehouseId   = generateWarehouseId();
    let referralCode    = generateReferralCode();
    while ((await db.query('SELECT id FROM users WHERE referral_code = $1', [referralCode])).rows.length > 0) {
      referralCode = generateReferralCode();
    }
    const tempPassword  = crypto.randomBytes(24).toString('hex');
    const passwordHash  = await bcrypt.hash(tempPassword, 10);
    const setupToken    = crypto.randomBytes(32).toString('hex');
    const setupTokenId  = uuidv4();
    const expiresAt     = new Date(Date.now() + 24 * 3600000).toISOString();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, language_pref, referral_code, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'en', $8, true)`,
        [userId, email.toLowerCase().trim(), passwordHash, name, phone, accountRole, warehouseId, referralCode]
      );
      // Wallet replaced by user_credits (PR A / migration 028).
      await client.query(
        `INSERT INTO user_credits (user_id, balance_kes, updated_at)
         VALUES ($1, 0, NOW())
         ON CONFLICT (user_id) DO NOTHING`,
        [userId]
      );
      await client.query('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [setupTokenId, userId, setupToken, expiresAt]);
      await client.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)', [uuidv4(), adminId, 'create_user_account', JSON.stringify({ user_id: userId, email: email.toLowerCase().trim(), role: accountRole, warehouse_id: warehouseId })]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }

    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    let emailStatus = 'sent';
    let emailError = null;
    try {
      await sendWelcomeAccountEmail(
        email.toLowerCase().trim(),
        name,
        warehouseId,
        accountRole,
        `${frontendUrl}/reset-password?token=${setupToken}`
      );
    } catch (err) {
      emailStatus = 'failed';
      emailError = err.message || 'unknown error';
      console.warn('Welcome email failed (non-fatal):', emailError);
    }

    const friendlyRole = accountRole === 'admin' ? 'Admin' :
      accountRole.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    const message = emailStatus === 'sent'
      ? `${friendlyRole} account created. Welcome email sent to ${email}.`
      : `${friendlyRole} account created. Welcome email failed (${emailError}). You can resend from the user detail page.`;

    res.status(201).json({
      success: true,
      message,
      email_status: emailStatus,
      email_error: emailError,
      user: { id: userId, email: email.toLowerCase().trim(), name, phone, role: accountRole, warehouse_id: warehouseId, referral_code: referralCode, is_active: true }
    });
  } catch (error) {
    console.error('Create user account error:', error);
    res.status(500).json({ success: false, message: 'Failed to create account' });
  }
});

/** POST /api/admin/orders/:id/send-reminder */
router.post('/orders/:id/send-reminder', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const { amount, notes } = req.body;
    const orderRes = await db.query(
      `SELECT o.*, u.email, u.name AS customer_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1`,
      [id]
    );
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    const reminderAmount = amount || order.actual_cost || order.estimated_cost;
    if (!reminderAmount || reminderAmount <= 0)
      return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';

    // Send in-app notification first (always works, no external dependency)
    sendInAppNotification(
      order.user_id,
      `Reminder: Payment of KES ${reminderAmount.toLocaleString()} is due for order ${order.tracking_number}.${notes ? ` Note: ${notes}` : ''}`
    );

    // Log the action regardless of email outcome
    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)',
      [uuidv4(), adminId, 'send_payment_reminder', JSON.stringify({
        order_id: id, tracking_number: order.tracking_number,
        customer_email: order.email, amount: reminderAmount, notes: notes || ''
      })]
    );

    // Attempt to send email — surface failures to admin instead of swallowing them
    let emailWarning = null;
    try {
      await sendPaymentReminderEmail(
        order.email,
        order.customer_name,
        order.tracking_number,
        reminderAmount,
        notes || '',
        `${frontendUrl}/pay/${id}?amount=${reminderAmount}`,
        order
      );
    } catch (emailErr) {
      console.error('Payment reminder email failed:', emailErr.message || emailErr);
      emailWarning = `Email delivery failed: ${emailErr.message || 'Unknown error'}. In-app notification was sent.`;
    }

    res.json({
      success: true,
      message: emailWarning
        ? `In-app notification sent to ${order.customer_name}, but email to ${order.email} failed.`
        : `Payment reminder sent to ${order.email} for KES ${reminderAmount.toLocaleString()}`,
      email_warning: emailWarning || null,
      reminder: {
        order_id: id, tracking_number: order.tracking_number,
        customer: { email: order.email, name: order.customer_name },
        amount: reminderAmount, currency: 'KES'
      }
    });
  } catch (error) {
    console.error('Send payment reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment reminder' });
  }
});

/** GET /api/admin/transactions/pending */
router.get('/transactions/pending', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const transactionsRes = await db.query(
      `SELECT t.id, t.user_id, t.amount, t.payment_reference, t.created_at,
              u.name, u.email,
              al.details AS log_details
       FROM transactions t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN LATERAL (
         SELECT details FROM admin_logs
         WHERE action = 'mpesa_payment_submitted'
           AND details::text LIKE '%' || t.id || '%'
         ORDER BY created_at DESC
         LIMIT 1
       ) al ON true
       WHERE t.status = 'pending' AND t.payment_method = 'mpesa'
       ORDER BY t.created_at DESC`,
      []
    );

    const transactions = transactionsRes.rows.map(t => {
      let mpesa_message = null;
      let payer_name = null;
      let payer_phone = null;
      if (t.log_details) {
        try {
          const parsed = typeof t.log_details === 'string' ? JSON.parse(t.log_details) : t.log_details;
          mpesa_message = parsed.mpesa_message || null;
          payer_name    = parsed.payer_name    || null;
          payer_phone   = parsed.payer_phone   || null;
        } catch (_) { /* ignore parse errors */ }
      }
      const { log_details, ...rest } = t;
      return { ...rest, mpesa_message, payer_name, payer_phone };
    });

    res.json({ success: true, transactions });
  } catch (error) {
    console.error('Get pending transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pending transactions' });
  }
});

/** POST /api/admin/transactions/:id/approve */
router.post('/transactions/:id/approve', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const adminId = req.user.id;
    const transRes = await db.query(
      `SELECT t.id, t.user_id, t.amount, t.payment_reference, u.name, u.email
       FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1`,
      [id]
    );
    if (!transRes.rows[0]) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const transaction = transRes.rows[0];
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE transactions SET status = 'completed' WHERE id = $1`, [id]);
      const logsRes = await client.query(
        `SELECT details FROM admin_logs WHERE action = 'mpesa_payment_submitted' AND details LIKE $1 ORDER BY created_at DESC LIMIT 1`,
        [`%${id}%`]
      );
      let orderDetails = null;
      if (logsRes.rows[0]) { try { orderDetails = JSON.parse(logsRes.rows[0].details); } catch (e) {} }
      let trackingNumber = 'N/A';
      if (orderDetails?.order_id) {
        const orderRes = await client.query('SELECT tracking_number FROM orders WHERE id = $1', [orderDetails.order_id]);
        if (orderRes.rows[0]) trackingNumber = orderRes.rows[0].tracking_number;
      }
      await client.query(
        `INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), adminId, 'mpesa_payment_approved', JSON.stringify({
          transaction_id: id, user_id: transaction.user_id, amount: transaction.amount,
          payment_reference: transaction.payment_reference, approved_at: new Date().toISOString()
        })]
      );
      await client.query('COMMIT');
      try {
        await sendPaymentReceiptEmail(
          transaction.email,
          transaction.name,
          trackingNumber,
          transaction.amount,
          transaction.payment_reference,
          new Date().toISOString()
        );
      } catch (emailErr) {
        console.warn('Failed to send receipt email:', emailErr.message);
      }
      res.json({ success: true, message: 'Transaction approved successfully', transaction: { id, status: 'completed' } });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (error) {
    console.error('Approve transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to approve transaction' });
  }
});

/** POST /api/admin/transactions/:id/reject */
router.post('/transactions/:id/reject', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = req.user.id;
    const transRes = await db.query(`SELECT id, status FROM transactions WHERE id = $1`, [id]);
    if (!transRes.rows[0]) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE transactions SET status = 'failed' WHERE id = $1`, [id]);
      await client.query(
        `INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), adminId, 'mpesa_payment_rejected', JSON.stringify({ transaction_id: id, reason: reason || null, rejected_at: new Date().toISOString() })]
      );
      await client.query('COMMIT');
      res.json({ success: true, message: 'Transaction rejected', transaction: { id, status: 'failed' } });
    } catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
  } catch (error) {
    console.error('Reject transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to reject transaction' });
  }
});

/** GET /api/admin/transactions/:id/proof */
router.get('/transactions/:id/proof', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const logsRes = await db.query(
      `SELECT details FROM admin_logs WHERE action = 'mpesa_payment_submitted' AND details LIKE $1 ORDER BY created_at DESC LIMIT 1`,
      [`%${id}%`]
    );
    if (!logsRes.rows[0])
      return res.status(404).json({ success: false, message: 'No proof of payment message found for this transaction' });
    const rawDetails = logsRes.rows[0].details;
    let payload = null;
    try { payload = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails; } catch (parseError) { console.warn('Failed to parse admin_logs.details for Mpesa proof:', parseError.message || parseError); }
    const mpesaMessage = payload?.mpesa_message || null;
    if (!mpesaMessage)
      return res.status(404).json({ success: false, message: 'Mpesa message not stored for this transaction' });
    res.json({
      success: true, mpesa_message: mpesaMessage,
      meta: { user_id: payload.user_id, amount: payload.amount, mpesa_code: payload.mpesa_code, order_id: payload.order_id || null, submitted_at: payload.submitted_at || null }
    });
  } catch (error) {
    console.error('Get Mpesa proof error:', error);
    res.status(500).json({ success: false, message: 'Failed to load proof of payment' });
  }
});

/** GET /api/admin/users/:id/emails */
router.get('/users/:id/emails', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userRes = await db.query(`SELECT email FROM users WHERE id = $1`, [id]);
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
    const userEmail = userRes.rows[0].email;
    const logsRes = await db.query(
      `SELECT id, email_to, email_type, subject, status, error_message, created_at
       FROM email_logs WHERE user_id = $1 OR email_to = $2 ORDER BY created_at DESC LIMIT 50`,
      [id, userEmail]
    );
    res.json({ success: true, email_logs: logsRes.rows });
  } catch (error) {
    console.error('Get user emails error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch email logs' });
  }
});

/** GET /api/admin/error-logs */
router.get('/error-logs', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    const level  = req.query.level  || null;
    const source = req.query.source || null;
    const search = req.query.search || null;
    const conditions = [];
    const params = [];
    let idx = 1;
    if (level)  { conditions.push(`level = $${idx++}`);  params.push(level); }
    if (source) { conditions.push(`source = $${idx++}`); params.push(source); }
    if (search) { conditions.push(`(message ILIKE $${idx} OR path ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = await db.query(`SELECT COUNT(*) FROM error_logs ${where}`, params);
    const total = parseInt(countRes.rows[0].count);
    const logsRes = await db.query(
      `SELECT id, level, source, message, stack, method, path, status_code, user_id, meta, created_at
       FROM error_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );
    res.json({ success: true, error_logs: logsRes.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Get error logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch error logs' });
  }
});

/** GET /api/admin/error-logs/stats */
router.get('/error-logs/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const statsRes = await db.query(
      `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
              COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')  AS last_7d,
              COUNT(*) FILTER (WHERE level = 'fatal' AND created_at > NOW() - INTERVAL '24 hours') AS fatal_24h,
              COUNT(*) AS total FROM error_logs`
    );
    res.json({ success: true, stats: statsRes.rows[0] });
  } catch (error) {
    console.error('Get error log stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch error log stats' });
  }
});

/** DELETE /api/admin/error-logs */
router.delete('/error-logs', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const keepDays = Math.max(1, parseInt(req.query.keepDays) || 30);
    const result = await db.query(`DELETE FROM error_logs WHERE created_at < NOW() - INTERVAL '1 day' * $1`, [keepDays]);
    res.json({ success: true, message: `Deleted ${result.rowCount} error logs older than ${keepDays} days`, deleted: result.rowCount });
  } catch (error) {
    console.error('Clear error logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear error logs' });
  }
});

// ─── Shipping Rates (Admin) ───────────────────────────────────────────────────
// These mirror /api/pricing/rates but are accessible under /api/admin/shipping-rates
// so the admin dashboard can manage them without a separate permission boundary.

/** GET /api/admin/shipping-rates */
router.get('/shipping-rates', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { DEFAULT_RATES_GBP } = await import('../utils/pricing.js');
    let ratesRes;
    try {
      ratesRes = await db.query('SELECT market, rate_gbp FROM shipping_rates ORDER BY updated_at DESC');
    } catch (_) {
      return res.json({ success: true, rates: { ...DEFAULT_RATES_GBP } });
    }
    const rates = { ...DEFAULT_RATES_GBP };
    ratesRes.rows.forEach(r => { rates[r.market] = parseFloat(r.rate_gbp); });
    res.json({ success: true, rates });
  } catch (error) {
    console.error('Admin get shipping rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shipping rates' });
  }
});

/** PUT /api/admin/shipping-rates */
router.put('/shipping-rates', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { rates } = req.body;
    const adminId = req.user.id;

    if (!rates || typeof rates !== 'object') {
      return res.status(400).json({ success: false, message: 'rates object is required' });
    }

    const validMarkets = ['UK', 'USA', 'China'];

    await db.query(`
      CREATE TABLE IF NOT EXISTS shipping_rates (
        id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        market     VARCHAR(10) NOT NULL UNIQUE,
        rate_gbp   NUMERIC(10,4) NOT NULL,
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    for (const [market, rate] of Object.entries(rates)) {
      if (!validMarkets.includes(market)) {
        return res.status(400).json({ success: false, message: `Invalid market: ${market}` });
      }
      const r = parseFloat(rate);
      if (isNaN(r) || r <= 0) {
        return res.status(400).json({ success: false, message: `Invalid rate for ${market}` });
      }
      const { v4: uuidv4Fn } = await import('uuid');
      await db.query(
        `INSERT INTO shipping_rates (id, market, rate_gbp, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (market) DO UPDATE SET rate_gbp=$3, updated_by=$4, updated_at=NOW()`,
        [uuidv4Fn(), market, r, adminId]
      );
    }

    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, 'update_shipping_rates', JSON.stringify(rates)]
    );

    const { DEFAULT_RATES_GBP } = await import('../utils/pricing.js');
    const updatedRaw = await db.query('SELECT market, rate_gbp FROM shipping_rates ORDER BY updated_at DESC');
    const updatedRates = { ...DEFAULT_RATES_GBP };
    updatedRaw.rows.forEach(r => { updatedRates[r.market] = parseFloat(r.rate_gbp); });

    res.json({ success: true, message: 'Shipping rates updated', rates: updatedRates });
  } catch (error) {
    console.error('Admin update shipping rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update shipping rates' });
  }
});

export default router;
