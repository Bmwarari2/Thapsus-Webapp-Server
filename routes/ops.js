/**
 * routes/ops.js — operator console (Spec §3.3, §4.3).
 *
 *   GET  /api/ops/today               — today's parcels view
 *   GET  /api/ops/parcels             — full parcel grid (filterable)
 *   POST /api/ops/parcels/:id/receive — barcode-driven receive workflow
 *   POST /api/ops/parcels/:id/screen  — re-run prohibited / DG screen
 *   POST /api/ops/parcels/:id/hold    — flag a parcel as held
 *   POST /api/ops/parcels/:id/release — clear a hold
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { checkItem as checkProhibited } from '../utils/prohibited.js';
import { notifyParcelStatus } from '../utils/parcelStatusNotify.js';

const router = express.Router();
const ALLOWED = requireRole('operator');

function calcVolumetric(dims) {
  if (!dims || !dims.length || !dims.width || !dims.height) return 0;
  return parseFloat(((dims.length * dims.width * dims.height) / 6000).toFixed(2));
}

/** GET /api/ops/today — operator dashboard */
router.get('/today', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const expected = await req.db.query(`
      SELECT COUNT(*)::int AS count FROM orders
       WHERE status = 'pending'
         AND created_at >= NOW() - INTERVAL '14 days'`);
    const received = await req.db.query(`
      SELECT COUNT(*)::int AS count FROM orders
       WHERE status = 'received_at_warehouse'`);
    const consolidating = await req.db.query(`
      SELECT COUNT(*)::int AS count FROM orders WHERE status = 'consolidating'`);
    const inTransit = await req.db.query(`
      SELECT COUNT(*)::int AS count FROM orders WHERE status = 'in_transit'`);
    const held = await req.db.query(`
      SELECT COUNT(*)::int AS count FROM orders
       WHERE hold_reason IS NOT NULL AND hold_resolved_at IS NULL`);

    res.json({
      success: true,
      today: {
        expected:      expected.rows[0].count,
        received:      received.rows[0].count,
        consolidating: consolidating.rows[0].count,
        in_transit:    inTransit.rows[0].count,
        held:          held.rows[0].count,
      },
    });
  } catch (err) {
    console.error('GET /ops/today error:', err);
    res.status(500).json({ success: false, message: 'Failed to load operator dashboard' });
  }
});

/** GET /api/ops/parcels — filterable parcel grid */
router.get('/parcels', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { status, q } = req.query;
    const params = [];
    const where  = [];
    if (status) { params.push(status); where.push(`o.status = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      where.push(`(o.tracking_number ILIKE $${params.length} OR o.description ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await req.db.query(
      `SELECT o.*, u.email, u.name, u.warehouse_id
         FROM orders o
         JOIN users u ON u.id = o.user_id
         ${wsql}
         ORDER BY o.created_at DESC
         LIMIT 200`,
      params
    );
    res.json({ success: true, parcels: rows });
  } catch (err) {
    console.error('GET /ops/parcels error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch parcels' });
  }
});

