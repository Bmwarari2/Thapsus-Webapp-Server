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

/* ──────────────────────────────────────────────────────────────────────────
 *  OPERATOR / ADMIN — list + create
 * ──────────────────────────────────────────────────────────────────────── */

/** GET /api/consolidations  — list all (operator + admin) */
router.get('/', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) { params.push(status); where = `WHERE status = $${params.length}`; }

    const { rows } = await req.db.query(
      `SELECT * FROM consolidations ${where}
       ORDER BY week_start DESC, created_at DESC
       LIMIT 100`,
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
    const id = shortId('CON');
    await req.db.query(
      `INSERT INTO consolidations
         (id, week_start, cutoff_at, departure_at, status, notes)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [id, week_start, cutoff_at, departure_at || null, notes || null]
    );
    res.status(201).json({ success: true, consolidation_id: id });
  } catch (err) {
    console.error('POST /consolidations error:', err);
    res.status(500).json({ success: false, message: 'Failed to create consolidation' });
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

/** POST /api/consolidations/:id/assign-parcel  — attach a parcel */
router.post('/:id/assign-parcel', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { parcel_id } = req.body;
    if (!parcel_id) {
      return res.status(400).json({ success: false, message: 'parcel_id is required' });
    }
    await req.db.query(
      `UPDATE orders SET consolidation_id = $1, status = 'consolidating', updated_at = NOW()
        WHERE id = $2`,
      [id, parcel_id]
    );
    await refreshTotals(req.db, id);
    res.json({ success: true });
  } catch (err) {
    console.error('POST /consolidations/:id/assign-parcel error:', err);
    res.status(500).json({ success: false, message: 'Failed to assign parcel' });
  }
});

/** POST /api/consolidations/:id/remove-parcel  — detach a parcel */
router.post('/:id/remove-parcel', authMiddleware, ALLOWED_OPERATOR, async (req, res) => {
  try {
    const { id } = req.params;
    const { parcel_id } = req.body;
    await req.db.query(
      `UPDATE orders SET consolidation_id = NULL, updated_at = NOW()
        WHERE id = $1 AND consolidation_id = $2`,
      [parcel_id, id]
    );
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
    const palletId = shortId('PAL');
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
        WHERE o.consolidation_id = $1
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
  await db.query(
    `UPDATE consolidations c
        SET total_parcels = (SELECT COUNT(*) FROM orders WHERE consolidation_id = c.id),
            total_kg      = COALESCE(
                              (SELECT SUM(COALESCE(chargeable_kg, weight_kg, 0))
                                 FROM orders WHERE consolidation_id = c.id), 0),
            updated_at    = NOW()
      WHERE c.id = $1`,
    [consolidationId]
  );
}

export default router;
