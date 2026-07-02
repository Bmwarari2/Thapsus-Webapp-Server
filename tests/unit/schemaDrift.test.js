import { describe, it, expect } from 'vitest';
import { analyze, extractQueries } from '../../scripts/check-schema-drift.mjs';

// check:drift v2 — every check is pinned to a bug the 2026 audits actually
// shipped to production, so this suite is the permanent negative test:
// if a check regresses, the exact outage class it guards reopens silently.

const SCHEMA = {
  tables: {
    // last_mile_runs.id: TEXT NOT NULL, no default — the run-creation outage.
    last_mile_runs: {
      id:      { t: 'text', nn: true,  hd: false },
      zone:    { t: 'text', nn: false, hd: false },
      status:  { t: 'text', nn: false, hd: true },
    },
    orders: {
      id:               { t: 'text', nn: true,  hd: false },
      consolidation_id: { t: 'text', nn: false, hd: false },
      chargeable_kg:    { t: 'real', nn: false, hd: false },
      weight_kg:        { t: 'real', nn: false, hd: false },
      created_at:       { t: 'timestamptz', nn: false, hd: true },
    },
    packages: {
      id:               { t: 'text', nn: true,  hd: false },
      order_id:         { t: 'text', nn: false, hd: false },
      consolidation_id: { t: 'text', nn: false, hd: false },
      weight_kg:        { t: 'real', nn: false, hd: false },
    },
    customer_consolidations: {
      id:      { t: 'uuid', nn: true, hd: true },
      user_id: { t: 'text', nn: true, hd: false },
    },
  },
  types: ['ticket_priority'], // one project-defined type that DOES exist
};

function run(sql) {
  const findings = [];
  analyze(SCHEMA, sql, 'test.js:1', findings);
  return findings;
}

describe('check 1 — existence (v1 behaviour retained)', () => {
  it('flags a missing table', () => {
    expect(run(`SELECT * FROM wallets`).join()).toMatch(/MISSING_TABLE.*wallets/);
  });
  it('flags an INSERT into a missing column', () => {
    expect(run(`INSERT INTO orders (id, hs_tier_v9) VALUES ($1,$2)`).join()).toMatch(/MISSING_COLUMN.*orders\.hs_tier_v9/);
  });
  it('flags an UPDATE SET on a missing column', () => {
    expect(run(`UPDATE orders SET no_such = $1 WHERE id = $2`).join()).toMatch(/MISSING_COLUMN.*orders\.no_such/);
  });
});

describe('check 2 — INSERT omits a NOT NULL, no-default column (last_mile_runs.id outage)', () => {
  it('flags the exact production bug: run INSERT without id', () => {
    const f = run(`INSERT INTO last_mile_runs (zone, status) VALUES ($1,'planned') RETURNING id`);
    expect(f.join()).toMatch(/INSERT_MISSING_REQUIRED.*last_mile_runs\.id/);
  });
  it('passes when the id is supplied', () => {
    expect(run(`INSERT INTO last_mile_runs (id, zone) VALUES ($1,$2)`)).toEqual([]);
  });
  it('does not fire for NOT NULL columns WITH a default', () => {
    // orders.created_at is NOT NULL+default in real life; here status has hd.
    expect(run(`INSERT INTO last_mile_runs (id, zone) VALUES ($1,$2)`).join()).not.toMatch(/status/);
  });
});

describe('check 3 — casts to types that do not exist (::customs_status outage)', () => {
  it('flags a cast to a nonexistent enum', () => {
    const f = run(`UPDATE orders SET consolidation_id = NULL WHERE id = $1::text AND $2::customs_status IS NOT NULL`);
    expect(f.join()).toMatch(/MISSING_TYPE.*customs_status/);
  });
  it('accepts builtins and project-defined types', () => {
    expect(run(`SELECT id::text, $1::uuid, $2::ticket_priority, $3::float, $4::text[] FROM orders`)).toEqual([]);
  });
});

describe('check 4 — text = uuid comparison casts (manifest / remove-parcel outage)', () => {
  it('flags the exact production bug: WHERE text column = $n::uuid', () => {
    const f = run(`SELECT id FROM orders o WHERE o.consolidation_id = $1::uuid`);
    expect(f.join()).toMatch(/CAST_TYPE_MISMATCH.*consolidation_id/);
  });
  it('flags ANY($n::uuid[]) against a text column', () => {
    const f = run(`SELECT id FROM packages WHERE consolidation_id = ANY($1::uuid[])`);
    expect(f.join()).toMatch(/CAST_TYPE_MISMATCH/);
  });
  it('accepts $n::uuid against a genuinely-uuid column', () => {
    expect(run(`SELECT id FROM customer_consolidations WHERE id = $1::uuid`)).toEqual([]);
  });
  it('accepts assignment-position casts (UPDATE SET col = $n::uuid is legal)', () => {
    expect(run(`UPDATE packages SET consolidation_id = $1::uuid WHERE id = $2`)).toEqual([]);
  });
});

describe('check 5 — column references (refreshTotals / by-barcode outages)', () => {
  it('flags alias.column that the aliased table lacks (by-barcode bug)', () => {
    const f = run(`SELECT p.chargeable_kg FROM packages p`);
    expect(f.join()).toMatch(/MISSING_COLUMN_REF.*p\.chargeable_kg/);
  });
  it('flags a bare identifier that is a column of no referenced table (refreshTotals bug)', () => {
    const f = run(`UPDATE packages SET weight_kg = (SELECT SUM(COALESCE(chargeable_kg, weight_kg, 0)) FROM packages WHERE consolidation_id = $1)`);
    expect(f.join()).toMatch(/MISSING_COLUMN_REF.*"chargeable_kg"/);
  });
  it('accepts the corrected join form', () => {
    const f = run(`UPDATE packages px SET weight_kg = (SELECT SUM(COALESCE(o.chargeable_kg, p.weight_kg, 0)) FROM packages p LEFT JOIN orders o ON o.id = p.order_id WHERE p.consolidation_id = $1)`);
    expect(f).toEqual([]);
  });
});

describe('false-positive guards', () => {
  it('CTE names, CTE-source aliases, and output aliases are not columns', () => {
    const f = run(`WITH bfm AS (SELECT id AS month FROM orders), inv AS (SELECT id AS month FROM packages)
      SELECT COALESCE(b.month, i.month) AS month FROM bfm b FULL JOIN inv i ON i.month = b.month`);
    expect(f).toEqual([]);
  });
  it('string literals never scan as identifiers or casts', () => {
    expect(run(`SELECT id FROM orders WHERE consolidation_id = 'not_a_column ::fake_type totally_fake'`)).toEqual([]);
  });
  it('function calls, EXTRACT fields, and intervals are not columns', () => {
    const f = run(`SELECT COUNT(*), EXTRACT(epoch FROM created_at), NOW() - INTERVAL '7 days' FROM orders GROUP BY 1 ORDER BY 1 DESC NULLS LAST LIMIT 10`);
    expect(f).toEqual([]);
  });
  it('dynamic ${} clauses are skipped, not guessed at', () => {
    const src = 'db.query(`UPDATE orders SET ${sets.join(", ")} WHERE id = $1`)';
    const qs = extractQueries(src);
    expect(qs).toHaveLength(1);
    expect(run(qs[0].sql)).toEqual([]);
  });
});
