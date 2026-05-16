// utils/accountDeletionRunner.js
//
// Daily job that hard-deletes user accounts whose 14-day cooldown is up.
// Same unref-d setInterval shape as utils/fxRefresh.js and
// utils/logRetention.js so the timer doesn't pin the event loop during
// graceful shutdown.
//
// The cooldown is enforced by the routes/accountDeletion.js POST handler
// (sets scheduled_deletion_at = NOW() + 14 days). This runner just
// sweeps for rows where:
//   - cancelled_at IS NULL  (user did not cancel)
//   - completed_at IS NULL  (we haven't already deleted them)
//   - scheduled_deletion_at <= NOW()
//
// For each due row we DELETE FROM users WHERE id = $1 — the FK cascade
// on every dependent table (orders, payments, packages, tickets, ...)
// removes the rest. The `account_deletion_requests` row stays so we
// have an audit trail; its FK is set to CASCADE so deletion of the
// user also deletes the request, which is fine — we stamp
// completed_at first, then delete the user. If the cascade wipes the
// stamped row that's the same shape we'd have anyway and the count is
// captured in logs.
//
// FAILURE MODE: a single bad row (e.g. user already deleted directly
// in SQL) must not stop the loop. Each iteration is wrapped in
// try/catch and a failure logs to error_logs + skips the row. The job
// retries the same row on the next daily tick.

import { logError } from './errorLogger.js';

const DAY_MS    = 24 * 60 * 60 * 1000;
const WARMUP_MS = 60 * 1000;

/**
 * Sweep for due rows and delete the underlying users. Returns counts
 * so the admin "trigger deletion sweep" endpoint can surface them.
 *
 * @param {{ query: Function }} db
 * @returns {Promise<{ deleted: number, failed: number, total: number }>}
 */
export async function runAccountDeletionSweep(db) {
  if (!db) {
    return { deleted: 0, failed: 0, total: 0, error: 'db pool not provided' };
  }

  let due;
  try {
    const { rows } = await db.query(
      `SELECT id, user_id
         FROM account_deletion_requests
        WHERE cancelled_at IS NULL
          AND completed_at IS NULL
          AND scheduled_deletion_at <= NOW()
        ORDER BY scheduled_deletion_at ASC
        LIMIT 200`
    );
    due = rows;
  } catch (e) {
    // Most common reason: migration 002_account_deletion_requests.sql
    // has not been applied yet. We log once per tick and bail rather
    // than crashing the timer.
    await logError({
      level: 'warn',
      source: 'account-deletion-runner',
      message: `Cannot read account_deletion_requests: ${e.message}`,
      stack: e.stack,
    });
    return { deleted: 0, failed: 0, total: 0, error: e.message };
  }

  let deleted = 0;
  let failed  = 0;

  for (const row of due) {
    try {
      // Mark complete FIRST so a partial cascade still records that
      // this request was processed (audit trail). FK ON DELETE CASCADE
      // on user_id will remove the request when the user is deleted
      // below — that's fine, the row was only ever needed for the
      // sweep + retry safety net.
      await db.query('BEGIN');
      await db.query(
        `UPDATE account_deletion_requests
            SET completed_at = NOW()
          WHERE id = $1`,
        [row.id]
      );
      await db.query(`DELETE FROM users WHERE id = $1`, [row.user_id]);
      await db.query('COMMIT');
      deleted++;
    } catch (e) {
      try { await db.query('ROLLBACK'); } catch { /* ignore */ }
      failed++;
      await logError({
        level: 'error',
        source: 'account-deletion-runner',
        message: `Failed to delete user ${row.user_id} (request ${row.id}): ${e.message}`,
        stack: e.stack,
      });
    }
  }

  return { deleted, failed, total: due.length };
}

/**
 * Start the daily deletion sweep. Mirrors startFxRefresh's shape: 60s
 * warm-up, 24h cadence, unref'd timers, returns a cancel handle the
 * caller wires into SIGTERM/SIGINT.
 *
 * Gated by ACCOUNT_DELETION_RUNNER_ENABLED env (default-on). Set to
 * 'false' on dev/staging where you don't want sweeps to fire.
 */
export function startAccountDeletionRunner(pool) {
  if (process.env.ACCOUNT_DELETION_RUNNER_ENABLED === 'false') {
    console.log('[account-deletion-runner] disabled via ACCOUNT_DELETION_RUNNER_ENABLED=false');
    return null;
  }
  if (!pool) {
    console.warn('[account-deletion-runner] no pool provided — skipping');
    return null;
  }

  const run = async () => {
    const result = await runAccountDeletionSweep(pool);
    if (result.error) {
      console.warn(`[account-deletion-runner] sweep aborted: ${result.error}`);
    } else if (result.total > 0) {
      console.log(`[account-deletion-runner] swept ${result.total} due: ${result.deleted} deleted, ${result.failed} failed`);
    }
  };

  const first = setTimeout(() => {
    run().catch((e) => console.error('[account-deletion-runner] crashed:', e?.message));
  }, WARMUP_MS);
  if (typeof first.unref === 'function') first.unref();

  const recurring = setInterval(() => {
    run().catch((e) => console.error('[account-deletion-runner] crashed:', e?.message));
  }, DAY_MS);
  if (typeof recurring.unref === 'function') recurring.unref();

  return () => {
    clearTimeout(first);
    clearInterval(recurring);
  };
}
