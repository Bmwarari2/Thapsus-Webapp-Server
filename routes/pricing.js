import express from 'express';
import {
  calculateShippingCost,
  loadPricingContext,
  getPricingSettings,
  getCustomsTiers,
  getHsCodeTiers,
  DEFAULT_SETTINGS,
  ELECTRONICS_HANDLING,
  HS_TIERS,
  PRICING_CACHE_KEYS,
} from '../utils/pricing.js';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { cacheInvalidate } from '../utils/cache.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function logAdminAction(db, adminId, action, details) {
  try {
    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, action, JSON.stringify(details)]
    );
  } catch (err) {
    console.warn(`[pricing] admin_logs insert failed (non-fatal): ${err.message}`);
  }
}

// ─── POST /api/pricing/calculate ────────────────────────────────────────────

router.post('/calculate', async (req, res) => {
  try {
    const {
      weight_kg = 0,
      dimensions,
      shipping_speed = 'economy',
      insurance = false,
      declared_value = 0,
      electronics_item = null,
      items = null,
    } = req.body;

    if (!['economy', 'express'].includes(shipping_speed)) {
      return res.status(400).json({ success: false, message: 'Invalid shipping_speed. Must be economy or express' });
    }
    if (electronics_item && !ELECTRONICS_HANDLING[electronics_item]) {
      return res.status(400).json({ success: false, message: 'Invalid electronics_item' });
    }

    const hs_tier = req.body.hs_tier || null;
    if (hs_tier && !HS_TIERS[hs_tier]) {
      return res.status(400).json({ success: false, message: `Invalid hs_tier. Valid values: ${Object.keys(HS_TIERS).join(', ')}` });
    }

    const db = req.db;
    const ctx = await loadPricingContext(db);

    const pricing = calculateShippingCost({
      weight_kg,
      dimensions,
      shipping_speed,
      insurance,
      declared_value,
      electronics_item,
      hs_tier,
      items,
      settings:        ctx.settings,
      customsTiers:    ctx.customsTiers,
      hsMap:           ctx.hsMap,
      electronicsFees: ctx.electronicsFees,
      // Public calculator omits customs from the customer-facing total.
      // Customs (VAT + Duty) are billed separately by KRA on clearance.
      // Order-creation paths (routes/orders.js, routes/admin.js) call the
      // engine directly without this flag, so they still get customs.
      skipCustoms:     true,
    });

    res.json({ success: true, pricing });
  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate pricing' });
  }
});

// ─── GET /api/pricing/electronics ───────────────────────────────────────────
// Public: returns the list of electronics categories and their handling fees.
// Reads from DB so admin edits are reflected; falls back to the in-code map.

router.get('/electronics', async (req, res) => {
  try {
    const db = req.db;
    let rows = [];
    try {
      const r = await db.query(
        `SELECT item_key, label, fee_gbp, min_weight_kg, is_active
           FROM electronics_fees
          WHERE COALESCE(is_active, TRUE) = TRUE
          ORDER BY item_key`
      );
      rows = r.rows;
    } catch { /* table may not exist yet */ }

    if (!rows.length) {
      return res.json({
        success: true,
        items: Object.entries(ELECTRONICS_HANDLING).map(([key, cfg]) => ({
          key,
          label: cfg.label,
          fee_gbp: cfg.fee_gbp,
          min_weight_kg: cfg.min_weight_kg,
        })),
      });
    }
    res.json({
      success: true,
      items: rows.map((r) => ({
        key: r.item_key,
        label: r.label || ELECTRONICS_HANDLING[r.item_key]?.label || r.item_key,
        fee_gbp: parseFloat(r.fee_gbp),
        min_weight_kg: parseFloat(r.min_weight_kg ?? 0),
      })),
    });
  } catch (error) {
    console.error('Get electronics fees error:', error);
    res.status(500).json({ success: false, message: 'Failed to load electronics fees' });
  }
});

// ─── GET /api/pricing/hs-tiers ──────────────────────────────────────────────
// Public: returns the active customs tiers. Reads from DB; falls back to
// the HS_TIERS constant.

