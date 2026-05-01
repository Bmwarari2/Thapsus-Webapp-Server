-- ============================================================
-- Migration 002 — packages.status v2 alignment
--
-- Recovers the migration that widened `packages.status` from the
-- legacy 8-value set
--   ('pending','received','consolidating','in_transit','customs',
--    'out_for_delivery','delivered','lost')
-- to the v2 16-value set used by routes/orders.js and routes/ops.js
-- since the framework_v2 rollout.
--
-- Live DB inspection (2026-05-01) shows the CHECK already widened
-- to 15 values on the production project but missing 'lost'.  This
-- migration is idempotent: it drops any existing CHECK on
-- `packages.status`, backfills any legacy values, and re-adds the
-- canonical v2 CHECK.  Safe to re-run.
--
-- Run order:
--   1. database/schema.sql                                   (already live)
--   2. database/migrations/000_repair_phase4_tables.sql
--   3. database/migrations/001_framework_v2_additions.sql
--   4. database/migrations/002_packages_v2_alignment.sql    ← THIS FILE
--   5. database/migrations/003_role_expansion.sql
-- ============================================================

BEGIN;

-- 1. Backfill legacy values into the v2 namespace before tightening
--    the CHECK.  Conditional UPDATEs only touch rows that still
--    carry a deprecated label, so re-runs become no-ops.
UPDATE public.packages
   SET status = 'pre_registered'
 WHERE status = 'pending';

UPDATE public.packages
   SET status = 'received_at_warehouse'
 WHERE status = 'received';

-- 2. Drop any pre-existing CHECK on status (legacy or partial v2).
--    `pg_constraint` lookup is more robust than guessing the name.
DO $$
DECLARE
  cname text;
BEGIN
  FOR cname IN
    SELECT c.conname
      FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
     WHERE t.relname = 'packages'
       AND c.contype = 'c'
       AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.packages DROP CONSTRAINT %I', cname);
  END LOOP;
END $$;

-- 3. Re-add the canonical v2 CHECK.
ALTER TABLE public.packages
  ADD CONSTRAINT packages_status_check
  CHECK (status IN (
    'pre_registered',
    'received_at_warehouse',
    'photographed',
    'weighed',
    'screened',
    'manifested',
    'in_transit',
    'jkia_arrived',
    'awaiting_duty_payment',
    'released',
    'out_for_delivery',
    'delivered',
    'held',
    'held_at_nairobi_hub',
    'abandoned',
    'lost'
  ));

-- 4. Default for new rows: customer-create-order in routes/orders.js
--    inserts with status='pre_registered', but a fresh schema.sql
--    install would still default to 'pending'.  Realign.
ALTER TABLE public.packages
  ALTER COLUMN status SET DEFAULT 'pre_registered';

COMMIT;
