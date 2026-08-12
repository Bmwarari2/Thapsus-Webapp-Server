import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { idempotency } from '../middleware/idempotency.js';
import { calculateShippingCost, loadPricingContext, HS_TIERS } from '../utils/pricing.js';
import { pushToUser, pushToAdmins } from './events.js';
import { logRouteError } from '../utils/errorLogger.js';
import { sendOrderCreatedEmail } from '../utils/email.js';
import { insertWithUniqueTrackingNumber } from '../utils/trackingNumber.js';
import { isValidOrderStatus } from '../utils/orderStatuses.js';
import { createSignedDownloadUrl } from '../utils/supabaseAdmin.js';

const router = express.Router();

/** GET /api/orders */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const page   = parseInt(req.query.page)  || 1;
    const limit  = parseInt(req.query.limit) || 10;
    const status = req.query.status;

    const params = [userId];
    let conditions = 'WHERE user_id = $1';
    if (status) { params.push(status); conditions += ` AND status = $${params.length}`; }

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
router.post('/', authMiddleware, idempotency, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { retailer, description, weight_kg, dimensions, shipping_speed, insurance, declared_value, hs_tier, electronics_item, items } = req.body;

    if (!retailer || !description)
      return res.status(400).json({ success: false, message: 'Missing required fields: retailer, description' });
    const speed = shipping_speed || 'economy';
    if (!['economy', 'express'].includes(speed))
      return res.status(400).json({ success: false, message: 'Invalid shipping speed.' });

    const tier = hs_tier || (electronics_item ? 'electronics' : 'general');
    if (!HS_TIERS[tier]) {
      return res.status(400).json({ success: false, message: `Invalid hs_tier. Valid values: ${Object.keys(HS_TIERS).join(', ')}` });
    }

    // Normalise the optional items[] array. Each item gets a default hs_code
    // of 'general' (matches the customer's stated default at the order form)
    // so the per-item customs path always has something to resolve.
    const normalisedItems = Array.isArray(items) && items.length > 0
      ? items.map((it) => ({
          description:    typeof it.description    === 'string' ? it.description : null,
          qty:            Math.max(1, parseInt(it.qty, 10) || 1),
          unit_value_gbp: Math.max(0, parseFloat(it.unit_value_gbp ?? it.declared_value) || 0),
          hs_code:        (typeof it.hs_code === 'string' && it.hs_code.trim()) ? it.hs_code.trim() : 'general',
        }))
      : null;

    // Weight and dimensions are now optional at order creation (added by admin later)
    const pricingCtx = await loadPricingContext(db);
    const costBreakdown = weight_kg ? calculateShippingCost({
      weight_kg: weight_kg || 0, dimensions, shipping_speed: speed,
      insurance: insurance || false, declared_value: declared_value || 0,
      electronics_item: electronics_item || null, hs_tier: tier,
      // Pass items[] when supplied → per-item HS-code lookup → summed customs.
      items: normalisedItems ? normalisedItems.map((it) => ({
        hs_code:        it.hs_code,
        qty:            it.qty,
        declared_value: it.unit_value_gbp,
      })) : null,
      settings:        pricingCtx.settings,
      customsTiers:    pricingCtx.customsTiers,
      hsMap:           pricingCtx.hsMap,
      electronicsFees: pricingCtx.electronicsFees,
    }) : { total: 0, breakdown: {} };

    const orderId = uuidv4();

    // Use a dedicated client so all queries run on the SAME connection
    // (pool.query() can dispatch each query to a different connection,
    //  which breaks BEGIN/COMMIT and makes uncommitted rows invisible)
    const client = await db.connect();
    let trackingNumber;
    try {
      await client.query('BEGIN');

      // Audit P2.4: live DB carries a unique index on
      // orders.tracking_number (orders_tracking_number_key). The previous
      // generator threw a 500 to the customer on the (rare) collision
      // because nothing retried on Postgres 23505. The shared helper
      // re-mints + reissues the INSERT until it lands.
      ({ trackingNumber } = await insertWithUniqueTrackingNumber(client, (tn) =>
        client.query(
          `INSERT INTO orders (id, user_id, tracking_number, retailer, status, description,
            weight_kg, dimensions_json, shipping_speed, insurance, declared_value, estimated_cost,
            hs_tier, electronics_item)
           VALUES ($1,$2,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [orderId, userId, tn, retailer, description,
            weight_kg || null, dimensions ? JSON.stringify(dimensions) : null,
            speed, insurance ? true : false, declared_value || 0, costBreakdown.total,
            tier, electronics_item || null]
        )
      ));
      // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
      // 'pending' is no longer valid — the equivalent intake state is 'pre_registered'.
      await client.query(
        `INSERT INTO packages (id, order_id, user_id, description, weight_kg, status) VALUES ($1,$2,$3,$4,$5,'pre_registered')`,
        [uuidv4(), orderId, userId, description, weight_kg || null]
      );

      // Persist per-item HS codes when the customer supplied items[]. The
      // parcel_items table is the source of truth the customs estimate
      // re-derives from on subsequent quote recomputes. parcel_id refs
      // orders.id (per 001_framework_v2_additions.sql).
      if (normalisedItems) {
        for (const it of normalisedItems) {
          await client.query(
            `INSERT INTO parcel_items (id, parcel_id, description, qty, unit_value_gbp, hs_code)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), orderId, it.description || description, it.qty, it.unit_value_gbp, it.hs_code]
          );
        }
      }

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
          trackingNumber, retailer, description,
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

    // Compute a live cost breakdown so the detail page can show itemised costs.
    // If parcel_items rows exist we use the per-item HS-code path; otherwise
    // fall back to the legacy single hs_tier on the order row.
    let cost_breakdown = null;
    try {
      const itemRows = await db.query(
        'SELECT description, qty, unit_value_gbp, hs_code FROM parcel_items WHERE parcel_id = $1 ORDER BY created_at',
        [id]
      );
      const items = itemRows.rows.length > 0
        ? itemRows.rows.map((it) => ({
            hs_code:        (it.hs_code || 'general'),
            qty:            it.qty || 1,
            declared_value: parseFloat(it.unit_value_gbp) || 0,
          }))
        : null;

      const pricingCtx = await loadPricingContext(db);
      cost_breakdown = calculateShippingCost({
        weight_kg:       order.weight_kg       || 0,
        dimensions:      dims,
        shipping_speed:  order.shipping_speed  || 'economy',
        insurance:       order.insurance       || false,
        declared_value:  order.declared_value  || 0,
        electronics_item: order.electronics_item || null,
        hs_tier:         order.hs_tier || null,
        items,
        settings:        pricingCtx.settings,
        customsTiers:    pricingCtx.customsTiers,
        hsMap:           pricingCtx.hsMap,
        electronicsFees: pricingCtx.electronicsFees,
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

/**
 * GET /api/orders/:id/pod — proof-of-delivery summary for the customer.
 *
 * Returns the most recent successful pod_event for the parcel, with
 * fresh signed download URLs for the photo + signature (5-min TTL,
 * mirrors the rider PWA + admin POD-detail flows). Owner-scoped:
 * admins can fetch any parcel's POD, customers only their own.
 *
 * Used by iOS Past Deliveries section so the customer can see the
 * delivery photo + recipient name without going through admin.
 */
router.get('/:id/pod', authMiddleware, async (req, res) => {
  try {
    const db          = req.db;
    const { id }      = req.params;
    const userId      = req.user.id;
    const isAdminUser = req.user.role === 'admin';

    // Resolve the supplied id to an authoritative orders.id. iOS clients
    // sometimes pass a packages.id (the row they observe locally) instead
    // of the orders.id that pod_events.parcel_id references — both id
    // shapes are uuids so we can't tell them apart from the URL alone.
    // Try orders first; if no match, look up the package and follow its
    // order_id pointer. Ownership is gated against the parent orders row
    // either way (customers only see PODs for their own parcels).
    let own = isAdminUser
      ? await db.query('SELECT id, tracking_number FROM orders WHERE id = $1', [id])
      : await db.query('SELECT id, tracking_number FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);
    if (own.rows.length === 0) {
      const viaPkg = isAdminUser
        ? await db.query(
            `SELECT o.id, o.tracking_number
               FROM packages p JOIN orders o ON o.id = p.order_id
              WHERE p.id = $1`,
            [id]
          )
        : await db.query(
            `SELECT o.id, o.tracking_number
               FROM packages p JOIN orders o ON o.id = p.order_id
              WHERE p.id = $1 AND o.user_id = $2`,
            [id, userId]
          );
      if (viaPkg.rows.length === 0) {
        return res.status(404).json({ success: false, message: 'Order not found' });
      }
      own = viaPkg;
    }
    const orderId = own.rows[0].id;

    // Latest successful POD wins. Riders shouldn't be re-POD'ing a
    // delivered parcel, but if they did the most recent capture is the
    // authoritative one.
    const podRes = await db.query(
      `SELECT id, captured_at, photo_url, photo_path,
              signature_url, signature_path,
              recipient_name, recipient_phone, notes
         FROM pod_events
        WHERE parcel_id = $1 AND result = 'delivered'
        ORDER BY captured_at DESC
        LIMIT 1`,
      [orderId]
    );
    if (podRes.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No POD recorded for this parcel yet' });
    }
    const pod = podRes.rows[0];

    // Mint short-lived signed download URLs. The pods bucket is private
    // (mig 015), so we never return a raw object URL — every read goes
    // through a fresh signed URL the iOS app must use immediately.
    //
    // `createSignedDownloadUrl` returns the supabase-js envelope
    // `{ signedUrl, token, path }`, NOT a string. Earlier code assigned
    // the whole object to `photoUrl`, so when signing succeeded the iOS
    // DTO (`photo_url: String?`) failed to deserialize; when signing
    // failed, the silent `.catch(() => null)` masked the real cause and
    // the customer just saw an empty photo slot. Both modes fixed here:
    //   • extract `.signedUrl` so the response field is a plain string
    //   • log the swallowed error so we can see WHY signing failed
    //     (missing service key, bucket misconfig, path drift, etc.)
    //     without losing the customer-visible 404→null fallback.
    const signOrNull = async (label, path) => {
      if (!path) return null;
      try {
        const data = await createSignedDownloadUrl('pods', path, 300);
        return data?.signedUrl ?? null;
      } catch (err) {
        console.error(`[orders/pod] ${label} signing failed for path "${path}":`, err);
        logRouteError(req, res, err, `pod ${label} signing failed`);
        return null;
      }
    };
    const photoUrl = await signOrNull('photo', pod.photo_path);
    const signatureUrl = await signOrNull('signature', pod.signature_path);

    res.json({
      success: true,
      pod: {
        id: pod.id,
        captured_at: pod.captured_at,
        recipient_name: pod.recipient_name,
        recipient_phone: pod.recipient_phone,
        notes: pod.notes,
        photo_url: photoUrl,
        signature_url: signatureUrl,
        tracking_number: own.rows[0].tracking_number,
      },
    });
  } catch (error) {
    console.error('Get POD error:', error);
    logRouteError(req, res, error, 'Get POD error');
    res.status(500).json({ success: false, message: 'Failed to fetch POD' });
  }
});

/** PUT /api/orders/:id/status  (admin only) */
router.put('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, actual_cost, customs_duty } = req.body;

    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
    if (!isValidOrderStatus(status)) return res.status(400).json({ success: false, message: 'Invalid status' });

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