/** POST /api/ops/parcels/:id/receive  — barcode-driven receive */
router.post('/parcels/:id/receive', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { id } = req.params;
    const { weight_kg, dimensions, photo_url, barcode, customs_duty } = req.body;

    const volumetric = calcVolumetric(dimensions);
    const chargeable = Math.max(parseFloat(weight_kg) || 0, volumetric);
    // Customs duty is operator-stamped at receive (the customer no longer
    // has weight + dims at order time, so the cost-side fields all
    // settle here). Treat any non-numeric input as "leave unchanged" so
    // a partial UI submit (e.g. just weight + dims) doesn't blank a duty
    // an admin already set.
    const dutyParsed = customs_duty === undefined || customs_duty === null || customs_duty === ''
      ? null
      : Number.parseFloat(customs_duty);
    const dutyValue = Number.isFinite(dutyParsed) ? dutyParsed : null;

    const orderUpdate = await req.db.query(
      `UPDATE orders
          SET status = 'received_at_warehouse',
              weight_kg = COALESCE($1, weight_kg),
              dimensions_json = COALESCE($2, dimensions_json),
              volumetric_kg = $3,
              chargeable_kg = $4,
              customs_duty = COALESCE($5, customs_duty),
              photographed_at = CASE WHEN $6::text IS NOT NULL THEN NOW() ELSE photographed_at END,
              updated_at = NOW()
        WHERE id = $7`,
      [weight_kg || null,
       dimensions ? JSON.stringify(dimensions) : null,
       volumetric,
       chargeable,
       dutyValue,
       photo_url || null,
       id]
    );

    if (orderUpdate.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: 'No order found for this id — package may be unlinked. Contact admin.',
      });
    }

    // The package row must always flip to 'received_at_warehouse' on receive,
    // even when the operator didn't scan a barcode or attach a photo (those
    // are nullable inputs). Previously this was gated on `barcode || photo_url`,
    // which left packages stuck at 'pre_registered' and zeroed out the
    // operator's "Ready to consolidate" KPI for any weight-only intake.
    // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
    // 'received' was renamed to 'received_at_warehouse' under the v2 PackageStatus enum.
    await req.db.query(
      `UPDATE packages
          SET barcode = COALESCE($1, barcode),
              photo_url = COALESCE($2, photo_url),
              status = 'received_at_warehouse',
              received_at = NOW()
        WHERE order_id = $3`,
      [barcode || null, photo_url || null, id]
    );

    // Best-effort customer notification + SSE push. Fire-and-forget: the
    // intake operator's success response must not wait on Gmail, and a
    // mail-server outage must not roll back the warehouse-receive flip.
    notifyParcelStatus(req.db, id, 'received_at_warehouse').catch((err) =>
      console.warn('notifyParcelStatus(received_at_warehouse) failed:', err.message)
    );

    res.json({
      success: true,
      weight_kg: parseFloat(weight_kg) || 0,
      volumetric_kg: volumetric,
      chargeable_kg: chargeable,
      customs_duty: dutyValue,
    });
  } catch (err) {
    console.error('POST /ops/parcels/:id/receive error:', err);
    res.status(500).json({ success: false, message: 'Failed to receive parcel' });
  }
});

/** POST /api/ops/parcels/:id/screen — prohibited / DG re-screen */
router.post('/parcels/:id/screen', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { id } = req.params;
    const { description } = req.body;
    const result = checkProhibited(description || '');

    // checkItem returns { allowed, reason, category, risk_level } — map to
    // the spec's three-state screening_result enum:
    //   high → 'held' (prohibited),  medium/low → 'dg_suspect' (restricted)
    let screening = 'clean';
    if (result && !result.allowed) {
      screening = result.risk_level === 'high' ? 'held' : 'dg_suspect';
    }

    // Audit P2.2: the legacy cascade wrote `packages.status='pending'` on
    // a 'held' screen. Migration 002 widened packages.status to the v2
    // CHECK list (pre_registered, received_at_warehouse, …, held,
    // held_at_nairobi_hub, …) and dropped the legacy 'pending' value
    // entirely — every high-risk re-screen 500'd against
    // `check_violation` on `packages_status_check` and the screening_result
    // column never updated either (the whole UPDATE rolled back).
    //
    // Use the v2-allowed 'held' value. orders.hold_reason carries the
    // screening category for the hold pill on the operator board.
    await req.db.query(
      `UPDATE packages
          SET screening_result = $1,
              status = CASE WHEN $1 = 'held' THEN 'held' ELSE status END,
              updated_at = NOW()
        WHERE order_id = $2`,
      [screening, id]
    );

    if (screening === 'held') {
      await req.db.query(
        `UPDATE orders SET hold_reason = $1, updated_at = NOW() WHERE id = $2`,
        [`screening_${result?.category || 'prohibited'}`, id]
      );
    }

    res.json({ success: true, screening_result: screening, detail: result });
  } catch (err) {
    console.error('POST /ops/parcels/:id/screen error:', err);
    res.status(500).json({ success: false, message: 'Failed to screen parcel' });
  }
});

/** POST /api/ops/parcels/:id/hold */
router.post('/parcels/:id/hold', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    await req.db.query(
      `UPDATE orders SET hold_reason = $1, hold_resolved_at = NULL, updated_at = NOW()
        WHERE id = $2`,
      [reason || 'manual_hold', id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /ops/parcels/:id/hold error:', err);
    res.status(500).json({ success: false, message: 'Failed to hold parcel' });
  }
});

