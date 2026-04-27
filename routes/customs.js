/**
 * routes/customs.js
 *
 * Kenya customs entries — the clearing-agent partner portal (Spec §4.5)
 * plus operator/admin oversight.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

/* ──────────────────────────────────────────────────────────────────────────
 *  AGENT VIEWS
 * ──────────────────────────────────────────────────────────────────────── */

/** GET /api/customs/agent/consolidations — assigned to me */
router.get(
  '/agent/consolidations',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    try {
      const { rows } = await req.db.query(
        `SELECT id, week_start, cutoff_at, departure_at, status,
                total_kg, total_parcels, master_awb_no
           FROM consolidations
          WHERE assigned_agent_id = $1
          ORDER BY departure_at DESC NULLS LAST
          LIMIT 50`,
        [req.user.id]
      );
      res.json({ success: true, consolidations: rows });
    } catch (err) {
      console.error('GET /customs/agent/consolidations error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch consolidations' });
    }
  }
);

/** GET /api/customs/agent/consolidations/:id/parcels  — pre-alert pack */
router.get(
  '/agent/consolidations/:id/parcels',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const ownership = await req.db.query(
        `SELECT 1 FROM consolidations WHERE id = $1 AND assigned_agent_id = $2`,
        [id, req.user.id]
      );
      if (ownership.rows.length === 0) {
        return res.status(403).json({ success: false, message: 'Not assigned to you' });
      }
      const { rows } = await req.db.query(
        `SELECT o.id, o.tracking_number, o.retailer, o.description, o.declared_value,
                o.weight_kg, o.chargeable_kg, u.name AS consignee_name, u.phone,
                ce.id AS entry_id, ce.idf_no, ce.entry_no, ce.duty_kes, ce.vat_kes,
                ce.idf_kes, ce.rdl_kes, ce.status AS entry_status
           FROM orders o
           JOIN users u ON u.id = o.user_id
      LEFT JOIN customs_entries ce ON ce.parcel_id = o.id
          WHERE o.consolidation_id = $1
          ORDER BY o.created_at ASC`,
        [id]
      );
      res.json({ success: true, parcels: rows });
    } catch (err) {
      console.error('GET /customs/agent/consolidations/:id/parcels error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch pre-alert' });
    }
  }
);

/* ──────────────────────────────────────────────────────────────────────────
 *  CUSTOMS ENTRIES — agent posts IDF / entry / duty figures per parcel
 * ──────────────────────────────────────────────────────────────────────── */

