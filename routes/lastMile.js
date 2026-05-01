/**
 * routes/lastMile.js
 *
 * Last-mile dispatch + rider PWA (Spec §4.6).
 *
 *   • Operators (and admin) build runs by zone, assign parcels, and dispatch.
 *   • Riders pick up runs, deliver, and capture POD with OTP confirmation.
 */
import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware, requireRole } from '../middleware/auth.js';
import { createSignedUploadUrl, getSupabaseAdmin } from '../utils/supabaseAdmin.js';

const router = express.Router();

const POD_BUCKET = 'pods';
const ZONES = ['westlands','kilimani','karen','kasarani','eastlands','cbd','south-b','industrial'];

const POD_OTP_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * issuePodOtp — generate a 4-digit OTP for a parcel that is entering the
 * out-for-delivery state, store its SHA-256 in pod_otps, and dispatch the
 * plain code to the recipient's in-app notification feed.
 *
 * Caller must run this on the same client as the orders.status flip so the
 * OTP and the status change commit together.
 *
 * No-ops silently if the orders row has no user_id (defensive — production
 * shouldn't allow that, but a partial schema state would otherwise leak an
 * orphaned OTP row).
 */
async function issuePodOtp(client, parcelId) {
  const { rows } = await client.query(
    `SELECT user_id FROM orders WHERE id = $1`,
    [parcelId]
  );
  const userId = rows[0]?.user_id;
  if (!userId) return null;

  // 0000–9999 zero-padded. crypto.randomInt picks from a uniform
  // distribution so the codes aren't biased the way Math.random() is.
  const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');
  const otpHash = crypto.createHash('sha256').update(otp).digest();
  const expiresAt = new Date(Date.now() + POD_OTP_TTL_MS);

  await client.query(
    `INSERT INTO pod_otps (parcel_id, otp_hash, expires_at, consumed, consumed_at, updated_at)
       VALUES ($1, $2, $3, FALSE, NULL, NOW())
     ON CONFLICT (parcel_id) DO UPDATE
       SET otp_hash = EXCLUDED.otp_hash,
           expires_at = EXCLUDED.expires_at,
           consumed = FALSE,
           consumed_at = NULL,
           updated_at = NOW()`,
    [parcelId, otpHash, expiresAt]
  );

  await client.query(
    `INSERT INTO notifications (id, user_id, type, message)
       VALUES ($1, $2, 'in_app', $3)`,
    [
      `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      userId,
      `Your delivery OTP is ${otp}. Share it with the rider on arrival.`,
    ]
  );
  return otp;
}

/**
 * validatePodOtp — hash-compare the rider-submitted OTP against the stored
 * hash for the parcel.  On match, mark the row consumed (returns true).
 * On mismatch / expired / already-consumed, returns false.
 */
async function validatePodOtp(client, parcelId, submittedOtp) {
  if (typeof submittedOtp !== 'string' || submittedOtp.length === 0) return false;
  const submittedHash = crypto.createHash('sha256').update(submittedOtp).digest();
  const { rows } = await client.query(
    `SELECT parcel_id, otp_hash, expires_at, consumed
       FROM pod_otps WHERE parcel_id = $1`,
    [parcelId]
  );
  if (rows.length === 0) return false;
  const row = rows[0];
  if (row.consumed) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) return false;
  if (!crypto.timingSafeEqual(submittedHash, row.otp_hash)) return false;

  await client.query(
    `UPDATE pod_otps SET consumed = TRUE, consumed_at = NOW(), updated_at = NOW()
      WHERE parcel_id = $1`,
    [parcelId]
  );
  return true;
}

/**
 * runParcelIds — return the ordered list of parcel ids attached to a run.
 *
 * Reads from the last_mile_run_parcels join table (migration 012). The
 * historical encoding lived in `last_mile_runs.notes->'planned_parcels'`
 * but was migrated out so a run's parcel set has FK integrity, an index,
 * and a position column for routing.
 *
 * Caller must be inside a transaction on `client` if it intends to act on
 * the returned ids; otherwise pass `req.db`.
 */
async function runParcelIds(client, runId) {
  const { rows } = await client.query(
    `SELECT parcel_id FROM last_mile_run_parcels
      WHERE run_id = $1
      ORDER BY position ASC`,
    [runId]
  );
  return rows.map(r => r.parcel_id);
}

/**
 * activateRunDispatch — flip every parcel on a run to out_for_delivery and
 * issue a delivery OTP for each.  Called when a run actually leaves the
 * yard (rider assigned + status moved to 'in_progress'), not on creation —
 * planned-but-unassigned runs would otherwise mark customer-visible parcels
 * as out_for_delivery prematurely (audit T7).
 *
 * Caller must already be inside a transaction on `client`.
 */
async function activateRunDispatch(client, runId) {
  const parcelIds = await runParcelIds(client, runId);
  if (parcelIds.length === 0) return;
  const placeholders = parcelIds.map((_, i) => `$${i + 1}`).join(',');
  await client.query(
    `UPDATE orders SET status = 'out_for_delivery', updated_at = NOW()
      WHERE id IN (${placeholders})`,
    parcelIds
  );
  // Mirror to packages so the operator dispatch board (which reads
  // packages.status, not orders.status) doesn't show parcels stuck at
  // 'manifested' while the customer-facing order says out_for_delivery.
  await client.query(
    `UPDATE packages SET status = 'out_for_delivery', updated_at = NOW()
      WHERE order_id IN (${placeholders})`,
    parcelIds
  );
  for (const pid of parcelIds) {
    await issuePodOtp(client, pid);
  }
}

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
      // "Pending" = dispatch-ready: customs-cleared and not yet on any
      // active run.  After T7 the run flips orders.status to
      // out_for_delivery only when the run actually starts, so the
      // board no longer shows parcels that already left the yard.
      // The active-run dedup uses last_mile_run_parcels (migration 012)
      // for an indexed lookup.
      const { rows: pending } = await req.db.query(
        `SELECT o.id, o.tracking_number, o.description, u.name, u.phone,
                u.delivery_address
           FROM orders o
           JOIN users u ON u.id = o.user_id
          WHERE o.status = 'customs'
            AND COALESCE(o.hold_reason, '') = ''
            AND NOT EXISTS (
              SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id
            )
            AND NOT EXISTS (
              SELECT 1
                FROM last_mile_run_parcels lmrp
                JOIN last_mile_runs r ON r.id = lmrp.run_id
               WHERE lmrp.parcel_id = o.id
                 AND r.status IN ('planned','in_progress')
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

      const parcelIdsArr = Array.isArray(parcel_ids) ? parcel_ids : [];
      const total = parcelIdsArr.length;

      // Pre-validate the parcel set so a typo in one id doesn't
      // create a half-broken run that only fails at activation time.
      // Two checks:
      //   1. Every id resolves to an existing orders row.
      //   2. None of those orders is already on another active run
      //      (planned/in_progress) — assigning a parcel to two runs
      //      would double-count completed_stops and let two riders
      //      race to POD it.
      if (total > 0) {
        const { rows: existing } = await req.db.query(
          `SELECT id FROM orders WHERE id = ANY($1::text[])`,
          [parcelIdsArr]
        );
        if (existing.length !== total) {
          const found = new Set(existing.map(r => r.id));
          const missing = parcelIdsArr.filter(p => !found.has(p));
          return res.status(400).json({
            success: false,
            message: `Unknown parcel id(s): ${missing.join(', ')}`,
          });
        }

        // Any active runs already containing one of these parcels?
        // Indexed lookup via the last_mile_run_parcels join table.
        const { rows: clashes } = await req.db.query(
          `SELECT lmrp.parcel_id
             FROM last_mile_run_parcels lmrp
             JOIN last_mile_runs r ON r.id = lmrp.run_id
            WHERE r.status IN ('planned','in_progress')
              AND lmrp.parcel_id = ANY($1::text[])`,
          [parcelIdsArr]
        );
        if (clashes.length > 0) {
          const conflictIds = [...new Set(clashes.map(c => c.parcel_id))];
          return res.status(409).json({
            success: false,
            message: `Parcel(s) already on an active run: ${conflictIds.join(', ')}`,
          });
        }
      }

      // Wrap run creation + parcel attachment in a single transaction so
      // a failure halfway through doesn't leave a run with no parcels
      // (or, worse, a partial parcel set silently undercounting
      // total_stops).  last_mile_runs.id is uuid (default
      // gen_random_uuid) on prod — RETURNING captures it.
      const client = await req.db.connect();
      let id;
      try {
        await client.query('BEGIN');
        const insertRes = await client.query(
          `INSERT INTO last_mile_runs (rider_id, zone, run_date, status, total_stops)
           VALUES ($1,$2,$3,'planned',$4)
           RETURNING id`,
          [rider_id || null, zone, run_date, total]
        );
        id = insertRes.rows[0].id;

        // Attach parcels via the join table. Position is the index in
        // the submitted array — operator decides routing order.
        if (total > 0) {
          for (let i = 0; i < parcelIdsArr.length; i++) {
            await client.query(
              `INSERT INTO last_mile_run_parcels (run_id, parcel_id, position)
               VALUES ($1, $2, $3)`,
              [id, parcelIdsArr[i], i]
            );
          }
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      // We do NOT flip parcels to out_for_delivery here — the run is
      // still 'planned' and may not have a rider yet.  The flip happens
      // when the operator transitions the run to 'in_progress' via
      // PATCH /runs/:id.  See activateRunDispatch().
      res.status(201).json({ success: true, run_id: id });
    } catch (err) {
      console.error('POST /last-mile/runs error:', err);
      res.status(500).json({ success: false, message: 'Failed to create run' });
    }
  }
);

/**
 * GET /api/last-mile/runs/:id/parcels — operator/rider view of which
 * parcels are scheduled for a particular run. Reads the
 * last_mile_run_parcels join table (migration 012) ordered by
 * `position`, joining to orders + users so the client can render
 * addresses, phone, and POD status.
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

      // Read the parcel set from the join table (migration 012),
      // joined to orders/users so the iOS dispatch UI can render
      // address + phone + POD-state per row in stop order.
      const { rows: parcels } = await req.db.query(
        `SELECT o.id, o.tracking_number, o.description, o.status,
                u.id AS user_id, u.name, u.phone, u.delivery_address,
                lmrp.delivery_address_override,
                lmrp.position,
                EXISTS(SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id) AS has_pod
           FROM last_mile_run_parcels lmrp
           JOIN orders o ON o.id = lmrp.parcel_id
           JOIN users  u ON u.id = o.user_id
          WHERE lmrp.run_id = $1
          ORDER BY lmrp.position ASC`,
        [id]
      );
      res.json({ success: true, run, parcels });
    } catch (err) {
      console.error('GET /last-mile/runs/:id/parcels error:', err);
      res.status(500).json({ success: false, message: 'Failed to load run parcels' });
    }
  }
);

/**
 * PATCH /api/last-mile/runs/:id/parcels — manage the parcel set on a run.
 *
 * Body:
 *   {
 *     add:       [parcelId, ...],                       // optional
 *     remove:    [parcelId, ...],                       // optional
 *     reorder:   [parcelId, parcelId, ...],             // optional
 *     addresses: { parcelId: "override text" | null }   // optional
 *   }
 *
 * Rules:
 *   • add / remove / reorder are only allowed when run.status = 'planned'.
 *     Once a run is in_progress / completed / cancelled the routing is
 *     frozen — the rider is already executing.
 *   • address overrides may be set on planned or in_progress runs (the
 *     rider may need an updated drop point mid-route).
 *   • adds run the same checks POST /runs uses: parcel exists + not on
 *     another active run.
 *   • reorder must list every parcel currently on the run exactly once;
 *     positions are reassigned by index.
 *   • total_stops is recomputed at the end so completion math stays
 *     correct.
 *
 * All work happens inside a single transaction with the run row
 * locked FOR UPDATE so concurrent edits serialise.
 */
router.patch(
  '/runs/:id/parcels',
  authMiddleware,
  requireRole('operator'),
  async (req, res) => {
    try {
      const { id } = req.params;
      const add = Array.isArray(req.body?.add) ? req.body.add : [];
      const remove = Array.isArray(req.body?.remove) ? req.body.remove : [];
      const reorder = Array.isArray(req.body?.reorder) ? req.body.reorder : [];
      const addresses = (req.body?.addresses && typeof req.body.addresses === 'object')
        ? req.body.addresses : {};

      if (add.length === 0 && remove.length === 0 && reorder.length === 0
          && Object.keys(addresses).length === 0) {
        return res.status(400).json({ success: false, message: 'Nothing to update' });
      }

      const client = await req.db.connect();
      try {
        await client.query('BEGIN');

        const cur = await client.query(
          `SELECT status FROM last_mile_runs WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (cur.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Run not found' });
        }
        const status = cur.rows[0].status;

        const mutatingParcelSet = add.length > 0 || remove.length > 0 || reorder.length > 0;
        if (mutatingParcelSet && status !== 'planned') {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Parcel set is frozen once the run leaves 'planned' (current: '${status}')`,
          });
        }
        if (Object.keys(addresses).length > 0 && status !== 'planned' && status !== 'in_progress') {
          await client.query('ROLLBACK');
          return res.status(409).json({
            success: false,
            message: `Address overrides cannot be edited on a ${status} run`,
          });
        }

        // Validate adds: orders existence + not on another active run.
        if (add.length > 0) {
          const { rows: existing } = await client.query(
            `SELECT id FROM orders WHERE id = ANY($1::text[])`,
            [add]
          );
          if (existing.length !== add.length) {
            const found = new Set(existing.map(r => r.id));
            const missing = add.filter(p => !found.has(p));
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: `Unknown parcel id(s): ${missing.join(', ')}`,
            });
          }
          const { rows: clashes } = await client.query(
            `SELECT lmrp.parcel_id
               FROM last_mile_run_parcels lmrp
               JOIN last_mile_runs r ON r.id = lmrp.run_id
              WHERE r.status IN ('planned','in_progress')
                AND lmrp.run_id <> $1
                AND lmrp.parcel_id = ANY($2::text[])`,
            [id, add]
          );
          if (clashes.length > 0) {
            const conflictIds = [...new Set(clashes.map(c => c.parcel_id))];
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: `Parcel(s) already on another active run: ${conflictIds.join(', ')}`,
            });
          }

          // Append new rows after the current max position so existing
          // routing order isn't disturbed.
          const { rows: maxRows } = await client.query(
            `SELECT COALESCE(MAX(position), -1) AS max_pos
               FROM last_mile_run_parcels WHERE run_id = $1`,
            [id]
          );
          let nextPos = maxRows[0].max_pos + 1;
          for (const pid of add) {
            await client.query(
              `INSERT INTO last_mile_run_parcels (run_id, parcel_id, position)
               VALUES ($1, $2, $3)
               ON CONFLICT (run_id, parcel_id) DO NOTHING`,
              [id, pid, nextPos]
            );
            nextPos++;
          }
        }

        if (remove.length > 0) {
          await client.query(
            `DELETE FROM last_mile_run_parcels
              WHERE run_id = $1 AND parcel_id = ANY($2::text[])`,
            [id, remove]
          );
        }

        if (reorder.length > 0) {
          // Validate that the reorder list matches the current set
          // exactly — no missing, no extras.  Rejecting partial
          // reorders avoids silently leaving a parcel at a stale
          // position the operator didn't account for.
          const { rows: currentRows } = await client.query(
            `SELECT parcel_id FROM last_mile_run_parcels WHERE run_id = $1`,
            [id]
          );
          const currentSet = new Set(currentRows.map(r => r.parcel_id));
          const reorderSet = new Set(reorder);
          if (
            currentSet.size !== reorderSet.size ||
            reorder.length !== reorderSet.size ||
            ![...currentSet].every(p => reorderSet.has(p))
          ) {
            await client.query('ROLLBACK');
            return res.status(400).json({
              success: false,
              message: 'reorder must list every parcel currently on the run exactly once',
            });
          }
          for (let i = 0; i < reorder.length; i++) {
            await client.query(
              `UPDATE last_mile_run_parcels
                  SET position = $3
                WHERE run_id = $1 AND parcel_id = $2`,
              [id, reorder[i], i]
            );
          }
        }

        if (Object.keys(addresses).length > 0) {
          for (const [pid, override] of Object.entries(addresses)) {
            const value = (override === null || override === '') ? null : String(override);
            await client.query(
              `UPDATE last_mile_run_parcels
                  SET delivery_address_override = $3
                WHERE run_id = $1 AND parcel_id = $2`,
              [id, pid, value]
            );
          }
        }

        // Resync total_stops so the run-completion check still works.
        const { rows: countRows } = await client.query(
          `SELECT COUNT(*)::int AS n FROM last_mile_run_parcels WHERE run_id = $1`,
          [id]
        );
        await client.query(
          `UPDATE last_mile_runs SET total_stops = $1, updated_at = NOW() WHERE id = $2`,
          [countRows[0].n, id]
        );

        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /last-mile/runs/:id/parcels error:', err);
      res.status(500).json({ success: false, message: 'Failed to update run parcels' });
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

      // State-machine guard: only allow forward transitions.  Without it
      // a re-PATCH with status='in_progress' would re-run
      // activateRunDispatch and issue a fresh OTP every time, and a
      // backwards 'completed → planned' would un-do completion math.
      const TRANSITIONS = {
        planned:     new Set(['planned','in_progress','cancelled']),
        in_progress: new Set(['in_progress','completed','cancelled']),
        completed:   new Set(['completed']),
        cancelled:   new Set(['cancelled']),
      };

      const requestedStatus = req.body.status;

      sets.push(`updated_at = NOW()`);
      params.push(id);

      const client = await req.db.connect();
      try {
        await client.query('BEGIN');

        // Lock the run row for the duration of the transaction so a
        // concurrent PATCH can't race the state-machine check.
        const cur = await client.query(
          `SELECT status FROM last_mile_runs WHERE id = $1 FOR UPDATE`,
          [id]
        );
        if (cur.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(404).json({ success: false, message: 'Run not found' });
        }
        const previousStatus = cur.rows[0].status;

        if (typeof requestedStatus !== 'undefined') {
          const allowedNext = TRANSITIONS[previousStatus];
          if (!allowedNext || !allowedNext.has(requestedStatus)) {
            await client.query('ROLLBACK');
            return res.status(409).json({
              success: false,
              message: `Cannot transition run from '${previousStatus}' to '${requestedStatus}'`,
            });
          }
        }

        await client.query(
          `UPDATE last_mile_runs SET ${sets.join(', ')} WHERE id = $${params.length}`,
          params
        );

        // Run dispatch activation only fires on the *first* transition
        // from 'planned' → 'in_progress' AND the run has a rider.  No
        // double-issue OTPs on a re-PATCH.
        const isFirstStart =
          previousStatus === 'planned' &&
          requestedStatus === 'in_progress';
        if (isFirstStart) {
          const { rows } = await client.query(
            `SELECT rider_id FROM last_mile_runs WHERE id = $1`,
            [id]
          );
          const run = rows[0];
          if (run?.rider_id) {
            await activateRunDispatch(client, id);
          }
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      res.json({ success: true });
    } catch (err) {
      console.error('PATCH /last-mile/runs/:id error:', err);
      res.status(500).json({ success: false, message: 'Failed to update run' });
    }
  }
);

