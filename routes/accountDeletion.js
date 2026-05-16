/**
 * routes/accountDeletion.js — customer-initiated account deletion with
 * a 14-day cooldown window.
 *
 *   POST   /api/account/deletion-request           — start cooldown, build + email export
 *   GET    /api/account/deletion-request           — current status (incl. days remaining)
 *   DELETE /api/account/deletion-request           — cancel before scheduled date
 *   GET    /api/account/deletion-request/export    — refresh signed download URL
 *
 * The actual deletion runs in utils/accountDeletionRunner.js on a daily
 * sweep. The cooldown is enforced server-side (scheduled_deletion_at =
 * NOW() + 14 days). Cancellation is a soft toggle — sets cancelled_at,
 * row remains for audit.
 *
 * Schema lives in database/manual-migrations/002_account_deletion_requests.sql.
 * The POST handler returns a 503 with a clear "table not provisioned"
 * message if the migration hasn't been applied yet (same pattern as DSAR).
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import {
  generateAndUploadHtmlExport,
  refreshExportSignedUrl,
} from '../utils/accountDataExport.js';
import { sendAccountDeletionRequestedEmail } from '../utils/email.js';

const router = express.Router();

const COOLDOWN_DAYS = 14;

function scheduledDeletionAt() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + COOLDOWN_DAYS);
  return d.toISOString();
}

function daysRemaining(scheduledAt) {
  const ms = new Date(scheduledAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

async function tableExists(db) {
  const { rows } = await db.query(`SELECT to_regclass('public.account_deletion_requests') AS reg`);
  return !!rows[0]?.reg;
}

function shapeRequest(row) {
  if (!row) return null;
  const isActive = !row.cancelled_at && !row.completed_at;
  return {
    id: row.id,
    user_id: row.user_id,
    requested_at: row.requested_at,
    scheduled_deletion_at: row.scheduled_deletion_at,
    cancelled_at: row.cancelled_at,
    cancel_reason: row.cancel_reason,
    completed_at: row.completed_at,
    export_signed_url: isActive ? row.export_signed_url : null,
    export_url_expires_at: row.export_url_expires_at,
    export_generated_at: row.export_generated_at,
    export_emailed_at: row.export_emailed_at,
    days_remaining: isActive ? daysRemaining(row.scheduled_deletion_at) : 0,
    status: row.cancelled_at ? 'cancelled'
          : row.completed_at ? 'completed'
          : 'pending',
  };
}

/**
 * POST /api/account/deletion-request — start the 14-day cooldown.
 * Generates the HTML export, uploads it, emails the customer with the
 * signed download URL, and returns the active request.
 *
 * 409 if the user already has an active request (cancel or wait for
 * completion before re-requesting).
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    if (!await tableExists(req.db)) {
      return res.status(503).json({
        success: false,
        message: 'Account deletion table not provisioned on this environment. Run database/manual-migrations/002_account_deletion_requests.sql in Supabase and try again.',
      });
    }

    const userId = req.user.id;

    // Existing active request → 409. Customer can cancel via DELETE, then
    // re-request if they really want a new export + fresh 14-day clock.
    const existing = await req.db.query(
      `SELECT * FROM account_deletion_requests
        WHERE user_id = $1 AND cancelled_at IS NULL AND completed_at IS NULL
        LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'You already have an active deletion request. Cancel it from the app first if you need to start over.',
        request: shapeRequest(existing.rows[0]),
      });
    }

    const profile = await req.db.query(
      `SELECT id, email, name FROM users WHERE id = $1`,
      [userId]
    );
    if (profile.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    const user = profile.rows[0];
    if (!user.email) {
      return res.status(422).json({
        success: false,
        message: "Your account has no email on file — we can't deliver the data export. Add one in your profile first.",
      });
    }

    // Insert the request first (with placeholders) so we have an ID for
    // the storage path; then upload + email + update the row with the
    // signed URL.
    const scheduled = scheduledDeletionAt();
    const insertRes = await req.db.query(
      `INSERT INTO account_deletion_requests (user_id, scheduled_deletion_at)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, scheduled]
    );
    const request = insertRes.rows[0];

    let exportInfo;
    try {
      exportInfo = await generateAndUploadHtmlExport(req.db, { userId, request });
    } catch (e) {
      // Roll back the request row so the user can retry rather than
      // sitting on a stuck pending state.
      await req.db.query(`DELETE FROM account_deletion_requests WHERE id = $1`, [request.id]);
      return res.status(502).json({
        success: false,
        message: `Couldn't generate your data export: ${e.message}. No deletion was scheduled — please try again.`,
      });
    }

    let emailedAt = null;
    try {
      await sendAccountDeletionRequestedEmail({
        toEmail: user.email,
        toName: user.name,
        scheduledDeletionAt: scheduled,
        exportUrl: exportInfo.signedUrl,
        userId,
      });
      emailedAt = new Date().toISOString();
    } catch (e) {
      // Email failure is non-fatal — the request stands, the customer
      // can still download the export from inside the app. Surface a
      // warning in the response so the client can mention it.
      console.warn(`[account-deletion] email failed for ${user.email}: ${e.message}`);
    }

    const updated = await req.db.query(
      `UPDATE account_deletion_requests
          SET export_storage_path   = $2,
              export_signed_url     = $3,
              export_url_expires_at = $4,
              export_generated_at   = NOW(),
              export_emailed_at     = $5
        WHERE id = $1
        RETURNING *`,
      [request.id, exportInfo.storagePath, exportInfo.signedUrl, exportInfo.expiresAt, emailedAt]
    );

    res.status(201).json({
      success: true,
      message: emailedAt
        ? 'Deletion scheduled. Your data export has been emailed to you.'
        : 'Deletion scheduled. We could not email the export — download it from this screen.',
      request: shapeRequest(updated.rows[0]),
    });
  } catch (err) {
    console.error('POST /account/deletion-request error:', err);
    res.status(500).json({ success: false, message: `Failed to start deletion: ${err.message}` });
  }
});

/**
 * GET /api/account/deletion-request — current status. Returns the most
 * recent row regardless of status; the client renders cancelled /
 * completed / pending differently.
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    if (!await tableExists(req.db)) {
      return res.json({ success: true, request: null });
    }
    const { rows } = await req.db.query(
      `SELECT * FROM account_deletion_requests
        WHERE user_id = $1
        ORDER BY requested_at DESC
        LIMIT 1`,
      [req.user.id]
    );
    res.json({ success: true, request: shapeRequest(rows[0]) });
  } catch (err) {
    console.error('GET /account/deletion-request error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch status' });
  }
});

/**
 * DELETE /api/account/deletion-request — cancel the active request.
 * 404 if there is no active request to cancel.
 */
