/**
 * routes/customs.js
 *
 * Kenya customs entries — the clearing-agent partner portal (Spec §4.5)
 * plus operator/admin oversight.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { notifyParcelStatus } from '../utils/parcelStatusNotify.js';

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
                o.weight_kg, o.chargeable_kg,
                o.user_id, u.name AS consignee_name, u.phone,
                ce.id AS entry_id, ce.idf_no, ce.entry_no, ce.duty_kes, ce.vat_kes,
                ce.idf_kes, ce.rdl_kes, ce.status AS entry_status
           FROM orders o
           JOIN users u ON u.id = o.user_id
      LEFT JOIN customs_entries ce ON ce.parcel_id = o.id
          WHERE o.consolidation_id = $1
          ORDER BY o.user_id ASC, o.created_at ASC`,
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
              idf_kes, rdl_kes, status, notes, doc_url } = req.body;
      if (!parcel_id) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }
      // customs_entries.id is uuid on live; the legacy CE-... prefix fails
      // string_to_uuid. Use a real uuidv4().
      const id = uuidv4();
      await req.db.query(
        `INSERT INTO customs_entries
           (id, parcel_id, agent_id, idf_no, entry_no, cif_kes,
            duty_kes, vat_kes, idf_kes, rdl_kes, status, notes, doc_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                 COALESCE($11,'idf_submitted')::customs_status,$12,$13)`,
        [id, parcel_id, req.user.id, idf_no || null, entry_no || null,
         cif_kes || 0, duty_kes || 0, vat_kes || 0, idf_kes || 0, rdl_kes || 0,
         status || null, notes || null, doc_url || null]
      );
      // Move the parcel into 'customs' state when an IDF is posted
      await req.db.query(
        `UPDATE orders SET status = 'customs', updated_at = NOW() WHERE id = $1`,
        [parcel_id]
      );
      res.status(201).json({ success: true, entry_id: id });
    } catch (err) {
      console.error('POST /customs/entries error:', err);
      // 23505 unique_violation — uniq_customs_entries_parcel rejects duplicates.
      if (err && err.code === '23505') {
        return res.status(409).json({
          success: false,
          message: 'A customs entry already exists for this parcel.'
        });
      }
      res.status(500).json({ success: false, message: 'Failed to create customs entry' });
    }
  }
);

/**
 * POST /api/customs/entries/bulk — file ONE set of tax details for an entire
 * customer's bundle inside a consolidation, instead of repeating the form
 * once per parcel.
 *
 * Body:
 *   {
 *     consolidation_id: string,   // required — scope to a single weekly flight
 *     user_id:          string,   // required — the customer whose parcels we're clearing
 *     idf_no, entry_no,           // single document set, applied to every entry
 *     cif_kes, duty_kes, vat_kes, idf_kes, rdl_kes, // split across parcels
 *     status?, notes?, doc_url?
 *   }
 *
 * The split rule prefers `chargeable_kg` (post-volumetric), falls back to
 * `weight_kg`, then to `declared_value`, then to an even split. Always
 * reconciles the last-parcel residual so SUM(per_parcel) === input total
 * down to the cent.
 *
 * Returns the per-parcel entry ids so the caller can show the breakdown
 * after submit. Idempotency: a parcel that already has a customs entry is
 * skipped (the unique constraint would otherwise fail the whole bulk).
 *
 * Audit follow-up: "parcels from one customer to be grouped and only one
 * set of tax details will be entered."
 */