/**
 * authorisePodAttempt — shared precondition check for the POD success and
 * failure endpoints.
 *
 * Returns `{ run, parcelIds }` on success, or sends the response and returns
 * `null` on rejection.  Callers must early-return when the result is null.
 *
 * Checks (in order):
 *   1. The run exists.
 *   2. The caller is the assigned rider, or admin.
 *   3. The parcel_id is attached to the run via last_mile_run_parcels.
 *   4. The order is in a deliverable status ('out_for_delivery' or 'customs').
 *
 * Audit ticket T4 — without these checks any rider could POD any other
 * rider's run, and a rider could POD a parcel still sitting in the warehouse.
 */
async function authorisePodAttempt(req, res, runId, parcelId) {
  const { rows: runRows } = await req.db.query(
    `SELECT id, rider_id, status
       FROM last_mile_runs
      WHERE id = $1`,
    [runId]
  );
  if (runRows.length === 0) {
    res.status(404).json({ success: false, message: 'Run not found' });
    return null;
  }
  const run = runRows[0];

  const isAdmin = req.user.role === 'admin';
  if (!isAdmin && run.rider_id !== req.user.id) {
    res.status(403).json({ success: false, message: 'Not the assigned rider for this run' });
    return null;
  }

  // Indexed lookup via the join table — replaces the JSON parse path.
  const { rows: linkRows } = await req.db.query(
    `SELECT 1 FROM last_mile_run_parcels
      WHERE run_id = $1 AND parcel_id = $2`,
    [runId, parcelId]
  );
  if (linkRows.length === 0) {
    res.status(400).json({ success: false, message: 'Parcel is not on this run' });
    return null;
  }

  const { rows: orderRows } = await req.db.query(
    `SELECT status FROM orders WHERE id = $1`,
    [parcelId]
  );
  if (orderRows.length === 0) {
    res.status(404).json({ success: false, message: 'Parcel not found' });
    return null;
  }
  const orderStatus = orderRows[0].status;
  if (orderStatus !== 'out_for_delivery' && orderStatus !== 'customs') {
    res.status(409).json({
      success: false,
      message: `Parcel is not deliverable (status: ${orderStatus})`,
    });
    return null;
  }

  return { run };
}

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

      // Read parcels per run from the join table in stop order.
      const result = [];
      for (const run of runs) {
        const { rows: parcels } = await req.db.query(
          `SELECT o.id, o.tracking_number, o.description, u.name, u.phone,
                  u.delivery_address,
                  lmrp.delivery_address_override,
                  lmrp.position,
                  EXISTS(SELECT 1 FROM pod_events p WHERE p.parcel_id = o.id) AS has_pod
             FROM last_mile_run_parcels lmrp
             JOIN orders o ON o.id = lmrp.parcel_id
             JOIN users  u ON u.id = o.user_id
            WHERE lmrp.run_id = $1
            ORDER BY lmrp.position ASC`,
          [run.id]
        );
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
      const auth = await authorisePodAttempt(req, res, runId, parcel_id);
      if (!auth) return;

      // Wrap the four-statement success path in a single transaction on a
      // dedicated client. Mirrors the pattern in routes/orders.js — pool.query
      // can dispatch each call to a different connection, which would defeat
      // BEGIN/COMMIT. A partial failure (e.g. NPS insert errors after
      // orders.status flipped) would otherwise leave the run, the order, and
      // pod_events inconsistent with each other.
      const client = await req.db.connect();
      let runState;
      let id;
      try {
        await client.query('BEGIN');
        const otpOk = await validatePodOtp(client, parcel_id, otp_used);
        if (!otpOk) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }
        // pod_events.id is a uuid (default gen_random_uuid()) on prod;
        // letting the column default fill it avoids the 22P02 mismatch
        // that bit POST /runs.
        const podRes = await client.query(
          `INSERT INTO pod_events
             (parcel_id, run_id, rider_id, result, photo_url,
              signature_url, otp_used, recipient_name, recipient_phone, notes)
           VALUES ($1,$2,$3,'delivered',$4,$5,$6,$7,$8,$9)
           RETURNING id`,
          [parcel_id, runId, req.user.id,
           photo_url || null, signature_url || null,
           otp_used || null, recipient_name || null,
           recipient_phone || null, notes || null]
        );
        id = podRes.rows[0].id;
        await client.query(
          `UPDATE orders SET status = 'delivered', updated_at = NOW() WHERE id = $1`,
          [parcel_id]
        );
        // Mirror to packages so the operator board no longer shows the
        // parcel as 'manifested' / 'out_for_delivery' after POD.
        await client.query(
          `UPDATE packages SET status = 'delivered', updated_at = NOW()
            WHERE order_id = $1`,
          [parcel_id]
        );
        // NPS invitation. Pulled from orders since the rider POD doesn't carry
        // user_id directly — keeps the (user_id, order_id) row exact.
        const ownerRow = await client.query(
          `SELECT user_id FROM orders WHERE id = $1`, [parcel_id]
        );
        const ownerId = ownerRow.rows[0]?.user_id;
        if (ownerId) {
          await client.query(
            `INSERT INTO nps_invitations (id, user_id, order_id)
             VALUES ($1, $2, $3) ON CONFLICT (order_id) DO NOTHING`,
            [`NPSI-${Date.now()}-${Math.random().toString(36).slice(2,6)}`, ownerId, parcel_id]
          );
        }
        // Atomic increment + completion flip. RETURNING the post-update
        // values lets us tell the rider whether the whole run is done.
        // The UPDATE is row-locked by Postgres; concurrent POD posts on
        // the same run serialise rather than racing on a stale read.
        const runUpd = await client.query(
          `UPDATE last_mile_runs
              SET completed_stops = completed_stops + 1,
                  status = CASE WHEN completed_stops + 1 >= total_stops
                                THEN 'completed' ELSE 'in_progress' END,
                  updated_at = NOW()
            WHERE id = $1
            RETURNING completed_stops, total_stops, status`,
          [runId]
        );
        runState = runUpd.rows[0] || null;
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      res.status(201).json({ success: true, pod_id: id, run: runState });
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
      const auth = await authorisePodAttempt(req, res, runId, parcel_id);
      if (!auth) return;

      // Transactional: insert the failure event + read the new fail count,
      // and on the second fail flip orders.status / hold_reason and the
      // package.status to held_at_nairobi_hub in the same transaction so
      // customer-visible tracking matches the dispatch board.
      const client = await req.db.connect();
      let fails;
      let held = false;
      let id;
      try {
        await client.query('BEGIN');
        // pod_events.id is uuid (default gen_random_uuid()) on prod.
        const failRes = await client.query(
          `INSERT INTO pod_events
             (parcel_id, run_id, rider_id, result, notes)
           VALUES ($1,$2,$3,'failed',$4)
           RETURNING id`,
          [parcel_id, runId, req.user.id, reason || 'Recipient unavailable']
        );
        id = failRes.rows[0].id;
        // Count failures on THIS run only.  An earlier global count
        // tripped the held-at-hub flip on the first fail of a re-run
        // because a previous run had already racked up two fails on
        // the same parcel — the parcel was supposed to get a fresh
        // pair of attempts under the new rider.
        const failsRes = await client.query(
          `SELECT COUNT(*)::int AS fails FROM pod_events
            WHERE parcel_id = $1 AND run_id = $2 AND result = 'failed'`,
          [parcel_id, runId]
        );
        fails = failsRes.rows[0].fails;
        if (fails >= 2) {
          // Customer-visible flip. orders.status uses the legacy v1 enum
          // (no 'held' value yet) so we settle on 'customs' + hold_reason
          // to surface the held state on the public tracking timeline.
          // packages.status carries the v2 enum which does include
          // 'held_at_nairobi_hub' — set it directly so the operator
          // dispatch board picks it up in one place.
          await client.query(
            `UPDATE orders
                SET status = 'customs',
                    hold_reason = 'held_at_nairobi_hub',
                    updated_at = NOW()
              WHERE id = $1`,
            [parcel_id]
          );
          await client.query(
            `UPDATE packages
                SET status = 'held_at_nairobi_hub',
                    updated_at = NOW()
              WHERE order_id = $1`,
            [parcel_id]
          );
          // Held is a terminal-for-this-run state — bump completed_stops
          // and flip the run to 'completed' if every stop is now resolved
          // (delivered OR held).  Without this, runs with one held parcel
          // never left 'in_progress'.  Audit D12.
          const runUpd = await client.query(
            `UPDATE last_mile_runs
                SET completed_stops = completed_stops + 1,
                    status = CASE WHEN completed_stops + 1 >= total_stops
                                  THEN 'completed' ELSE 'in_progress' END,
                    updated_at = NOW()
              WHERE id = $1
              RETURNING completed_stops, total_stops, status`,
            [runId]
          );
          held = true;
          if (runUpd.rows[0]) {
            // expose the run state alongside `held` so the rider client
            // can show "Run complete" without a re-fetch.
            // (the response builder below already references `held`/`fails`)
          }
        }
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      res.status(201).json({ success: true, pod_id: id, fails, held });
    } catch (err) {
      console.error('POST /last-mile/rider/runs/:runId/fail error:', err);
      res.status(500).json({ success: false, message: 'Failed to record failed delivery' });
    }
  }
);