router.get('/hs-tiers', async (req, res) => {
  try {
    const db = req.db;
    let rows = [];
    try {
      const r = await db.query(
        `SELECT tier_key, label, duty_pct, vat_pct, idf_pct, rdl_pct, notes
           FROM customs_tiers
          WHERE is_active = TRUE
          ORDER BY tier_key`
      );
      rows = r.rows;
    } catch { /* pre-051 environments */ }

    if (!rows.length) {
      return res.json({
        success: true,
        tiers: Object.entries(HS_TIERS).map(([key, cfg]) => ({
          key,
          label: cfg.label,
          duty_rate: cfg.duty_rate,
          vat_zero_rated: !!cfg.vat_zero_rated,
          note: cfg.note,
        })),
      });
    }
    res.json({
      success: true,
      tiers: rows.map((r) => ({
        key:            r.tier_key,
        label:          r.label,
        duty_rate:      parseFloat(r.duty_pct),
        vat_rate:       parseFloat(r.vat_pct),
        idf_rate:       parseFloat(r.idf_pct),
        rdl_rate:       parseFloat(r.rdl_pct),
        vat_zero_rated: parseFloat(r.vat_pct) === 0,
        note:           r.notes,
      })),
    });
  } catch (error) {
    console.error('Get customs tiers error:', error);
    res.status(500).json({ success: false, message: 'Failed to load customs tiers' });
  }
});

// ─── GET /api/pricing/settings ──────────────────────────────────────────────
// New: the four numeric pricing knobs.

router.get('/settings', async (req, res) => {
  try {
    const db = req.db;
    const settings = await getPricingSettings(db);
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Get pricing settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch pricing settings' });
  }
});

// ─── PUT /api/pricing/settings ──────────────────────────────────────────────
// New: admin-only update of base_shipping_per_kg / base_handling_fee /
// card_processing_pct / dim_divisor. Body shape: { settings: { key: value } }.

router.put('/settings', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const { settings } = req.body || {};

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ success: false, message: 'settings object is required' });
    }

    const validKeys = Object.keys(DEFAULT_SETTINGS);
    const changes = {};
    for (const [key, raw] of Object.entries(settings)) {
      if (!validKeys.includes(key)) {
        return res.status(400).json({ success: false, message: `Unknown pricing setting: ${key}` });
      }
      const v = parseFloat(raw);
      if (!Number.isFinite(v)) {
        return res.status(400).json({ success: false, message: `Invalid numeric value for ${key}` });
      }
      // Bound checks — card_processing_pct is a fraction, dim_divisor must be
      // positive, the two GBP fees can't be negative. Reject obviously-bad
      // inputs at the API boundary rather than letting a typo through.
      if (key === 'card_processing_pct' && (v < 0 || v > 1)) {
        return res.status(400).json({ success: false, message: 'card_processing_pct must be between 0 and 1 (e.g. 0.03 for 3%)' });
      }
      if (key === 'dim_divisor' && v <= 0) {
        return res.status(400).json({ success: false, message: 'dim_divisor must be > 0' });
      }
      if ((key === 'base_shipping_per_kg' || key === 'base_handling_fee') && v < 0) {
        return res.status(400).json({ success: false, message: `${key} must be ≥ 0` });
      }
      changes[key] = v;
    }

    for (const [key, value] of Object.entries(changes)) {
      await db.query(
        `INSERT INTO pricing_settings (key, value, updated_by, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = NOW()`,
        [key, value, adminId]
      );
    }

    await logAdminAction(db, adminId, 'update_pricing_settings', changes);
    cacheInvalidate(PRICING_CACHE_KEYS.settings);

    const updated = await getPricingSettings(db);
    res.json({ success: true, message: 'Pricing settings updated', settings: updated });
  } catch (error) {
    console.error('Update pricing settings error:', error);
    res.status(500).json({ success: false, message: 'Failed to update pricing settings' });
  }
});

// ─── PUT /api/pricing/customs-tiers ─────────────────────────────────────────
// New: admin-only update of the per-tier customs rates. Body:
//   { tiers: { general: { duty_pct, vat_pct, idf_pct?, rdl_pct?, label?, is_active? }, ... } }

