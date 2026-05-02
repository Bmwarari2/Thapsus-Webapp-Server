/**
 * routes/customerConsolidations.js
 *
 * Two-tier consolidation lifecycle (Phase 2 of the customer-flow rework):
 *   1. customer_consolidations  — admin groups a single user's parcels +
 *                                 stamps an invoice the user pays
 *   2. consolidations           — pre-existing weekly shipping unit;
 *                                 multiple paid customer-consolidations
 *                                 batch into one of these
 *
 * Mounts under /api at server.js. Admin-only writes (operator gets
 * read access too via requireRole's admin-passthrough). Customer
 * reads of their own rows go via the supabase_realtime channel
 * (RLS policy in migration 025) so this file doesn't expose a
 * customer GET — iOS observes the realtime channel directly.
 *
 * Side-effects fan out via utils/parcelStatusNotify when invoices are
 * minted or paid so the customer's iOS NotificationInbox lights up
 * without a poll.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { sendInvoiceReadyEmail, sendInvoicePaidEmail } from '../utils/email.js';
import { pushToUser, pushToAdmins } from './events.js';

const router = express.Router();
const ALLOWED_ADMIN = requireRole('admin');

/**
 * Look up the customer record so the email/SSE/in-app notification
 * paths have a name to address. Mirrors loadParcelOwner in
 * utils/parcelStatusNotify.js but keyed by user_id rather than parcel_id.
 */
async function loadUser(client, userId) {
  const { rows } = await client.query(
    `SELECT id, email, name FROM users WHERE id = $1`,
    [userId]
  );
  return rows[0] || null;
}

/**
 * Best-effort customer fan-out for the invoice lifecycle. Mirrors the
 * pattern in parcelStatusNotify (in-app + SSE + email, all swallowed
 * on failure so the admin's status flip doesn't roll back).
 */
