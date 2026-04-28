/**
 * routes/amlFlags.js — admin AML / risk review queue.
 * Reads/writes the `aml_flags` table created in migration 001.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';

const router = express.Router();

/** GET /api/admin/aml-flags?status=open — list flags, default open. */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const status = req.query.status || 'open';
    const { rows } = await req.db.query(
      `SELECT af.*, u.name AS user_name, u.email AS user_email
         FROM aml_flags af
         JOIN users u ON u.id = af.user_id
        WHERE af.status = $1
        ORDER BY af.created_at DESC LIMIT 200`,
      [status]
    );
    res.json({ success: true, flags: rows });
  } catch (err) {
    console.error('GET /aml-flags error:', err);
    logRouteError(req, res, err, 'List AML flags');
    res.status(500).json({ success: false, message: 'Failed to fetch flags' });
  }
});

/** POST /api/admin/aml-flags — admin records a new flag. */
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { user_id, parcel_id, reason, notes } = req.body;
    if (!user_id || !reason) {
      return res.status(400).json({ success: false, message: 'user_id and reason are required' });
    }
    const id = uuidv4();
    await req.db.query(
      `INSERT INTO aml_flags (id, user_id, parcel_id, reason, status, notes)
       VALUES ($1,$2,$3,$4,'open',$5)`,
      [id, user_id, parcel_id || null, reason, notes || null]
    );
    res.status(201).json({ success: true, id });
  } catch (err) {
    console.error('POST /aml-flags error:', err);
    logRouteError(req, res, err, 'Create AML flag');
    res.status(500).json({ success: false, message: 'Failed to create flag' });
  }
});

/** PATCH /api/admin/aml-flags/:id — clear or escalate. */
router.patch('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!['open','cleared','escalated'].includes(status)) {
      return res.status(400).json({ success: false, message: 'invalid status' });
    }
    const resolvedClause = status !== 'open'
      ? `, resolved_at = NOW(), resolved_by = $3`
      : '';
    const params = status !== 'open'
      ? [status, notes ?? null, req.user.id, req.params.id]
      : [status, notes ?? null, req.params.id];
    await req.db.query(
      `UPDATE aml_flags
          SET status = $1, notes = COALESCE($2, notes)${resolvedClause}
        WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /aml-flags/:id error:', err);
    logRouteError(req, res, err, 'Update AML flag');
    res.status(500).json({ success: false, message: 'Failed to update flag' });
  }
});

export default router;
