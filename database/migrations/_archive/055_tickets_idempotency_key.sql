-- 055_tickets_idempotency_key.sql
-- Stops duplicate support tickets created by the client-side offline outbox.
--
-- POST /api/tickets is NOT idempotent: every call mints a fresh uuid and
-- INSERTs unconditionally. The web outbox (client/src/lib/outbox.js) replays
-- response-less write failures (timeout / dropped socket) on reconnect, so a
-- ticket that actually committed server-side but never returned its response
-- gets created a second time — and a second "[Thapsus Support]" email fires.
--
-- Fix: carry a client-minted idempotency key on the request and coalesce
-- replays server-side. We mirror the established `transactions.idempotency_key`
-- precedent (migration 001): a nullable column + a partial UNIQUE index so
-- only non-null keys are constrained (legacy / keyless callers still work).
-- The unique scope is (user_id, idempotency_key) so distinct customers can
-- never collide, and a replayed POST resolves to the same row via ON CONFLICT.
--
-- Additive + idempotent: safe to re-run.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_user_idempotency_unique
  ON public.tickets (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