/**
 * POST /api/last-mile/rider/runs/:runId/parcels/:parcelId/reissue-otp
 *
 * Re-mints the delivery OTP for a parcel on this run and dispatches a fresh
 * notification to the recipient.  Use case: rider arrives, recipient says
 * "I never got the code" or the original 24h TTL elapsed because the run
 * stretched across two days.  Bypassing the rider here would mean rolling
 * back to the old "trust whatever 4 digits the rider typed" behaviour, so
 * we keep the OTP gate and just re-issue.
 *
 * Auth + run membership + deliverable-state checks reuse authorisePodAttempt.
 */
router.post(
  '/rider/runs/:runId/parcels/:parcelId/reissue-otp',
  authMiddleware,
  requireRole('rider'),
  async (req, res) => {
    try {
      const { runId, parcelId } = req.params;
      const auth = await authorisePodAttempt(req, res, runId, parcelId);
      if (!auth) return;
      const client = await req.db.connect();
      try {
        await client.query('BEGIN');
        await issuePodOtp(client, parcelId);
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
      res.json({ success: true });
    } catch (err) {
      console.error('POST /last-mile/rider/runs/:runId/parcels/:parcelId/reissue-otp error:', err);
      res.status(500).json({ success: false, message: 'Failed to reissue OTP' });
    }
  }
);

/**
 * POST /api/last-mile/pod/upload-url
 *
 * Returns a 5-minute signed-upload URL into the `pods` bucket.  The rider
 * iOS / Android client then PUTs the JPEG (POD photo) or PNG (signature)
 * directly to `signed_url` via URLSession / OkHttp — no Supabase JWT or
 * KMP-bridged ByteArray traversal at the upload site.
 *
 * The K/N ByteArray bridge cost ~1µs per byte on iOS, so a 4 MB photo
 * froze the app long enough that Kotlin_processUnhandledException fired
 * before the upload even started; signed URLs sidestep the bridge entirely
 * (audit D19, mirroring the agent-invoice fix from PR #35).
 *
 * Body: { parcel_id, kind: 'photo' | 'signature' }
 *   The path is `pod/<parcel_id>/<ts>.<ext>` (jpg for photo, png for
 *   signature) so existing storage layout / RLS path patterns still hold.
 *
 * Returns: { success, bucket, path, signed_url, token, public_url }
 */
router.post(
  '/pod/upload-url',
  authMiddleware,
  requireRole('rider'),
  async (req, res) => {
    try {
      if (!getSupabaseAdmin()) {
        return res.status(503).json({
          success: false,
          message: 'Storage admin not configured. Set SUPABASE_SERVICE_KEY on the server.',
        });
      }
      const parcelId = String(req.body?.parcel_id || '').trim();
      const kind = String(req.body?.kind || 'photo');
      if (!parcelId) {
        return res.status(400).json({ success: false, message: 'parcel_id is required' });
      }
      if (kind !== 'photo' && kind !== 'signature') {
        return res.status(400).json({ success: false, message: "kind must be 'photo' or 'signature'" });
      }
      const ts = Date.now();
      const ext = kind === 'signature' ? 'png' : 'jpg';
      const subdir = kind === 'signature' ? 'signatures' : 'pod';
      const path = `${subdir}/${parcelId}/${ts}.${ext}`;
      const data = await createSignedUploadUrl(POD_BUCKET, path);

      const sb = getSupabaseAdmin();
      const { data: pub } = sb.storage.from(POD_BUCKET).getPublicUrl(path);

      return res.json({
        success: true,
        bucket: POD_BUCKET,
        path,
        signed_url: data.signedUrl,
        token: data.token,
        public_url: pub?.publicUrl ?? null,
      });
    } catch (err) {
      console.error('POST /last-mile/pod/upload-url error:', err);
      return res.status(500).json({ success: false, message: 'Failed to mint upload URL' });
    }
  }
);

export default router;
