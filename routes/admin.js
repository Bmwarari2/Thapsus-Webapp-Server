import express from 'express';
import crypto from 'crypto';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { sendAdminPasswordResetEmail, sendPaymentRequestEmail, sendOrderCreatedEmail, sendWelcomeAccountEmail, sendPaymentReminderEmail, sendPaymentReceiptEmail } from '../utils/email.js';
import { calculateShippingCost, ELECTRONICS_HANDLING } from '../utils/pricing.js';
import { sendInAppNotification } from '../utils/notifications.js';
import { logRouteError } from '../utils/errorLogger.js';

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
      `SELECT id, email, name, phone, role, warehouse_id, referral_code, wallet_balance, is_active, created_at
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
              wallet_balance, is_active, created_at, updated_at FROM users WHERE id = $1`,
      [id]
    );
    if (!userRes.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

    const orders = await db.query(
      `SELECT id, tracking_number, retailer, market, status, estimated_cost, actual_cost, created_at
       FROM orders WHERE user_id = $1 ORDER BY created_at DESC`, [id]
    );
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
      user: { ...userRes.rows[0], ordersCount: orders.rows.length, orders: orders.rows },
      recentTransactions: transactions.rows,
      referralStats: refStats.rows[0]
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
    const { role, is_active } = req.body;

    if (id === adminId && is_active === false) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account' });
    }

    const userCheck = await db.query('SELECT id, email, name, is_active FROM users WHERE id = $1', [id]);
    if (!userCheck.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });

    const params = [];
    const updates = [];
    if (role !== undefined) {
      if (!['customer','admin'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });
      params.push(role); updates.push(`role = $${params.length}`);
    }
    if (is_active !== undefined) { params.push(is_active); updates.push(`is_active = $${params.length}`); }
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

    const updated = await db.query('SELECT id, email, name, phone, role, warehouse_id, is_active FROM users WHERE id = $1', [id]);
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
      await client.query('DELETE FROM wallet WHERE user_id = $1', [id]);
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
      GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID ? '***set***' : '(NOT SET)',
      GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET ? '***set***' : '(NOT SET)',
      GMAIL_REFRESH_TOKEN: process.env.GMAIL_REFRESH_TOKEN ? '***set***' : '(NOT SET)',
      GMAIL_SENDER_EMAIL: process.env.GMAIL_SENDER_EMAIL || '(NOT SET)',
    };
    const missing = [];
    if (!process.env.GMAIL_CLIENT_ID) missing.push('GMAIL_CLIENT_ID');
    if (!process.env.GMAIL_CLIENT_SECRET) missing.push('GMAIL_CLIENT_SECRET');
    if (!process.env.GMAIL_REFRESH_TOKEN) missing.push('GMAIL_REFRESH_TOKEN');
    if (!process.env.GMAIL_SENDER_EMAIL) missing.push('GMAIL_SENDER_EMAIL');
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
              o.estimated_cost, o.actual_cost, o.created_at, u.name, u.email
       FROM orders o JOIN users u ON o.user_id = u.id
       ${conditions} ORDER BY o.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, orders: orders.rows, pagination: { page, limit, total, totalPages } });
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
    const validStatuses = ['pending','received_at_warehouse','consolidating','in_transit','customs','out_for_delivery','delivered','cancelled'];
    if (!validStatuses.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status' });
    const updatePlaceholders = order_ids.map((_, i) => `$${i + 2}`).join(',');
    await db.query(`UPDATE orders SET status = $1, updated_at = NOW() WHERE id IN (${updatePlaceholders})`, [status, ...order_ids]);
    const selectPlaceholders = order_ids.map((_, i) => `$${i + 1}`).join(',');
    const updated = await db.query(`SELECT id, tracking_number, status FROM orders WHERE id IN (${selectPlaceholders})`, order_ids);
    res.json({ success: true, message: `Updated ${updated.rows.length} orders`, updated_count: updated.rows.length, orders: updated.rows });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ success: false, message: 'Failed to bulk update orders' });
  }
});

