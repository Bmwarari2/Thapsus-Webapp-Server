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

## Known issues to reconcile (found during the 2026 audit)

The migration set in `database/migrations/` currently **cannot provision a clean
database on its own**. These should be fixed so a fresh environment can be built
reproducibly:

1. **Non-hermetic dependencies.** `007_auth_hardening.sql` runs
   `ALTER FUNCTION public.is_thapsus_admin()` / `is_thapsus_staff()` assuming
   those functions already exist, but their `CREATE FUNCTION` lives only in
   `server-patch-*` migrations that are recorded in the `_migrations` ledger yet
   are **not present in this directory**. Several tables (e.g. `auth_otps`) are
   likewise created only by manual/patch migrations. Fold the missing
   `CREATE FUNCTION`/`CREATE TABLE` statements into ordered migrations here.

2. **FK type drift.** `consolidations.id` and `last_mile_runs.id` are created as
   `TEXT` (`001_framework_v2_additions.sql`), but later migrations add `uuid`
   foreign keys pointing at them (`012_last_mile_run_parcels.sql`,
   `025_customer_consolidations.sql`), so a clean build fails with
   *"foreign key constraint cannot be implemented"*. The live DB only works
   because its `id` columns drifted to `uuid`. Align the migration column types
   with live.

3. **Unreliable ledger.** The `_migrations` ledger historically missed some
   manually-applied migrations and recorded a `057_whatsapp_otp_and_optin.sql`
   that isn't in this directory. Always treat the **live schema** as
   authoritative (that's what `check:drift` does); the ledger reconcile above
   was used to bring it back in line.
