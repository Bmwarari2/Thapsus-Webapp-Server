/**
 * routes/consolidationsV2.js
 *
 * Operator + admin endpoints for the weekly UK→NBO flight unit
 * (Webapp Spec §4.4).  Distinct from the legacy customer-facing
 * routes/consolidation.js — that file stays in place for backwards
 * compatibility with the existing customer portal.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();
const ALLOWED_OPERATOR = requireRole('operator');

/* ──────────────────────────────────────────────────────────────────────────
 *  Helpers
 * ──────────────────────────────────────────────────────────────────────── */
function shortId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Resolve the "current" consolidation — the open one whose cut-off is in
 * the future.  Used by the public cut-off countdown banner.
 */
async function findCurrentConsolidation(db) {
  const { rows } = await db.query(
    `SELECT * FROM consolidations
     WHERE status = 'open' AND cutoff_at > NOW()
     ORDER BY cutoff_at ASC
     LIMIT 1`
  );
  return rows[0] || null;
}

/* ──────────────────────────────────────────────────────────────────────────
 *  PUBLIC — current cut-off (used by the home-page banner)
 * ──────────────────────────────────────────────────────────────────────── */

/** GET /api/consolidations/current — public, no auth */
router.get('/current', async (req, res) => {
  try {
    const current = await findCurrentConsolidation(req.db);
    if (!current) {
      return res.json({ success: true, consolidation: null });
    }
    res.json({
      success: true,
      consolidation: {
        id: current.id,
        week_start: current.week_start,
        cutoff_at:  current.cutoff_at,
        departure_at: current.departure_at,
        total_kg: current.total_kg,
        total_parcels: current.total_parcels,
      },
    });
  } catch (err) {
    console.error('GET /consolidations/current error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch current consolidation' });
  }
});

/**
 * GET /api/consolidations/customer/:id — read-only consolidation summary
 * for an authenticated customer who owns at least one parcel inside it.
 * Used by the iOS "your weekly flight" card.
 */
router.get('/customer/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const ownership = await req.db.query(
      `SELECT 1 FROM packages WHERE consolidation_id = $1 AND user_id = $2 LIMIT 1`,
      [id, req.user.id]
    );
    if (ownership.rows.length === 0) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { rows } = await req.db.query(
      `SELECT id, week_start, cutoff_at, departure_at, arrival_at,
              status, total_kg, total_parcels
         FROM consolidations WHERE id = $1`, [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Consolidation not found' });
    }
    // Recompute the visible totals on read. The cached `consolidations.total_kg`
    // gets stamped at consolidation-build time but never refreshes when the
    // operator records weight at receive — so customers see "3 parcels · 0 kg"
    // even after every parcel has been weighed (audit E2). Source of truth:
    // packages.weight_kg, falling back to orders.weight_kg for legacy rows
    // where the package was created before the weight column populated.
    const totals = await req.db.query(
      `SELECT COUNT(*)::int AS total_parcels,
              COALESCE(SUM(COALESCE(p.weight_kg, o.weight_kg, 0))::numeric, 0)::float AS total_kg
         FROM packages p
         LEFT JOIN orders o ON o.id = p.order_id
        WHERE p.consolidation_id = $1`,
      [id]
    );
    const live = totals.rows[0] || { total_parcels: 0, total_kg: 0 };
    res.json({
      success: true,
      consolidation: {
        ...rows[0],
        total_parcels: live.total_parcels,
        total_kg: live.total_kg,
      },
    });
  } catch (err) {
    console.error('GET /consolidations/customer/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidation' });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 *  OPERATOR / ADMIN — list + create
 * ──────────────────────────────────────────────────────────────────────── */

/** GET /api/consolidations  — list all (operator + admin)
 *
 * Query params:
 *   status — filter by enum value (open, locked, …) — optional.
 *   limit  — page size, integer in [1, 100]. Defaults to 100. Out-of-range
 *            values are clamped server-side so a hostile caller can't ask
 *            for thousands of rows. iOS uses limit=5 to populate the
 *            "recent shipping consolidations" picker on the customer-
 *            consolidation Attach-to-shipping sheet.
 */