router.put('/customs-tiers', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const { tiers } = req.body || {};

    if (!tiers || typeof tiers !== 'object') {
      return res.status(400).json({ success: false, message: 'tiers object is required' });
    }

    const changes = {};
    for (const [tier_key, raw] of Object.entries(tiers)) {
      if (!tier_key.match(/^[a-z0-9_]{1,50}$/)) {
        return res.status(400).json({ success: false, message: `Invalid tier_key: ${tier_key}` });
      }
      const out = {};
      const pctKeys = ['duty_pct', 'vat_pct', 'idf_pct', 'rdl_pct'];
      for (const pk of pctKeys) {
        if (raw[pk] != null) {
          const v = parseFloat(raw[pk]);
          if (!Number.isFinite(v) || v < 0 || v > 1) {
            return res.status(400).json({ success: false, message: `Invalid ${pk} for ${tier_key} — must be 0..1` });
          }
          out[pk] = v;
        }
      }
      if (raw.label != null)     out.label = String(raw.label).slice(0, 200);
      if (raw.notes != null)     out.notes = String(raw.notes);
      if (raw.is_active != null) out.is_active = !!raw.is_active;
      changes[tier_key] = out;
    }

    for (const [tier_key, out] of Object.entries(changes)) {
      // Upsert. duty_pct + vat_pct are NOT NULL — when creating a new tier,
      // the caller MUST supply both. Existing tiers can be PATCHed partially
      // because the ON CONFLICT clause only touches the supplied columns.
      const cols = ['tier_key', ...Object.keys(out), 'updated_by', 'updated_at'];
      const vals = [tier_key, ...Object.values(out), adminId, new Date()];
      const placeholders = vals.map((_, i) => `$${i + 1}`);
      const updateSet = Object.keys(out)
        .map((k) => `${k} = EXCLUDED.${k}`)
        .concat(['updated_by = EXCLUDED.updated_by', 'updated_at = EXCLUDED.updated_at'])
        .join(', ');
      try {
        await db.query(
          `INSERT INTO customs_tiers (${cols.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (tier_key) DO UPDATE SET ${updateSet}`,
          vals
        );
      } catch (err) {
        // duty_pct/vat_pct NOT NULL violation = new tier missing required fields.
        if (err.code === '23502') {
          return res.status(400).json({
            success: false,
            message: `New tier ${tier_key} requires duty_pct and vat_pct`,
          });
        }
        throw err;
      }
    }

    await logAdminAction(db, adminId, 'update_customs_tiers', changes);
    cacheInvalidate(PRICING_CACHE_KEYS.tiers);

    const updated = await getCustomsTiers(db);
    res.json({ success: true, message: 'Customs tiers updated', tiers: updated });
  } catch (error) {
    console.error('Update customs tiers error:', error);
    res.status(500).json({ success: false, message: 'Failed to update customs tiers' });
  }
});

// ─── PUT /api/pricing/hs-codes ──────────────────────────────────────────────
// New: admin-only CRUD of the HS-prefix → tier mapping. Body:
//   { upsert: [{ hs_prefix, tier_key, notes? }, ...], remove?: ['8517', ...] }

router.put('/hs-codes', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const { upsert = [], remove = [] } = req.body || {};

    if (!Array.isArray(upsert) || !Array.isArray(remove)) {
      return res.status(400).json({ success: false, message: 'upsert and remove must be arrays' });
    }

    for (const row of upsert) {
      if (!row || !row.hs_prefix || !row.tier_key) {
        return res.status(400).json({ success: false, message: 'upsert rows require hs_prefix and tier_key' });
      }
      if (!/^[0-9]{2,10}$/.test(row.hs_prefix)) {
        return res.status(400).json({ success: false, message: `Invalid hs_prefix "${row.hs_prefix}" — must be 2–10 digits` });
      }
    }

    for (const row of upsert) {
      try {
        await db.query(
          `INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, NOW())
           ON CONFLICT (hs_prefix) DO UPDATE
             SET tier_key  = EXCLUDED.tier_key,
                 notes     = EXCLUDED.notes,
                 updated_by= EXCLUDED.updated_by,
                 updated_at= EXCLUDED.updated_at`,
          [row.hs_prefix, row.tier_key, row.notes ?? null, adminId]
        );
      } catch (err) {
        // FK violation = tier_key does not exist in customs_tiers
        if (err.code === '23503') {
          return res.status(400).json({
            success: false,
            message: `tier_key "${row.tier_key}" does not exist in customs_tiers`,
          });
        }
        throw err;
      }
    }

    for (const prefix of remove) {
      if (!/^[0-9]{2,10}$/.test(prefix)) continue;
      await db.query('DELETE FROM hs_code_tiers WHERE hs_prefix = $1', [prefix]);
    }

    await logAdminAction(db, adminId, 'update_hs_code_tiers', { upsert, remove });
    cacheInvalidate(PRICING_CACHE_KEYS.hsMap);

    const updated = await getHsCodeTiers(db);
    res.json({ success: true, message: 'HS-code mapping updated', mapping: updated });
  } catch (error) {
    console.error('Update HS codes error:', error);
    res.status(500).json({ success: false, message: 'Failed to update HS-code mapping' });
  }
});