async function notifyInvoice(client, customerConsolidation, kind) {
  const owner = await loadUser(client, customerConsolidation.user_id).catch(() => null);
  if (!owner || !owner.email) return;

  const amount = Number(customerConsolidation.invoice_amount || 0).toLocaleString();
  const currency = customerConsolidation.invoice_currency || 'KES';
  const message =
    kind === 'invoiced'
      ? `Your shipping invoice of ${currency} ${amount} is ready.`
      : `Payment received — ${currency} ${amount}. Thanks!`;

  // In-app feed
  try {
    await client.query(
      `INSERT INTO notifications (id, user_id, type, message)
         VALUES ($1, $2, 'in_app', $3)`,
      [`NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, owner.id, message]
    );
  } catch (err) {
    console.warn('[customer-consolidation] in-app insert failed:', err.message);
  }

  // SSE push for the React webapp
  try {
    pushToUser(owner.id, 'invoice_update', {
      action: kind,
      customer_consolidation_id: customerConsolidation.id,
      amount: customerConsolidation.invoice_amount,
      currency,
    });
    pushToAdmins('admin_stats', { action: `invoice_${kind}`, customer_consolidation_id: customerConsolidation.id });
  } catch (err) {
    console.warn('[customer-consolidation] SSE push failed:', err.message);
  }

  // Transactional email (fire-and-forget)
  const sendErr = (label) => (err) =>
    console.warn(`[customer-consolidation] ${label} email failed (non-fatal): ${err.message}`);

  if (kind === 'invoiced') {
    sendInvoiceReadyEmail(
      owner.email,
      owner.name,
      customerConsolidation.id,
      customerConsolidation.invoice_amount,
      currency
    ).catch(sendErr('invoice_ready'));
  } else if (kind === 'paid') {
    sendInvoicePaidEmail(
      owner.email,
      owner.name,
      customerConsolidation.id,
      customerConsolidation.invoice_amount,
      currency
    ).catch(sendErr('invoice_paid'));
  }
}

/**
 * GET /api/customer-consolidations  (admin)
 *
 * Filterable list for the admin console — by user_id, status, or
 * shipping_consolidation_id. Returns the row plus a parcel count so the
 * admin UI can render summary cards without an N+1.
 */
router.get('/', authMiddleware, ALLOWED_ADMIN, async (req, res) => {
  try {
    const { user_id, status, shipping_consolidation_id } = req.query;
    const params = [];
    const where = [];
    if (user_id) { params.push(user_id); where.push(`cc.user_id = $${params.length}`); }
    if (status) { params.push(status); where.push(`cc.status = $${params.length}`); }
    if (shipping_consolidation_id) {
      params.push(shipping_consolidation_id);
      where.push(`cc.shipping_consolidation_id = $${params.length}::uuid`);
    }
    const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await req.db.query(
      `SELECT cc.*, u.email AS user_email, u.name AS user_name,
              (SELECT COUNT(*)::int FROM packages p
                 WHERE p.customer_consolidation_id = cc.id) AS parcel_count
         FROM customer_consolidations cc
         JOIN users u ON u.id = cc.user_id
         ${wsql}
         ORDER BY cc.created_at DESC
         LIMIT 200`,
      params
    );
    res.json({ success: true, customer_consolidations: rows });
  } catch (err) {
    console.error('GET /customer-consolidations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch customer consolidations' });
  }
});

/**
 * POST /api/customer-consolidations  (admin)
 *
 * Mints a customer-consolidation by selecting parcels owned by a single
 * user. Validates:
 *   • parcel_ids is non-empty
 *   • every parcel belongs to user_id
 *   • every parcel is at status='received_at_warehouse' (the only
 *     state where consolidation makes sense)
 *   • no parcel is already attached to another customer_consolidation
 *
 * Body: { user_id, parcel_ids: string[], notes? }
 * Returns: { success, customer_consolidation_id }
 */
router.post('/', authMiddleware, ALLOWED_ADMIN, async (req, res) => {
  try {
    const { user_id, parcel_ids, notes } = req.body;
    if (!user_id) return res.status(400).json({ success: false, message: 'user_id is required' });
    if (!Array.isArray(parcel_ids) || parcel_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'parcel_ids must be a non-empty array' });
    }
    if (parcel_ids.length > 200) {
      return res.status(400).json({ success: false, message: 'too many parcels (max 200 per consolidation)' });
    }

    const client = await req.db.connect();
    let id;
    try {
      await client.query('BEGIN');

      // Validate parcel ownership + state in one query so a typo in any
      // id surfaces with the full diagnosis instead of a confusing
      // partial commit.
      const { rows: parcels } = await client.query(
        `SELECT p.id, p.user_id, p.status, p.customer_consolidation_id
           FROM packages p
          WHERE p.id = ANY($1::text[])`,
        [parcel_ids]
      );
      const found = new Set(parcels.map(p => p.id));
      const missing = parcel_ids.filter(p => !found.has(p));
      if (missing.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ success: false, message: `Unknown parcel id(s): ${missing.join(', ')}` });
      }
      const wrongOwner = parcels.filter(p => p.user_id !== user_id);
      if (wrongOwner.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Parcel(s) belong to another user: ${wrongOwner.map(p => p.id).join(', ')}`,
        });
      }
      const wrongStatus = parcels.filter(p => p.status !== 'received_at_warehouse');
      if (wrongStatus.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Parcels must be received_at_warehouse. Skipped: ${wrongStatus.map(p => `${p.id} (${p.status})`).join(', ')}`,
        });
      }
      const alreadyGrouped = parcels.filter(p => p.customer_consolidation_id);
      if (alreadyGrouped.length > 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          message: `Parcels already in another customer-consolidation: ${alreadyGrouped.map(p => p.id).join(', ')}`,
        });
      }

      const ins = await client.query(
        `INSERT INTO customer_consolidations (user_id, status, notes, created_by)
         VALUES ($1, 'pending', $2, $3)
         RETURNING id`,
        [user_id, notes || null, req.user.id]
      );
      id = ins.rows[0].id;

      await client.query(
        `UPDATE packages
            SET customer_consolidation_id = $1::uuid,
                updated_at = NOW()
          WHERE id = ANY($2::text[])`,
        [id, parcel_ids]
      );

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.status(201).json({ success: true, customer_consolidation_id: id });
  } catch (err) {
    console.error('POST /customer-consolidations error:', err);
    res.status(500).json({ success: false, message: 'Failed to create customer consolidation' });
  }
});

/**
 * PATCH /api/customer-consolidations/:id/invoice  (admin)
 *
 * Stamps the invoice. Status flips pending → invoiced, the customer
 * gets the invoice email + in-app + SSE push. Idempotent on a
 * re-PATCH (amount can be revised; status stays 'invoiced').
 *
 * Body: { amount, currency? }
 */
router.patch('/:id/invoice', authMiddleware, ALLOWED_ADMIN, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, currency } = req.body;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ success: false, message: 'amount must be a positive number' });
    }

    const client = await req.db.connect();
    let row;
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT * FROM customer_consolidations WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Customer consolidation not found' });
      }
      const previous = cur.rows[0];
      // Forward-only on the lifecycle: shipped/paid rows shouldn't get
      // re-invoiced. Allow pending → invoiced and invoiced → invoiced
      // (revised amount).
      if (!['pending', 'invoiced'].includes(previous.status)) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cannot invoice from status '${previous.status}'`,
        });
      }
      const upd = await client.query(
        `UPDATE customer_consolidations
            SET invoice_amount = $1,
                invoice_currency = COALESCE($2, invoice_currency),
                invoice_status = 'pending',
                status = 'invoiced'
          WHERE id = $3
          RETURNING *`,
        [numericAmount, currency || null, id]
      );
      row = upd.rows[0];
      // Side-effects piggyback on the same client so the in-app row
      // commits with the invoice flip.
      await notifyInvoice(client, row, 'invoiced');
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, customer_consolidation: row });
  } catch (err) {
    console.error('PATCH /customer-consolidations/:id/invoice error:', err);
    res.status(500).json({ success: false, message: 'Failed to set invoice' });
  }
});