router.get('/', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) { params.push(status); where = `WHERE status = $${params.length}`; }

    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 100;
    params.push(limit);
    const limitParam = `$${params.length}`;

    const { rows } = await req.db.query(
      `SELECT * FROM consolidations ${where}
       ORDER BY week_start DESC, created_at DESC
       LIMIT ${limitParam}`,
      params
    );
    res.json({ success: true, consolidations: rows });
  } catch (err) {
    console.error('GET /consolidations error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidations' });
  }
});

/** POST /api/consolidations  — create a new weekly flight unit */
router.post('/', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { week_start, cutoff_at, departure_at, notes } = req.body;
    if (!week_start || !cutoff_at) {
      return res.status(400).json({
        success: false,
        message: 'week_start and cutoff_at are required',
      });
    }
    // The live `consolidations.id` column is `uuid` on this project even
    // though the on-disk schema declares TEXT, so the legacy `shortId('CON-…')`
    // helper failed with `invalid input syntax for type uuid`. Use a real UUID
    // — works against either column type.
    const id = uuidv4();
    await req.db.query(
      `INSERT INTO consolidations
         (id, week_start, cutoff_at, departure_at, status, notes)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [id, week_start, cutoff_at, departure_at || null, notes || null]
    );
    res.status(201).json({ success: true, consolidation_id: id });
  } catch (err) {
    // Real Postgres detail (constraint, code, RLS denial) is logged
    // server-side for ops review — never returned to clients, since
    // it leaks DB internals to anyone observing the response.
    console.error('POST /consolidations error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create consolidation',
    });
  }
});

/** GET /api/consolidations/:id  — full detail with parcels + pallets */
router.get('/:id', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: consRows } = await req.db.query(
      `SELECT * FROM consolidations WHERE id = $1`, [id]
    );
    if (consRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Consolidation not found' });
    }
    const { rows: parcels } = await req.db.query(
      `SELECT o.id, o.tracking_number, o.retailer, o.market, o.status,
              o.weight_kg, o.chargeable_kg, o.declared_value, u.email, u.name
         FROM orders o
         JOIN users u ON u.id = o.user_id
        WHERE o.consolidation_id = $1
        ORDER BY o.created_at ASC`,
      [id]
    );
    const { rows: pallets } = await req.db.query(
      `SELECT * FROM pallets WHERE consolidation_id = $1 ORDER BY created_at ASC`, [id]
    );
    const { rows: customs } = await req.db.query(
      `SELECT ce.* FROM customs_entries ce
         JOIN orders o ON o.id = ce.parcel_id
        WHERE o.consolidation_id = $1`, [id]
    );

    res.json({
      success: true,
      consolidation: consRows[0],
      parcels,
      pallets,
      customs_entries: customs,
    });
  } catch (err) {
    console.error('GET /consolidations/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidation' });
  }
});

/** PATCH /api/consolidations/:id  — update status, AWB, departure, agent */
router.patch('/:id', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['status','master_awb_no','master_awb_pdf','tudor_invoice_no',
                     'tudor_invoice_pdf','manifest_pdf','departure_at','arrival_at',
                     'assigned_agent_id','notes','cutoff_at'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        params.push(req.body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No updatable fields supplied' });
    }
    sets.push(`updated_at = NOW()`);
    params.push(id);
    await req.db.query(
      `UPDATE consolidations SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /consolidations/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update consolidation' });
  }
});

/**
 * POST /api/consolidations/:id/assign-parcels — bulk attach (audit S2-6).
 *
 * The single-parcel /assign-parcel route is N round-trips per consolidation
 * load. Operators routinely tag 30–50 parcels at a time, which made the
 * Liquid-Glass progress sheet hang for 5–10 seconds. This batch endpoint
 * performs the same package-then-order cascade in two queries instead of
 * 2 × N. The single-parcel route is kept for backwards compatibility.
 *
 * Body: { parcel_ids: string[] } — non-empty, capped at 200 to keep the
 *       UPDATE plan time bounded.
 * Returns: { success, assigned: number, missing: string[] }
 */
