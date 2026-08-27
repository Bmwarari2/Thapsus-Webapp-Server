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
import { normalizeKenyanPhone } from '../utils/lipanaClient.js';
import { nextCustomerCode } from '../utils/waCodes.js';
import { pushToStaff } from '../routes/events.js';
import {
  createSignedUploadUrl,
  createSignedDownloadUrl,
  sanitizeUploadFilename,
} from '../utils/supabaseAdmin.js';
import { MEDIA_BUCKET, mediaShortUrl } from '../utils/mediaLink.js';

const router = express.Router();
const STAFF = requireRole('operator');

// The bucket name lives with the link helper, so the token and the
// redirect can never disagree about which bucket a path is in.

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
      // A short link, not the signed URL. The signed one is ~600
      // characters of JWT: on WhatsApp it arrives as a wall of
      // underlined text taller than the photo, and it expires, so a
      // message opened next week leads nowhere. /m/:token mints a fresh
      // signature at click time — the same trick receipts use.
      mediaUrl = mediaShortUrl(media_path);
      if (!mediaUrl) return res.status(502).json({ success: false, message: 'Failed to build the media link' });
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
 * POST /api/wa/conversations/:contactId/dismiss-reminder — silence the
 * unanswered-conversation reminder for the CURRENT message.
 *
 * Some messages genuinely need no reply — a "thank you", an emoji, a
 * screenshot for the record. Without this, the sweeper paged staff 15
 * minutes later anyway. Stamping unanswered_alerted_at marks the current
 * stretch as handled; a new customer message later re-arms the reminder
 * automatically, so silencing never mutes the conversation for good.
 */
router.post('/conversations/:contactId/dismiss-reminder', authMiddleware, STAFF, async (req, res) => {
  try {
    const { rowCount } = await req.db.query(
      `UPDATE wa_contacts SET unanswered_alerted_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [req.params.contactId]
    );
    if (rowCount === 0) return res.status(404).json({ success: false, message: 'Contact not found' });
    res.json({ success: true });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/conversations/:contactId/dismiss-reminder');
    res.status(500).json({ success: false, message: 'Failed to dismiss the reminder' });
  }
});

/**
 * Read a phone number the way an operator typed it.
 *
 * Kenyan numbers come in every shape and normalizeKenyanPhone knows them
 * all. Anything else has to carry its country code, because bare digits
 * are ambiguous: '9607218089' is a perfectly good Maldives number and
 * also what a mistyped Kenyan one looks like. Requiring the + means we
 * never have to guess which.
 *
 * The stored form is bare digits either way — sentdm's toE164() puts the
 * + back on the way out — and nothing downstream assumes Kenya, so any
 * country code works. The 8-digit floor is there for typos, not
 * geography: the shortest real international numbers run to about that.
 *
 * @returns {{phone: string|null, error: string|null}}
 */
function parseContactPhone(input) {
  const raw = String(input || '').trim();
  const international = /^(\+|00)/.test(raw);
  const phone = normalizeKenyanPhone(raw)
    || (international ? raw.replace(/\D/g, '').replace(/^00/, '') : null);
  if (!phone || phone.length < 8 || phone.length > 15) {
    return {
      phone: null,
      error: international
        ? 'That international number does not look right — check the country code and digits.'
        : 'Enter a Kenyan number (07…, 01… or +254…), or a number from anywhere else with its country code (+44…).',
    };
  }
  return { phone, error: null };
}

/**
 * POST /api/wa/contacts
 *   { phone, full_name?, delivery_address?, mpesa_number?, source?, note? }
 *
 * Add someone who reached us somewhere else — Instagram, TikTok, a phone
 * call, a friend of a friend. The WhatsApp flow normally creates contacts
 * itself from an inbound message, but plenty of customers arrive by other
 * routes and still need a Customer Code and a place in the pipeline.
 *
 * A name is enough to earn a Customer Code here, which is where this
 * parts company with the conversational path. The assistant asks for the
 * address before it calls anyone a customer; an operator typing the row
 * in already knows who they are, and wants a code to quote them straight
 * away. The state still records what is missing, so if they message in
 * later the assistant asks for exactly that and nothing else.
 *
 * mpesa_number is still accepted, and still validated as Kenyan, because
 * an operator may know the number an existing customer pays from and it
 * is what an STK push is sent to. Nothing asks for it any more — payments
 * are matched off the M-Pesa statement — so it never holds up a profile.
 *
 * Re-adding an existing number is not an error — it fills in the blanks
 * on the row that is already there and hands it back.
 */
router.post('/contacts', authMiddleware, STAFF, async (req, res) => {
  try {
    const { phone, error } = parseContactPhone(req.body?.phone);
    if (!phone) return res.status(400).json({ success: false, message: error });

    const str = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
    const fullName = str(req.body?.full_name, 120);
    const address = str(req.body?.delivery_address, 400);
    const mpesa = req.body?.mpesa_number ? normalizeKenyanPhone(req.body.mpesa_number) : null;
    if (req.body?.mpesa_number && !mpesa) {
      return res.status(400).json({ success: false, message: 'That M-Pesa number is not a valid Kenyan number' });
    }

    // Where they came from is worth keeping — it is the only record that
    // this person did not arrive through WhatsApp.
    const source = str(req.body?.source, 40);
    const note = [source ? `Reached out via ${source}.` : null, str(req.body?.note, 300)]
      .filter(Boolean).join(' ') || null;

    const state = !fullName ? 'awaiting_name'
      : !address ? 'awaiting_address'
      : 'active';

    const { rows } = await req.db.query(
      `INSERT INTO wa_contacts (id, phone, full_name, delivery_address, mpesa_number, state, ai_summary)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, $6)
       ON CONFLICT (phone) DO UPDATE SET
         full_name        = COALESCE(wa_contacts.full_name, EXCLUDED.full_name),
         delivery_address = COALESCE(wa_contacts.delivery_address, EXCLUDED.delivery_address),
         mpesa_number     = COALESCE(wa_contacts.mpesa_number, EXCLUDED.mpesa_number),
         ai_summary       = COALESCE(wa_contacts.ai_summary, EXCLUDED.ai_summary),
         updated_at       = NOW()
       RETURNING *`,
      [phone, fullName, address, mpesa, state, note]
    );
    let contact = rows[0];

    // Code them, using the merged row rather than what was posted — an
    // existing contact may already hold the pieces this request left out.
    // 'active' still means the profile is complete; a coded contact who is
    // short an address keeps the state that says so.
    if (!contact.customer_code && contact.full_name) {
      const complete = Boolean(contact.delivery_address);
      const code = await nextCustomerCode(req.db);
      const { rows: coded } = await req.db.query(
        `UPDATE wa_contacts
            SET customer_code = $2,
                state = CASE WHEN $3::boolean THEN 'active' ELSE state END,
                updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [contact.id, code, Boolean(complete)]
      );
      contact = coded[0];
      pushToStaff('wa_new_customer', {
        contact_id: contact.id, customer_code: code,
        full_name: contact.full_name, phone: contact.phone,
      });
    }

    res.status(201).json({ success: true, contact });
  } catch (err) {
    logRouteError(req, res, err, 'POST /api/wa/contacts');
    res.status(500).json({ success: false, message: 'Failed to add contact' });
  }
});

