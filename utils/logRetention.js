// utils/logRetention.js
//
// Daily prune of long-lived log tables so they don't grow unbounded.
// Runs once on boot (after a 60-second warm-up so a Railway redeploy
// doesn't fight the previous instance over rows about to expire) and
// then every 24 hours via setInterval.
//
// Tables + retention windows are env-configurable; defaults match the
// 2026-05-09 audit recommendation:
//
//   error_logs    →  LOG_RETENTION_ERROR_DAYS    (default 30)
//   admin_logs    →  LOG_RETENTION_ADMIN_DAYS    (default 365)
//   email_logs    →  LOG_RETENTION_EMAIL_DAYS    (default 180)
//
// To disable a table's prune entirely, set its env var to 0.
//
// The job is fire-and-forget: errors are logged to stderr but never
// propagate up. We deliberately do NOT route this to errorLogger
// (which writes to error_logs) — that would be the table we just
// failed to prune. Use logRouteError elsewhere; here, console is
// the right exit.

const RETENTION = {
  error_logs:  { envKey: 'LOG_RETENTION_ERROR_DAYS', defaultDays: 30,  column: 'created_at' },
  admin_logs:  { envKey: 'LOG_RETENTION_ADMIN_DAYS', defaultDays: 365, column: 'created_at' },
  email_logs:  { envKey: 'LOG_RETENTION_EMAIL_DAYS', defaultDays: 180, column: 'sent_at' },
};

const DAY_MS  = 24 * 60 * 60 * 1000;
const WARMUP  = 60 * 1000;

function readDays(cfg) {
  const raw = process.env[cfg.envKey];
  if (raw === undefined || raw === '') return cfg.defaultDays;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) {
    console.warn(`[log-retention] ignoring invalid ${cfg.envKey}="${raw}", using default ${cfg.defaultDays}`);
    return cfg.defaultDays;
  }
  return n;
}

async function pruneTable(pool, tableName, days, column) {
  if (days === 0) return { table: tableName, days, deleted: 0, skipped: true };
  const startedAt = Date.now();
  try {
    // Parameterised days; column + table are validated at module load
    // (see RETENTION above) so the substitution is safe. We use
    // INTERVAL '1 day' * $1 rather than NOW() - $1 * INTERVAL '1 day'
    // so the cast is unambiguous to Postgres.
    const { rowCount } = await pool.query(
      `DELETE FROM ${tableName}
        WHERE ${column} < NOW() - ($1 || ' days')::interval`,
      [String(days)]
    );
    return {
      table: tableName,
      days,
      deleted: rowCount || 0,
      skipped: false,
      tookMs: Date.now() - startedAt,
    };
  } catch (err) {
    return { table: tableName, days, error: err.message, tookMs: Date.now() - startedAt };
  }
}

async function pruneAll(pool) {
  const summaries = [];
  for (const [table, cfg] of Object.entries(RETENTION)) {
    const days = readDays(cfg);
    summaries.push(await pruneTable(pool, table, days, cfg.column));
  }

  const totalDeleted = summaries.reduce((acc, s) => acc + (s.deleted || 0), 0);
  const errors = summaries.filter((s) => s.error);

  if (errors.length) {
    console.error(`[log-retention] completed with ${errors.length} error(s):`,
      errors.map((e) => `${e.table}: ${e.error}`).join('; '));
  }
  if (totalDeleted > 0 || errors.length === 0) {
    console.log(`[log-retention] pruned ${totalDeleted} row(s) total — ${
      summaries
        .filter((s) => !s.error)
        .map((s) => `${s.table}=${s.deleted}${s.skipped ? '(disabled)' : ''}`)
        .join(', ')
    }`);
  }
}

/**
 * Start the daily retention job. Returns a clearInterval handle the
 * caller can cancel — we wire that into the SIGTERM/SIGINT shutdown
 * path in server.js so the timer doesn't keep the event loop alive
 * during graceful shutdown.
 *
 * The first prune fires after WARMUP (60s) so a fresh deploy doesn't
 * compete with the previous instance over rows that are about to
 * expire. After that, every 24h.
 */
export function startLogRetention(pool) {
  if (!pool) {
    console.warn('[log-retention] no pool provided — skipping');
    return null;
  }
  const first = setTimeout(() => {
    pruneAll(pool).catch((e) => console.error('[log-retention] prune crashed:', e.message));
  }, WARMUP);
  // Don't keep the loop alive solely on this timer — Node will still
  // exit cleanly on SIGTERM even if the warm-up hasn't fired yet.
  if (typeof first.unref === 'function') first.unref();

  const recurring = setInterval(() => {
    pruneAll(pool).catch((e) => console.error('[log-retention] prune crashed:', e.message));
  }, DAY_MS);
  if (typeof recurring.unref === 'function') recurring.unref();

  return () => {
    clearTimeout(first);
    clearInterval(recurring);
  };
}
