#!/usr/bin/env node
// scripts/check-schema-drift.mjs — CI guard against code/DB schema drift. v2.
//
// v1 verified that tables and INSERT/UPDATE-written columns exist — the check
// that would have caught the orders.hs_tier / tickets.idempotency_key /
// request_idempotency outages. The 2026-07 functionality audit then found five
// outage groups that sailed straight past an existence-only check, so v2 also
// verifies, for every static SQL string passed to `.query(...)`/`.exec(...)`:
//
//   1. MISSING_TABLE / MISSING_COLUMN — as before (tables referenced in
//      FROM/JOIN/INTO/UPDATE/DELETE; columns written by INSERT lists and
//      UPDATE ... SET).
//   2. INSERT_MISSING_REQUIRED — an INSERT's column list omits a NOT NULL
//      column that has no default (caught: last_mile_runs.id, pod_events.id).
//   3. MISSING_TYPE — a `::typename` cast names a type that does not exist
//      (caught: ::customs_status, ::invoice_status, ::run_status — the
//      columns are TEXT on live; those enum types were never created).
//   4. CAST_TYPE_MISMATCH — a `col = $n::uuid` / `col = ANY($n::uuid[])`
//      comparison against a TEXT column ("operator does not exist:
//      text = uuid"; caught: manifest, remove-parcel, attach-to-shipping).
//      Assignment positions (UPDATE ... SET col = $n::uuid) are legal via
//      assignment casts and are excluded.
//   5. MISSING_COLUMN_REF — `alias.column` (resolved through the statement's
//      FROM/JOIN alias map) or a bare identifier in expression position that
//      is not a column of any table the statement references (caught:
//      refreshTotals reading chargeable_kg off packages when it lives on
//      orders).
//
// Extraction is deliberately scoped to query call-sites (not arbitrary string
// literals). Dynamic pieces (`${...}` interpolations) are replaced with a
// placeholder and the containing clause is skipped rather than guessed at.
// Exit code is 1 when any drift is found — wired into CI (test.yml).
//
// Schema source (first match wins):
//   --snapshot[=path]        read database/schema-snapshot.json (or path) —
//                            no DB needed; refresh via --write-snapshot
//   DATABASE_URL             read the live/local database
//
//   node scripts/check-schema-drift.mjs
//   node scripts/check-schema-drift.mjs --snapshot
//   node scripts/check-schema-drift.mjs --write-snapshot   # refresh snapshot
//
// The snapshot must be regenerated whenever a migration changes the schema:
//   npm run schema:snapshot   (requires DATABASE_URL at a migrated DB)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
export const DEFAULT_SNAPSHOT = path.join(ROOT, 'database', 'schema-snapshot.json');

const IGNORE_PREFIX = ['information_schema.', 'pg_', 'storage.', 'auth.', 'realtime.', 'cron.', 'net.', 'vault.', 'extensions.'];
const SQL_FUNCS = new Set(['unnest', 'jsonb_array_elements', 'jsonb_array_elements_text', 'json_array_elements',
  'generate_series', 'json_to_recordset', 'jsonb_to_recordset', 'regexp_split_to_table', 'string_to_array',
  'json_each', 'jsonb_each', 'excluded', 'lateral', 'dual']);
// SQL keywords that can appear in the table position of our regexes but are not
// tables — notably `DO UPDATE SET` (upsert) leaves `set` after `UPDATE`.
const STOPWORDS = new Set(['set', 'where', 'values', 'select', 'from', 'join', 'into', 'returning',
  'using', 'on', 'and', 'or', 'as', 'null', 'default', 'true', 'false', '_expr_']);

// Types that exist on any Postgres without project DDL. `::type[]` array casts
// are reduced to their element type before the lookup.
const BUILTIN_TYPES = new Set(['text', 'varchar', 'char', 'character', 'name', 'citext',
  'int', 'int2', 'int4', 'int8', 'integer', 'smallint', 'bigint', 'serial', 'bigserial',
  'numeric', 'decimal', 'real', 'float', 'float4', 'float8', 'double', 'money',
  'boolean', 'bool', 'uuid', 'json', 'jsonb', 'xml', 'bytea',
  'date', 'time', 'timetz', 'timestamp', 'timestamptz', 'interval',
  'inet', 'cidr', 'macaddr', 'tsvector', 'tsquery', 'point', 'oid',
  'regclass', 'regnamespace', 'regproc', 'regtype', 'record', 'void']);

