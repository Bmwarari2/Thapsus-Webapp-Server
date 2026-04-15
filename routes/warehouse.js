/**
 * Warehouse Addresses route
 * GET /api/warehouse/addresses  — authenticated
 *
 * Returns the per-market warehouse addresses used by customers when placing
 * orders from international retailers.  Addresses are driven by environment
 * variables so they can be updated without a code change or redeployment:
 *
 *   WAREHOUSE_UK_LINE1   = "31 Collingwood Close"
 *   WAREHOUSE_UK_LINE2   = "Hazel Grove, Stockport"
 *   WAREHOUSE_UK_LINE3   = "SK7 4LB"
 *   WAREHOUSE_UK_LINE4   = "United Kingdom"
 *   WAREHOUSE_CHINA_LINE1 = "Thapsus Cargo Warehouse"
 *   WAREHOUSE_CHINA_LINE2 = "Shanghai, China"
 *
 * The customer's own TC warehouse code (e.g. "TC-XXXXXX") is returned as
 * a separate `tcCode` field so the frontend can format it independently and
 * expose a dedicated "Copy TC code" action.
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/**
 * Build a market address object from env vars with sensible fallbacks.
 * Lines are filtered so that empty env vars don't produce blank address rows.
 */
function buildAddress(market, lineEnvKeys, label, flag) {
  const lines = lineEnvKeys
    .map(key => process.env[key] || '')
    .filter(Boolean);

  return {
    label,
    flag,
    lines,
    // Convenience: pre-joined full address for a single-copy action
    full: lines.join('\n'),
  };
}

// ── GET /api/warehouse/addresses ─────────────────────────────────────────────
router.get('/addresses', authMiddleware, (req, res) => {
  const tcCode = `TC-${req.user.warehouse_id || req.user.warehouseId || 'XXXX'}`;

  const addresses = {
    UK: buildAddress(
      'UK',
      [
        'WAREHOUSE_UK_LINE1',
        'WAREHOUSE_UK_LINE2',
        'WAREHOUSE_UK_LINE3',
        'WAREHOUSE_UK_LINE4',
      ],
      'United Kingdom',
      '🇬🇧',
    ),
    China: buildAddress(
      'China',
      [
        'WAREHOUSE_CHINA_LINE1',
        'WAREHOUSE_CHINA_LINE2',
        'WAREHOUSE_CHINA_LINE3',
      ],
      'China',
      '🇨🇳',
    ),
  };

  // Apply fallbacks if env vars are not configured so the frontend always
  // has valid addresses to display even in development.
  if (addresses.UK.lines.length === 0) {
    addresses.UK.lines = ['31 Collingwood Close', 'Hazel Grove, Stockport', 'SK7 4LB', 'United Kingdom'];
    addresses.UK.full  = addresses.UK.lines.join('\n');
  }
  if (addresses.China.lines.length === 0) {
    addresses.China.lines = ['Thapsus Cargo Warehouse', 'Shanghai, China'];
    addresses.China.full  = addresses.China.lines.join('\n');
  }

  res.json({ success: true, addresses, tcCode });
});

export default router;
