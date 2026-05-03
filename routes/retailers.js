// routes/retailers.js — public catalog of curated retailers backing the
// Buy-for-me create form's picker (PR 4 / migration 029). Customers pick
// from this list (which feeds the retailer label + base_url) or pick
// "Other" and type a free-text URL the operator will see verbatim.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';

const router = express.Router();

/** GET /api/retailers — active retailers, grouped client-side by country. */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT id, name, country, base_url, logo_url, sort_order
         FROM retailers
        WHERE is_active = true
        ORDER BY sort_order ASC, name ASC`
    );
    res.json({
      success: true,
      retailers: rows.map(r => ({
        id:        r.id,
        name:      r.name,
        country:   r.country,
        base_url:  r.base_url,
        logo_url:  r.logo_url,
        sort_order: r.sort_order,
      })),
    });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/retailers');
    res.status(500).json({ success: false, message: 'Failed to load retailers' });
  }
});

export default router;