// Keywords/identifiers that legitimately appear bare in expression position.
// Anything here is never reported as a missing column by check 5.
const EXPR_KEYWORDS = new Set([...STOPWORDS,
  'insert', 'update', 'delete', 'conflict', 'do', 'nothing', 'all', 'any', 'some', 'exists', 'not',
  'in', 'is', 'like', 'ilike', 'similar', 'between', 'case', 'when', 'then', 'else', 'end',
  'distinct', 'group', 'by', 'order', 'asc', 'desc', 'nulls', 'first', 'last', 'limit', 'offset',
  'for', 'share', 'nowait', 'skip', 'locked', 'union', 'intersect', 'except', 'with', 'recursive',
  'left', 'right', 'inner', 'outer', 'full', 'cross', 'having', 'over', 'partition', 'window',
  'filter', 'within', 'rows', 'range', 'unbounded', 'preceding', 'following', 'current', 'row',
  'cast', 'collate', 'escape', 'array', 'interval', 'epoch', 'year', 'month', 'day', 'hour',
  'minute', 'second', 'dow', 'doy', 'week', 'quarter', 'century', 'millennium', 'timezone',
  'current_date', 'current_timestamp', 'current_time', 'localtime', 'localtimestamp',
  'session_user', 'current_user', 'user', 'symmetric', 'to', 'at', 'zone', 'only',
  'begin', 'commit', 'rollback', 'if', 'then', 'elsif', 'declare', 'raise', 'notice',
  'primary', 'key', 'unique', 'check', 'references', 'constraint', 'index', 'concurrently',
  'add', 'drop', 'alter', 'column', 'table', 'exclude', 'inherits', 'temp', 'temporary']);

function die(m) { console.error(`✗ ${m}`); process.exit(2); }

// ── Schema loading ──────────────────────────────────────────────────────────
// Shape: { tables: { name: { col: { t: 'text', nn: true, hd: false } } },
//          types:  ['customs_status', ...] }   (project-defined types only)

export async function loadSchemaFromDb(url) {
  const { default: pg } = await import('pg');
  const isLocal = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) || /sslmode=disable/.test(url);
  const pool = new pg.Pool({ connectionString: url, ssl: isLocal ? false : { rejectUnauthorized: false }, max: 2 });
  try {
    const { rows: cols } = await pool.query(`
      SELECT c.relname AS tbl, a.attname AS col,
             format_type(a.atttypid, a.atttypmod) AS typ,
             a.attnotnull AS nn,
             (a.atthasdef OR a.attidentity <> '') AS hd
        FROM pg_attribute a
        JOIN pg_class c ON c.oid = a.attrelid
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind = 'r'
         AND a.attnum > 0 AND NOT a.attisdropped`);
    const { rows: types } = await pool.query(`
      SELECT t.typname FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typtype IN ('e','d','c')
         AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.oid = t.typrelid AND c.relkind = 'r')`);
    const tables = {};
    for (const r of cols) {
      (tables[r.tbl] ||= {})[r.col] = { t: normType(r.typ), nn: r.nn, hd: r.hd };
    }
    return { tables, types: types.map((r) => r.typname) };
  } finally { await pool.end(); }
}

// Reduce format_type output to a comparable base name ('character varying(50)'
// → 'varchar', 'timestamp with time zone' → 'timestamptz', 'numeric(12,2)' →
// 'numeric').
function normType(t) {
  t = t.toLowerCase().replace(/\(.*\)/, '').trim();
  const map = {
    'character varying': 'varchar', 'character': 'char',
    'timestamp with time zone': 'timestamptz', 'timestamp without time zone': 'timestamp',
    'time with time zone': 'timetz', 'time without time zone': 'time',
    'double precision': 'float8',
  };
  return map[t] || t;
}

