/**
 * routes/pricingTiers.js — admin-editable pricing tiers + fees + promotions.
 *
 * Spec §4.7 says all pricing data must be DB-driven.  These tables back
 * the calculator and intake quotes; admins edit them via /ops/settings.
 */
import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();
const ADMIN = requireRole('admin');

/* ── Tiers ─────────────────────────────────────────────────────────────── */

/** GET /api/pricing-tiers (public) */
router.get('/tiers', async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, channel, min_kg, max_kg, gbp_per_kg, effective_from, is_active, notes
         FROM pricing_tiers
        WHERE is_active = TRUE
        ORDER BY channel, min_kg`
    );
    res.json({ success: true, tiers: rows });
  } catch (err) {
    console.error('GET /pricing-tiers/tiers error:', err);
    res.status(500).json({ success: false, message: 'Failed to load tiers' });
  }
});

/** POST /api/pricing-tiers/tiers (admin) */
router.post('/tiers', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { channel, min_kg, max_kg, gbp_per_kg, notes } = req.body;
    if (!channel || min_kg == null || max_kg == null || gbp_per_kg == null) {
      return res.status(400).json({ success: false, message: 'channel, min_kg, max_kg, gbp_per_kg required' });
    }
    const id = `pt-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
    await req.db.query(
      `INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, channel, min_kg, max_kg, gbp_per_kg, notes || null]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /pricing-tiers/tiers error:', err);
    res.status(500).json({ success: false, message: 'Failed to create tier' });
  }
});

/** PATCH /api/pricing-tiers/tiers/:id (admin) */
router.patch('/tiers/:id', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['gbp_per_kg','min_kg','max_kg','is_active','notes','effective_to'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        params.push(req.body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ success: false, message: 'No updatable fields' });
    params.push(id);
    await req.db.query(
      `UPDATE pricing_tiers SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /pricing-tiers/tiers/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update tier' });
  }
});

/* ── Fees ──────────────────────────────────────────────────────────────── */

/** GET /api/pricing-tiers/fees (public) */
router.get('/fees', async (req, res) => {
  try {
    const exists = await req.db.query(
      `SELECT to_regclass('public.fees') AS reg`
    );
    if (!exists.rows[0]?.reg) {
      return res.json({ success: true, fees: [], degraded: true });
    }
    const { rows } = await req.db.query(
      `SELECT id, code, label, currency, amount, is_percentage, is_active, notes
         FROM fees WHERE is_active = TRUE ORDER BY code`
    );
    res.json({ success: true, fees: rows });
  } catch (err) {
    // Likely 'relation "fees" does not exist' (migration 001 not applied).
    // Don't 500 the calculator — return empty fees so the engine can still
    // produce a freight-only quote.
    console.error('GET /pricing-tiers/fees error:', err);
    res.json({ success: true, fees: [], degraded: true, error: err.message });
  }
});

/** PATCH /api/pricing-tiers/fees/:id (admin) */
router.patch('/fees/:id', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['amount','is_percentage','is_active','label','currency','notes'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        params.push(req.body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0)
      return res.status(400).json({ success: false, message: 'No updatable fields' });
    params.push(id);
    await req.db.query(
      `UPDATE fees SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /pricing-tiers/fees/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update fee' });
  }
});

/* ── Promotions ────────────────────────────────────────────────────────── */

/** GET /api/pricing-tiers/promotions (admin) */
router.get('/promotions', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM promotions ORDER BY created_at DESC LIMIT 100`
    );
    res.json({ success: true, promotions: rows });
  } catch (err) {
    console.error('GET /pricing-tiers/promotions error:', err);
    res.status(500).json({ success: false, message: 'Failed to load promotions' });
  }
});

/** POST /api/pricing-tiers/promotions (admin) */
router.post('/promotions', authMiddleware, ADMIN, async (req, res) => {
  try {
    const { code, type, value, valid_from, valid_to, max_uses, description } = req.body;
    if (!code || !type || value == null) {
      return res.status(400).json({ success: false, message: 'code, type and value required' });
    }
    const id = `promo-${Date.now()}-${Math.random().toString(36).slice(2,5)}`;
    await req.db.query(
      `INSERT INTO promotions
         (id, code, type, value, valid_from, valid_to, max_uses, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, code, type, value, valid_from || new Date().toISOString(),
       valid_to || null, max_uses || null, description || null]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /pricing-tiers/promotions error:', err);
    res.status(500).json({ success: false, message: 'Failed to create promotion' });
  }
});

/** POST /api/pricing-tiers/promotions/validate — public */
router.post('/promotions/validate', async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.json({ success: true, valid: false });
    const { rows } = await req.db.query(
      `SELECT * FROM promotions
        WHERE code = $1 AND is_active = TRUE
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_to IS NULL OR valid_to >= NOW())
          AND (max_uses IS NULL OR uses < max_uses)`,
      [code]
    );
    if (rows.length === 0) return res.json({ success: true, valid: false });
    res.json({ success: true, valid: true, promotion: rows[0] });
  } catch (err) {
    console.error('POST /pricing-tiers/promotions/validate error:', err);
    res.status(500).json({ success: false, message: 'Failed to validate code' });
  }
});

export default router;