/** GET /api/admin/stats */
router.get('/stats', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const [userStats, orderStats, marketStats, statusStats, revenueStats, referralStats] = await Promise.all([
      db.query(`SELECT COUNT(*) AS total, SUM(CASE WHEN role='customer' THEN 1 ELSE 0 END) AS customers, SUM(CASE WHEN role='admin' THEN 1 ELSE 0 END) AS admins, SUM(CASE WHEN is_active=true THEN 1 ELSE 0 END) AS active_users FROM users`),
      db.query(`SELECT COUNT(*) AS total_orders, SUM(CASE WHEN status='delivered' THEN 1 ELSE 0 END) AS delivered, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='in_transit' THEN 1 ELSE 0 END) AS in_transit, AVG(estimated_cost) AS avg_estimated_cost, SUM(estimated_cost) AS total_estimated_value FROM orders`),
      db.query(`SELECT market, COUNT(*) AS count, SUM(estimated_cost) AS value FROM orders GROUP BY market`),
      db.query(`SELECT status, COUNT(*) AS count FROM orders GROUP BY status`),
      db.query(`SELECT COUNT(*) AS total_transactions, SUM(CASE WHEN status='completed' THEN amount ELSE 0 END) AS total_revenue, SUM(CASE WHEN type='deposit' AND status='completed' THEN amount ELSE 0 END) AS deposits, SUM(CASE WHEN type='payment' AND status='completed' THEN amount ELSE 0 END) AS payments FROM transactions`),
      db.query(`SELECT COUNT(*) AS total_referrals, SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_referrals, SUM(CASE WHEN status='completed' THEN reward_amount ELSE 0 END) AS total_rewards_paid FROM referrals`)
    ]);
    res.json({
      success: true,
      stats: { users: userStats.rows[0], orders: orderStats.rows[0], markets: marketStats.rows,
        order_statuses: statusStats.rows, revenue: revenueStats.rows[0], referrals: referralStats.rows[0] }
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch statistics' });
  }
});

