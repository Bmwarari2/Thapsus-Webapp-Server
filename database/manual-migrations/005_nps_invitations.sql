-- Migration 005 — nps_invitations (repair: table referenced by code, never migrated)
-- =====================================================================
-- The NPS *invitation* table was lost when the schema moved to the
-- migration baseline (0000_baseline_schema.sql). Only its sibling
-- `nps_responses` survived (mig 001 §22). Server code, however, still
-- reads from and writes to `nps_invitations`, so every one of these
-- paths was throwing `relation "nps_invitations" does not exist`:
--
--   • routes/lastMile.js  → INSERT on POD success (one invite per parcel)
--   • routes/admin.js     → INSERT when an order is marked 'delivered'
--   • routes/nps.js        → UPDATE responded_at on POST /api/nps,
--                            SELECT on GET  /api/nps/pending
--
-- Migration 050 even DROP INDEX IF EXISTS'd `idx_nps_invitations_pending`
-- — a tombstone confirming the table once existed in the legacy
-- hard-coded bootstrap before it was retired.
--
-- Shape is recovered from the call sites:
--   INSERT (id, user_id, order_id) ON CONFLICT (order_id) DO NOTHING
--   UPDATE … SET responded_at = NOW() WHERE order_id = ? AND user_id = ?
--   SELECT order_id, created_at WHERE user_id = ? AND responded_at IS NULL
-- → columns id/user_id/order_id/responded_at/created_at, with a UNIQUE
--   constraint on order_id (required by ON CONFLICT (order_id)).
--
-- FKs cascade so the existing admin "delete user" flow (which DELETEs the
-- user's orders explicitly) tears invitations down without FK violations.
--
-- RLS mirrors `nps_responses`: enabled (not forced), one self-or-staff
-- SELECT policy for `authenticated`. All writes go through the Express
-- service_role pool, which bypasses RLS.
--
-- Apply via the Supabase SQL Editor for prod (project zzdfxsfuhosuqvsugtfd).
-- Wrapped in BEGIN/COMMIT; every statement is idempotent / IF NOT EXISTS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nps_invitations (
  id            TEXT PRIMARY KEY,
  user_id       TEXT REFERENCES public.users(id)  ON DELETE CASCADE,
  order_id      TEXT UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  responded_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.nps_invitations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'nps_invitations'
       AND policyname = 'nps invitations self-or-staff read'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "nps invitations self-or-staff read"
        ON public.nps_invitations
        FOR SELECT
        TO authenticated
        USING ((user_id = (auth.jwt() ->> 'sub')) OR is_thapsus_staff())
    $p$;
  END IF;
END
$$;

COMMIT;
