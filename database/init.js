import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const { Pool } = pg;

// ── Validate DATABASE_URL before anything else ──────────────────────────────
const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: DATABASE_URL is not set                                  ║
║                                                                  ║
║  Steps to fix:                                                   ║
║  1. Go to supabase.com → your project → Settings → Database      ║
║  2. Copy the "Connection string" (URI format)                    ║
║  3. In Railway: your service → Variables → add DATABASE_URL      ║
║                                                                  ║
║  Expected format:                                                ║
║  postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres ║
╚══════════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// Validate it is a real URL before pg even tries to parse it
try {
  const parsed = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`Protocol must be postgres:// or postgresql://, got: ${parsed.protocol}`);
  }
  console.log(`✓ DATABASE_URL validated — host: ${parsed.hostname}`);
} catch (err) {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: DATABASE_URL is set but is not a valid PostgreSQL URL    ║
║                                                                  ║
║  Error: ${err.message.padEnd(54)}║
║                                                                  ║
║  Common mistakes:                                                ║
║  • Password contains special chars — URL-encode them             ║
║    e.g. @ → %40   # → %23   $ → %24   & → %26                   ║
║  • Missing protocol (must start with postgresql://)              ║
║  • Copied the "Direct connection" string with [YOUR-PASSWORD]    ║
║    placeholder still in it — replace it with your real password  ║
║                                                                  ║
║  Expected format:                                                ║
║  postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres ║
╚══════════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

/**
 * PostgreSQL connection pool (Supabase via Railway)
 *
 * Timeout tuning — Railway kills idle TCP connections after ~20s.
 * We must evict idle pool connections before that window closes.
 *
 *   idleTimeoutMillis: 10000   — drop idle connections after 10s,
 *                                before Railway's ~20s TCP teardown
 *   keepAlive: true            — send TCP keepalive probes so Railway
 *                                doesn't classify active connections
 *                                as idle and tear them down silently
 *   keepAliveInitialDelayMillis: 10000 — start keepalives after 10s
 *   max: 5                     — Supabase free tier allows ~25 total
 *                                concurrent connections; 5 is safe
 *   allowExitOnIdle: true      — clean exit when all connections idle
 *
 *   family: 0  → allow both IPv4 and IPv6
 *   ssl        → required for Supabase
 */
// Supabase (and any non-local host) requires SSL. A local Postgres — used for
// running the suite / a seeded dev DB before touching the remote project — does
// not support SSL, so disable it for localhost / an explicit sslmode=disable.
const isLocalDb = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(rawUrl) || /sslmode=disable/.test(rawUrl);

const pool = new Pool({
  connectionString: rawUrl,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  family: 0,
  max: 5,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
  allowExitOnIdle: true,
});

pool.on('error', (err) => {
  console.error('⚠ Unexpected PostgreSQL pool error:', err.message);
});

// ═══════════════════════════════════════════════════════════════════════════════
// initializeDatabase — connect, run forward migrations, run smoke checks.
//
// Audit C-1 (2026-05-09): the previous implementation also held a hard-coded
// TABLES schema that re-ran CREATE TABLE / CREATE INDEX / ALTER TABLE on every
// boot. That was fighting forward migrations — e.g. migration 039 dropped
// `wallet`, which the bootstrap then re-created on the next deploy with RLS
// disabled. Forward migrations under database/migrations/ are now the single
// source of truth for schema. The bootstrap only:
//   1. opens the pool and validates the connection,
//   2. enumerates database/migrations/*.sql against the _migrations ledger
//      and applies anything new,
//   3. runs a couple of cheap diagnostics (role check, users SELECT smoke).
// Provisioning a *fresh* Supabase project: just point DATABASE_URL at the new
// direct-connection string and boot. The baseline migration
// `0000_baseline_schema.sql` creates the 15 base tables; the rest of
// `database/migrations/*.sql` layers every additive change on top in
// alphabetical order. (For history: this used to require pasting
// database/schema.sql into the SQL Editor first; the baseline migration
// replaces that step.)
// ═══════════════════════════════════════════════════════════════════════════════
export async function initializeDatabase() {
  // ── Step 1: connect ──────────────────────────────────────────────────────
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: Could not connect to the database                        ║
║                                                                  ║
║  Check that:                                                     ║
║  1. Your DATABASE_URL password is correct                        ║
║  2. Your Supabase project is active (not paused)                 ║
║  3. The host/port in the URL is correct                          ║
║                                                                  ║
║  Error: ${err.message.substring(0, 54).padEnd(54)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
    throw err;
  }

  // ── Step 2: verify connection, check role, detect read-only ─────────────
  let dbUser = 'unknown';
  let isReadOnly = false;

  try {
    const versionRes = await client.query('SELECT version()');
    console.log(`✓ Database connected — ${versionRes.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
  } catch (err) {
    console.error('⚠ Connected but SELECT version() failed:', err.message);
  }

  // Check role
  try {
    const roleRes = await client.query('SELECT current_user, current_setting(\'role\') AS session_role');
    dbUser = roleRes.rows[0].current_user;
    const sessRole = roleRes.rows[0].session_role;
    console.log(`✓ Connected as role: ${dbUser} (session: ${sessRole})`);

    if (dbUser !== 'postgres' && sessRole !== 'postgres') {
      console.error(`⚠ WARNING: Connected as "${dbUser}" instead of "postgres".`);
      console.error('  RLS policies may block queries. Use the direct connection string (port 5432).');
    }
  } catch (err) {
    console.error('⚠ Could not check database role:', err.message);
  }

  // Check if connection is read-only (Supabase transaction pooler = read-only for DDL)
  try {
    const txRes = await client.query('SHOW transaction_read_only');
    isReadOnly = txRes.rows[0]?.transaction_read_only === 'on';
    if (isReadOnly) {
      console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  ⚠ DATABASE CONNECTION IS READ-ONLY                              ║
║                                                                  ║
║  Your DATABASE_URL is using the Supabase transaction pooler      ║
║  (port 6543). This blocks CREATE TABLE, ALTER TABLE, etc.        ║
║                                                                  ║
║  To fix: use the DIRECT connection string instead:               ║
║  Supabase → Settings → Database → Connection string → URI        ║
║  Make sure it uses port 5432 and starts with:                    ║
║  postgresql://postgres.[REF]:[PASS]@aws-0-...:5432/postgres      ║
║                                                                  ║
║  Skipping forward migrations — using existing schema only.       ║
╚══════════════════════════════════════════════════════════════════╝
      `);
    }
  } catch (err) {
    console.error('⚠ Could not check transaction_read_only:', err.message);
  }

  client.release();

  // ── Step 3: list tables in database (diagnostic only) ───────────────────
  // Schema creation is owned entirely by database/migrations/ — see Step 5.
  try {
    const checkRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const existing = checkRes.rows.map(r => r.table_name);
    console.log(`✓ ${existing.length} tables present: ${existing.join(', ')}`);
  } catch (err) {
    console.error('⚠ Could not list tables:', err.message);
  }

  // ── Step 4: quick data test — can we actually read from users? ──────────
  // RLS is intentionally ENABLED + FORCED on every public table (see
  // server-patches/database/migrations/018_rls_relockdown.sql + 019_rls_policy_fill.sql).
  // The mobile clients read directly via PostgREST under the user's JWT, so the
  // policies are the only thing isolating one customer's data from another.
  // This service-role pool already bypasses RLS for the server's own queries —
  // so previous bootstrap code that disabled RLS / dropped every policy on
  // every boot was a regression vector and has been removed.
  try {
    const testRes = await pool.query('SELECT COUNT(*) AS cnt FROM users');
    console.log(`✓ Data access test: users table has ${testRes.rows[0].cnt} row(s)`);
  } catch (err) {
    console.error(`✗ Data access test FAILED on users table: ${err.message}`);
    console.error('  This confirms RLS or permissions are blocking reads.');
  }

  // ── Step 5: SQL migrations from database/migrations/ ─────────────────────
  //
  // **Disabled by default as of 2026-05-11.** The auto-runner is now gated
  // behind `RUN_MIGRATIONS_ON_BOOT=true`; without that flag, server boot
  // never touches `database/migrations/*.sql`. Apply migrations manually
  // via the Supabase SQL Editor.
  //
  // Why this is off by default: an unreviewed .sql file landing on `main`
  // would auto-apply on the next Railway deploy, potentially breaking
  // schema before anyone caught it. Manual apply forces a human checkpoint.
  // The PRs that introduced this disable also retired the legacy
  // `shipping_rates` table; future schema work goes in
  // `database/manual-migrations/` (see that directory's README).
  //
  // When the runner *is* enabled, behaviour is unchanged: it consults the
  // `_migrations` ledger (filename text PRIMARY KEY, applied_at timestamptz)
  // to skip files already recorded. Failures are logged but never block
  // boot. On success the filename is INSERTed into `_migrations`.
  const runMigrationsOnBoot = process.env.RUN_MIGRATIONS_ON_BOOT === 'true';
  if (!isReadOnly && runMigrationsOnBoot) {
    try {
      // Defensive: create the ledger if a fresh install hasn't seen it
      // yet (live carries it from the original 0001 migration; this is
      // for new envs that bypass the bootstrap chain).
      await pool.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          filename   text PRIMARY KEY,
          applied_at timestamptz NOT NULL DEFAULT NOW()
        )
      `);

      const { rows: appliedRows } = await pool.query(
        `SELECT filename FROM _migrations`
      );
      const applied = new Set(appliedRows.map(r => r.filename));

      const migrationsDir = path.join(__dirname, 'migrations');
      if (fs.existsSync(migrationsDir)) {
        const files = fs.readdirSync(migrationsDir)
          .filter(f => f.endsWith('.sql'))
          .sort();

        let applyCount = 0;
        let skipCount = 0;
        for (const file of files) {
          if (applied.has(file)) {
            skipCount++;
            continue;
          }
          const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
          try {
            await pool.query(sql);
            // Ledger insert is best-effort: if a future migration has
            // already INSERTed itself (older bootstrap conventions), the
            // ON CONFLICT keeps boot moving instead of double-applying.
            await pool.query(
              `INSERT INTO _migrations (filename) VALUES ($1)
               ON CONFLICT (filename) DO NOTHING`,
              [file]
            );
            applyCount++;
            console.log(`✓ Framework migration applied: ${file}`);
          } catch (err) {
            console.error(`⚠ Framework migration failed (${file}): ${err.message}`);
          }
        }
        if (applyCount === 0) {
          console.log(`✓ Framework migrations: ${skipCount} already applied, none new`);
        } else {
          console.log(`✓ Framework migrations: ${applyCount} new applied, ${skipCount} skipped`);
        }
      }
    } catch (err) {
      console.error(`⚠ Could not enumerate migrations directory: ${err.message}`);
    }
  } else if (isReadOnly) {
    console.warn('⚠ Skipping Framework v2 migrations — connection is read-only.');
    console.warn('  Apply database/migrations/*.sql manually in Supabase SQL Editor.');
  } else {
    console.log('✓ Migration auto-runner disabled (default). Set RUN_MIGRATIONS_ON_BOOT=true to enable.');
    // ...but say whether anything is waiting. Deploys land automatically
    // on merge and migrations do not, so code can reach production ahead
    // of the column it writes to — which is how #296 took order creation
    // down: every POST /api/wa/orders 500'd on a missing supplier_ref,
    // and the only clue at boot was this line saying the runner was off.
    // A count here turns that into something you can see straight away.
    await warnIfMigrationsPending(pool);
  }

  return pool;
}

/**
 * Say out loud when the database is behind the code.
 *
 * Best-effort and never fatal: a boot that cannot read the ledger is not
 * a boot worth refusing, and the app may legitimately run against a
 * database someone else migrates.
 */
async function warnIfMigrationsPending(db) {
  try {
    const dir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(dir)) return;
    const onDisk = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
    const { rows } = await db.query('SELECT filename FROM _migrations');
    const applied = new Set(rows.map((r) => r.filename));
    const pending = onDisk.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log('✓ Database schema is up to date with database/migrations.');
      return;
    }
    console.warn(`⚠ ${pending.length} migration(s) NOT applied: ${pending.join(', ')}`);
    console.warn('  Code that reads or writes those columns will fail until they are applied.');
    console.warn('  Apply with `npm run migrate`, or set RUN_MIGRATIONS_ON_BOOT=true for one deploy.');
  } catch (err) {
    console.warn(`⚠ Could not check for pending migrations: ${err.message}`);
  }
}

export function getPool() {
  return pool;
}

export default pool;