/** GET /api/admin/revenue */
router.get('/revenue', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;
    const params = [];
    let filter = "WHERE status = 'completed'";
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
  try {
    const db = req.db;
    const { rates } = req.body;
    const adminId = req.user.id;
    if (!rates || typeof rates !== 'object') return res.status(400).json({ success: false, message: 'rates object is required' });
    const validPairs = ['USD_KES','GBP_KES','EUR_KES','CNY_KES'];
    await db.query('BEGIN');
    try {
      for (const [pair, rate] of Object.entries(rates)) {
        if (!validPairs.includes(pair)) throw new Error(`Invalid currency pair: ${pair}`);
        if (typeof rate !== 'number' || rate <= 0) throw new Error(`Invalid rate for ${pair}`);
        await db.query(
          `INSERT INTO exchange_rates (currency_pair, rate, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
           ON CONFLICT (currency_pair) DO UPDATE SET rate = EXCLUDED.rate, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
          [pair, rate, adminId]
        );
      }
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'update_exchange_rates', JSON.stringify(rates)]);
    res.json({ success: true, message: 'Exchange rates updated successfully', rates });
  } catch (error) {
    console.error('Set exchange rates error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update exchange rates' });
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
      electronics_item = null,
    } = req.body;

    if (!customer_email && !customer_name)
      return res.status(400).json({ success: false, message: 'customer_email or customer_name is required' });

    // Validate electronics_item if provided
    if (electronics_item && !ELECTRONICS_HANDLING[electronics_item]) {
      return res.status(400).json({ success: false, message: `Invalid electronics_item. Valid values: ${Object.keys(ELECTRONICS_HANDLING).join(', ')}` });
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
    if (!['UK','USA','China'].includes(market))
      return res.status(400).json({ success: false, message: 'Invalid market' });
    const speed = shipping_speed || 'economy';
    if (!['economy','express'].includes(speed))
      return res.status(400).json({ success: false, message: 'Invalid shipping speed' });

    // Load admin-configured per-kg rates if available
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
      rates_gbp,
    });

    const orderId = uuidv4();
    const date = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const trackingNumber = `TC-${date}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

    await db.query('BEGIN');
    try {
      await db.query(
        `INSERT INTO orders (id, user_id, tracking_number, retailer, market, status, description, weight_kg, dimensions_json, shipping_speed, insurance, declared_value, estimated_cost)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12)`,
        [orderId, customer.id, trackingNumber, retailer, market, description, weight_kg || null, dimensions ? JSON.stringify(dimensions) : null, speed, insurance ? true : false, declared_value || 0, costBreakdown.total]
      );
      await db.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES ($1,$2,$3,$4,$5,'pending')`,
        [uuidv4(), orderId, customer.id, description, weight_kg || null]
      );
      await db.query(
        'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
        [uuidv4(), adminId, 'create_order_for_client', JSON.stringify({
          order_id: orderId, tracking_number: trackingNumber,
          customer_id: customer.id, customer_email: customer.email,
          electronics_item: electronics_item || null,
        })]
      );
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }

    sendInAppNotification(customer.id, `A new order (${trackingNumber}) has been created for you by Thapsus Cargo.`);

    // Build electronics handling fee note for the order-created email
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
      `${appUrl}/orders`
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

/** PUT /api/admin/orders/:id/cancel */
router.put('/orders/:id/cancel', authMiddleware, isAdmin, async (req, res) => {
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
      await db.query(`UPDATE packages SET status = 'lost', updated_at = NOW() WHERE order_id = $1`, [id]);
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
    const orderRes = await db.query(`SELECT o.*, u.email, u.name AS customer_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1`, [id]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    const paymentAmount = amount || order.actual_cost || order.estimated_cost;
    if (!paymentAmount || paymentAmount <= 0) return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
    const frontendUrl = process.env.FRONTEND_URL || 'https://www.thapsus.uk';
    sendPaymentRequestEmail(order.email, order.customer_name, order.tracking_number, paymentAmount, notes || '', `${frontendUrl}/pay/${id}?amount=${paymentAmount}`).catch(console.error);
    sendInAppNotification(order.user_id, `Payment of KES ${paymentAmount.toLocaleString()} requested for order ${order.tracking_number}.${notes ? ` Note: ${notes}` : ''}`);
    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)', [uuidv4(), adminId, 'request_payment', JSON.stringify({ order_id: id, tracking_number: order.tracking_number, customer_email: order.email, amount: paymentAmount, notes: notes || '' })]);
    res.json({ success: true, message: `Payment request of KES ${paymentAmount.toLocaleString()} sent to ${order.email}`, payment_request: { order_id: id, tracking_number: order.tracking_number, customer: { email: order.email, name: order.customer_name }, amount: paymentAmount, currency: 'KES' } });
  } catch (error) {
    console.error('Request payment error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment request' });
  }
});

/** POST /api/admin/users/create */
router.post('/users/create', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const { name, email, phone, role } = req.body;
    if (!name || !email || !phone) return res.status(400).json({ success: false, message: 'Name, email, and phone are required' });
    const accountRole = role || 'customer';
    if (!['customer', 'admin'].includes(accountRole)) return res.status(400).json({ success: false, message: 'Invalid role. Must be customer or admin' });
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    const userId = uuidv4();
    const warehouseId = generateWarehouseId();
    let referralCode = generateReferralCode();
    while ((await db.query('SELECT id FROM users WHERE referral_code = $1', [referralCode])).rows.length > 0) {
      referralCode = generateReferralCode();
    }
    const tempPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = bcrypt.hashSync(tempPassword, 10);
    const setupToken = crypto.randomBytes(32).toString('hex');
    const setupTokenId = uuidv4();
    const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO users (id, email, password, name, phone, role, warehouse_id, language_pref, referral_code, wallet_balance, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, 'en', $8, 0, true)`, [userId, email.toLowerCase().trim(), passwordHash, name, phone, accountRole, warehouseId, referralCode]);
      await client.query(`INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1, $2, 0, 'KES')`, [uuidv4(), userId]);
      await client.query('INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)', [setupTokenId, userId, setupToken, expiresAt]);
      await client.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)', [uuidv4(), adminId, 'create_user_account', JSON.stringify({ user_id: userId, email: email.toLowerCase().trim(), role: accountRole, warehouse_id: warehouseId })]);
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    sendWelcomeAccountEmail(email.toLowerCase().trim(), name, warehouseId, accountRole, `${frontendUrl}/reset-password?token=${setupToken}`).catch((err) => console.warn('Welcome email failed (non-fatal):', err.message));
    res.status(201).json({ success: true, message: `${accountRole === 'admin' ? 'Admin' : 'User'} account created. Welcome email sent to ${email}.`, user: { id: userId, email: email.toLowerCase().trim(), name, phone, role: accountRole, warehouse_id: warehouseId, referral_code: referralCode, is_active: true } });
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
    const orderRes = await db.query(`SELECT o.*, u.email, u.name AS customer_name FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = $1`, [id]);
    if (!orderRes.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });
    const order = orderRes.rows[0];
    const reminderAmount = amount || order.actual_cost || order.estimated_cost;
    if (!reminderAmount || reminderAmount <= 0) return res.status(400).json({ success: false, message: 'A valid payment amount is required.' });
    const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL || 'https://www.thapsus.uk';
    sendPaymentReminderEmail(order.email, order.customer_name, order.tracking_number, reminderAmount, notes || '', `${frontendUrl}/pay/${id}?amount=${reminderAmount}`).catch(console.error);
    sendInAppNotification(order.user_id, `Reminder: Payment of KES ${reminderAmount.toLocaleString()} is due for order ${order.tracking_number}.${notes ? ` Note: ${notes}` : ''}`);
    await db.query('INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)', [uuidv4(), adminId, 'send_payment_reminder', JSON.stringify({ order_id: id, tracking_number: order.tracking_number, customer_email: order.email, amount: reminderAmount, notes: notes || '' })]);
    res.json({ success: true, message: `Payment reminder sent to ${order.email} for KES ${reminderAmount.toLocaleString()}`, reminder: { order_id: id, tracking_number: order.tracking_number, customer: { email: order.email, name: order.customer_name }, amount: reminderAmount, currency: 'KES' } });
  } catch (error) {
    console.error('Send payment reminder error:', error);
    res.status(500).json({ success: false, message: 'Failed to send payment reminder' });
  }
});

