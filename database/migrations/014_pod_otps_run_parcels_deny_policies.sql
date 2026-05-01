-- ============================================================
-- Migration 014 — explicit deny-all policies on pod_otps +
--                last_mile_run_parcels (advisor 0008)
--
-- Migrations 009 and 012 enabled + forced RLS on these tables
-- but added no policies, on the assumption that the Node API
-- bypasses RLS via the service_role.  That's still true, but
-- Supabase's database linter flags the absence of any policy as
-- INFO (rls_enabled_no_policy 0008) — and a future maintainer
-- reading the schema can't tell whether the empty policy list
-- is intentional or an oversight.
--
-- This migration makes the lockdown explicit: a single
-- restrictive policy on each table that returns false for every
-- row when the caller is `authenticated` or `anon`.  The
-- service_role used by the Express API bypasses RLS entirely
-- so its access path is unchanged.
--
-- Idempotent.  Safe to re-run.
-- ============================================================

BEGIN;

DO $mig$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'pod_otps'
       AND policyname = 'pod_otps_deny_authenticated'
  ) THEN
    CREATE POLICY pod_otps_deny_authenticated ON public.pod_otps
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'last_mile_run_parcels'
       AND policyname = 'last_mile_run_parcels_deny_authenticated'
  ) THEN
    CREATE POLICY last_mile_run_parcels_deny_authenticated ON public.last_mile_run_parcels
      FOR ALL
      TO authenticated, anon
      USING (false)
      WITH CHECK (false);
  END IF;
END $mig$;

COMMIT;
