#!/usr/bin/env node
// scripts/check-schema-drift.mjs — CI guard against code/DB schema drift.
//
// This is the check that would have caught the order-creation and
// ticket-creation outages: the code INSERT/UPDATE'd columns and tables
// (orders.hs_tier, tickets.idempotency_key, request_idempotency) that had
// never been created on the live database, so every write 500'd.
//
// It connects to DATABASE_URL, reads the ACTUAL columns of every public table,
// then statically extracts the SQL passed to every `.query(...)` / `.exec(...)`
// call under routes/, utils/, middleware/ and server.js and verifies that:
//   • every table referenced in FROM / JOIN / INTO / UPDATE / DELETE exists, and
//   • every column an INSERT column-list or UPDATE ... SET writes to exists.
//
// Extraction is deliberately scoped to query call-sites (not arbitrary string
// literals) so prose/error-message strings never produce false positives.
// Dynamic pieces (`${...}` interpolations, string-built SQL) are skipped rather
// than guessed at. Exit code is 1 when any drift is found — wire it into CI:
//
//   node scripts/check-schema-drift.mjs
//
// Requires DATABASE_URL to point at the schema you deploy against.

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const IGNORE_PREFIX = ['information_schema.', 'pg_', 'storage.', 'auth.', 'realtime.', 'cron.', 'net.', 'vault.', 'extensions.'];
const SQL_FUNCS = new Set(['unnest', 'jsonb_array_elements', 'jsonb_array_elements_text', 'json_array_elements',
  'generate_series', 'json_to_recordset', 'jsonb_to_recordset', 'regexp_split_to_table', 'string_to_array',
  'json_each', 'jsonb_each', 'excluded', 'lateral', 'dual']);
// SQL keywords that can appear in the table position of our regexes but are not
// tables — notably `DO UPDATE SET` (upsert) leaves `set` after `UPDATE`.
const STOPWORDS = new Set(['set', 'where', 'values', 'select', 'from', 'join', 'into', 'returning',
  'using', 'on', 'and', 'or', 'as', 'null', 'default', 'true', 'false', '_expr_']);

function die(m) { console.error(`✗ ${m}`); process.exit(2); }

async function loadSchema() {
  const url = process.env.DATABASE_URL;
  if (!url) die('DATABASE_URL is not set');
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 2 });
  try {
    const { rows } = await pool.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public'`
    );
    const tables = {};
    for (const r of rows) (tables[r.table_name] ||= new Set()).add(r.column_name);
    return tables;
  } finally { await pool.end(); }
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '_legacy', '.git'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.js') || e.name.endsWith('.mjs')) acc.push(p);
  }
  return acc;
}

// Extract the string literal argument of each .query(/.exec( call.
function extractQueries(src) {
  const out = [];
  const callRe = /\.(?:query|exec)\s*\(\s*(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")/gs;
  for (const m of src.matchAll(callRe)) {
    let s = m[1].slice(1, -1);
    if (!/\b(select|insert\s+into|update|delete\s+from|with)\b/i.test(s)) continue;
    s = s.replace(/\$\{[^}]*\}/g, ' _EXPR_ ')      // interpolations
         .replace(/--[^\n]*/g, ' ')                 // line comments
         .replace(/\/\*[\s\S]*?\*\//g, ' ');        // block comments
    out.push({ sql: s, line: src.slice(0, m.index).split('\n').length });
  }
  return out;
}

const norm = (t) => t.replace(/^public\./i, '').replace(/["`]/g, '').toLowerCase();
const ignored = (t) => IGNORE_PREFIX.some((p) => t.startsWith(p)) || SQL_FUNCS.has(t);

function analyze(tables, sql, ctx, findings) {
  const tableNames = new Set(Object.keys(tables));
  const cte = new Set();
  for (const m of sql.matchAll(/(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/gi)) cte.add(m[1].toLowerCase());
  for (const m of sql.matchAll(/\)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\b/gi)) cte.add(m[1].toLowerCase());

  for (const m of sql.matchAll(/\b(from|join|into|update|delete\s+from)\s+("?[a-z_][a-z0-9_."]*"?)/gi)) {
    const t = norm(m[2]);
    if (ignored(t) || cte.has(t) || STOPWORDS.has(t)) continue;
    // norm() strips a leading `public.`; any dot left is an alias.column ref
    // (e.g. EXTRACT(epoch FROM u.password_changed_at)), not a table.
    if (t.includes('.')) continue;
    if (!tableNames.has(t)) findings.push(`${ctx}  MISSING_TABLE  ${m[1].toUpperCase()} "${t}"`);
  }
  for (const m of sql.matchAll(/insert\s+into\s+("?[a-z_][a-z0-9_."]*"?)\s*\(([^)]*)\)/gis)) {
    const t = norm(m[1]);
    if (!tables[t]) continue;
    if (/\bselect\b|=|_expr_/i.test(m[2])) continue;
    for (let c of m[2].split(',')) {
      c = norm(c.trim());
      if (/^[a-z_][a-z0-9_]*$/.test(c) && !tables[t].has(c)) findings.push(`${ctx}  MISSING_COLUMN  INSERT ${t}.${c}`);
    }
  }
  for (const m of sql.matchAll(/update\s+("?[a-z_][a-z0-9_."]*"?)\s+set\s+/gis)) {
    const t = norm(m[1]);
    if (!tables[t]) continue;
    const start = m.index + m[0].length;
    let i = start, depth = 0, end = sql.length;
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) { end = i; break; } depth--; }
      else if (depth === 0) {
        const rest = sql.slice(i);
        if (/^\s+(where|returning|from)\b/i.test(rest) || ch === ';') { end = i; break; }
      }
    }
    let d = 0, cur = '', segs = [];
    for (const ch of sql.slice(start, end)) {
      if (ch === '(') { d++; cur += ch; } else if (ch === ')') { d--; cur += ch; }
      else if (ch === ',' && d === 0) { segs.push(cur); cur = ''; } else cur += ch;
    }
    if (cur.trim()) segs.push(cur);
    for (const seg of segs) {
      const eq = seg.indexOf('=');
      if (eq === -1) continue;
      const lhs = norm(seg.slice(0, eq).trim());
      if (/^[a-z_][a-z0-9_]*$/.test(lhs) && !tables[t].has(lhs)) findings.push(`${ctx}  MISSING_COLUMN  UPDATE ${t}.${lhs}`);
    }
  }
}

async function main() {
  const tables = await loadSchema();
  const files = [...walk(path.join(ROOT, 'routes')), ...walk(path.join(ROOT, 'utils')),
    ...walk(path.join(ROOT, 'middleware')), path.join(ROOT, 'server.js')];
  const findings = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.replace(ROOT + '/', '');
    for (const { sql, line } of extractQueries(src)) analyze(tables, sql, `${rel}:${line}`, findings);
  }
  const uniq = [...new Set(findings)].sort();
  if (uniq.length === 0) {
    console.log(`✓ no schema drift — code SQL matches ${Object.keys(tables).length} live tables.`);
    return;
  }
  console.error(`✗ ${uniq.length} schema-drift finding(s):`);
  for (const f of uniq) console.error(`   ${f}`);
  process.exitCode = 1;
}

main().catch((e) => die(e.message));