router.post('/:id/assign-parcels', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { parcel_ids } = req.body;
    if (!Array.isArray(parcel_ids) || parcel_ids.length === 0) {
      return res.status(400).json({ success: false, message: 'parcel_ids must be a non-empty array' });
    }
    if (parcel_ids.length > 200) {
      return res.status(400).json({ success: false, message: 'too many parcels (max 200 per batch)' });
    }
    const pkgRes = await req.db.query(
      `UPDATE packages
          SET consolidation_id = $1::uuid,
              consolidated_with = $1::text,
              is_consolidated = true,
              status = 'manifested',
              updated_at = NOW()
        WHERE id = ANY($2::text[])
        RETURNING id, order_id`,
      [id, parcel_ids]
    );
    const updatedIds = pkgRes.rows.map((r) => r.id);
    const orderIds = pkgRes.rows.map((r) => r.order_id).filter(Boolean);
    if (orderIds.length > 0) {
      await req.db.query(
        `UPDATE orders
            SET consolidation_id = $1::uuid,
                status = 'consolidating',
                updated_at = NOW()
          WHERE id = ANY($2::text[])`,
        [id, orderIds]
      );
    }
    await refreshTotals(req.db, id);
    const missing = parcel_ids.filter((pid) => !updatedIds.includes(pid));
    res.json({ success: true, assigned: updatedIds.length, missing });
  } catch (err) {
    console.error('POST /consolidations/:id/assign-parcels error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to assign parcels',
    });
  }
});

/** POST /api/consolidations/:id/assign-parcel  — attach a parcel */
router.post('/:id/assign-parcel', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { parcel_id } = req.body;
    if (!parcel_id) {
      return res.status(400).json({ success: false, message: 'parcel_id is required' });
    }
    // `parcel_id` from the iOS client is a `packages.id`. The legacy code only
    // updated the parent `orders` row, which left `packages.consolidation_id`
    // null and the operator's manifest panel empty (the iOS cache observes
    // packages, not orders). Update the package row first; cascade the parent
    // order so the customer-facing consolidation card stays in sync.
    const pkgRes = await req.db.query(
      `UPDATE packages
          SET consolidation_id = $1::uuid,
              consolidated_with = $1::text,
              is_consolidated = true,
              status = 'manifested',
              updated_at = NOW()
        WHERE id = $2
        RETURNING order_id`,
      [id, parcel_id]
    );
    if (!pkgRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Parcel not found' });
    }
    const orderId = pkgRes.rows[0].order_id;
    if (orderId) {
      await req.db.query(
        `UPDATE orders SET consolidation_id = $1::uuid, status = 'consolidating', updated_at = NOW()
          WHERE id = $2`,
        [id, orderId]
      );
    }
    await refreshTotals(req.db, id);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /consolidations/:id/assign-parcel error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to assign parcel',
    });
  }
});

/** POST /api/consolidations/:id/remove-parcel  — detach a parcel */
router.post('/:id/remove-parcel', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { parcel_id } = req.body;
    // Same package-first contract as assign-parcel — clear the package, then
    // cascade to its parent order. Status drops back to received_at_warehouse
    // so the parcel is again eligible for another consolidation.
    const pkgRes = await req.db.query(
      `UPDATE packages
          SET consolidation_id = NULL,
              consolidated_with = NULL,
              is_consolidated = false,
              status = 'received_at_warehouse',
              updated_at = NOW()
        WHERE id = $1 AND consolidation_id = $2::uuid
        RETURNING order_id`,
      [parcel_id, id]
    );
    const orderId = pkgRes.rows[0]?.order_id;
    if (orderId) {
      // Reset orders.status alongside consolidation_id so the order isn't
      // left stuck at 'consolidating' when its package has already
      // dropped back to received_at_warehouse.  The audit punch list
      // flagged this as a state-machine inconsistency: removing a parcel
      // detached the package but never told the parent order it was
      // back in the intake pool.
      await req.db.query(
        `UPDATE orders
            SET consolidation_id = NULL,
                status = 'received_at_warehouse',
                updated_at = NOW()
          WHERE id = $1 AND consolidation_id = $2::uuid`,
        [orderId, id]
      );
    }
    await refreshTotals(req.db, id);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /consolidations/:id/remove-parcel error:', err);
    res.status(500).json({ success: false, message: 'Failed to remove parcel' });
  }
});

