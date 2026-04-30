/**
 * routes/lastMile.js
 *
 * Last-mile dispatch + rider PWA (Spec §4.6).
 *
 *   • Operators (and admin) build runs by zone, assign parcels, and dispatch.
 *   • Riders pick up runs, deliver, and capture POD with OTP confirmation.
 */
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';

const router = express.Router();

const ZONES = ['westlands','kilimani','karen','kasarani','eastlands','cbd','south-b','industrial'];

/* ──────────────────────────────────────────────────────────────────────────
 *  OPERATOR — dispatch board
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/last-mile/riders — minimal rider list for the dispatch picker.
 *
 * `/api/admin/users?role=rider` is admin-only, which left operators with a
 * free-text rider-id field on iOS — too easy to mistype. This endpoint is
 * deliberately narrow (id + display fields only, no audit info) so it can
 * be opened to operators as well as admins (`requireRole` auto-passes
 * admin).
 */
router.get(
  '/riders',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      const { rows } = await req.db.query(
        `SELECT id, name, email, phone
           FROM users
          WHERE role = 'rider'
          ORDER BY name ASC NULLS LAST
          LIMIT 200`
      );
      res.json({ success: true, riders: rows });
    } catch (err) {
      console.error('GET /last-mile/riders error:', err);
      res.status(500).json({ success: false, message: 'Failed to load riders' });
    }
  }
);

/** GET /api/last-mile/dispatch — board view (parcels released, awaiting run) */
router.get(
  '/dispatch',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      const { rows: pending } = await req.db.query(
        `SELECT o.id, o.tracking_number, o.description, u.name, u.phone,
                u.delivery_address
           FROM orders o
           JOIN users u ON u.id = o.user_id
          WHERE o.status IN ('out_for_delivery','customs')
            AND NOT EXISTS (
              SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id
            )
          ORDER BY o.updated_at ASC NULLS LAST
          LIMIT 100`
      );

      const { rows: runs } = await req.db.query(
        `SELECT r.*, u.name AS rider_name
           FROM last_mile_runs r
      LEFT JOIN users u ON u.id = r.rider_id
          WHERE r.status IN ('planned','in_progress')
          ORDER BY r.run_date DESC, r.created_at DESC
          LIMIT 50`
      );

      res.json({ success: true, pending, runs, zones: ZONES });
    } catch (err) {
      console.error('GET /last-mile/dispatch error:', err);
      res.status(500).json({ success: false, message: 'Failed to load dispatch board' });
    }
  }
);