/**
 * POST /api/customer-consolidations/:id/mark-paid  (admin)
 *
 * Admin manually marks the invoice as paid (e.g. wallet top-up, M-Pesa
 * STK confirmation, or off-platform settlement). Status flips
 * invoiced → paid, customer gets the receipt email + in-app push.
 */
router.post('/:id/mark-paid', authMiddleware, ALLOWED_ADMIN, async (req, res) => {
  try {
    const { id } = req.params;
    const client = await req.db.connect();
    let row;
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        `SELECT * FROM customer_consolidations WHERE id = $1 FOR UPDATE`,
        [id]
      );
      if (cur.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Customer consolidation not found' });
      }
      const previous = cur.rows[0];
      if (previous.status !== 'invoiced') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Cannot mark paid from status '${previous.status}'`,
        });
      }
      const upd = await client.query(
        `UPDATE customer_consolidations
            SET status = 'paid',
                invoice_status = 'paid',
                invoice_paid_at = NOW()
          WHERE id = $1
          RETURNING *`,
        [id]
      );
      row = upd.rows[0];
      await notifyInvoice(client, row, 'paid');
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, customer_consolidation: row });
  } catch (err) {
    console.error('POST /customer-consolidations/:id/mark-paid error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark paid' });
  }
});

/**
 * POST /api/consolidations/:shippingId/attach-customer-consolidations  (admin)
 *
 * Batches one or more *paid* customer_consolidations into a shipping
 * consolidation (the existing weekly flight unit). Sets:
 *   - customer_consolidations.shipping_consolidation_id
 *   - customer_consolidations.status = 'shipped'
 *   - packages.consolidation_id = shippingId  (denormalised mirror so
 *     the existing operator dispatch board / manifest queries keep
 *     working without joining through customer_consolidations)
 *
 * Body: { customer_consolidation_ids: string[] }
 *
 * Mounted at /api (not /api/consolidations) so the path makes sense
 * — the operator dispatch board would otherwise need a separate
 * mount. Server.js wires it up.
 */
router.post('/attach-to-shipping/:shippingId', authMiddleware, ALLOWED_ADMIN, async (req, res) => {
  try {
    const { shippingId } = req.params;
    const { customer_consolidation_ids } = req.body;
    if (!Array.isArray(customer_consolidation_ids) || customer_consolidation_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'customer_consolidation_ids must be a non-empty array' });
    }

    const client = await req.db.connect();
    let attached;
    try {
      await client.query('BEGIN');

      const ship = await client.query(
        `SELECT id, status FROM consolidations WHERE id = $1::uuid`,
        [shippingId]
      );
      if (ship.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Shipping consolidation not found' });
      }

      const customers = await client.query(
        `SELECT id, status FROM customer_consolidations
          WHERE id = ANY($1::uuid[])
          FOR UPDATE`,
        [customer_consolidation_ids]
      );
      const notPaid = customers.rows.filter(c => c.status !== 'paid');
      if (notPaid.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: `Customer consolidations must be paid before shipping. Skipped: ${notPaid.map(c => `${c.id} (${c.status})`).join(', ')}`,
        });
      }

      await client.query(
        `UPDATE customer_consolidations
            SET shipping_consolidation_id = $1::uuid,
                status = 'shipped'
          WHERE id = ANY($2::uuid[])`,
        [shippingId, customer_consolidation_ids]
      );

      // Mirror to packages.consolidation_id so existing manifest /
      // dispatch queries that read the shipping linkage off packages
      // continue to work unchanged.
      await client.query(
        `UPDATE packages
            SET consolidation_id = $1::uuid,
                consolidated_with = $1::text,
                is_consolidated = true,
                updated_at = NOW()
          WHERE customer_consolidation_id = ANY($2::uuid[])`,
        [shippingId, customer_consolidation_ids]
      );

      attached = customer_consolidation_ids.length;
      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    res.json({ success: true, attached });
  } catch (err) {
    console.error('POST /customer-consolidations/attach-to-shipping/:shippingId error:', err);
    res.status(500).json({ success: false, message: 'Failed to attach to shipping consolidation' });
  }
});

export default router;
