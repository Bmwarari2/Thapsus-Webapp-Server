// routes/waInbox.js
//
// Operator API for the unified WhatsApp inbox: conversation list with
// unread badges, message threads, sending text/media from the dashboard,
// and contact-detail edits. Live updates ride SSE ('wa_inbox_update',
// 'wa_new_customer') — this API is the pull side.

import express from 'express';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';
import { sendToContact } from '../utils/waSend.js';
import {
  createSignedUploadUrl,
  createSignedDownloadUrl,
  sanitizeUploadFilename,
} from '../utils/supabaseAdmin.js';

const router = express.Router();
const STAFF = requireRole('operator');

const MEDIA_BUCKET = 'wa-media';

/** GET /api/wa/conversations?q=&limit= — inbox list, newest activity first. */
router.get('/conversations', authMiddleware, STAFF, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 300);
    const q = String(req.query.q || '').trim();
    const params = [];
    let where = '';
    if (q) {
      params.push(`%${q}%`);
      where = `WHERE (full_name ILIKE $1 OR phone LIKE $1 OR customer_code ILIKE $1)`;
    }
    params.push(limit);
    const { rows } = await req.db.query(
      `SELECT id, phone, customer_code, full_name, state, unread_count,
              last_message_at, last_message_preview, created_at, human_takeover_at
         FROM wa_contacts
         ${where}
        ORDER BY last_message_at DESC NULLS LAST
        LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, conversations: rows });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/conversations');
    res.status(500).json({ success: false, message: 'Failed to load conversations' });
  }
});

/** GET /api/wa/conversations/:contactId — contact + their orders. */
router.get('/conversations/:contactId', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM wa_contacts WHERE id = $1`, [req.params.contactId]
    );
    const contact = rows[0];
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });
    const { rows: orders } = await req.db.query(
      `SELECT id, tracking_code, status, quote_kes, product_links, created_at
         FROM wa_orders WHERE contact_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [contact.id]
    );
    res.json({ success: true, contact, orders });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/conversations/:contactId');
    res.status(500).json({ success: false, message: 'Failed to load conversation' });
  }
});

/** GET /api/wa/conversations/:contactId/messages?before=&limit= */
router.get('/conversations/:contactId/messages', authMiddleware, STAFF, async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
    const before = String(req.query.before || '').trim(); // ISO timestamp cursor
    const params = [req.params.contactId];
    let where = 'WHERE contact_id = $1';
    if (before) {
      params.push(before);
      where += ` AND created_at < $${params.length}::timestamptz`;
    }
    params.push(limit);
    const { rows } = await req.db.query(
      `SELECT * FROM wa_messages ${where}
        ORDER BY created_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({ success: true, messages: rows.reverse() });
  } catch (err) {
    logRouteError(req, res, err, 'GET /api/wa/conversations/:contactId/messages');
    res.status(500).json({ success: false, message: 'Failed to load messages' });
  }
});

/**
 * POST /api/wa/conversations/:contactId/messages
 *   { text } | { media_path, media_type, caption? }
 * media_path is an object path in the wa-media bucket previously uploaded
 * via POST /api/wa/upload-url; we mint a signed URL for delivery.
 */
