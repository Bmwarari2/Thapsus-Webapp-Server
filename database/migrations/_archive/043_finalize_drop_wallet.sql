-- ============================================================
-- Migration 043 — finalize drop of public.wallet (audit C-1, F-2).
--
-- Migration 039 already dropped this table, but the legacy bootstrap
-- script (database/init.js) had been re-creating it on every Railway
-- redeploy with RLS disabled — Supabase advisor flagged it
-- rls_disabled_in_public ERROR. The bootstrap was de-armed in the
-- companion PR (audit C-1, fix/bootstrap-no-schema-ddl), so this
-- DROP will now stay applied across redeploys.
--
-- Defensive — IF EXISTS so this is safe to apply even if the live
-- DB never had `wallet` re-created.
-- ============================================================

DROP TABLE IF EXISTS public.wallet CASCADE;
