import express from 'express';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, isAdmin } from '../middleware/auth.js';
import { pushToUser, pushToAdmins } from './events.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || './uploads'),
  filename:    (req, file, cb) => cb(null, 'ticket-' + Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname)),
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880 },
  fileFilter: (req, file, cb) => {
    ['image/jpeg','image/png','image/gif','application/pdf'].includes(file.mimetype)
      ? cb(null, true) : cb(new Error('Invalid file type'));
  },
});

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
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

/** POST /api/tickets */
router.post('/', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const db = req.db;
    const userId = req.user.id;
    const { subject, description, priority } = req.body;
    if (!subject || !description)
      return res.status(400).json({ success: false, message: 'Subject and description are required' });
    const ticketPriority = priority || 'medium';
    if (!['low','medium','high'].includes(ticketPriority))
      return res.status(400).json({ success: false, message: 'Invalid priority' });

    const ticketId = uuidv4();
    const photoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    await db.query(
      `INSERT INTO tickets (id, user_id, subject, description, status, priority, photo_url)
       VALUES ($1,$2,$3,$4,'open',$5,$6)`,
      [ticketId, userId, subject, description, ticketPriority, photoUrl]
    );

    const ticket = (await db.query('SELECT * FROM tickets WHERE id = $1', [ticketId])).rows[0];

    // Notify admins that a new ticket was raised
    pushToAdmins('ticket_update', { action: 'created', ticket });

    res.status(201).json({ success: true, message: 'Ticket created successfully', ticket });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to create ticket' });
  }
});

/** GET /api/tickets/:id */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const { id } = req.params;
    const userId  = req.user.id;

    const ticketRes = await db.query('SELECT * FROM tickets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!ticketRes.rows[0]) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const messages = await db.query(
      `SELECT tm.id, tm.message, tm.created_at, u.email, u.name, u.role
       FROM ticket_messages tm JOIN users u ON tm.sender_id = u.id
       WHERE tm.ticket_id = $1 ORDER BY tm.created_at ASC`,
      [id]
    );
    res.json({ success: true, ticket: ticketRes.rows[0], messages: messages.rows });
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch ticket' });
  }
});

/** POST /api/tickets/:id/message */
router.post('/:id/message', authMiddleware, async (req, res) => {
  try {
    const db = req.db;
    const { id }     = req.params;
    const { message } = req.body;
    const userId     = req.user.id;
    const isAdminUser = req.user.role === 'admin';
    if (!message) return res.status(400).json({ success: false, message: 'Message is required' });

    // Admins can message any ticket; customers only their own
    const ticketRes = isAdminUser
      ? await db.query('SELECT * FROM tickets WHERE id = $1', [id])
      : await db.query('SELECT * FROM tickets WHERE id = $1 AND user_id = $2', [id, userId]);
    if (!ticketRes.rows[0]) return res.status(404).json({ success: false, message: 'Ticket not found' });

    const ticket    = ticketRes.rows[0];
    const messageId = uuidv4();
    await db.query(
      'INSERT INTO ticket_messages (id, ticket_id, sender_id, message) VALUES ($1,$2,$3,$4)',
      [messageId, id, userId, message]
    );
    await db.query('UPDATE tickets SET updated_at = NOW() WHERE id = $1', [id]);

    const payload = { action: 'new_message', ticketId: id, message, senderId: userId, messageId };
    if (isAdminUser) {
      // Admin replied — push to ticket owner
      pushToUser(ticket.user_id, 'ticket_update', payload);
    } else {
      // Customer replied — push to all admins
      pushToAdmins('ticket_update', payload);
    }

    res.status(201).json({ success: true, message: 'Message added successfully', message_id: messageId });
  } catch (error) {
    console.error('Add message error:', error);
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
    res.status(500).json({ success: false, message: 'Failed to fetch tickets' });
  }
});

export default router;