/**
 * PUT /api/wa/contacts/:contactId — operator fixes profile details or
 * blocks/unblocks. Only whitelisted fields.
 *
 * The phone number is editable here because a mistyped one is the single
 * thing an operator most needs to correct and the least able to work
 * around: every message to that contact goes nowhere until it is right.
 * It is validated exactly as it is on the way in.
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
    if (req.body?.phone !== undefined) {
      const { phone, error } = parseContactPhone(req.body.phone);
      if (!phone) return res.status(400).json({ success: false, message: error });
      params.push(phone);
      sets.push(`phone = $${params.length}`);
    }
    if (req.body?.blocked === true) { params.push('blocked'); sets.push(`state = $${params.length}`); }
    if (req.body?.blocked === false) { params.push('active'); sets.push(`state = $${params.length}`); }
    if (sets.length === 0) return res.status(400).json({ success: false, message: 'Nothing to update' });
    sets.push('updated_at = NOW()');

    let rows;
    try {
      ({ rows } = await req.db.query(
        `UPDATE wa_contacts SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
        params
      ));
    } catch (e) {
      // phone carries a UNIQUE constraint; two rows for one person is a
      // merge decision, not something to make silently.
      if (e?.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'Another contact already has that number.',
        });
      }
      throw e;
    }
    let contact = rows[0];
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    // Same rule as adding one: a name is enough to be worth a code. This
    // is how a contact added before their name was known catches up.
    if (!contact.customer_code && contact.full_name) {
      const code = await nextCustomerCode(req.db);
      const { rows: coded } = await req.db.query(
        `UPDATE wa_contacts SET customer_code = $2, updated_at = NOW() WHERE id = $1 RETURNING *`,
        [contact.id, code]
      );
      contact = coded[0];
      pushToStaff('wa_new_customer', {
        contact_id: contact.id, customer_code: code,
        full_name: contact.full_name, phone: contact.phone,
      });
    }

    res.json({ success: true, contact });
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
