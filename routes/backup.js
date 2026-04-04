import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * POST /api/admin/backups
 * Records a backup entry (Supabase handles physical backups).
 * On Supabase, use the dashboard's built-in Point-in-Time Recovery (PITR)
 * or pg_dump from your local machine for manual backups.
 */
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const adminId = req.user.id;
    const backupId = uuidv4();
    const timestamp = new Date().toISOString();
    const filename = `supabase-backup-note-${timestamp.replace(/[:.]/g, '-')}.txt`;

    await db.query(
      `INSERT INTO backups (id, filename, filepath, size_bytes, checksum, status, created_by)
       VALUES ($1,$2,$3,0,'supabase-managed','completed',$4)`,
      [backupId, filename, 'supabase', adminId]
    );

    const logId = uuidv4();
    await db.query(
      `INSERT INTO admin_logs (id, admin_id, action, details) VALUES ($1,$2,'create_backup',$3)`,
      [logId, adminId, JSON.stringify({ backup_id: backupId, note: 'Supabase manages backups automatically. Use the Supabase dashboard for PITR or pg_dump for manual exports.' })]
    );

    res.status(201).json({
      success: true,
      message: 'Backup note recorded. Supabase manages physical database backups automatically.',
      backup: { id: backupId, filename, status: 'completed', created_at: timestamp,
        note: 'Use the Supabase dashboard (Database > Backups) for Point-in-Time Recovery, or run pg_dump locally for a manual export.' }
    });
  } catch (error) {
    console.error('Create backup error:', error);
    res.status(500).json({ success: false, message: 'Failed to record backup' });
  }
});

/** GET /api/admin/backups */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const countRes = await db.query('SELECT COUNT(*) AS count FROM backups');
    const total = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    const backups = await db.query(
      `SELECT b.id, b.filename, b.size_bytes, b.checksum, b.status, b.created_at,
              u.name AS created_by_name, u.email AS created_by_email
       FROM backups b LEFT JOIN users u ON b.created_by = u.id
       ORDER BY b.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    res.json({
      success: true,
      backups: backups.rows.map(b => ({
        id: b.id, filename: b.filename, size_bytes: b.size_bytes,
        size_mb: parseFloat(((b.size_bytes || 0) / (1024 * 1024)).toFixed(2)),
        checksum: b.checksum, status: b.status, integrity: 'supabase-managed',
        created_at: b.created_at,
        created_by: b.created_by_name || b.created_by_email || 'System'
      })),
      pagination: { page, limit, total, totalPages }
    });
  } catch (error) {
    console.error('List backups error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch backups' });
  }
});

export default router;
