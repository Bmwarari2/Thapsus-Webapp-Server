-- Migration 059 — lock down request_idempotency with RLS
--
-- Migration 056 created public.request_idempotency WITHOUT row-level security.
-- Like push_subscriptions before it (see migration 058), the table lives in the
-- `public` schema and is therefore exposed through PostgREST, so any holder of
-- the anon/publishable key could read it. It caches full HTTP response bodies
-- keyed by client idempotency key — potentially other users' order/payment
-- payloads — plus user_ids, so it must not be client-readable.
--
-- The Express backend uses the postgres/service-role pool (database/init.js)
-- which bypasses RLS, so middleware/idempotency.js is unaffected. Enable RLS
-- and add an explicit deny-all policy (documents intent + keeps the advisor
-- quiet), mirroring every other server-only table in this project.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.request_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "request_idempotency deny client access" ON public.request_idempotency;
CREATE POLICY "request_idempotency deny client access"
    ON public.request_idempotency
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);