/** POST /api/last-mile/runs — create a new rider run */
router.post(
  '/runs',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      const { rider_id, zone, run_date, parcel_ids } = req.body;
      if (!zone || !run_date) {
        return res.status(400).json({ success: false, message: 'zone and run_date are required' });
      }
      const id = `RUN-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      const total = Array.isArray(parcel_ids) ? parcel_ids.length : 0;
      await req.db.query(
        `INSERT INTO last_mile_runs (id, rider_id, zone, run_date, status, total_stops)
         VALUES ($1,$2,$3,$4,'planned',$5)`,
        [id, rider_id || null, zone, run_date, total]
      );
      // No join table — we tag each parcel with the run id via a packages
      // column? The spec keeps the parcel→run association implicit through
      // pod_events at completion.  For the planning phase we record the
      // current parcel set in a notes JSON blob.
      if (total > 0) {
        await req.db.query(
          `UPDATE last_mile_runs SET notes = $1 WHERE id = $2`,
          [JSON.stringify({ planned_parcels: parcel_ids }), id]
        );
        // Move parcels into out_for_delivery state for visibility
        const placeholders = parcel_ids.map((_, i) => `$${i + 1}`).join(',');
        await req.db.query(
          `UPDATE orders SET status = 'out_for_delivery', updated_at = NOW()
            WHERE id IN (${placeholders})`,
          parcel_ids
        );
      }
      res.status(201).json({ success: true, run_id: id });
    } catch (err) {
      console.error('POST /last-mile/runs error:', err);
      res.status(500).json({ success: false, message: 'Failed to create run' });
    }
  }
);

/**
 * GET /api/last-mile/runs/:id/parcels — operator/rider view of which
 * parcels are scheduled for a particular run. Reads the JSON-encoded
 * `planned_parcels` list out of `last_mile_runs.notes` (same shape the
 * rider PWA pulls in /rider/today) and joins to orders + users so the
 * client can render addresses, phone, and POD status.
 *
 * Used by the iOS dispatch UI to surface "what's on this run" so the
 * operator can assign / unassign individual parcels (S1-9). Operators,
 * admins, and the assigned rider can read.
 */
router.get(
  '/runs/:id/parcels',
  authMiddleware,
  async (req, res) => {
    try {
      const { id } = req.params;
      const { rows: runRows } = await req.db.query(
        `SELECT id, rider_id, zone, run_date, status, notes
           FROM last_mile_runs WHERE id = $1`,
        [id]
      );
      if (runRows.length === 0) {
        return res.status(404).json({ success: false, message: 'Run not found' });
      }
      const run = runRows[0];
      const role = req.user.role;
      const isStaff = role === 'admin' || role === 'operator';
      const isAssignedRider = role === 'rider' && run.rider_id === req.user.id;
      if (!isStaff && !isAssignedRider) {
        return res.status(403).json({ success: false, message: 'Not authorised to view this run' });
      }

      let parcelIds = [];
      try {
        if (run.notes) {
          const parsed = JSON.parse(run.notes);
          if (Array.isArray(parsed.planned_parcels)) parcelIds = parsed.planned_parcels;
        }
      } catch (_) { /* notes wasn't JSON — empty list */ }

      let parcels = [];
      if (parcelIds.length > 0) {
        const placeholders = parcelIds.map((_, i) => `$${i + 1}`).join(',');
        const { rows } = await req.db.query(
          `SELECT o.id, o.tracking_number, o.description, o.status,
                  u.id AS user_id, u.name, u.phone, u.delivery_address,
                  EXISTS(SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id) AS has_pod
             FROM orders o JOIN users u ON u.id = o.user_id
            WHERE o.id IN (${placeholders})`,
          parcelIds
        );
        parcels = rows;
      }
      res.json({ success: true, run, parcels });
    } catch (err) {
      console.error('GET /last-mile/runs/:id/parcels error:', err);
      res.status(500).json({ success: false, message: 'Failed to load run parcels' });
    }
  }
);

/** PATCH /api/last-mile/runs/:id — operator updates run (rider assign etc.) */
router.patch(
  '/runs/:id',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const allowed = ['rider_id','zone','run_date','status','notes'];
      const sets = []; const params = [];
      for (const k of allowed) {
        if (Object.prototype.hasOwnProperty.call(req.body, k)) {
          params.push(typeof req.body[k] === 'object'
            ? JSON.stringify(req.body[k]) : req.body[k]);
          sets.push(`${k} = $${params.length}`);
        }
      }
      if (sets.length === 0)
        return res.status(400).json({ success: false, message: 'No updatable fields' });
      sets.push(`updated_at = NOW()`);
      params.push(id);
      await req.db.query(
        `UPDATE last_mile_runs SET ${sets.join(', ')} WHERE id = $${params.length}`,
        params
      );
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /last-mile/runs/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update run' });
    }
  }
);

/* ──────────────────────────────────────────────────────────────────────────
 *  RIDER PWA
 * ──────────────────────────────────────────────────────────────────────── */

/** GET /api/last-mile/rider/today — runs assigned to me today */
router.get(
  '/rider/today',
  authMiddleware,
  requireRole('rider'),
  async (req, res) => {
    try {
      const { rows: runs } = await req.db.query(
        `SELECT * FROM last_mile_runs
          WHERE rider_id = $1 AND run_date = CURRENT_DATE
          ORDER BY created_at ASC`,
        [req.user.id]
      );

      // Decode planned parcels per run + fetch the parcel rows
      const result = [];
      for (const run of runs) {
        let parcelIds = [];
        try {
          if (run.notes) {
            const parsed = JSON.parse(run.notes);
            if (Array.isArray(parsed.planned_parcels)) {
              parcelIds = parsed.planned_parcels;
            }
          }
        } catch (_) { /* notes wasn't JSON — ignore */ }

        let parcels = [];
        if (parcelIds.length > 0) {
          const placeholders = parcelIds.map((_, i) => `$${i + 1}`).join(',');
          const { rows } = await req.db.query(
            `SELECT o.id, o.tracking_number, o.description, u.name, u.phone,
                    u.delivery_address,
                    EXISTS(SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id) AS has_pod
               FROM orders o JOIN users u ON u.id = o.user_id
              WHERE o.id IN (${placeholders})`,
            parcelIds
          );
          parcels = rows;
        }
        result.push({ ...run, parcels });
      }

      res.json({ success: true, runs: result });
    } catch (err) {
      console.error('GET /last-mile/rider/today error:', err);
      res.status(500).json({ success: false, message: 'Failed to load runs' });
    }
  }
);

/** POST /api/last-mile/rider/runs/:runId/pod — capture proof of delivery */
router.post(
  '/rider/runs/:runId/pod',
  authMiddleware,
  requireRole('rider'),
  async (req, res) => {
    try {
      const { runId } = req.params;
      const { parcel_id, photo_url, otp_used, recipient_name,
              recipient_phone, signature_url, notes } = req.body;
      if (!parcel_id) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }
      const id = `POD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await req.db.query(
        `INSERT INTO pod_events
           (id, parcel_id, run_id, rider_id, result, photo_url,
            signature_url, otp_used, recipient_name, recipient_phone, notes)
         VALUES ($1,$2,$3,$4,'delivered',$5,$6,$7,$8,$9,$10)`,
        [id, parcel_id, runId, req.user.id,
         photo_url || null, signature_url || null,
         otp_used || null, recipient_name || null,
         recipient_phone || null, notes || null]
      );
      await req.db.query(
        `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
        [parcel_id]
      );
      // NPS invitation. Pulled from orders since the rider POD doesn't carry
      // user_id directly — keeps the (user_id, order_id) row exact.
      const ownerRow = await req.db.query(
        `SELECT user_id FROM orders WHERE id = $1`, [parcel_id]
      );
      const ownerId = ownerRow.rows[0]?.user_id;
      if (ownerId) {
        await req.db.query(
          `INSERT INTO nps_invitations (id, user_id, order_id)
           VALUES ($1, $2, $3) ON CONFLICT (order_id) DO NOTHING`,
          [`NPSI-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, ownerId, parcel_id]
        );
      }
      await req.db.query(
        `UPDATE last_mile_runs
            SET completed_stops = completed_stops + 1,
                status = CASE WHEN completed_stops + 1 >= total_stops
                              THEN 'completed' ELSE 'in_progress' END,
                updated_at = NOW()
          WHERE id = $1`,
        [runId]
      );
      res.status(201).json({ success: true, pod_id: id });
    } catch (err) {
      console.error('POST /last-mile/rider/runs/:runId/pod error:', err);
      res.status(500).json({ success: false, message: 'Failed to record POD' });
    }
  }
);

