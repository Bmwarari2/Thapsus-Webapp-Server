-- Migration 061 — RLS performance: wrap auth.*()/helper calls in (SELECT ...)
--
-- Supabase performance advisors:
--   • 0003_auth_rls_initplan (15 policies): auth.uid()/auth.jwt()/is_thapsus_staff()
--     called bare in a policy are re-evaluated once PER ROW. Wrapping them in a
--     scalar subquery — (SELECT auth.jwt()) — makes Postgres treat them as an
--     InitPlan evaluated ONCE per statement. This is the documented Supabase
--     fix and is purely a performance change: the boolean result for every row
--     is identical, so access control is unchanged.
--   • 0006_multiple_permissive_policies (account_deletion_requests): two
--     permissive SELECT policies for `authenticated` are collapsed into one.
--
-- Each policy below is dropped and recreated with the SAME predicate, only with
-- the volatile-looking calls wrapped. Names/roles/commands are preserved.
-- Idempotent (DROP ... IF EXISTS). Requires is_thapsus_staff()/current_user_id()
-- to exist (they do on the live project).

-- ── self-or-staff SELECT policies keyed on user_id via auth.jwt()->>'sub' ─────
DROP POLICY IF EXISTS "buy_for_me self-or-staff read" ON public.buy_for_me_orders;
CREATE POLICY "buy_for_me self-or-staff read" ON public.buy_for_me_orders FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "dsar self-or-staff read" ON public.dsar_requests;
CREATE POLICY "dsar self-or-staff read" ON public.dsar_requests FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "insurance self-or-staff read" ON public.insurance_policies;
CREATE POLICY "insurance self-or-staff read" ON public.insurance_policies FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "notifications self-or-staff read" ON public.notifications;
CREATE POLICY "notifications self-or-staff read" ON public.notifications FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "nps invitations self-or-staff read" ON public.nps_invitations;
CREATE POLICY "nps invitations self-or-staff read" ON public.nps_invitations FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "nps self-or-staff read" ON public.nps_responses;
CREATE POLICY "nps self-or-staff read" ON public.nps_responses FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "orders self-or-staff read" ON public.orders;
CREATE POLICY "orders self-or-staff read" ON public.orders FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "packages self-or-staff read" ON public.packages;
CREATE POLICY "packages self-or-staff read" ON public.packages FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "tickets self-or-staff read" ON public.tickets;
CREATE POLICY "tickets self-or-staff read" ON public.tickets FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "transactions self-or-staff read" ON public.transactions;
CREATE POLICY "transactions self-or-staff read" ON public.transactions FOR SELECT TO authenticated
  USING ((user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

-- ── keyed on id / referrer / referee ─────────────────────────────────────────
DROP POLICY IF EXISTS "users self-or-staff read" ON public.users;
CREATE POLICY "users self-or-staff read" ON public.users FOR SELECT TO authenticated
  USING ((id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()));

DROP POLICY IF EXISTS "referrals participants-or-staff read" ON public.referrals;
CREATE POLICY "referrals participants-or-staff read" ON public.referrals FOR SELECT TO authenticated
  USING ((referrer_id = ((SELECT auth.jwt()) ->> 'sub'::text))
      OR (referee_id = ((SELECT auth.jwt()) ->> 'sub'::text))
      OR (SELECT is_thapsus_staff()));

-- ── EXISTS-subquery policies (parent-owned rows) ─────────────────────────────
DROP POLICY IF EXISTS "parcel_items self-or-staff read" ON public.parcel_items;
CREATE POLICY "parcel_items self-or-staff read" ON public.parcel_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.packages p
                 WHERE p.id = parcel_items.parcel_id
                   AND ((p.user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()))));

DROP POLICY IF EXISTS "ticket_messages thread-or-staff read" ON public.ticket_messages;
CREATE POLICY "ticket_messages thread-or-staff read" ON public.ticket_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.tickets t
                 WHERE t.id = ticket_messages.ticket_id
                   AND ((t.user_id = ((SELECT auth.jwt()) ->> 'sub'::text)) OR (SELECT is_thapsus_staff()))));

-- ── account_deletion_requests: collapse two permissive SELECT policies into one
-- The union of `(user_id = current_user_id()) OR is_thapsus_staff()` and
-- `user_id = auth.uid()::text` is preserved exactly, with every call wrapped.
DROP POLICY IF EXISTS "account_deletion_requests_self_select" ON public.account_deletion_requests;
DROP POLICY IF EXISTS "account_deletion_requests_self_or_staff_select" ON public.account_deletion_requests;
CREATE POLICY "account_deletion_requests_self_or_staff_select" ON public.account_deletion_requests FOR SELECT TO authenticated
  USING ((user_id = (SELECT current_user_id()))
      OR (user_id = ((SELECT auth.uid()))::text)
      OR (SELECT is_thapsus_staff()));