export function loadSchemaFromSnapshot(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// ── Query extraction ────────────────────────────────────────────────────────

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
export function extractQueries(src) {
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

// Replace single-quoted string literals with a placeholder so their contents
// never look like identifiers/casts. Handles '' escapes.
function stripStrings(sql) {
  return sql.replace(/'(?:[^']|'')*'/g, " 'S' ");
}

// UPDATE ... SET <span> [WHERE|RETURNING|FROM ...] — returns [start,end)
// index ranges of every SET assignment span, so comparison-cast checks can
// skip assignment positions (assignment casts uuid→text are legal).
function setSpans(sql) {
  const spans = [];
  for (const m of sql.matchAll(/\bset\s+/gi)) {
    const start = m.index + m[0].length;
    let i = start, depth = 0, end = sql.length;
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') { if (depth === 0) { end = i; break; } depth--; }
      else if (depth === 0) {
        if (/^\s+(where|returning|from)\b/i.test(sql.slice(i)) || ch === ';') { end = i; break; }
      }
    }
    spans.push([start, end]);
  }
  return spans;
}

// FROM/JOIN/UPDATE/INTO alias map: { alias: table }. A table used without an
// alias maps to itself.
function aliasMap(sql, tableNames) {
  const map = {};
  const re = /\b(?:from|join|update|into|delete\s+from)\s+("?[a-z_][a-z0-9_."]*"?)(?:\s+(?:as\s+)?([a-z_][a-z0-9_]*))?/gi;
  for (const m of sql.matchAll(re)) {
    const t = norm(m[1]);
    if (!tableNames.has(t)) continue;
    map[t] = t;
    const alias = m[2]?.toLowerCase();
    if (alias && !EXPR_KEYWORDS.has(alias) && !STOPWORDS.has(alias)) map[alias] = t;
  }
  return map;
}

// ── Analysis ────────────────────────────────────────────────────────────────