/** POST /api/last-mile/rider/runs/:runId/fail — failed delivery attempt */
router.post(
  '/rider/runs/:runId/fail',
  authMiddleware,
  requireRole('rider'),
  async (req, res) => {
    try {
      const { runId } = req.params;
      const { parcel_id, reason } = req.body;
      if (!parcel_id) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }
      const id = `POD-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
      await req.db.query(
        `INSERT INTO pod_events
           (id, parcel_id, run_id, rider_id, result, notes)
         VALUES ($1,$2,$3,$4,'failed',$5)`,
        [id, parcel_id, runId, req.user.id, reason || 'Recipient unavailable']
      );
      // After two failed attempts → held_at_nairobi_hub (custom tracking
      // status surfaced via order_notes field)
      const { rows } = await req.db.query(
        `SELECT COUNT(*)::int AS fails FROM pod_events
          WHERE parcel_id = $1 AND result = 'failed'`,
        [parcel_id]
      );
      if (rows[0].fails >= 2) {
        await req.db.query(
          `UPDATE orders SET hold_reason = 'held_at_nairobi_hub',
                  updated_at = NOW() WHERE id = $1`,
          [parcel_id]
        );
      }
      res.status(201).json({ success: true, pod_id: id, fails: rows[0].fails });
    } catch (err) {
      console.error('POST /last-mile/rider/runs/:runId/fail error:', err);
      res.status(500).json({ success: false, message: 'Failed to record failed delivery' });
    }
  }
);

export default router;