/** POST /api/ops/parcels/:id/release */
router.post('/parcels/:id/release', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { id } = req.params;
    await req.db.query(
      `UPDATE orders SET hold_resolved_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /ops/parcels/:id/release error:', err);
    res.status(500).json({ success: false, message: 'Failed to release parcel' });
  }
});

/**
 * GET /api/ops/parcels/:id/customer — Phase C label lookup. Operators need
 * the customer's display name + personal warehouse code (TC-XXXX) on the
 * printed SKU label so a parcel sitting on the warehouse shelf can be tied
 * back to a single user. The orders table only carries user_id; this is the
 * smallest projection that keeps PII off the per-parcel listing endpoint.
 */
router.get('/parcels/:id/customer', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await req.db.query(
      `SELECT COALESCE(u.full_name, u.name) AS full_name, u.warehouse_id
         FROM orders o
         JOIN users  u ON u.id = o.user_id
        WHERE o.id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({
      success: true,
      customer: {
        full_name: rows[0].full_name,
        warehouse_id: rows[0].warehouse_id,
      },
    });
  } catch (err) {
    console.error('GET /ops/parcels/:id/customer error:', err);
    res.status(500).json({ success: false, message: 'Failed to load customer' });
  }
});

/**
 * GET /api/ops/parcels/by-barcode/:barcode — operator SKU scan lookup.
 * Returns the full operator-scope projection for the matching parcel so the
 * iOS scanner can route to either the Receive sheet (pre_registered) or a
 * detail panel (everything else). Trims + uppercases the input so a slightly
 * dirty Code 128 read still hits.
 */
router.get('/parcels/by-barcode/:barcode', authMiddleware, ALLOWED, async (req, res) => {
  try {
    const raw = String(req.params.barcode || '').trim().toUpperCase();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'barcode is required' });
    }
    const { rows } = await req.db.query(
      `SELECT p.id            AS package_id,
              p.order_id,
              p.barcode,
              p.status        AS package_status,
              p.retailer,
              p.description,
              p.declared_value_gbp_pence,
              p.actual_kg,
              p.volumetric_kg,
              p.chargeable_kg,
              p.length_cm,
              p.width_cm,
              p.height_cm,
              p.photo_url,
              p.received_at,
              p.photographed_at,
              p.consolidation_id,
              p.is_consolidated,
              p.hold_reason     AS package_hold_reason,
              o.id              AS order_id_full,
              o.tracking_number,
              o.status          AS order_status,
              o.market,
              o.hold_reason     AS order_hold_reason,
              o.hold_resolved_at,
              c.master_awb_no,
              c.departure_at,
              c.status          AS consolidation_status,
              COALESCE(u.full_name, u.name) AS full_name,
              u.warehouse_id,
              u.email           AS customer_email,
              u.phone           AS customer_phone
         FROM packages p
         LEFT JOIN orders        o ON o.id = p.order_id
         LEFT JOIN consolidations c ON c.id = p.consolidation_id
         LEFT JOIN users         u ON u.id = COALESCE(o.user_id, p.user_id)
        WHERE upper(p.barcode) = $1
        LIMIT 1`,
      [raw]
    );
    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No parcel with that SKU. Was the label re-minted?',
      });
    }
    const r = rows[0];
    res.json({
      success: true,
      parcel: {
        package_id:                  r.package_id,
        order_id:                    r.order_id_full || r.order_id,
        barcode:                     r.barcode,
        tracking_number:             r.tracking_number,
        package_status:              r.package_status,
        order_status:                r.order_status,
        retailer:                    r.retailer,
        description:                 r.description,
        market:                      r.market,
        declared_value_gbp_pence:    r.declared_value_gbp_pence,
        actual_kg:                   r.actual_kg,
        volumetric_kg:               r.volumetric_kg,
        chargeable_kg:               r.chargeable_kg,
        length_cm:                   r.length_cm,
        width_cm:                    r.width_cm,
        height_cm:                   r.height_cm,
        photo_url:                   r.photo_url,
        received_at:                 r.received_at,
        photographed_at:             r.photographed_at,
        is_consolidated:             r.is_consolidated,
        consolidation_id:            r.consolidation_id,
        consolidation_master_awb:    r.master_awb_no,
        consolidation_flight_date:   r.departure_at,
        consolidation_status:        r.consolidation_status,
        hold_reason:                 r.order_hold_reason || r.package_hold_reason,
        hold_resolved_at:            r.hold_resolved_at,
        customer: {
          full_name:    r.full_name,
          warehouse_id: r.warehouse_id,
          email:        r.customer_email,
          phone:        r.customer_phone,
        },
      },
    });
  } catch (err) {
    console.error('GET /ops/parcels/by-barcode/:barcode error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to look up parcel',
      detail: err?.message || null,
    });
  }
});

export default router;