export function analyze(schema, sqlRaw, ctx, findings) {
  const { tables, types } = schema;
  const tableNames = new Set(Object.keys(tables));
  const customTypes = new Set(types || []);
  const sql = stripStrings(sqlRaw);
  const hasCol = (t, c) => Object.prototype.hasOwnProperty.call(tables[t] || {}, c);

  // EXTRACT(epoch FROM x) / substring(x FROM n) / trim(... FROM x) use FROM
  // as a function-argument separator, not a table clause — neutralise it so
  // the table-existence regex never sees it.
  const sqlSafe = sql
    .replace(/\b(extract\s*\(\s*[a-z_]+)\s+from\b/gi, '$1 ,')
    .replace(/\b((?:substring|trim|overlay)\s*\([^()]*?)\bfrom\b/gi, '$1 ,');

  const cte = new Set();
  for (const m of sql.matchAll(/(?:with|,)\s+([a-z_][a-z0-9_]*)\s+as\s*\(/gi)) cte.add(m[1].toLowerCase());
  for (const m of sql.matchAll(/\)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\b/gi)) cte.add(m[1].toLowerCase());

  // 1a. tables exist
  for (const m of sqlSafe.matchAll(/\b(from|join|into|update|delete\s+from)\s+("?[a-z_][a-z0-9_."]*"?)/gi)) {
    const t = norm(m[2]);
    if (ignored(t) || cte.has(t) || STOPWORDS.has(t)) continue;
    // norm() strips a leading `public.`; any dot left is an alias.column ref
    // (e.g. EXTRACT(epoch FROM u.password_changed_at)), not a table.
    if (t.includes('.')) continue;
    if (!tableNames.has(t)) findings.push(`${ctx}  MISSING_TABLE  ${m[1].toUpperCase()} "${t}"`);
  }

  // 1b + 2. INSERT column lists: written columns exist AND every NOT NULL
  // no-default column is present.
  for (const m of sql.matchAll(/insert\s+into\s+("?[a-z_][a-z0-9_."]*"?)\s*\(([^)]*)\)/gis)) {
    const t = norm(m[1]);
    if (!tables[t]) continue;
    if (/\bselect\b|=|_expr_/i.test(m[2])) continue;
    const listed = new Set();
    for (let c of m[2].split(',')) {
      c = norm(c.trim());
      if (!/^[a-z_][a-z0-9_]*$/.test(c)) continue;
      listed.add(c);
      if (!hasCol(t, c)) findings.push(`${ctx}  MISSING_COLUMN  INSERT ${t}.${c}`);
    }
    for (const [col, meta] of Object.entries(tables[t])) {
      if (meta.nn && !meta.hd && !listed.has(col)) {
        findings.push(`${ctx}  INSERT_MISSING_REQUIRED  ${t}.${col} is NOT NULL with no default but absent from INSERT column list`);
      }
    }
  }

  // 1c. UPDATE ... SET columns exist
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
        if (/^\s+(where|returning|from)\b/i.test(sql.slice(i)) || ch === ';') { end = i; break; }
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
      if (/^[a-z_][a-z0-9_]*$/.test(lhs) && !hasCol(t, lhs)) findings.push(`${ctx}  MISSING_COLUMN  UPDATE ${t}.${lhs}`);
    }
  }

  // 3. every ::type cast names a real type
  for (const m of sql.matchAll(/::\s*"?([a-z_][a-z0-9_]*)"?(\[\])?/g)) {
    const ty = m[1].toLowerCase();
    if (BUILTIN_TYPES.has(ty) || customTypes.has(ty)) continue;
    findings.push(`${ctx}  MISSING_TYPE  cast ::${ty} — type does not exist`);
  }

  const aliases = aliasMap(sql, tableNames);
  const stmtTables = new Set(Object.values(aliases));
  const spans = setSpans(sql);
  const inSetSpan = (idx) => spans.some(([s, e]) => idx >= s && idx < e);

  // 4. comparison casts against incompatible column types (uuid vs text has
  // no equality operator; assignment positions are excluded).
  const resolveColType = (ref) => {
    ref = ref.toLowerCase();
    if (ref.includes('.')) {
      const [a, c] = ref.split('.');
      const t = aliases[a];
      return t && hasCol(t, c) ? [tables[t][c].t] : null;
    }
    const found = [];
    for (const t of stmtTables) if (hasCol(t, ref)) found.push(tables[t][ref].t);
    return found.length ? found : null;
  };
  const cmpRe = /([a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?)\s*(?:=|<>|!=)\s*(?:any\s*\(\s*)?\$\d+::([a-z_][a-z0-9_]*)(\[\])?/gi;
  for (const m of sql.matchAll(cmpRe)) {
    if (inSetSpan(m.index)) continue;
    const castTy = m[2].toLowerCase();
    const colTypes = resolveColType(m[1]);
    if (!colTypes) continue;
    const incompatible = (col, cast) =>
      (col === 'text' || col === 'varchar' || col === 'char') !== (cast === 'text' || cast === 'varchar' || cast === 'char')
      && (col === 'uuid' || cast === 'uuid');
    if (colTypes.every((ct) => incompatible(ct, castTy))) {
      findings.push(`${ctx}  CAST_TYPE_MISMATCH  ${m[1]} (${colTypes[0]}) compared to $n::${castTy}${m[3] || ''} — no ${colTypes[0]} = ${castTy} operator`);
    }
  }

  // 5a. alias-qualified column refs resolve
  for (const m of sql.matchAll(/\b([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)\b/g)) {
    const a = m[1].toLowerCase(), c = m[2].toLowerCase();
    const t = aliases[a];
    if (!t || SQL_FUNCS.has(a)) continue;
    if (sql[m.index + m[0].length] === '(') continue; // schema-qualified function call
    if (!hasCol(t, c) && c !== '*') findings.push(`${ctx}  MISSING_COLUMN_REF  ${a}.${c} — "${t}" has no column "${c}"`);
  }

  // 5b. bare identifiers in expression position must be a column of SOME
  // table the statement references. Lenient by design (union of all tables
  // in the statement) — zero-false-positive beats exhaustive.
  if (stmtTables.size > 0 && !/\b(create|alter|drop|grant|revoke)\b/i.test(sql)) {
    // local names that are not columns: table aliases, CTEs, output aliases,
    // and aliases over non-table sources (CTEs, subqueries) — e.g.
    // `FROM bfm b FULL JOIN inv i USING (month)`.
    const localNames = new Set([...Object.keys(aliases), ...cte]);
    for (const m of sql.matchAll(/\bas\s+([a-z_][a-z0-9_]*)/gi)) localNames.add(m[1].toLowerCase());
    for (const m of sql.matchAll(/\b(?:from|join)\s+([a-z_][a-z0-9_]*)\s+(?:as\s+)?([a-z_][a-z0-9_]*)\b/gi)) {
      if (!EXPR_KEYWORDS.has(m[2].toLowerCase())) localNames.add(m[2].toLowerCase());
    }
    const colUnion = new Set();
    for (const t of stmtTables) for (const c of Object.keys(tables[t])) colUnion.add(c);
    // strip ::casts and qualified refs so their parts don't scan as bare idents
    const scan = sql.replace(/::\s*"?[a-z_][a-z0-9_]*"?(\[\])?/g, ' ')
                    .replace(/\b[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*\b/g, ' _Q_ ');
    const idRe = /\b([a-z_][a-z0-9_]*)\b\s*(\()?/g;
    for (const m of scan.matchAll(idRe)) {
      const id = m[1].toLowerCase();
      if (m[2]) continue;                          // function call
      if (EXPR_KEYWORDS.has(id) || SQL_FUNCS.has(id)) continue;
      if (id === '_q_' || id === '_expr_' || id === 's') continue;
      if (localNames.has(id) || tableNames.has(id) || ignored(id)) continue;
      if (colUnion.has(id)) continue;
      findings.push(`${ctx}  MISSING_COLUMN_REF  bare "${id}" is not a column of any referenced table (${[...stmtTables].join(', ')})`);
    }
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

/**
 * Key-sorted deep copy. Arrays keep their order — only object keys are
 * normalised, so the committed snapshot is byte-stable across machines
 * and re-runs.
 */
function sortDeep(value) {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortDeep(value[k])]));
  }
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  const snapArg = args.find((a) => a.startsWith('--snapshot'));
  const writeSnap = args.includes('--write-snapshot');

  let schema;
  if (snapArg && !writeSnap) {
    const file = snapArg.includes('=') ? snapArg.split('=')[1] : DEFAULT_SNAPSHOT;
    schema = loadSchemaFromSnapshot(file);
    console.log(`ℹ schema from snapshot ${path.relative(ROOT, file)}`);
  } else {
    const url = process.env.DATABASE_URL;
    if (!url) die('DATABASE_URL is not set (or pass --snapshot to use the committed snapshot)');
    const { default: dotenv } = await import('dotenv').catch(() => ({ default: null }));
    dotenv?.config?.();
    schema = await loadSchemaFromDb(url);
  }

  if (writeSnap) {
    // Sorted, so the diff shows the schema change and nothing else. The
    // database hands tables and columns back in whatever order it likes,
    // which made a one-column migration land as a 1,300-line diff that
    // no one could review.
    fs.writeFileSync(DEFAULT_SNAPSHOT, JSON.stringify(sortDeep(schema), null, 1) + '\n');
    console.log(`✓ wrote ${path.relative(ROOT, DEFAULT_SNAPSHOT)} — ${Object.keys(schema.tables).length} tables, ${schema.types.length} custom types`);
    return;
  }

  const files = [...walk(path.join(ROOT, 'routes')), ...walk(path.join(ROOT, 'utils')),
    ...walk(path.join(ROOT, 'middleware')), path.join(ROOT, 'server.js')];
  const findings = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = f.replace(ROOT + '/', '');
    for (const { sql, line } of extractQueries(src)) analyze(schema, sql, `${rel}:${line}`, findings);
  }
  const uniq = [...new Set(findings)].sort();
  if (uniq.length === 0) {
    console.log(`✓ no schema drift — code SQL matches ${Object.keys(schema.tables).length} tables (v2: existence + required-insert columns + type casts + comparison casts + column refs).`);
    return;
  }
  console.error(`✗ ${uniq.length} schema-drift finding(s):`);
  for (const f of uniq) console.error(`   ${f}`);
  process.exitCode = 1;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) main().catch((e) => die(e.message));