router.delete('/', authMiddleware, async (req, res) => {
  try {
    if (!await tableExists(req.db)) {
      return res.status(404).json({ success: false, message: 'No deletion request found.' });
    }
    const reason = (req.body?.reason || '').toString().slice(0, 500) || null;
    const { rows } = await req.db.query(
      `UPDATE account_deletion_requests
          SET cancelled_at  = NOW(),
              cancel_reason = $2
        WHERE user_id = $1
          AND cancelled_at IS NULL
          AND completed_at IS NULL
        RETURNING *`,
      [req.user.id, reason]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No active deletion request to cancel.' });
    }
    res.json({
      success: true,
      message: 'Deletion cancelled. Your account stays as-is.',
      request: shapeRequest(rows[0]),
    });
  } catch (err) {
    console.error('DELETE /account/deletion-request error:', err);
    res.status(500).json({ success: false, message: 'Failed to cancel deletion' });
  }
});

/**
 * GET /api/account/deletion-request/export — refresh signed URL. Returns
 * a brand-new signed URL for the existing HTML export. Used by the
 * client to re-download if the original URL is past TTL or got lost.
 */
router.get('/export', authMiddleware, async (req, res) => {
  try {
    if (!await tableExists(req.db)) {
      return res.status(404).json({ success: false, message: 'No deletion request found.' });
    }
    const { rows } = await req.db.query(
      `SELECT * FROM account_deletion_requests
        WHERE user_id = $1
          AND cancelled_at IS NULL
          AND completed_at IS NULL
        ORDER BY requested_at DESC
        LIMIT 1`,
      [req.user.id]
    );
    if (rows.length === 0 || !rows[0].export_storage_path) {
      return res.status(404).json({ success: false, message: 'No data export available.' });
    }
    const fresh = await refreshExportSignedUrl(rows[0].export_storage_path);
    if (!fresh?.signedUrl) {
      return res.status(502).json({ success: false, message: 'Could not refresh download URL.' });
    }
    await req.db.query(
      `UPDATE account_deletion_requests
          SET export_signed_url     = $2,
              export_url_expires_at = $3
        WHERE id = $1`,
      [rows[0].id, fresh.signedUrl, fresh.expiresAt]
    );
    res.json({
      success: true,
      export_signed_url: fresh.signedUrl,
      export_url_expires_at: fresh.expiresAt,
    });
  } catch (err) {
    console.error('GET /account/deletion-request/export error:', err);
    res.status(500).json({ success: false, message: 'Failed to refresh export URL' });
  }
});

export default router;
