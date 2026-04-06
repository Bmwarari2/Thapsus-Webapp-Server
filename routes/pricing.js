import express from 'express';
import { calculateShippingCost, DEFAULT_RATES_GBP, ELECTRONICS_HANDLING } from '../utils/pricing.js';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getActiveRates(db) {
  try {
    const res = await db.query(
      'SELECT market, rate_gbp FROM shipping_rates ORDER BY updated_at DESC'
    );
    if (!res.rows.length) return { ...DEFAULT_RATES_GBP };
    const rates = { ...DEFAULT_RATES_GBP };
    res.rows.forEach((r) => { rates[r.market] = parseFloat(r.rate_gbp); });
    return rates;
  } catch {
    // Table may not exist yet; fall back to defaults
    return { ...DEFAULT_RATES_GBP };
  }
}

// ─── POST /api/pricing/calculate ────────────────────────────────────────────

router.post('/calculate', async (req, res) => {
  try {
    const {
      weight_kg = 0,
      dimensions,
      market,
      shipping_speed = 'economy',
      insurance = false,
      declared_value = 0,
      electronics_item = null,
    } = req.body;

    if (!market || !['UK', 'USA', 'China'].includes(market)) {
      return res.status(400).json({ success: false, message: 'Invalid market. Must be UK, USA, or China' });
    }
    if (!['economy', 'express'].includes(shipping_speed)) {
      return res.status(400).json({ success: false, message: 'Invalid shipping_speed. Must be economy or express' });
    }
    if (electronics_item && !ELECTRONICS_HANDLING[electronics_item]) {
      return res.status(400).json({ success: false, message: 'Invalid electronics_item' });
    }

    const db = req.db;
    const rates_gbp = await getActiveRates(db);

    const pricing = calculateShippingCost({
      weight_kg,
      dimensions,
      market,
      shipping_speed,
      insurance,
      declared_value,
      electronics_item,
      rates_gbp,
    });

    res.json({ success: true, pricing });
  } catch (error) {
    console.error('Calculate pricing error:', error);
    res.status(500).json({ success: false, message: 'Failed to calculate pricing' });
  }
});

// ─── GET /api/pricing/electronics ───────────────────────────────────────────
// Public: returns the list of electronics categories and their handling fees

router.get('/electronics', (req, res) => {
  res.json({
    success: true,
    items: Object.entries(ELECTRONICS_HANDLING).map(([key, cfg]) => ({
      key,
      label: cfg.label,
      fee_gbp: cfg.fee_gbp,
      min_weight_kg: cfg.min_weight_kg,
    })),
  });
});

// ─── GET /api/pricing/rates ──────────────────────────────────────────────────
// Public: returns current per-kg shipping rates

router.get('/rates', async (req, res) => {
  try {
    const db = req.db;
    const rates = await getActiveRates(db);
    res.json({ success: true, rates });
  } catch (error) {
    console.error('Get rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch shipping rates' });
  }
});

// ─── PUT /api/pricing/rates ──────────────────────────────────────────────────
// Admin only: update per-kg shipping rates

router.put('/rates', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { rates } = req.body; // { UK: 8, USA: 10, China: 6 }
    const adminId = req.user.id;

    if (!rates || typeof rates !== 'object') {
      return res.status(400).json({ success: false, message: 'rates object is required' });
    }

    const validMarkets = ['UK', 'USA', 'China'];

    // Ensure the table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipping_rates (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        market      VARCHAR(10) NOT NULL UNIQUE,
        rate_gbp    NUMERIC(10,4) NOT NULL,
        updated_by  UUID,
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
      await db.query(
        `INSERT INTO shipping_rates (id, market, rate_gbp, updated_by, updated_at)
         VALUES ($1,$2,$3,$4,NOW())
         ON CONFLICT (market) DO UPDATE SET rate_gbp=$3, updated_by=$4, updated_at=NOW()`,
        [uuidv4(), market, r, adminId]
      );
    }

    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, 'update_shipping_rates', JSON.stringify(rates)]
    );

    const updatedRates = await getActiveRates(db);
    res.json({ success: true, message: 'Shipping rates updated', rates: updatedRates });
  } catch (error) {
    console.error('Update shipping rates error:', error);
    res.status(500).json({ success: false, message: 'Failed to update shipping rates' });
  }
});




// ─── PUT /api/pricing/electronics ─────────────────────────────────────────
// Admin only: update electronics handling fees
router.put('/electronics', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { fees } = req.body; // { phone: 75, laptop: 65, tv_monitor: 65 }
    const adminId = req.user.id;
    if (!fees || typeof fees !== 'object') {
      return res.status(400).json({ success: false, message: 'fees object is required' });
    }
    const validKeys = Object.keys(ELECTRONICS_HANDLING);
    for (const [key, fee] of Object.entries(fees)) {
      if (!validKeys.includes(key)) {
        return res.status(400).json({ success: false, message: `Invalid electronics item: ${key}` });
      }
      const f = parseFloat(fee);
      if (isNaN(f) || f < 0) {
        return res.status(400).json({ success: false, message: `Invalid fee for ${key}` });
      }
    }
    // Store in DB: create electronics_fees table if needed
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
      await db.query(
        `INSERT INTO electronics_fees (id, item_key, fee_gbp, updated_by, updated_at)
        VALUES ($1,$2,$3,$4,NOW())
        ON CONFLICT (item_key) DO UPDATE SET fee_gbp=$3, updated_by=$4, updated_at=NOW()`,
        [uuidv4(), key, f, adminId]
      );
    }
    await db.query(
      'INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,$3,$4)',
      [uuidv4(), adminId, 'update_electronics_handling_fees', JSON.stringify(fees)]
    );
    const updatedFees = {};
    for (const key of validKeys) {
      const queryRes = await db.query('SELECT fee_gbp FROM electronics_fees WHERE item_key = $1', [key]);
      updatedFees[key] = queryRes.rows.length ? parseFloat(queryRes.rows[0].fee_gbp) : ELECTRONICS_HANDLING[key].fee_gbp;
    }
    res.json({ success: true, message: 'Electronics handling fees updated', fees: updatedFees });
  } catch (error) {
    console.error('Update electronics handling fees error:', error);
    res.status(500).json({ success: false, message: 'Failed to update electronics handling fees' });
  }
});export default router;