/** POST /api/customs/entries  — agent creates an entry against a parcel */
router.post(
  '/entries',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    try {
      const { parcel_id, idf_no, entry_no, cif_kes, duty_kes, vat_kes,
              idf_kes, rdl_kes, status, notes } = req.body;
      if (!parcel_id) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }
      const id = `CE-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await req.db.query(
        `INSERT INTO customs_entries
           (id, parcel_id, agent_id, idf_no, entry_no, cif_kes,
            duty_kes, vat_kes, idf_kes, rdl_kes, status, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,'idf_submitted'),$12)`,
        [id, parcel_id, req.user.id, idf_no || null, entry_no || null,
         cif_kes || 0, duty_kes || 0, vat_kes || 0, idf_kes || 0, rdl_kes || 0,
         status || null, notes || null]
      );
      // Move the parcel into 'customs' state when an IDF is posted
      await req.db.query(
        `UPDATE orders SET status = 'customs', updated_at = NOW() WHERE id = $1`,
        [parcel_id]
      );
      res.status(201).json({ success: true, entry_id: id });
    } catch (err) {
      console.error('POST /customs/entries error:', err);
      res.status(500).json({ success: false, message: 'Failed to create customs entry' });
    }
  }
);

/** PATCH /api/customs/entries/:id  — update IDF / entry / amounts / status */
router.patch(
  '/entries/:id',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const allowed = ['idf_no','entry_no','cif_kes','duty_kes','vat_kes',
                       'idf_kes','rdl_kes','admin_fee_kes','status','notes'];
      const sets = []; const params = [];
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, k)) {
          params.push(req.body[k]);
          sets.push(`${k} = $${params.length}`);
        }
      }
      if (sets.length === 0) {
        return res.status(400).json({ success: false, message: 'No updatable fields' });
      }
      sets.push(`updated_at = NOW()`);
      params.push(id, req.user.id);
      await req.db.query(
        `UPDATE customs_entries
            SET ${sets.join(', ')}
          WHERE id = $${params.length - 1} AND agent_id = $${params.length}`,
        params
      );

      // Cascade parcel status when entry is marked released
      if (req.body.status === 'released') {
        const parcelRow = await req.db.query(
          `SELECT parcel_id FROM customs_entries WHERE id = $1`, [id]
        );
        if (parcelRow.rows[0]) {
          await req.db.query(
            `UPDATE orders SET status = 'out_for_delivery', updated_at = NOW()
              WHERE id = $1`,
            [parcelRow.rows[0].parcel_id]
          );
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /customs/entries/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update customs entry' });
    }
  }
);

/** GET /api/customs/entries  — admin/operator pipeline view */
router.get(
  '/entries',
  authMiddleware,
  requireRole('operator','clearing_agent'),
  async (req, res) => {
    try {
      const { status } = req.query;
      const params = [];
      let where = '';
      if (req.user.role === 'clearing_agent') {
        params.push(req.user.id);
        where = `WHERE ce.agent_id = $${params.length}`;
      }
      if (status) {
        params.push(status);
        where += where ? ` AND ce.status = $${params.length}` : `WHERE ce.status = $${params.length}`;
      }
      const { rows } = await req.db.query(
        `SELECT ce.*, o.tracking_number, o.declared_value
           FROM customs_entries ce
           JOIN orders o ON o.id = ce.parcel_id
          ${where}
          ORDER BY ce.created_at DESC
          LIMIT 200`,
        params
      );
      res.json({ success: true, entries: rows });
    } catch (err) {
      console.error('GET /customs/entries error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch entries' });
    }
  }
);

/* ──────────────────────────────────────────────────────────────────────────
 *  AGENT INVOICES
 * ──────────────────────────────────────────────────────────────────────── */

/** POST /api/customs/agent-invoices  — agent uploads their own fee invoice */
router.post(
  '/agent-invoices',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    try {
      const { consolidation_id, invoice_no, amount_kes, doc_url, notes } = req.body;
      const id = `AI-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await req.db.query(
        `INSERT INTO agent_invoices
           (id, agent_id, consolidation_id, invoice_no, amount_kes, doc_url, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id, req.user.id, consolidation_id || null, invoice_no || null,
         amount_kes || 0, doc_url || null, notes || null]
      );
      res.status(201).json({ success: true, invoice_id: id });
    } catch (err) {
      console.error('POST /customs/agent-invoices error:', err);
      res.status(500).json({ success: false, message: 'Failed to submit invoice' });
    }
  }
);

/** GET /api/customs/agent-invoices  — list the agent's own invoices */
router.get(
  '/agent-invoices',
  authMiddleware,
  requireRole('clearing_agent','operator'),
  async (req, res) => {
    try {
      const params = [];
      let where = '';
      if (req.user.role === 'clearing_agent') {
        params.push(req.user.id);
        where = `WHERE agent_id = $${params.length}`;
      }
      const { rows } = await req.db.query(
        `SELECT * FROM agent_invoices ${where} ORDER BY created_at DESC LIMIT 100`,
        params
      );
      res.json({ success: true, invoices: rows });
    } catch (err) {
      console.error('GET /customs/agent-invoices error:', err);
      res.status(500).json({ success: false, message: 'Failed to fetch invoices' });
    }
  }
);

/** PATCH /api/customs/agent-invoices/:id — admin approves / pays */
router.patch(
  '/agent-invoices/:id',
  authMiddleware,
  requireRole('admin'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const sets = ['status = $1', 'paid_at = CASE WHEN $1 = \'paid\' THEN NOW() ELSE paid_at END'];
      await req.db.query(
        `UPDATE agent_invoices SET ${sets.join(', ')} WHERE id = $2`,
        [status, id]
      );
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /customs/agent-invoices/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update invoice' });
    }
  }
);

export default router;
