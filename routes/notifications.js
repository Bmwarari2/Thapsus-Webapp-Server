/**
 * routes/notifications.js — Customer notification inbox.
 *
 * Reads/writes the existing `notifications` table (database/schema.sql §
 * notifications). Used by the iOS app's inbox screen and the webapp's
 * NotificationBanner. Mark-as-read is per-row plus a mark-all helper.
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';

const router = express.Router();

/** GET /api/notifications — paginated list for the signed-in user. */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit, 10)  || 50, 100);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

    const { rows } = await req.db.query(
      `SELECT id, type, message, is_read, created_at
         FROM notifications
        WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [req.user.id, limit, offset]
    );

    const { rows: countRows } = await req.db.query(
      `SELECT COUNT(*) FILTER (WHERE is_read = false) AS unread
         FROM notifications WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({
      success: true,
      notifications: rows,
      unread: parseInt(countRows[0]?.unread || '0', 10),
    });
  } catch (error) {
    console.error('GET /notifications error:', error);
    logRouteError(req, res, error, 'List notifications error');
    res.status(500).json({ success: false, message: 'Failed to load notifications' });
  }
});

/** PUT /api/notifications/:id/read — mark a single notification as read. */
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await req.db.query(
      `UPDATE notifications SET is_read = true
        WHERE id = $1 AND user_id = $2`,
      [id, req.user.id]
    );
    if (rowCount === 0) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('PUT /notifications/:id/read error:', error);
    logRouteError(req, res, error, 'Mark notification read error');
    res.status(500).json({ success: false, message: 'Failed to mark as read' });
  }
});

/** PUT /api/notifications/read-all — mark every notification as read. */
router.put('/read-all', authMiddleware, async (req, res) => {
  try {
    await req.db.query(
      `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('PUT /notifications/read-all error:', error);
    logRouteError(req, res, error, 'Mark all read error');
    res.status(500).json({ success: false, message: 'Failed to mark all as read' });
  }
});

export default router;
