#!/usr/bin/env node
// scripts/migrate.mjs — reliable, ledger-backed migration runner.
//
// Why this exists
// ───────────────
// Migrations under database/migrations/ were historically applied by hand in
// the Supabase SQL editor, and the app's boot-time auto-runner is disabled by
// default (RUN_MIGRATIONS_ON_BOOT). The result was silent drift: several
// migrations (055, 056, and the orders.hs_tier DDL) never reached the live
// database, so the code referenced columns/tables that did not exist and
// order/ticket creation 500'd. The `_migrations` ledger was also unreliable —
// it recorded some manual applies and missed others.
//
// This script makes applying migrations deterministic and CI-checkable:
//
//   node scripts/migrate.mjs            apply every pending migration, in order,
//                                       each in its own transaction, fail-fast.
//   node scripts/migrate.mjs --check    exit 1 if any migration is unapplied
//                                       (no writes) — wire this into CI so a
//                                       PR that adds a .sql without it being
//                                       applied to the target DB fails loudly.
//   node scripts/migrate.mjs --reconcile  record every migration file as applied
//                                         WITHOUT running it — one-time use when
//                                         adopting an already-provisioned DB
//                                         whose ledger is behind reality.
//   node scripts/migrate.mjs --continue-on-error   don't stop on the first
//                                       failure (used for local vanilla-Postgres
//                                       runs where Supabase-only migrations —
//                                       storage/auth/realtime — are expected to
//                                       fail; NOT for production).
//
// The ledger table (`_migrations`, filename PRIMARY KEY) matches the one the
// app bootstrap already uses, so the two stay compatible.

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'database', 'migrations');

const args = new Set(process.argv.slice(2));
const MODE = args.has('--check') ? 'check'
  : args.has('--reconcile') ? 'reconcile'
  : 'apply';
const CONTINUE_ON_ERROR = args.has('--continue-on-error');

function log(...a) { console.log(...a); }
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }

const url = process.env.DATABASE_URL;
if (!url) die('DATABASE_URL is not set');

// Supabase requires SSL; a local/plain Postgres does not. Enable SSL unless the
// URL points at localhost or explicitly disables it.
const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
const pool = new pg.Pool({
  connectionString: url,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 3,
});

function migrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) die(`migrations dir not found: ${MIGRATIONS_DIR}`);
  return fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function ensureLedger(db) {
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (
    filename   text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT NOW()
  )`);
}

async function appliedSet(db) {
  const { rows } = await db.query('SELECT filename FROM _migrations');
  return new Set(rows.map((r) => r.filename));
}

async function main() {
  const files = migrationFiles();
  const db = await pool.connect();
  try {
    await ensureLedger(db);
    const applied = await appliedSet(db);
    const pending = files.filter((f) => !applied.has(f));

    if (MODE === 'check') {
      if (pending.length === 0) { log(`✓ schema up to date — ${files.length} migrations applied.`); return; }
      log(`✗ ${pending.length} pending migration(s):`);
      for (const f of pending) log(`   • ${f}`);
      process.exitCode = 1;
      return;
    }

    if (MODE === 'reconcile') {
      for (const f of pending) {
        await db.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
        log(`≡ marked applied (not run): ${f}`);
      }
      log(`✓ reconciled — ${pending.length} filename(s) recorded.`);
      return;
    }

    // apply
    if (pending.length === 0) { log(`✓ nothing to apply — ${files.length} migrations already applied.`); return; }
    let ok = 0, failed = 0;
    for (const f of pending) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      try {
        await db.query('BEGIN');
        await db.query(sql);
        await db.query('INSERT INTO _migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING', [f]);
        await db.query('COMMIT');
        ok++; log(`✓ applied ${f}`);
      } catch (e) {
        await db.query('ROLLBACK').catch(() => {});
        failed++;
        console.error(`✗ FAILED ${f}: ${e.message}`);
        if (!CONTINUE_ON_ERROR) die(`stopped on first failure (${f}). Fix it or re-run with --continue-on-error.`);
      }
    }
    log(`\n${ok} applied, ${failed} failed, ${files.length - pending.length} previously applied.`);
    if (failed && !CONTINUE_ON_ERROR) process.exitCode = 1;
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => die(e.message));