/** POST /api/consolidations/:id/pallets  — create a pallet */
router.post('/:id/pallets', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, weight_kg, photo_url } = req.body;
    if (!label) return res.status(400).json({ success: false, message: 'label is required' });
    // pallets.id is uuid on this project (same story as consolidations.id);
    // legacy shortId('PAL-…') would fail with invalid_input_syntax. Use UUID.
    const palletId = uuidv4();
    await req.db.query(
      `INSERT INTO pallets (id, consolidation_id, label, weight_kg, photo_url)
       VALUES ($1,$2,$3,$4,$5)`,
      [palletId, id, label, weight_kg || 0, photo_url || null]
    );
    res.status(201).json({ success: true, pallet_id: palletId });
  } catch (err) {
    console.error('POST /consolidations/:id/pallets error:', err);
    res.status(500).json({ success: false, message: 'Failed to create pallet' });
  }
});

/** POST /api/consolidations/:id/manifest  — generate manifest summary
 *  v1 returns JSON; PDF generation runs in the worker (spec §8 worker svc).
 */
router.post('/:id/manifest', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;

    const { rows: parcels } = await req.db.query(
      `SELECT o.id, o.tracking_number, o.retailer, o.description, o.market,
              o.weight_kg, o.chargeable_kg, o.declared_value,
              u.name AS consignee_name, u.email AS consignee_email,
              u.phone AS consignee_phone, u.delivery_address
         FROM orders o
         JOIN users u ON u.id = o.user_id
        WHERE o.consolidation_id = $1::uuid
        ORDER BY o.created_at ASC`,
      [id]
    );

    const totalKg     = parcels.reduce((s, p) => s + (parseFloat(p.weight_kg) || 0), 0);
    const totalValue  = parcels.reduce((s, p) => s + (parseFloat(p.declared_value) || 0), 0);

    res.json({
      success: true,
      manifest: {
        consolidation_id: id,
        generated_at:     new Date().toISOString(),
        parcels_count:    parcels.length,
        total_kg:         parseFloat(totalKg.toFixed(2)),
        total_declared_value_gbp: parseFloat(totalValue.toFixed(2)),
        parcels,
      },
    });
  } catch (err) {
    console.error('POST /consolidations/:id/manifest error:', err);
    res.status(500).json({ success: false, message: 'Failed to generate manifest' });
  }
});

/* ──────────────────────────────────────────────────────────────────────────
 *  Internal helpers
 * ──────────────────────────────────────────────────────────────────────── */
async function refreshTotals(db, consolidationId) {
  // Manifest totals are driven by `packages` (the per-parcel intake row), not
  // `orders` — assign-parcel/remove-parcel operate on packages first now that
  // the iOS detail view tracks them via cache.observePackagesInConsolidation.
  // packages.consolidation_id is uuid (migration 016 aligned the type), so we
  // join directly on c.id with no cast.
  await db.query(
    `UPDATE consolidations c
        SET total_parcels = (SELECT COUNT(*) FROM packages WHERE consolidation_id = c.id),
            total_kg      = COALESCE(
                              (SELECT SUM(COALESCE(chargeable_kg, weight_kg, 0))
                                 FROM packages WHERE consolidation_id = c.id), 0),
            updated_at    = NOW()
      WHERE c.id = $1::uuid`,
    [consolidationId]
  );
}

export default router;
