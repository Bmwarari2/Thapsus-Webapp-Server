import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { pushToUser, pushToAdmins } from './events.js';
import { logRouteError } from '../utils/errorLogger.js';
import { sendTicketCreatedEmail, sendTicketReplyEmail } from '../utils/email.js';
import {
  createSignedUploadUrl,
  createSignedDownloadUrl,
  getSupabaseAdmin,
  sanitizeUploadFilename
} from '../utils/supabaseAdmin.js';

const router = express.Router();

const TICKET_ATTACHMENT_BUCKET = 'ticket-attachments';

/** GET /api/tickets */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId   = req.user.id;
    const page     = parseInt(req.query.page)  || 1;
    const limit    = parseInt(req.query.limit) || 10;
    const status   = req.query.status;
    const priority = req.query.priority;

    const params = [userId];
    let conditions = 'WHERE user_id = $1';
    if (status)   { params.push(status);   conditions += ` AND status = $${params.length}`; }
    if (priority) { params.push(priority); conditions += ` AND priority = $${params.length}`; }

    const countRes   = await db.query(`SELECT COUNT(*) AS count FROM tickets ${conditions}`, params);
    const total      = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset     = (page - 1) * limit;
    params.push(limit, offset);
    const tickets = await db.query(
      `SELECT * FROM tickets ${conditions} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, tickets: tickets.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get tickets error:', error);
    logRouteError(req, res, error, 'Get tickets error');
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

/** POST /api/tickets */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { subject, description, priority } = req.body;
    const isAdminUser = req.user.role === 'admin';

    if (!subject || !description)
      return res.status(400).json({ success: false, message: 'Subject and description are required' });

    // Only admins can choose priority; customers default to medium
    let ticketPriority = 'medium';
    if (isAdminUser && priority) {
      ticketPriority = priority;
    }
    if (!['low','medium','high'].includes(ticketPriority))
      return res.status(400).json({ success: false, message: 'Invalid priority' });

    const ticketId = uuidv4();

    await db.query(
      `INSERT INTO tickets (id, user_id, subject, description, status, priority, photo_url)
       VALUES ($1,$2,$3,$4,'open',$5,$6)`,
      [ticketId, userId, subject, description, ticketPriority, null]
    );

    const ticket = (await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId])).rows[0];

    // Notify admins that a new ticket was raised
    pushToAdmins('ticket_update', { action: 'created', ticket });

    // Email notification to support inbox (non-blocking)
    try {
      const supportEmail = process.env.SUPPORT_EMAIL || process.env.SUPPORT_INBOX || process.env.GMAIL_SENDER_EMAIL;
      if (supportEmail) {
        await sendTicketCreatedEmail(supportEmail, ticket);
      }
    } catch (err) {
      console.error('Ticket email notify failed', err);
    }

    res.status(201).json({ success: true, message: 'Ticket created successfully', ticket });
  } catch (error) {
    console.error('Create ticket error:', error);
    logRouteError(req, res, error, 'Create ticket error');
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

/** GET /api/tickets/:id */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId = req.user.id;
    const isAdminUser = req.user.role === 'admin';

    // Admins get the customer's name/email joined in so the conversation
    // view can render the contact header on a direct load (deep link /
    // page refresh) without depending on the list payload.
    const ticketRes = isAdminUser
      ? await db.query(
          `SELECT t.*, u.name AS customer_name, u.email AS customer_email
           FROM tickets t LEFT JOIN users u ON t.user_id = u.id
           WHERE t.id = $1`,
          [id]
        )
      : await db.query('SELECT * FROM tickets WHERE id = $1 AND user_id = $2', [id, userId]);

    if (!ticketRes.rows[0]) {
      return res.status(404).json({ success: false, message: 'Ticket not found' });
    }

    const ticket = ticketRes.rows[0];

    const messages = await db.query(
      `SELECT tm.id, tm.message, tm.attachment_url, tm.created_at, u.email, u.name, u.role
       FROM ticket_messages tm
       JOIN users u ON tm.sender_id = u.id
       WHERE tm.ticket_id = $1
       ORDER BY tm.created_at ASC`,
      [id]
    );

    res.json({ success: true, ticket, messages: messages.rows });
  } catch (error) {
    console.error('Get ticket error:', error);
    logRouteError(req, res, error, 'Get ticket error');
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

/** POST /api/tickets/:id/message */
router.post('/:id/message', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const { id }     = req.params;
    const { message, attachment_url } = req.body;
    const userId     = req.user.id;
    const isAdminUser = req.user.role === 'admin';
    // Allow attachment-only messages — a customer who just snaps a photo of a
    // damaged parcel shouldn't be forced to type something.
    if (!message && !attachment_url) {
      return res.status(400).json({ success: false, message: 'Message or attachment required' });
    }

    // Admins can message any ticket; customers only their own
    const ticketRes = isAdminUser
      ? await db.query('SELECT * FROM tickets WHERE id = $1', [id])
      : await db.query('SELECT * FROM tickets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!ticketRes.rows[0]) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const ticket    = ticketRes.rows[0];
    const messageId = uuidv4();
    await db.query(
      `INSERT INTO ticket_messages (id, ticket_id, sender_id, message, attachment_url)
       VALUES ($1,$2,$3,$4,$5)`,
      [messageId, id, userId, message || '', attachment_url || null]
    );
    await db.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);

    const payload = {
      action: 'new_message',
      ticketId: id,
      message,
      attachmentUrl: attachment_url || null,
      senderId: userId,
      messageId
    };
    if (isAdminUser) {
      // Admin replied — push to ticket owner
      pushToUser(ticket.user_id, 'ticket_update', payload);

      // Also email the customer (non-blocking)
      try {
        const userRes = await db.query('SELECT email, name FROM users WHERE id = $1', [ticket.user_id]);
        const user = userRes.rows[0];
        if (user && user.email) {
          await sendTicketReplyEmail(user.email, user.name, ticket, message);
        }
      } catch (err) {
        console.error('Ticket reply email failed', err);
      }
    } else {
      // Customer replied — push to all admins
      pushToAdmins('ticket_update', payload);
    }

    res.status(201).json({ success: true, message: 'Message added successfully', message_id: messageId });
  } catch (error) {
    console.error('Add message error:', error);
    logRouteError(req, res, error, 'Add message error');
    res.status(500).json({ success: false, message: 'Failed to add message' });
  }
});

/** PUT /api/tickets/:id/status  (admin only) */
router.put('/:id/status', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const { status, admin_message } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Status is required' });
    if (!['open','in_progress','resolved','closed'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status' });

    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1', [id]);
    if (!ticketRes.rows[0]) return res.status(404).json({ success: false, message: 'Ticket not found' });

    await db.query('UPDATE tickets SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
    if (admin_message) {
      await db.query(
        'INSERT INTO ticket_messages (id, ticket_id, sender_id, message) VALUES ($1,$2,$3,$4)',
        [uuidv4(), id, req.user.id, admin_message]
      );
    }
    const updated = (await db.query('SELECT * FROM tickets WHERE id = $1', [id])).rows[0];

    // Notify the ticket owner in real time
    pushToUser(updated.user_id, 'ticket_update', { action: 'status_changed', ticket: updated });

    res.json({ success: true, message: 'Ticket status updated successfully', ticket: updated });
  } catch (error) {
    console.error('Update ticket status error:', error);
    logRouteError(req, res, error, 'Update ticket status error');
    res.status(500).json({ success: false, message: 'Failed to update ticket status' });
  }
});

/** GET /api/tickets/admin/all  (admin only) */
router.get('/admin/all', authMiddleware, isAdmin, async (req, res) => {
  try {
    const db = req.db;
    const page     = parseInt(req.query.page)  || 1;
    const limit    = parseInt(req.query.limit) || 10;
    const status   = req.query.status;
    const priority = req.query.priority;

    const params = [];
    let conditions = 'WHERE 1=1';
    if (status)   { params.push(status);   conditions += ` AND t.status = $${params.length}`; }
    if (priority) { params.push(priority); conditions += ` AND t.priority = $${params.length}`; }

    const countRes   = await db.query(`SELECT COUNT(*) AS count FROM tickets t ${conditions}`, params);
    const total      = parseInt(countRes.rows[0].count);
    const totalPages = Math.ceil(total / limit);
    const offset     = (page - 1) * limit;
    params.push(limit, offset);

    const tickets = await db.query(
      `SELECT t.*, u.name AS customer_name, u.email AS customer_email
       FROM tickets t LEFT JOIN users u ON t.user_id = u.id
       ${conditions} ORDER BY t.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, tickets: tickets.rows, pagination: { page, limit, total, totalPages } });
  } catch (error) {
    console.error('Get all tickets error:', error);
    logRouteError(req, res, error, 'Get all tickets error');
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

/**
 * POST /api/tickets/attachments/upload-url
 *
 * Mints a signed-upload URL into the private `ticket-attachments` bucket
 * (migration 006). The client PUTs bytes there directly without a Supabase
 * JWT, then POSTs the returned `path` back as `attachment_url` on
 * /api/tickets/:id/message.
 *
 * Body (optional): { filename: 'damage-photo.jpg' }
 */
router.post('/attachments/upload-url', authMiddleware, async (req, res) => {
  try {
    if (!getSupabaseAdmin()) {
      return res.status(503).json({
        success: false,
        message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.'
      });
    }
    const ts = Date.now();
    const safeName = sanitizeUploadFilename(req.body?.filename, `${ts}.jpg`);
    const path = `${req.user.id}/${ts}-${safeName}`;
    const data = await createSignedUploadUrl(TICKET_ATTACHMENT_BUCKET, path);
    return res.json({
      success: true,
      bucket: TICKET_ATTACHMENT_BUCKET,
      path,
      signed_url: data.signedUrl,
      token: data.token
    });
  } catch (err) {
    console.error('POST /tickets/attachments/upload-url error:', err);
    logRouteError(req, res, err, 'Mint ticket attachment upload URL');
    return res.status(500).json({ success: false, message: 'Failed to mint upload URL' });
  }
});

/**
 * GET /api/tickets/messages/:messageId/attachment-url
 *
 * Returns a 5-minute signed download URL for an attached photo / PDF.
 * Caller must own the ticket (or be admin); we resolve through the message
 * → ticket join.
 */
router.get('/messages/:messageId/attachment-url', authMiddleware, async (req, res) => {
  try {
    if (!getSupabaseAdmin()) {
      return res.status(503).json({
        success: false,
        message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.'
      });
    }
    const { messageId } = req.params;
    const { rows } = await req.db.query(
      `SELECT tm.attachment_url, t.user_id
         FROM ticket_messages tm
         JOIN tickets t ON t.id = tm.ticket_id
        WHERE tm.id = $1`,
      [messageId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Message not found' });
    }
    const row = rows[0];
    const isOwner = row.user_id === req.user.id;
    const isStaff = req.user.role === 'admin' || req.user.role === 'operator';
    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Not authorised' });
    }
    if (!row.attachment_url) {
      return res.status(404).json({ success: false, message: 'No attachment on this message' });
    }
    // attachment_url is the in-bucket path (per upload-url contract). Strip
    // any leading bucket prefix in case a legacy public URL crept in.
    const marker = `/${TICKET_ATTACHMENT_BUCKET}/`;
    const idx = row.attachment_url.indexOf(marker);
    const path = idx >= 0 ? row.attachment_url.slice(idx + marker.length) : row.attachment_url;
    const data = await createSignedDownloadUrl(TICKET_ATTACHMENT_BUCKET, path, 300);
    return res.json({ success: true, signed_url: data.signedUrl, expires_in_seconds: 300 });
  } catch (err) {
    console.error('GET /tickets/messages/:messageId/attachment-url error:', err);
    logRouteError(req, res, err, 'Mint ticket attachment download URL');
    return res.status(500).json({ success: false, message: 'Failed to mint download URL' });
  }
});

export default router;
