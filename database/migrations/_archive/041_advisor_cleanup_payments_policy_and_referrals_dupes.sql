-- Migration 041 — advisor cleanup follow-up
--
-- Mig 040 missed two flags discovered on the next advisor refresh:
--   * `payments self-or-staff read` still re-evaluates auth.jwt() per
--     row (auth_rls_initplan on public.payments) — same fix shape as
--     user_credits / credit_ledger in mig 040.
--   * `referrals` had TWO duplicate-index pairs, not one (the
--     `idx_referrals_referrer` / `_id` pair was hidden in the
--     truncated advisor JSON). Drop both legacy unsuffixed names
--     `idx_referrals_referee` / `idx_referrals_referrer` so the
--     canonical `_id`-suffix variants from database/schema.sql win.
--
-- Already applied to the live project via Supabase MCP; this file pins
-- the change in migration history so fresh provisions match prod.

-- 1. payments RLS init-plan fix.
DROP POLICY IF EXISTS "payments self-or-staff read" ON public.payments;
CREATE POLICY "payments self-or-staff read"
    ON public.payments
    FOR SELECT
    TO authenticated
    USING (
        (user_id = ((SELECT auth.jwt()) ->> 'sub'::text))
        OR (SELECT public.is_thapsus_staff())
    );

-- 2. Drop legacy referrals duplicate indexes (the `_id`-suffix variants
--    in database/schema.sql are the canonical names).
DROP INDEX IF EXISTS public.idx_referrals_referee;
DROP INDEX IF EXISTS public.idx_referrals_referrer;
