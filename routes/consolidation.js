import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

/** GET /api/consolidation */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const packages = await db.query(
      `SELECT p.id, p.description, p.weight_kg, p.received_at, p.warehouse_location,
              o.tracking_number, o.retailer, o.market, o.created_at AS order_created_at
       FROM packages p JOIN orders o ON p.order_id = o.id
       WHERE p.user_id = $1 AND p.status IN ('received','consolidating') AND p.is_consolidated = false
       ORDER BY p.received_at DESC`,
      [userId]
    );

    const totalWeight = packages.rows.reduce((sum, pkg) => sum + (parseFloat(pkg.weight_kg) || 0), 0);
    res.json({ success: true, packages_waiting: packages.rows.length, total_weight_kg: parseFloat(totalWeight.toFixed(2)), packages: packages.rows });
  } catch (error) {
    console.error('Get consolidation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidation information' });
  }
});

/** GET /api/consolidation/requests — list this user's consolidation request groups */
router.get('/requests', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;

    const result = await db.query(
      `SELECT consolidated_with AS id,
              COUNT(*)::int       AS package_count,
              MIN(created_at)     AS created_at,
              MAX(updated_at)     AS updated_at,
              CASE
                WHEN BOOL_AND(status = 'delivered')        THEN 'completed'
                WHEN BOOL_AND(status = 'consolidating')    THEN 'pending'
                ELSE 'in_progress'
              END                  AS status
         FROM packages
        WHERE user_id = $1 AND consolidated_with IS NOT NULL
        GROUP BY consolidated_with
        ORDER BY MIN(created_at) DESC`,
      [userId]
    );

    res.json({
      success: true,
      requests: result.rows.map(r => ({
        id:           r.id,
        packageCount: r.package_count,
        status:       r.status,
        createdAt:    r.created_at,
        completedAt:  r.status === 'completed' ? r.updated_at : null,
      })),
    });
  } catch (error) {
    console.error('Get consolidation requests error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidation requests' });
  }
});

/** POST /api/consolidation/request */
router.post('/request', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { package_ids } = req.body;

    if (!package_ids || !Array.isArray(package_ids) || package_ids.length === 0)
      return res.status(400).json({ success: false, message: 'package_ids array is required and must not be empty' });
    if (package_ids.length < 2)
      return res.status(400).json({ success: false, message: 'At least 2 packages are required for consolidation' });

    const placeholders = package_ids.map((_, i) => `$${i + 1}`).join(',');
    const packages = await db.query(
      `SELECT id, weight_kg FROM packages WHERE id IN (${placeholders}) AND user_id = $${package_ids.length + 1} AND is_consolidated = false`,
      [...package_ids, userId]
    );

    if (packages.rows.length !== package_ids.length)
      return res.status(400).json({ success: false, message: 'Some packages not found or already consolidated' });

    const totalWeight = packages.rows.reduce((sum, pkg) => sum + (parseFloat(pkg.weight_kg) || 0), 0);
    const consolidationId = uuidv4();

    const setPlaceholders = package_ids.map((_, i) => `$${i + 3}`).join(',');
    await db.query(
      `UPDATE packages SET is_consolidated = true, consolidated_with = $1 WHERE id IN (${setPlaceholders})`,
      [consolidationId, ...package_ids]
    );
    // Packages enum was rewritten by migration 002_packages_v2_alignment.sql;
    // 'consolidating' was renamed to 'manifested' under the v2 PackageStatus enum.
    await db.query(
      `UPDATE packages SET status = 'manifested' WHERE id IN (${setPlaceholders})`,
      [null, ...package_ids]
    );

    res.status(201).json({
      success: true, message: 'Consolidation request created',
      consolidation: {
        consolidation_id: consolidationId, packages_count: packages.rows.length,
        total_weight_kg: parseFloat(totalWeight.toFixed(2)), status: 'consolidating',
        created_at: new Date().toISOString(),
        note: 'Your packages are being consolidated at the warehouse. You will be notified once consolidation is complete.'
      }
    });
  } catch (error) {
    console.error('Consolidation request error:', error);
    res.status(500).json({ success: false, message: 'Failed to request consolidation' });
  }
});

/** GET /api/consolidation/:id */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId = req.user.id;

    const packages = await db.query(
      `SELECT p.id, p.description, p.weight_kg, p.status, p.received_at, p.warehouse_location,
              o.tracking_number, o.retailer, o.market
       FROM packages p JOIN orders o ON p.order_id = o.id
       WHERE p.user_id = $1 AND p.consolidated_with = $2
       ORDER BY p.created_at ASC`,
      [userId, id]
    );

    if (packages.rows.length === 0)
      return res.status(404).json({ success: false, message: 'Consolidation not found' });

    const totalWeight = packages.rows.reduce((sum, pkg) => sum + (parseFloat(pkg.weight_kg) || 0), 0);
    const statuses = packages.rows.map(p => p.status);
    let consolidationStatus = 'consolidating';
    if (statuses.every(s => s === 'in_transit')) consolidationStatus = 'in_transit';
    if (statuses.every(s => s === 'out_for_delivery')) consolidationStatus = 'out_for_delivery';
    if (statuses.every(s => s === 'delivered')) consolidationStatus = 'delivered';

    res.json({
      success: true,
      consolidation: { consolidation_id: id, status: consolidationStatus,
        packages_count: packages.rows.length, total_weight_kg: parseFloat(totalWeight.toFixed(2)),
        packages: packages.rows }
    });
  } catch (error) {
    console.error('Get consolidation error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch consolidation details' });
  }
});

export default router;
