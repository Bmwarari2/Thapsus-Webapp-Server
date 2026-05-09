-- ============================================================
-- Migration 048 — tighten customer_consolidations_owner_select to
-- {authenticated} (audit F-15).
--
-- The policy was created by mig 040 with `roles = {public}`, which
-- includes both `anon` and `authenticated`. The behaviour is anyway
-- anon-deny (the USING clause `(SELECT auth.uid())::text = user_id`
-- evaluates to NULL for anon and never matches), so this is a hygiene
-- fix only — bringing the policy into line with every other self_or_staff
-- pattern in the schema, which all use `TO authenticated`.
--
-- DROP+CREATE because postgres doesn't allow ALTER POLICY ... TO ....
-- ============================================================

DROP POLICY IF EXISTS customer_consolidations_owner_select ON public.customer_consolidations;
CREATE POLICY customer_consolidations_owner_select
    ON public.customer_consolidations
    FOR SELECT
    TO authenticated
    USING (((SELECT auth.uid())::text) = user_id);
