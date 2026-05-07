/**
 * routes/dsar.js — GDPR data subject access requests (Spec §4.11).
 *
 *   POST  /api/dsar               — customer requests export or erasure
 *   GET   /api/dsar/me            — customer sees their requests
 *   GET   /api/dsar/queue         — admin sees all open DSARs
 *   PATCH /api/dsar/:id           — admin marks fulfilled / rejected
 *   POST  /api/dsar/:id/export    — admin packages user data into JSON blob
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

/** Compute due date (30-day SLA) */
function dueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

/** POST /api/dsar — customer creates a DSAR */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { type, notes } = req.body;
    if (!['export','erase'].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'export' or 'erase'" });
    }
    const exists = await req.db.query(`SELECT to_regclass('public.dsar_requests') AS reg`);
    if (!exists.rows[0]?.reg) {
      return res.status(503).json({
        success: false,
        message: 'DSAR table not provisioned on this environment. Run database/migrations/001_framework_v2_additions.sql in Supabase and try again.'
      });
    }
    const id = uuidv4();
    const due = dueDate();
    await req.db.query(
      `INSERT INTO dsar_requests (id, user_id, type, status, due_at, notes)
       VALUES ($1,$2,$3,'open',$4,$5)`,
      [id, req.user.id, type, due, notes || null]
    );
    res.status(201).json({
      success: true,
      request_id: id,
      due_at: due,
      request: {
        id, user_id: req.user.id, type, status: 'open',
        due_at: due, notes: notes || null,
        created_at: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('POST /dsar error:', err);
    res.status(500).json({ success: false, message: `Failed to create DSAR: ${err.message}` });
  }
});

/** GET /api/dsar/me — customer's own requests */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM dsar_requests WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, requests: rows });
  } catch (err) {
    console.error('GET /dsar/me error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch DSARs' });
  }
});

/** GET /api/dsar/queue — admin queue */
router.get('/queue', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT d.*, u.email, u.name FROM dsar_requests d
         JOIN users u ON u.id = d.user_id
        WHERE d.status IN ('open','in_progress')
        ORDER BY d.due_at ASC`
    );
    res.json({ success: true, requests: rows });
  } catch (err) {
    console.error('GET /dsar/queue error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch queue' });
  }
});

/** PATCH /api/dsar/:id — admin updates status */
router.patch('/:id', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, export_url } = req.body;
    if (!['open','in_progress','fulfilled','rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'invalid status' });
    }
    const fulfilled = status === 'fulfilled' ? new Date().toISOString() : null;
    await req.db.query(
      `UPDATE dsar_requests
          SET status = $1, notes = COALESCE($2, notes), export_url = COALESCE($3, export_url),
              fulfilled_at = COALESCE($4, fulfilled_at)
        WHERE id = $5`,
      [status, notes, export_url, fulfilled, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /dsar/:id error:', err);
    res.status(500).json({ success: false, message: 'Failed to update DSAR' });
  }
});

/** POST /api/dsar/:id/export — admin builds the export blob */
router.post('/:id/export', authMiddleware, requireRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const dsar = await req.db.query(
      `SELECT * FROM dsar_requests WHERE id = $1`, [id]
    );
    if (dsar.rows.length === 0)
      return res.status(404).json({ success: false, message: 'DSAR not found' });
    const userId = dsar.rows[0].user_id;

    const [user, orders, txns, tickets] = await Promise.all([
      req.db.query(`SELECT id, email, name, phone, warehouse_id, language_pref,
                           country_of_residence, kyc_status, marketing_consent_at,
                           utm_source, utm_medium, utm_campaign, created_at
                      FROM users WHERE id = $1`, [userId]),
      req.db.query(`SELECT * FROM orders WHERE user_id = $1`, [userId]),
      req.db.query(`SELECT * FROM transactions WHERE user_id = $1`, [userId]),
      req.db.query(`SELECT * FROM tickets WHERE user_id = $1`, [userId]),
    ]);

    res.json({
      success: true,
      export: {
        generated_at: new Date().toISOString(),
        user: user.rows[0],
        orders: orders.rows,
        transactions: txns.rows,
        tickets: tickets.rows,
      },
    });
  } catch (err) {
    console.error('POST /dsar/:id/export error:', err);
    res.status(500).json({ success: false, message: 'Failed to export user data' });
  }
});

export default router;