router.post('/conversations/:contactId/messages', authMiddleware, STAFF, async (req, res) => {
  try {
    const { text, media_path, media_type, caption } = req.body || {};
    const { rows } = await req.db.query(
      `SELECT id, phone, state FROM wa_contacts WHERE id = $1`, [req.params.contactId]
    );
    const contact = rows[0];
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    let mediaUrl = null;
    let mediaKind = null;
    if (media_path) {
      if (typeof media_path !== 'string' || media_path.includes('..')) {
        return res.status(400).json({ success: false, message: 'Invalid media_path' });
      }
      mediaKind = media_type === 'document' ? 'document' : 'image';
      const signed = await createSignedDownloadUrl(MEDIA_BUCKET, media_path, 7 * 24 * 3600);
      mediaUrl = signed?.signedUrl || null;
      if (!mediaUrl) return res.status(502).json({ success: false, message: 'Failed to sign media URL' });
    }
    const body = typeof text === 'string' ? text.trim() : (typeof caption === 'string' ? caption.trim() : '');
    if (!body && !mediaUrl) {
      return res.status(400).json({ success: false, message: 'Provide text or media_path' });
    }

    const result = await sendToContact(req.db, contact, {
      text: body || undefined,
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaKind || undefined,
      sentBy: req.user.id,
    });
    if (!result.ok) {
      return res.status(502).json({ success: false, message: `Send failed: ${result.error}`, message_id: result.id });
    }
    // A human just replied — pause the assistant on this thread so the
    // customer isn't answered by two voices. It resumes on its own after
    // ai_resume_after_minutes of silence, or via the toggle below.
    await req.db.query(
      `UPDATE wa_contacts SET human_takeover_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [contact.id]
    );
    res.status(201).json({ success: true, message_id: result.id, ai_paused: true });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/conversations/:contactId/messages');
    res.status(500).json({ success: false, message: 'Failed to send message' });
  }
});

/** POST /api/wa/conversations/:contactId/read — clear the unread badge. */
router.post('/conversations/:contactId/read', authMiddleware, STAFF, async (req, res) => {
  try {
    await req.db.query(
      `UPDATE wa_contacts SET unread_count = 0, updated_at = NOW() WHERE id = $1`,
      [req.params.contactId]
    );
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/conversations/:contactId/read');
    res.status(500).json({ success: false, message: 'Failed to mark read' });
  }
});

/**
 * PUT /api/wa/contacts/:contactId — operator fixes profile details or
 * blocks/unblocks. Only whitelisted fields.
 */
router.put('/contacts/:contactId', authMiddleware, STAFF, async (req, res) => {
  try {
    const allowed = ['full_name', 'delivery_address', 'mpesa_number'];
    const sets = [];
    const params = [req.params.contactId];
    for (const field of allowed) {
      if (typeof req.body?.[field] === 'string') {
        params.push(req.body[field].trim().slice(0, 400));
        sets.push(`${field} = $${params.length}`);
      }
    }
    if (req.body?.blocked === true) { params.push('blocked'); sets.push(`state = $${params.length}`); }
    if (req.body?.blocked === false) { params.push('active'); sets.push(`state = $${params.length}`); }
    if (sets.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });
    sets.push('updated_at = NOW()');
    const { rows } = await req.db.query(
      `UPDATE wa_contacts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, contact: rows[0] });
  } catch (err) {
    logRouteError(req, res, err, 'PUT /api/wa/contacts/:contactId');
    res.status(500).json({ success: false, message: 'Failed to update contact' });
  }
});

/**
 * POST /api/wa/conversations/:contactId/ai  { enabled: boolean }
 * Hand the thread back to the assistant (enabled=true) or keep it with
 * the humans (enabled=false). Replying from the inbox pauses it
 * automatically; this is the explicit override in both directions.
 */
router.post('/conversations/:contactId/ai', authMiddleware, STAFF, async (req, res) => {
  try {
    const enabled = req.body?.enabled === true;
    const { rows } = await req.db.query(
      enabled
        ? `UPDATE wa_contacts SET human_takeover_at = NULL, updated_at = NOW()
            WHERE id = $1 RETURNING id, human_takeover_at`
        : `UPDATE wa_contacts SET human_takeover_at = NOW(), updated_at = NOW()
            WHERE id = $1 RETURNING id, human_takeover_at`,
      [req.params.contactId]
    );
    if (!rows[0]) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true, ai_paused: Boolean(rows[0].human_takeover_at) });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/conversations/:contactId/ai');
    res.status(500).json({ success: false, message: 'Failed to update assistant state' });
  }
});

/**
 * POST /api/wa/upload-url  { filename, content_type }
 * Signed Supabase upload URL for outbound inbox media (images/PDFs).
 * Rate-limited via the shared uploadLimiter in server.js.
 */
router.post('/upload-url', authMiddleware, STAFF, async (req, res) => {
  try {
    const { filename, content_type } = req.body || {};
    const clean = sanitizeUploadFilename(filename, 'attachment.bin');
    const path = `outbox/${Date.now()}-${clean}`;
    const signed = await createSignedUploadUrl(MEDIA_BUCKET, path);
    if (!signed) return res.status(502).json({ success: false, message: 'Failed to mint upload URL' });
    res.json({ success: true, path, content_type: content_type || null, ...signed });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/upload-url');
    res.status(500).json({ success: false, message: 'Failed to mint upload URL' });
  }
});

export default router;
