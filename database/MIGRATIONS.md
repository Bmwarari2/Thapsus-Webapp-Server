# Database migrations & schema-drift guardrails

This project's live schema drifted away from the code several times because
migrations were applied by hand in the Supabase SQL editor and the boot-time
auto-runner is disabled by default. The result: the code referenced columns and
tables that did not exist on the live database, and order/ticket creation 500'd
in production. The tooling below makes applying migrations deterministic and
makes drift a CI failure instead of a production outage.

## Tooling

| Command | What it does |
| --- | --- |
| `npm run migrate` | Apply every pending migration (files under `database/migrations/*.sql` not yet in the `_migrations` ledger), in filename order, each in its own transaction, **fail-fast**. |
| `npm run migrate:check` | Exit non-zero if any migration is unapplied. **Wire this into CI** so a PR that adds a `.sql` without applying it to the target DB fails loudly. No writes. |
| `npm run migrate:reconcile` | Record every migration filename as applied **without running it** — one-time use when adopting an already-provisioned DB whose ledger is behind reality. |
| `npm run check:drift` | Connect to `DATABASE_URL`, read the **actual** columns of every public table, and verify that every table/column the code's `.query()`/`.exec()` calls reference exists. This is the check that would have caught the `orders.hs_tier`, `tickets.idempotency_key`, and `request_idempotency` outages. **Wire this into CI.** |
| `npm run seed:dev` | Seed a local/dev DB with a verified admin, two customers, and sample orders (refuses non-local DBs unless `ALLOW_REMOTE_SEED=true`). |

All commands read `DATABASE_URL`. SSL is auto-disabled for `localhost`/`127.0.0.1`
(and `sslmode=disable`) and required otherwise, so the same commands work against
a local Postgres and against Supabase.

## Recommended CI gate

```yaml
# after installing deps, against a DB that mirrors production schema:
- run: npm run migrate:check   # no migration left unapplied
- run: npm run check:drift     # no code references a missing table/column
```

## Local development / testing against a throwaway Postgres

```bash
# 1. start a local Postgres (any 14+); create a database
createdb thapsus_dev
export DATABASE_URL="postgres://<you>@127.0.0.1:5432/thapsus_dev"

# 2. apply migrations, seed, run the app
npm run migrate
npm run seed:dev
npm start
```

> Note: `database/migrations/*.sql` are written for Supabase (they reference the
> `anon`/`authenticated`/`service_role` roles, the `auth`/`storage` schemas, the
> `supabase_realtime` publication, and `auth.uid()`). On a vanilla Postgres you
> must first create those as shims, or run `npm run migrate -- --continue-on-error`
> and accept that the Supabase-only policy/storage migrations are skipped. The
> Express server connects as a superuser and bypasses RLS, so skipped RLS
> policies do not affect local API testing.

## Schema-reproducibility status (2026 audit)

Rebuilding a fresh DB from `database/migrations/` alone was tested against a
throwaway local Postgres. Two of the blockers have been fixed; a third,
larger one is characterised below.

### Fixed

1. **Non-hermetic helper predicates + `auth_otps`** ✅
   `007_auth_hardening.sql` `ALTER`s `is_thapsus_admin()` / `is_thapsus_staff()`
   and many RLS policies call them, but their `CREATE FUNCTION` lived only in
   out-of-directory `server-patch-*` migrations; `auth_otps` (referenced by 058)
   was likewise created out of band. These are now codified — from the verbatim
   live definitions — in **`0000a_supabase_prerequisites.sql`**, which sorts
   right after the baseline and before `007`.

2. **FK type drift** ✅
   `012_last_mile_run_parcels.sql` and `025_customer_consolidations.sql`
   declared `uuid` FK columns (`run_id`, `shipping_consolidation_id`) pointing at
   `TEXT` primary keys (`last_mile_runs.id`, `consolidations.id`), so a clean
   build failed *"foreign key constraint cannot be implemented"*. Live has always
   used `TEXT` for those columns; the files were corrected to match. (The `uuid`
   PKs `customer_consolidations.id` / `packages.customer_consolidation_id` are
   correct and unchanged.)

With these, a clean-room rebuild went from 22 failed migrations to 4.

### Still open (larger reconciliation, not yet done)

3. **Other objects created only by out-of-repo `server-patch-*` / manual
   migrations.** A fully hermetic build still needs, among others:
   `orders.consolidation_id` and `promotions.currency` (referenced by `033`/`035`
   but added by server-patch migrations that are in **neither**
   `database/migrations/` nor `database/manual-migrations/`), and the
   `database/manual-migrations/` tables (`account_deletion_requests`,
   `email_verification_tokens`, `nps_invitations`) which are applied manually by
   design (see that directory's README). Closing this means dumping the current
   live schema into a single consolidated baseline — a deliberate follow-up, not
   a piecemeal patch.

Until then, **treat the live schema as authoritative** — which is exactly what
`npm run check:drift` does. The `_migrations` ledger is only advisory (it
historically missed manual applies and even lists a `057_whatsapp_otp_and_optin.sql`
that isn't in this directory), so drift detection is anchored to the real schema,
not the ledger.
