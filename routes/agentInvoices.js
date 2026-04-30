/**
 * routes/agentInvoices.js — Clearing-agent invoices.
 *
 * Agents submit invoices for the consolidations they handled in Nairobi.
 * Admins approve/reject and mark paid. iOS uses the agent endpoints for the
 * AgentInvoices screen; admin endpoints power the ops/admin review queue.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole, isAdmin } from '../middleware/auth.js';
import { logRouteError } from '../utils/errorLogger.js';

const router = express.Router();

/** GET /api/agent-invoices/mine — agent sees their submissions */
router.get('/mine', authMiddleware, requireRole('clearing_agent'), async (req, res) => {
  try {
    const { rows } = await req.db.query(
      `SELECT * FROM agent_invoices WHERE agent_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ success: true, invoices: rows });
  } catch (err) {
    console.error('GET /agent-invoices/mine error:', err);
    logRouteError(req, res, err, 'List own agent invoices');
    res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
  }
});

/** POST /api/agent-invoices — agent submits a new invoice. */
router.post('/', authMiddleware, requireRole('clearing_agent'), async (req, res) => {
  try {
    const { consolidation_id, invoice_no, amount_kes, doc_url, notes } = req.body;
    if (!amount_kes || amount_kes <= 0) {
      return res.status(400).json({ success: false, message: 'amount_kes is required' });
    }
    const id = uuidv4();
    await req.db.query(
      `INSERT INTO agent_invoices
         (id, agent_id, consolidation_id, invoice_no, amount_kes, doc_url, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,'submitted'::invoice_status,$7)`,
      [id, req.user.id, consolidation_id || null, invoice_no || null,
       amount_kes, doc_url || null, notes || null]
    );
    res.status(201).json({ success: true, invoice_id: id });
  } catch (err) {
    console.error('POST /agent-invoices error:', err);
    logRouteError(req, res, err, 'Submit agent invoice');
    res.status(500).json({ success: false, message: 'Failed to submit invoice' });
  }
});

/** GET /api/agent-invoices — admin queue of all invoices, optional status filter. */
router.get('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const params = [];
    let where = '';
    if (status) { params.push(status); where = `WHERE ai.status = $${params.length}`; }
    const { rows } = await req.db.query(
      `SELECT ai.*, u.name AS agent_name, u.email AS agent_email
         FROM agent_invoices ai
         JOIN users u ON u.id = ai.agent_id
         ${where}
        ORDER BY ai.created_at DESC LIMIT 200`,
      params
    );
    res.json({ success: true, invoices: rows });
  } catch (err) {
    console.error('GET /agent-invoices error:', err);
    logRouteError(req, res, err, 'List agent invoices');
    res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
  }
});

/** PATCH /api/agent-invoices/:id — admin advances status (approved/paid/rejected). */
router.patch('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!['submitted','approved','paid','rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'invalid status' });
    }
    const paidClause = status === 'paid' ? `, paid_at = NOW()` : '';
    await req.db.query(
      `UPDATE agent_invoices SET status = $1, notes = COALESCE($2, notes)${paidClause}
        WHERE id = $3`,
      [status, notes ?? null, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PATCH /agent-invoices/:id error:', err);
    logRouteError(req, res, err, 'Update agent invoice');
    res.status(500).json({ success: false, message: 'Failed to update invoice' });
  }
});

export default router;
