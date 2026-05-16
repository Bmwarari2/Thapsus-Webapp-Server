-- 003_account_deletion_widen_policy.sql
--
-- Widens the account_deletion_requests SELECT policy to follow the
-- repo's dominant `self_or_staff` convention (see buy_for_me_orders,
-- compliance_trainings, consolidations, etc.). Two changes:
--
--   1. Drops `auth.uid()::text` in favour of the local
--      `current_user_id()` helper. Any future change to how the JWT
--      identity is resolved only needs to be made in one place.
--   2. Adds `OR is_thapsus_staff()` so admins can subscribe to a
--      Realtime channel of pending deletions (mirrors the AML /
--      audit-logs surfacing pattern). Today every admin write still
--      goes through Express service-role and bypasses RLS, so this
--      is purely additive — a future "Deletions queue" admin screen
--      driven by PostgREST/Realtime will Just Work.
--
-- Apply by hand in Supabase per database/manual-migrations/README.md.
-- Idempotent (DROP POLICY IF EXISTS) so reruns against an already
-- updated environment are a no-op.

DROP POLICY IF EXISTS account_deletion_requests_self_select
  ON public.account_deletion_requests;

DROP POLICY IF EXISTS account_deletion_requests_self_or_staff_select
  ON public.account_deletion_requests;

CREATE POLICY account_deletion_requests_self_or_staff_select
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING ((user_id = current_user_id()) OR is_thapsus_staff());
