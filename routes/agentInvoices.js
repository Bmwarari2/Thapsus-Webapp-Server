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
import {
  createSignedUploadUrl,
  createSignedDownloadUrl,
  extractAgentInvoicePath,
  getSupabaseAdmin
} from '../utils/supabaseAdmin.js';

const router = express.Router();

const AGENT_INVOICE_BUCKET = 'agent-invoices';

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

/**
 * docPathBelongsToCaller — agents may only submit invoices that point at a
 * file inside their own per-user namespace in the bucket (the upload-url
 * endpoint above mints `${req.user.id}/...` paths exclusively).  Without
 * this check an agent could submit an invoice whose doc_url points at
 * another agent's PDF and quietly impersonate them on the admin queue.
 *
 * Accepts either a bucket-relative path or a full Supabase storage URL;
 * extractAgentInvoicePath strips the host/bucket prefix in both cases.
 * Returns true when the path is empty (no document attached — allowed),
 * or when it starts with `${userId}/`.  Audit M6.
 */
function docPathBelongsToCaller(docUrl, userId) {
  if (!docUrl) return true; // empty doc_url is allowed
  const path = extractAgentInvoicePath(docUrl);
  if (!path) return false;  // unparseable / wrong bucket
  return path.startsWith(`${userId}/`);
}

/** POST /api/agent-invoices — agent submits a new invoice. */
router.post('/', authMiddleware, requireRole('clearing_agent'), async (req, res) => {
  try {
    const { consolidation_id, invoice_no, amount_kes, doc_url, notes } = req.body;
    if (!amount_kes || amount_kes <= 0) {
      return res.status(400).json({ success: false, message: 'amount_kes is required' });
    }
    if (!docPathBelongsToCaller(doc_url, req.user.id)) {
      return res.status(403).json({ success: false, message: 'doc_url is not owned by the caller' });
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

/**
 * POST /api/agent-invoices/upload-url
 *
 * Returns a signed-upload URL the agent's iOS / Android client can PUT the
 * PDF bytes to without holding a Supabase JWT. The agent-invoices bucket
 * was flipped private in migration 005 so direct PostgREST + storage RLS
 * uploads now 403 — this endpoint is the only sanctioned upload path.
 *
 * The returned `path` is the canonical in-bucket path that the iOS client
 * then POSTs back as `doc_url` (server records the path; download URLs are
 * minted on demand from /agent-invoices/:id/document-url).
 *
 * Body (optional): { filename: 'invoice-1234.pdf' }
 *   — used as the suffix; default is "<ts>.pdf".
 */
router.post('/upload-url', authMiddleware, requireRole('clearing_agent'), async (req, res) => {
  try {
    if (!getSupabaseAdmin()) {
      return res.status(503).json({
        success: false,
        message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.'
      });
    }
    const ts = Date.now();
    const safeName = String(req.body?.filename || `${ts}.pdf`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const path = `${req.user.id}/${ts}-${safeName}`;
    const data = await createSignedUploadUrl(AGENT_INVOICE_BUCKET, path);
    return res.json({
      success: true,
      bucket: AGENT_INVOICE_BUCKET,
      path,
      signed_url: data.signedUrl,
      token: data.token
    });
  } catch (err) {
    console.error('POST /agent-invoices/upload-url error:', err);
    logRouteError(req, res, err, 'Mint signed upload URL');
    return res.status(500).json({ success: false, message: 'Failed to mint upload URL' });
  }
});

/**
 * GET /api/agent-invoices/:id/document-url
 *
 * Returns a 5-minute signed download URL for the invoice's stored PDF.
 *
 *   - The submitting agent can fetch their own invoice URL (RLS-equivalent
 *     check on agent_id).
 *   - Admin / staff can fetch any invoice URL.
 *
 * Returns 404 if the invoice has no doc_url, or if the requester is not
 * authorised to view it.
 */
router.get('/:id/document-url', authMiddleware, async (req, res) => {
  try {
    if (!getSupabaseAdmin()) {
      return res.status(503).json({
        success: false,
        message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.'
      });
    }
    const { id } = req.params;
    const { rows } = await req.db.query(
      `SELECT id, agent_id, doc_url FROM agent_invoices WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found' });
    }
    const inv = rows[0];
    const isOwner = inv.agent_id === req.user.id;
    const isStaff = req.user.role === 'admin' || req.user.role === 'operator';
    if (!isOwner && !isStaff) {
      return res.status(403).json({ success: false, message: 'Not authorised to view this invoice' });
    }
    if (!inv.doc_url) {
      return res.status(404).json({ success: false, message: 'No document attached to this invoice' });
    }
    const path = extractAgentInvoicePath(inv.doc_url);
    if (!path) {
      return res.status(500).json({ success: false, message: 'Stored doc_url could not be parsed' });
    }
    const data = await createSignedDownloadUrl(AGENT_INVOICE_BUCKET, path, 300);
    return res.json({ success: true, signed_url: data.signedUrl, expires_in_seconds: 300 });
  } catch (err) {
    console.error('GET /agent-invoices/:id/document-url error:', err);
    logRouteError(req, res, err, 'Mint signed document URL');
    return res.status(500).json({ success: false, message: 'Failed to mint document URL' });
  }
});

/** PATCH /api/agent-invoices/:id — admin advances status (approved/paid/rejected). */
router.patch('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, doc_url } = req.body;
    if (!['submitted','approved','paid','rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'invalid status' });
    }

    // If the caller is updating doc_url (currently the admin route only
    // accepts status/notes, but guard defensively for future schema
    // expansion), verify the path lives in the invoice's owning agent's
    // bucket namespace.  An admin shouldn't be able to swap in a path
    // outside the agent's namespace — that would let a malicious admin
    // attribute someone else's PDF to this agent's invoice.  Audit M6.
    if (typeof doc_url !== 'undefined' && doc_url !== null) {
      const { rows: invRows } = await req.db.query(
        `SELECT agent_id FROM agent_invoices WHERE id = $1`,
        [id]
      );
      if (invRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      if (!docPathBelongsToCaller(doc_url, invRows[0].agent_id)) {
        return res.status(403).json({ success: false, message: 'doc_url is not owned by the invoice agent' });
      }
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