/** GET /api/admin/transactions/pending */
router.get('/transactions/pending', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const transactionsRes = await db.query(`SELECT t.id, t.user_id, t.amount, t.payment_reference, t.created_at, u.id as user_id, u.name, u.email FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.status = 'pending' AND t.payment_method = 'mpesa' ORDER BY t.created_at DESC`, []);
    res.json({ success: true, transactions: transactionsRes.rows });
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
    const transRes = await db.query(`SELECT t.id, t.user_id, t.amount, t.payment_reference, u.name, u.email FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.id = $1`, [id]);
    if (!transRes.rows[0]) return res.status(404).json({ success: false, message: 'Transaction not found' });
    const transaction = transRes.rows[0];
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(`UPDATE transactions SET status = 'completed' WHERE id = $1`, [id]);
      const logsRes = await client.query(`SELECT details FROM admin_logs WHERE action = 'mpesa_payment_submitted' AND details LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`%${id}%`]);
      let orderDetails = null;
      if (logsRes.rows[0]) { try { orderDetails = JSON.parse(logsRes.rows[0].details); } catch (e) {} }
      let trackingNumber = 'N/A';
      if (orderDetails?.order_id) {
        const orderRes = await client.query('SELECT tracking_number FROM orders WHERE id = $1', [orderDetails.order_id]);
        if (orderRes.rows[0]) trackingNumber = orderRes.rows[0].tracking_number;
      }
      await client.query(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)`, [uuidv4(), adminId, 'mpesa_payment_approved', JSON.stringify({ transaction_id: id, user_id: transaction.user_id, amount: transaction.amount, payment_reference: transaction.payment_reference, approved_at: new Date().toISOString() })]);
      await client.query('COMMIT');
      try { await sendPaymentReceiptEmail(transaction.email, transaction.name, trackingNumber, transaction.amount, transaction.payment_reference, new Date().toISOString()); } catch (emailErr) { console.warn('Failed to send receipt email:', emailErr.message); }
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
      await client.query(`INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1, $2, $3, $4)`, [uuidv4(), adminId, 'mpesa_payment_rejected', JSON.stringify({ transaction_id: id, reason: reason || null, rejected_at: new Date().toISOString() })]);
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
    const logsRes = await db.query(`SELECT details FROM admin_logs WHERE action = 'mpesa_payment_submitted' AND details LIKE $1 ORDER BY created_at DESC LIMIT 1`, [`%${id}%`]);
    if (!logsRes.rows[0]) return res.status(404).json({ success: false, message: 'No proof of payment message found for this transaction' });
    const rawDetails = logsRes.rows[0].details;
    let payload = null;
    try { payload = typeof rawDetails === 'string' ? JSON.parse(rawDetails) : rawDetails; } catch (parseError) { console.warn('Failed to parse admin_logs.details for Mpesa proof:', parseError.message || parseError); }
    const mpesaMessage = payload?.mpesa_message || null;
    if (!mpesaMessage) return res.status(404).json({ success: false, message: 'Mpesa message not stored for this transaction' });
    res.json({ success: true, mpesa_message: mpesaMessage, meta: { user_id: payload.user_id, amount: payload.amount, mpesa_code: payload.mpesa_code, order_id: payload.order_id || null, submitted_at: payload.submitted_at || null } });
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
    const logsRes = await db.query(`SELECT id, email_to, email_type, subject, status, error_message, created_at FROM email_logs WHERE user_id = $1 OR email_to = $2 ORDER BY created_at DESC LIMIT 50`, [id, userEmail]);
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
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
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
    const logsRes = await db.query(`SELECT id, level, source, message, stack, method, path, status_code, user_id, meta, created_at FROM error_logs ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, [...params, limit, offset]);
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
    const statsRes = await db.query(`SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h, COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d, COUNT(*) FILTER (WHERE level = 'fatal' AND created_at > NOW() - INTERVAL '24 hours') AS fatal_24h, COUNT(*) AS total FROM error_logs`);
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

export default router;
