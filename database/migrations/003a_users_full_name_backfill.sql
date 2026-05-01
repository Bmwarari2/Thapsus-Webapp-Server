-- ============================================================
-- Migration 003a — users.full_name column + backfill
--
-- Aligns the `users` table with the operator + ops endpoints in
-- routes/ops.js (e.g. /api/ops/parcels/:id/customer and
-- /api/ops/parcels/by-barcode/:barcode) which already SELECT
-- u.full_name even though the original schema.sql only declared
-- u.name.
--
-- On the production project (2026-05-01) the column was added
-- ad-hoc and 5/15 rows still carry NULL full_name with a
-- non-NULL name.  This migration formalises the column on fresh
-- installs and backfills any legacy rows.  Idempotent.
--
-- Run order:
--   1. database/schema.sql                                   (already live)
--   2. database/migrations/000_repair_phase4_tables.sql
--   3. database/migrations/001_framework_v2_additions.sql
--   4. database/migrations/002_packages_v2_alignment.sql
--   5. database/migrations/003_role_expansion.sql
--   6. database/migrations/003a_users_full_name_backfill.sql ← THIS FILE
-- ============================================================

BEGIN;

-- 1. Add the column on environments that pre-date it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name TEXT;

-- 2. Backfill from the legacy `name` column wherever full_name is
--    blank.  Both columns are kept for now; ops/admin routes are
--    being migrated to read COALESCE(full_name, name) and writes
--    will populate both during the transition.
UPDATE public.users
   SET full_name = name
 WHERE full_name IS NULL
   AND name IS NOT NULL;

COMMIT;
