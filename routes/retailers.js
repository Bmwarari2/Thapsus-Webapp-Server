// routes/retailers.js — public catalog of curated retailers backing the
// Buy-for-me create form's picker (PR 4 / migration 029). Customers pick
// from this list (which feeds the retailer label + base_url) or pick
// "Other" and type a free-text URL the operator will see verbatim.

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { getOrCompute } from '../utils/cache.js';

const router = express.Router();

const RETAILERS_CACHE_KEY = 'retailers:active';
const RETAILERS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** GET /api/retailers — active retailers, grouped client-side by country. */
router.get('/', authMiddleware, async (req, res) => {
  try {
    // The retailers catalog is admin-curated and changes maybe weekly.
    // Every customer hits this on the BFM-create form. 5-min TTL keeps
    // it cheap without admin needing to coordinate cache busts —
    // worst-case staleness is a fresh retailer not appearing for 5
    // minutes after the admin adds it via the Supabase dashboard.
    const retailers = await getOrCompute(RETAILERS_CACHE_KEY, RETAILERS_CACHE_TTL_MS, async () => {
      const { rows } = await req.db.query(
        `SELECT id, name, country, base_url, logo_url, sort_order
           FROM retailers
          WHERE is_active = true
          ORDER BY sort_order ASC, name ASC`
      );
      return rows.map(r => ({
        id:        r.id,
        name:      r.name,
        country:   r.country,
        base_url:  r.base_url,
        logo_url:  r.logo_url,
        sort_order: r.sort_order,
      }));
    });
    res.json({ success: true, retailers });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/retailers');
    res.status(500).json({ success: false, message: 'Failed to load retailers' });
  }
});

export default router;
