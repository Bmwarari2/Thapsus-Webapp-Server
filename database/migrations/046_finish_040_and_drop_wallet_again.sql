-- ============================================================
-- Migration 046 — clean up the F-baseline + mig-040 regressions
-- introduced when PR #163 merged on 2026-05-09.
--
-- Two problems this fixes:
--
-- 1. PR #163 (F-baseline) lifted `database/schema.sql` into the new
--    `0000_baseline_schema.sql` migration verbatim. That file used to
--    include a `CREATE TABLE IF NOT EXISTS wallet (...)` block. On the
--    next Railway redeploy, the baseline ran, recreated `public.wallet`
--    without RLS enabled (Supabase advisor flagged it
--    `rls_disabled_in_public` ERROR), and the existing migrations 039 +
--    043 — which previously dropped the table — were already in the
--    `_migrations` ledger so they never re-fired.
--
--    Fix: drop public.wallet again. The companion edit removes the wallet
--    block from `0000_baseline_schema.sql` so future fresh deploys don't
--    hit this.
--
-- 2. Mig 040 had been failing on every redeploy with
--    `42710 policy "retailers select all" for table "retailers" already
--    exists`. The script's section 5 created the policy without first
--    dropping any pre-existing version, so any environment where mig
--    029 or a partial earlier apply had created the policy aborts at
--    that statement. The DROP+CREATE for the three admin policies that
--    follow then never ran, so 040 has been recording errors in
--    `error_logs` on every boot.
--
--    The companion edit to `040_advisor_cleanup_*.sql` adds DROP POLICY
--    IF EXISTS before each CREATE POLICY in section 5. Live envs where
--    mig 040 already (partially) succeeded still have the policies, but
--    the migration is no longer in their ledger because it errored —
--    so on the next boot it will re-run, this time succeeding.
--
--    This migration also drops the still-lingering duplicate index
--    `idx_referrals_referee` (mig 040 section 2 was supposed to drop it,
--    but if 040 errored before completing, the section-2 DROP could
--    still be pending). DROP INDEX IF EXISTS is safe either way.
--
-- 3. Belt-and-braces: re-confirm RLS is enabled on every table the
--    baseline migration creates EXCEPT the ones that legitimately don't
--    have it (none — every public table should have RLS by mig 018's
--    relockdown). Idempotent ALTER TABLE … ENABLE ROW LEVEL SECURITY.
-- ============================================================

-- ─── Drop wallet for real (again) ──────────────────────────────────────
DROP TABLE IF EXISTS public.wallet CASCADE;

-- ─── Drop lingering duplicate referrals index ──────────────────────────
DROP INDEX IF EXISTS public.idx_referrals_referee;

-- ─── Belt-and-braces RLS enable on baseline tables ─────────────────────
-- These should already be enabled by mig 018_rls_relockdown, but if
-- the baseline migration recreated any of them on a fresh provision,
-- enable RLS now so a future advisor run doesn't flag them.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'users', 'orders', 'packages', 'transactions', 'referrals',
        'tickets', 'ticket_messages', 'notifications', 'admin_logs',
        'exchange_rates', 'password_reset_tokens', 'backups',
        'email_logs', 'error_logs'
    ]
    LOOP
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public' AND table_name = t
        ) THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        END IF;
    END LOOP;
END
$$;