router.post(
  '/entries/bulk',
  authMiddleware,
  requireRole('clearing_agent'),
  async (req, res) => {
    const {
      consolidation_id, user_id,
      idf_no, entry_no,
      cif_kes = 0, duty_kes = 0, vat_kes = 0, idf_kes = 0, rdl_kes = 0,
      status, notes, doc_url,
    } = req.body || {};

    if (!consolidation_id || !user_id) {
      return res.status(400).json({
        success: false,
        message: 'consolidation_id and user_id are required',
      });
    }

    const client = await req.db.connect();
    try {
      await client.query('BEGIN');

      // Confirm the agent owns the consolidation — same gate the per-parcel
      // path uses on the parcels read.
      const ownership = await client.query(
        `SELECT 1 FROM consolidations WHERE id = $1 AND assigned_agent_id = $2`,
        [consolidation_id, req.user.id]
      );
      if (ownership.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(403).json({ success: false, message: 'Not assigned to you' });
      }

      // Pull every parcel belonging to this customer in this consolidation
      // that doesn't already have a customs entry. ORDER BY id keeps the
      // per-parcel split deterministic across calls.
      const parcels = await client.query(
        `SELECT o.id, o.tracking_number,
                COALESCE(o.chargeable_kg, o.weight_kg, 0)::float AS weight,
                COALESCE(o.declared_value, 0)::float AS declared
           FROM orders o
           LEFT JOIN customs_entries ce ON ce.parcel_id = o.id
          WHERE o.consolidation_id = $1
            AND o.user_id = $2
            AND ce.id IS NULL
          ORDER BY o.id ASC`,
        [consolidation_id, user_id]
      );
      if (parcels.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({
          success: false,
          message: 'No un-entered parcels for that customer in this consolidation',
        });
      }

      // Pick a split key in priority order. If every parcel has weight=0
      // and declared=0 we fall through to even-split (key=1 each).
      const totalWeight    = parcels.rows.reduce((s, p) => s + (p.weight  || 0), 0);
      const totalDeclared  = parcels.rows.reduce((s, p) => s + (p.declared || 0), 0);
      const useWeight      = totalWeight   > 0;
      const useDeclared    = !useWeight && totalDeclared > 0;
      const totalKey       = useWeight ? totalWeight : useDeclared ? totalDeclared : parcels.rows.length;
      const keyOf = (p) => useWeight ? (p.weight || 0)
                       : useDeclared ? (p.declared || 0)
                       : 1;

      // Rounded-to-2dp cumulative split with last-row residual reconciliation
      // so SUM(per-parcel charge) === input total exactly.
      function splitPositive(total) {
        const t = Number(total) || 0;
        if (t === 0) return parcels.rows.map(() => 0);
        const out = [];
        let assigned = 0;
        for (let i = 0; i < parcels.rows.length; i++) {
          if (i === parcels.rows.length - 1) {
            out.push(Math.round((t - assigned) * 100) / 100);
          } else {
            const share = Math.round((t * keyOf(parcels.rows[i]) / totalKey) * 100) / 100;
            out.push(share);
            assigned += share;
          }
        }
        return out;
      }

      const cifSplit  = splitPositive(cif_kes);
      const dutySplit = splitPositive(duty_kes);
      const vatSplit  = splitPositive(vat_kes);
      const idfSplit  = splitPositive(idf_kes);
      const rdlSplit  = splitPositive(rdl_kes);

      const entryIds = [];
      for (let i = 0; i < parcels.rows.length; i++) {
        const p = parcels.rows[i];
        const id = uuidv4();
        await client.query(
          `INSERT INTO customs_entries
             (id, parcel_id, agent_id, idf_no, entry_no, cif_kes,
              duty_kes, vat_kes, idf_kes, rdl_kes, status, notes, doc_url)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                   COALESCE($11,'idf_submitted')::customs_status,$12,$13)`,
          [
            id, p.id, req.user.id, idf_no || null, entry_no || null,
            cifSplit[i],
            dutySplit[i], vatSplit[i], idfSplit[i], rdlSplit[i],
            status || null, notes || null, doc_url || null,
          ]
        );
        entryIds.push({
          entry_id: id,
          parcel_id: p.id,
          tracking_number: p.tracking_number,
          duty_kes: dutySplit[i],
          vat_kes: vatSplit[i],
        });
      }

      // Move every freshly-entered parcel into 'customs' state in one shot.
      const placeholders = parcels.rows.map((_, i) => `$${i + 1}`).join(',');
      await client.query(
        `UPDATE orders SET status = 'customs', updated_at = NOW()
          WHERE id IN (${placeholders})`,
        parcels.rows.map(p => p.id)
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        consolidation_id,
        user_id,
        parcel_count: parcels.rows.length,
        split_basis: useWeight ? 'chargeable_kg' : useDeclared ? 'declared_value' : 'even',
        entries: entryIds,
      });
    } catch (err) {
      await client.query('ROLLBACK');
      console.error('POST /customs/entries/bulk error:', err);
      res.status(500).json({ success: false, message: 'Failed to file bulk entries' });
    } finally {
      client.release();
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
                       'idf_kes','rdl_kes','admin_fee_kes','status','notes','doc_url'];
      const sets = []; const params = [];
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, k)) {
          params.push(req.body[k]);
          // status is a Postgres enum (customs_status); cast on the way in.
          sets.push(k === 'status'
            ? `${k} = $${params.length}::customs_status`
            : `${k} = $${params.length}`);
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

      // Audit P2.1: when an agent marks the entry 'released', the parcel is
      // KRA-cleared but NOT yet on a rider's run. The previous cascade
      // flipped orders.status='out_for_delivery' here, which:
      //   • removed the parcel from the dispatch board (filter requires
      //     orders.status='customs');
      //   • skipped activateRunDispatch's OTP issuance — riders later
      //     hit /pod with otp_not_issued because pod_otps had no row;
      //   • showed "out for delivery" to the customer before any
      //     rider had accepted the run.
      //
      // The fix is to leave orders.status='customs'. The dispatch
      // board picks up customs-cleared parcels via the released-entry
      // join (see GET /api/last-mile/dispatch). orders.status flips
      // to 'out_for_delivery' only when activateRunDispatch fires.
      // We still notify the customer that customs is cleared so
      // they get progress visibility.
      if (req.body.status === 'released') {
        const parcelRow = await req.db.query(
          `SELECT parcel_id FROM customs_entries WHERE id = $1`, [id]
        );
        const parcelId = parcelRow.rows[0]?.parcel_id;
        if (parcelId) {
          // Stamp updated_at on orders so the dispatch board ordering
          // (oldest-cleared-first) reflects the release time.
          await req.db.query(
            `UPDATE orders SET updated_at = NOW() WHERE id = $1`,
            [parcelId]
          );
          // Best-effort customer fan-out. Generic STATUS_MESSAGE for
          // 'customs' covers it ("Your parcel ... is clearing customs.")
          // — for now we reuse it post-release; a dedicated
          // 'customs_cleared' template can land in a follow-up.
          notifyParcelStatus(req.db, parcelId, 'customs').catch((err) =>
            console.warn('notifyParcelStatus(customs released) failed:', err.message)
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
      // agent_invoices.id is uuid on live; the legacy AI-... prefix fails
      // string_to_uuid. Use a real uuidv4().
      const id = uuidv4();
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
