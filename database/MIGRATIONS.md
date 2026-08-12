# Database migrations & schema-drift guardrails

This project's live schema drifted away from the code several times because
migrations were applied by hand in the Supabase SQL editor and the boot-time
auto-runner is disabled by default. The result: the code referenced columns and
tables that did not exist on the live database, and order/ticket creation 500'd
in production. The tooling below makes applying migrations deterministic and
makes drift a CI failure instead of a production outage.

## The consolidated baseline (2026-07)

`database/migrations/` now starts from a **single consolidated baseline**:

- **`0000_baseline.sql`** — the complete schema (tables, constraints, indexes,
  functions, triggers, RLS flags, policies, grants), dumped from the LIVE
  Supabase project after per-object fingerprint reconciliation. A fresh
  database built from it is fingerprint-identical to live across every
  category, including column order.
- **`0000a_baseline_reference_data.sql`** — the reference/config rows the app
  reads at request time (pricing settings, customs tiers, HS-code map,
  electronics fees, fee catalogue, rate cards, FX rates, prohibited items,
  retailers, finance chart of accounts), captured verbatim from live.
  Idempotent (`ON CONFLICT DO NOTHING`).

The 59 historical pre-baseline migrations were removed from the tree (they were
never applied by the runner); they remain available in git history under
`database/migrations/_archive/` if forensic reference is needed. **New migrations
start at `0001_*.sql`** and layer on top of the baseline. Applied so far:
`0001` (drop plaintext token columns), `0002` (influencer referral programme),
`0003` (influencer partner logins + link-open analytics with coarse
geolocation). Both `0002` and `0003` have been applied to the live Supabase
project and recorded in the `_migrations` ledger.

The live `_migrations` ledger has both baseline filenames recorded, so
`migrate:check` is green against live; the archived filenames remaining in
the ledger are harmless (the runner only looks at files that exist).

### Regenerating the baseline

If the baseline ever needs to be re-cut (e.g. after a long run of new
migrations), repeat the process from the 2026-07 audit: fingerprint live and
a rebuilt DB per object category (columns/constraints/indexes/functions/
triggers/policies/RLS), reconcile until the diff is zero, `pg_dump
--schema-only --schema=public --no-owner`, drop pg_dump's session-scoped
`set_config('search_path','')` line, make the `_migrations` CREATE collision-
proof (the runner pre-creates it), and re-verify a clean-room rebuild passes
the full test suite.

## Tooling

| Command | What it does |
| --- | --- |
| `npm run migrate` | Apply every pending migration (files under `database/migrations/*.sql` not yet in the `_migrations` ledger), in filename order, each in its own transaction, **fail-fast**. |
| `npm run migrate:check` | Exit non-zero if any migration is unapplied. **Wire this into CI** so a PR that adds a `.sql` without applying it to the target DB fails loudly. No writes. |
| `npm run migrate:reconcile` | Record every migration filename as applied **without running it** — one-time use when adopting an already-provisioned DB whose ledger is behind reality. |
| `npm run check:drift` | **v2.** Statically verify every `.query()`/`.exec()` SQL string against the real schema (from `DATABASE_URL`): tables/columns exist, INSERTs don't omit NOT-NULL-no-default columns, `::type` casts name real types, `col = $n::uuid` comparisons aren't against TEXT columns, and alias-qualified + bare column references resolve. Each check is pinned to a production outage from the 2026 audits (`tests/unit/schemaDrift.test.js` is the permanent negative test). Runs in CI. |
| `npm run check:drift:snapshot` | Same checks, but against the committed `database/schema-snapshot.json` — no database needed (laptops, quick pre-commit). |
| `npm run schema:snapshot` | Regenerate `database/schema-snapshot.json` from `DATABASE_URL`. Run after any migration that changes the schema and commit the result. |
| `npm run seed:dev` | Seed a local/dev DB with a verified admin, two customers, and sample orders (refuses non-local DBs unless `ALLOW_REMOTE_SEED=true`). |

All commands read `DATABASE_URL`. SSL is auto-disabled for `localhost`/`127.0.0.1`
(and `sslmode=disable`) and required otherwise, so the same commands work against
a local Postgres and against Supabase.

## CI gate (wired)

`.github/workflows/test.yml` (`integration` job) runs on every PR/push
against a hermetic `postgres:17` service container — no secrets needed:

```
shims → npm run migrate → migrate:check → check:drift → seed:dev → npm test
```

That last step runs the FULL suite including the DB-gated integration
suites (auth, role matrix, finance, last-mile/cargo), because
`TEST_DATABASE_URL` points at the container. A PR that adds a migration
that doesn't apply, code that references a missing table/column, or a
change that breaks any integration test fails CI instead of production.

## Local development / testing against a throwaway Postgres

```bash
# 1. start a local Postgres (any 14+); create a database
createdb thapsus_dev
export DATABASE_URL="postgres://<you>@127.0.0.1:5432/thapsus_dev"

# 2. one-time Supabase shims (roles, auth/storage schemas, auth.uid() etc.)
psql "$DATABASE_URL" -f database/dev/supabase-shims.sql

# 3. apply the baseline (+ any newer migrations), seed, run the app + tests
npm run migrate
npm run seed:dev
npm start
TEST_DATABASE_URL="$DATABASE_URL" npm test   # unlocks the DB integration suites
```

The baseline references the `anon`/`authenticated`/`service_role` roles and
functions that call `auth.uid()`/`auth.jwt()`, which Supabase provides
natively — that's what the shims file stands in for on vanilla Postgres.
Never apply the shims to a real Supabase project.

## History: how the schema got un-reproducible (2026 audits)

Two audit rounds established that the live schema had drifted from the
migrations: helper functions and tables created only by out-of-repo
`server-patch-*` files, FK columns declared `uuid` against TEXT referents,
manual-migrations applied out of band, and a `_migrations` ledger that missed
manual applies. Fixes were layered piecemeal (see `_archive/0000a_supabase_prerequisites.sql`
and the archive README trail, both now only in git history) until the 2026-07 audit ended the class by
cutting the consolidated baseline above from the live schema itself.

The operating rule stands: **treat the live schema as authoritative** — which
is exactly what `npm run check:drift` does. The ledger is advisory.