// ─── GET /api/pricing/hs-codes ──────────────────────────────────────────────
// Public read of the HS-code → tier mapping (used by the customer order form
// to show which prefixes resolve to which tier).

router.get('/hs-codes', async (req, res) => {
  try {
    const db = req.db;
    const mapping = await getHsCodeTiers(db);
    res.json({ success: true, mapping });
  } catch (error) {
    console.error('Get HS codes error:', error);
    res.status(500).json({ success: false, message: 'Failed to load HS-code mapping' });
  }
});

// ─── PUT /api/pricing/electronics ───────────────────────────────────────────
// Admin only: update electronics handling fees. Same surface as the
// pre-051 endpoint (body: { fees: { phone, laptop, tv_monitor } }) so the
// existing UI continues to work; new keys can be added freely.

router.put('/electronics', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { fees } = req.body;
    const adminId = req.user.id;
    if (!fees || typeof fees !== 'object') {
      return res.status(400).json({ success: false, message: 'fees object is required' });
    }
    for (const [key, fee] of Object.entries(fees)) {
      if (!key.match(/^[a-z0-9_]{1,50}$/)) {
        return res.status(400).json({ success: false, message: `Invalid electronics item key: ${key}` });
      }
      const f = parseFloat(fee);
      if (isNaN(f) || f < 0) {
        return res.status(400).json({ success: false, message: `Invalid fee for ${key}` });
      }
    }
    // The table exists (mig 051). Older deployments may still hit this before
    // running 051 — fall back to the legacy create-on-the-fly path.
    await db.query(`
      CREATE TABLE IF NOT EXISTS electronics_fees (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        item_key VARCHAR(50) NOT NULL UNIQUE,
        fee_gbp NUMERIC(10,2) NOT NULL,
        updated_by UUID,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const [key, fee] of Object.entries(fees)) {
      const f = parseFloat(fee);
      const label = ELECTRONICS_HANDLING[key]?.label || key;
      await db.query(
        `INSERT INTO electronics_fees (id, item_key, fee_gbp, label, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,$5,NOW())
        ON CONFLICT (item_key) DO UPDATE SET fee_gbp=$3, label=COALESCE(electronics_fees.label, $4), updated_by=$5, updated_at=NOW()`,
        [uuidv4(), key, f, label, adminId]
      );
    }
    await logAdminAction(db, adminId, 'update_electronics_handling_fees', fees);
    cacheInvalidate(PRICING_CACHE_KEYS.electronics);

    const allKeys = Array.from(new Set([...Object.keys(ELECTRONICS_HANDLING), ...Object.keys(fees)]));
    const updatedFees = {};
    for (const key of allKeys) {
      const queryRes = await db.query('SELECT fee_gbp FROM electronics_fees WHERE item_key = $1', [key]);
      updatedFees[key] = queryRes.rows.length ? parseFloat(queryRes.rows[0].fee_gbp) : ELECTRONICS_HANDLING[key]?.fee_gbp ?? null;
    }
    res.json({ success: true, message: 'Electronics handling fees updated', fees: updatedFees });
  } catch (error) {
    console.error('Update electronics handling fees error:', error);
    res.status(500).json({ success: false, message: 'Failed to update electronics handling fees' });
  }
});

export default router;
