-- Migration 040 — advisor cleanup batch
--
-- Addresses Supabase database advisor flags from 2026-05-07:
--   * function_search_path_mutable on touch_payments_updated_at and
--     touch_customer_consolidations_updated_at (security WARN)
--   * auth_rls_initplan on customer_consolidations / user_credits /
--     credit_ledger (performance WARN)
--   * multiple_permissive_policies on retailers (performance WARN)
--   * unindexed_foreign_keys on customer_consolidations.created_by and
--     payments.reviewed_by (performance INFO)
--   * duplicate_index on pod_events and referrals (performance WARN)
--
-- Already applied to the live project via Supabase MCP; this file pins
-- the change in migration history so fresh provisions match prod.

-- 1. Pin search_path on the trivial trigger touch functions. Body only
--    calls NOW() (in pg_catalog) and assigns to NEW, so an empty
--    search_path is safe.
CREATE OR REPLACE FUNCTION public.touch_payments_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.touch_customer_consolidations_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

-- 2. Drop duplicate indexes (keep the canonical names from tracked
--    migrations / schema.sql).
DROP INDEX IF EXISTS public.idx_pod_events_parcel;   -- duplicate of idx_pod_parcel (mig 001)
DROP INDEX IF EXISTS public.idx_referrals_referee;   -- duplicate of idx_referrals_referee_id (schema.sql)

-- 3. Cover unindexed foreign keys.
CREATE INDEX IF NOT EXISTS idx_cc_created_by
    ON public.customer_consolidations(created_by);
CREATE INDEX IF NOT EXISTS idx_payments_reviewed_by
    ON public.payments(reviewed_by);

-- 4. Wrap auth.* / staff-helper calls in (SELECT ...) so RLS evaluates
--    them once per query instead of once per row.
DROP POLICY IF EXISTS customer_consolidations_owner_select ON public.customer_consolidations;
CREATE POLICY customer_consolidations_owner_select
    ON public.customer_consolidations
    FOR SELECT
    USING (((SELECT auth.uid())::text) = user_id);

DROP POLICY IF EXISTS "user_credits self-or-staff read" ON public.user_credits;
CREATE POLICY "user_credits self-or-staff read"
    ON public.user_credits
    FOR SELECT
    TO authenticated
    USING (
        (user_id = ((SELECT auth.jwt()) ->> 'sub'::text))
        OR (SELECT public.is_thapsus_staff())
    );

DROP POLICY IF EXISTS "credit_ledger self-or-staff read" ON public.credit_ledger;
CREATE POLICY "credit_ledger self-or-staff read"
    ON public.credit_ledger
    FOR SELECT
    TO authenticated
    USING (
        (user_id = ((SELECT auth.jwt()) ->> 'sub'::text))
        OR (SELECT public.is_thapsus_staff())
    );

-- 5. Collapse the overlapping permissive SELECT policies on retailers.
--    The old `retailers admin write` (cmd=ALL) and `retailers public read`
--    (cmd=SELECT) both matched authenticated SELECT — that's the
--    multiple_permissive_policies trip. Split admin write into
--    INSERT/UPDATE/DELETE so a single SELECT policy serves both anon
--    and authenticated, and admin still has full write access.
DROP POLICY IF EXISTS "retailers admin write" ON public.retailers;
DROP POLICY IF EXISTS "retailers public read" ON public.retailers;

CREATE POLICY "retailers select all"
    ON public.retailers
    FOR SELECT
    TO anon, authenticated
    USING (is_active = true OR (SELECT public.is_thapsus_admin()));

CREATE POLICY "retailers admin insert"
    ON public.retailers
    FOR INSERT
    TO authenticated
    WITH CHECK ((SELECT public.is_thapsus_admin()));

CREATE POLICY "retailers admin update"
    ON public.retailers
    FOR UPDATE
    TO authenticated
    USING ((SELECT public.is_thapsus_admin()))
    WITH CHECK ((SELECT public.is_thapsus_admin()));

CREATE POLICY "retailers admin delete"
    ON public.retailers
    FOR DELETE
    TO authenticated
    USING ((SELECT public.is_thapsus_admin()));
