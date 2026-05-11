# Manual migrations

SQL files in this directory are **never auto-applied on server boot**. They
are documentation of schema changes that have been (or will be) applied
manually via the Supabase SQL Editor.

## Why a separate directory

`database/migrations/` used to be auto-run via a `_migrations`-ledger
runner in `database/init.js` Step 5. Even though the runner skipped
already-applied files, the failure mode was bad: a brand-new .sql file
landing on `main` would apply on the next Railway redeploy, with no
human checkpoint. The runner is now gated behind
`RUN_MIGRATIONS_ON_BOOT=true` and the legacy directory is frozen.

All schema changes from this point go here. Operator applies them
manually, reviews the result, then commits the file as the historical
record.

## Workflow

1. Author the migration .sql here. File-naming convention is
   `NNN_short_description.sql` with NNN strictly increasing from `001`.
2. Open the file in the Supabase SQL Editor for the target project
   (`zzdfxsfuhosuqvsugtfd` for prod).
3. Wrap in `BEGIN`/`COMMIT` so a partial failure rolls back.
4. Paste and run.
5. Spot-check the result (`SELECT … information_schema.columns`, etc).
6. Commit the file with the PR that ships the matching code changes.

The PR description should call out **"migration applied: YYYY-MM-DD HH:MM
UTC"** so reviewers can correlate file commits with prod state.
