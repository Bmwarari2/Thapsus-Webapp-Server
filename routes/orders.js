import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { calculateShippingCost, HS_TIERS } from '../utils/pricing.js';
import { pushToUser, pushToAdmins } from './events.js';
import { logRouteError } from '../utils/errorLogger.js';
import { sendOrderCreatedEmail } from '../utils/email.js';

const router = express.Router();

function generateTrackingNumber() {
  const date   = new Date().toISOString().split('T')[0].replace(/-/g, '');
  // 4 random bytes → 8 hex chars.  Math.random() was a CSPRNG bypass in
  // V8 and gave roughly 1.7M codes/day; crypto.randomBytes pushes the
  // keyspace to ~4B/day so brute-force enumeration of someone else's
  // tracking number stops being feasible under the existing rate limit.
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `TC-${date}-${random}`;
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
    logRouteError(req, res, error, 'Get orders error');
    res.status(500).json({ success: false, message: 'Failed to fetch orders' });
  }
});

/** POST /api/orders */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { retailer, market, description, weight_kg, dimensions, shipping_speed, insurance, declared_value, hs_tier, electronics_item } = req.body;

    if (!retailer || !market || !description)
      return res.status(400).json({ success: false, message: 'Missing required fields: retailer, market, description' });
    if (!['UK', 'China'].includes(market))
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK or China' });
    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed))
      return res.status(400).json({ success: false, message: 'Invalid shipping speed.' });

    const tier = hs_tier || (electronics_item ? 'electronics' : 'general');
    if (!HS_TIERS[tier]) {
      return res.status(400).json({ success: false, message: `Invalid hs_tier. Valid values: ${Object.keys(HS_TIERS).join(', ')}` });
    }

    // Weight and dimensions are now optional at order creation (added by admin later)
    const costBreakdown = weight_kg ? calculateShippingCost({
      weight_kg: weight_kg || 0, dimensions, market, shipping_speed: speed,
      insurance: insurance || false, declared_value: declared_value || 0,
      electronics_item: electronics_item || null, hs_tier: tier,
    }) : { total: 0, breakdown: {} };

    const orderId        = uuidv4();
    const trackingNumber = generateTrackingNumber();

    // Use a dedicated client so all queries run on the SAME connection
    // (pool.query() can dispatch each query to a different connection,
    //  which breaks BEGIN/COMMIT and makes uncommitted rows invisible)
    const client = await db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO orders (id, user_id, tracking_number, retailer, market, status, description,
          weight_kg, dimensions_json, shipping_speed, insurance, declared_value, estimated_cost,
          hs_tier, electronics_item)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [orderId, userId, trackingNumber, retailer, market, description,
          weight_kg || null, dimensions ? JSON.stringify(dimensions) : null,
          speed, insurance ? true : false, declared_value || 0, costBreakdown.total,
          tier, electronics_item || null]
      );
      // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
      // 'pending' is no longer valid — the equivalent intake state is 'pre_registered'.
      await client.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES ($1,$2,$3,$4,$5,'pre_registered')`,
        [uuidv4(), orderId, userId, description, weight_kg || null]
      );

      // Referral reward check — both referrer AND referee get KES 50 of credit.
      // Migration 028 replaced the wallet model with user_credits + credit_ledger;
      // this reward path now bumps the credit balance and appends a ledger row
      // instead of touching wallet/users.wallet_balance/transactions.
      const refResult = await client.query(
        `SELECT id, referrer_id, reward_amount FROM referrals WHERE referee_id = $1 AND status = 'pending' LIMIT 1`,
        [userId]
      );
      const pendingReferral = refResult.rows[0];
      if (pendingReferral) {
        const countRes = await client.query('SELECT COUNT(*) AS cnt FROM orders WHERE user_id = $1', [userId]);
        if (parseInt(countRes.rows[0].cnt) === 1) {
          const reward = 50; // KES 50 for each party

          await client.query(
            `UPDATE referrals SET status = 'completed', completed_at = NOW(), reward_amount = $1 WHERE id = $2`,
            [reward, pendingReferral.id]
          );

          // Ensure both users have a user_credits row, then bump + ledger.
          for (const beneficiary of [pendingReferral.referrer_id, userId]) {
            await client.query(
              `INSERT INTO user_credits (user_id, balance_kes, updated_at)
               VALUES ($1, 0, NOW())
               ON CONFLICT (user_id) DO NOTHING`,
              [beneficiary]
            );
            await client.query(
              `UPDATE user_credits
                  SET balance_kes = balance_kes + $1, updated_at = NOW()
                WHERE user_id = $2`,
              [reward, beneficiary]
            );
            await client.query(
              `INSERT INTO credit_ledger (id, user_id, delta_kes, reason, source_id, note)
               VALUES ($1, $2, $3, 'referral', $4, $5)`,
              [`CRD-RFR-${pendingReferral.id}-${beneficiary === pendingReferral.referrer_id ? 'A' : 'B'}`,
               beneficiary, reward, pendingReferral.id,
               `Referral reward for ${pendingReferral.id}`]
            );
          }

          // SSE push so each user's credit widget refreshes live.
          pushToUser(pendingReferral.referrer_id, 'credit_update', { delta_kes: reward });
          pushToUser(userId, 'credit_update', { delta_kes: reward });
        }
      }

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const newOrder = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    const order    = { ...newOrder.rows[0], dimensions_json: newOrder.rows[0].dimensions_json ? JSON.parse(newOrder.rows[0].dimensions_json) : null, cost_breakdown: costBreakdown };

    // Push to the customer who placed the order + all admins
    pushToUser(userId, 'order_update', { action: 'created', order });
    pushToAdmins('admin_stats', { action: 'new_order', order });

    // Auto-generated confirmation email — same template the admin
    // create-for-client flow uses, so customer-initiated orders get the
    // same receipt. Non-fatal: if Gmail/SMTP isn't configured we log and
    // continue so the order still succeeds.
    try {
      const userRow = await db.query('SELECT email, name FROM users WHERE id = $1', [userId]);
      const customer = userRow.rows[0];
      if (customer?.email) {
        const appUrl = process.env.APP_URL || 'https://www.thapsus.uk';
        const orderForEmail = {
          user_id: userId,
          shipping_cost: costBreakdown.breakdown?.base_shipping?.amount || 0,
          handling_fee:
            (costBreakdown.breakdown?.electronics_handling?.amount || 0) +
            (costBreakdown.breakdown?.handling_fee?.amount || 0),
          insurance_fee: costBreakdown.breakdown?.insurance?.amount || 0,
          customs_duty: costBreakdown.breakdown?.customs_estimate?.amount || 0,
          estimated_cost: costBreakdown.total || 0,
          actual_cost: null,
        };
        sendOrderCreatedEmail(
          customer.email, customer.name || 'Customer',
          trackingNumber, retailer, market, description,
          speed, `${appUrl}/orders`, orderForEmail
        ).catch((err) => console.warn('Order created email failed (non-fatal):', err.message));
      }
    } catch (mailErr) {
      console.warn('Order created email lookup failed (non-fatal):', mailErr.message);
    }

    res.status(201).json({ success: true, message: 'Order created successfully', order });
  } catch (error) {
    console.error('Create order error:', error);
    logRouteError(req, res, error, 'Create order error');
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

    const dims = order.dimensions_json ? JSON.parse(order.dimensions_json) : null;

    // Compute a live cost breakdown so the detail page can show itemised costs
    let cost_breakdown = null;
    try {
      cost_breakdown = calculateShippingCost({
        weight_kg:       order.weight_kg       || 0,
        dimensions:      dims,
        market:          order.market,
        shipping_speed:  order.shipping_speed  || 'economy',
        insurance:       order.insurance       || false,
        declared_value:  order.declared_value  || 0,
        electronics_item: order.electronics_item || null,
      });
    } catch (_) { /* non-fatal — client falls back to estimated_cost */ }

    res.json({
      success: true,
      order: {
        ...order,
        dimensions_json: dims,
        packages: pkgs.rows,
        cost_breakdown,
      },
    });
  } catch (error) {
    console.error('Get order error:', error);
    logRouteError(req, res, error, 'Get order error');
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
    logRouteError(req, res, error, 'Update order status error');
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

export default router;
