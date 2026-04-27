/**
 * routes/insurance.js
 *
 * Declared-value insurance (Spec §4.9).  Three tiers:
 *   • standard — included up to £100  → premium £0
 *   • plus     — up to £500           → premium £8 (flat)
 *   • premier  — up to £2 000         → premium 3.5% of declared value
 *   • custom   — over £2 000          → manual quote
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Compute the premium in GBP for a given tier + declared value.
 * Pure function — exported for tests and the calculator UI.
 */
export function computeInsurancePremium(tier, declaredValueGbp) {
  const v = Math.max(0, parseFloat(declaredValueGbp) || 0);
  switch (tier) {
    case 'standard': return { premium_gbp: 0, max_cover_gbp: Math.min(100, v) };
    case 'plus':     return { premium_gbp: 8, max_cover_gbp: Math.min(500, v) };
    case 'premier':  return { premium_gbp: parseFloat((v * 0.035).toFixed(2)),
                              max_cover_gbp: Math.min(2000, v) };
    case 'custom':   return { premium_gbp: parseFloat((v * 0.04).toFixed(2)),
                              max_cover_gbp: v, requires_manual_review: true };
    default:         return { premium_gbp: 0, max_cover_gbp: 0, error: 'unknown tier' };
  }
}

/** POST /api/insurance/quote — public quote calculator helper */
router.post('/quote', (req, res) => {
  const { tier, declared_value_gbp } = req.body || {};
  res.json({ success: true, quote: computeInsurancePremium(tier, declared_value_gbp) });
});

/** POST /api/insurance/policies — buy a policy for a parcel */
router.post('/policies', authMiddleware, async (req, res) => {
  try {
    const { parcel_id, tier, declared_value_gbp } = req.body;
    if (!parcel_id || !tier) {
      return res.status(400).json({ success: false, message: 'parcel_id and tier are required' });
    }
    if (!['standard','plus','premier','custom'].includes(tier)) {
      return res.status(400).json({ success: false, message: 'invalid tier' });
    }

    // Make sure the parcel belongs to the requesting user (or admin)
    const parcel = await req.db.query(
      `SELECT user_id FROM orders WHERE id = $1`, [parcel_id]
    );
    if (parcel.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Parcel not found' });
    }
    if (req.user.role !== 'admin' && parcel.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const { premium_gbp, max_cover_gbp } = computeInsurancePremium(tier, declared_value_gbp);
    const policyId = `INS-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;

    await req.db.query(
      `INSERT INTO insurance_policies
         (id, parcel_id, user_id, tier, declared_value_gbp, premium_gbp, status)
       VALUES ($1,$2,$3,$4,$5,$6,'active')`,
      [policyId, parcel_id, parcel.rows[0].user_id, tier,
       declared_value_gbp || 0, premium_gbp]
    );
    await req.db.query(
      `UPDATE orders SET insurance = TRUE, insurance_tier = $1,
              insurance_premium_gbp = $2, declared_value = $3, updated_at = NOW()
        WHERE id = $4`,
      [tier, premium_gbp, declared_value_gbp || 0, parcel_id]
    );

    res.status(201).json({
      success: true,
      policy: { id: policyId, tier, premium_gbp, max_cover_gbp,
                declared_value_gbp: declared_value_gbp || 0, status: 'active' },
    });
  } catch (err) {
    console.error('POST /insurance/policies error:', err);
    res.status(500).json({ success: false, message: 'Failed to issue policy' });
  }
});

/** GET /api/insurance/policies — list user's policies */
router.get('/policies', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT ip.*, o.tracking_number
         FROM insurance_policies ip
         JOIN orders o ON o.id = ip.parcel_id
        WHERE ip.user_id = $1
        ORDER BY ip.created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, policies: rows });
  } catch (err) {
    console.error('GET /insurance/policies error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch policies' });
  }
});

/** POST /api/insurance/policies/:id/claim — initiate a claim */
router.post('/policies/:id/claim', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { claim_amount_gbp, notes } = req.body;
    const own = await req.db.query(
      `SELECT user_id FROM insurance_policies WHERE id = $1`, [id]
    );
    if (own.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Policy not found' });
    if (own.rows[0].user_id !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Access denied' });

    await req.db.query(
      `UPDATE insurance_policies
          SET status = 'claimed', claimed_at = NOW(),
              payout_gbp = $1
        WHERE id = $2`,
      [claim_amount_gbp || 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('POST /insurance/policies/:id/claim error:', err);
    res.status(500).json({ success: false, message: 'Failed to file claim' });
  }
});

export default router;
