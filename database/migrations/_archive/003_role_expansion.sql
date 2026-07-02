-- ============================================================
-- Migration 003 — users.role expansion
--
-- Recovers the migration that widened `users.role` from the legacy
-- ('customer','admin') set to the v2 5-role set
-- ('customer','admin','operator','clearing_agent','rider') used by
-- middleware/auth.js, routes/lastMile.js, routes/ops.js, etc.
--
-- Live DB inspection (2026-05-01) confirms the CHECK was already
-- widened on prod, but the migration file itself was missing from
-- the repo so fresh installs would still reject inserts of
-- operator/rider/clearing_agent users (e.g. dispatch picker seeds).
--
-- Idempotent — drops any existing CHECK on users.role and re-adds
-- the canonical v2 CHECK.  Safe to re-run.
--
-- Run order:
--   1. database/schema.sql                                   (already live)
--   2. database/migrations/000_repair_phase4_tables.sql
--   3. database/migrations/001_framework_v2_additions.sql
--   4. database/migrations/002_packages_v2_alignment.sql
--   5. database/migrations/003_role_expansion.sql           ← THIS FILE
-- ============================================================

BEGIN;

-- 1. Drop any pre-existing CHECK on role (legacy or partial v2).
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'users'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%role%'
       AND pg_get_constraintdef(c.oid) NOT ILIKE '%email_change%'
  LOOP
    EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- 2. Re-add the canonical v2 CHECK.
ALTER TABLE public.users
  ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'customer',
    'admin',
    'operator',
    'clearing_agent',
    'rider'
  ));

COMMIT;
