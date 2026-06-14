-- 056_request_idempotency.sql
-- Generic request-idempotency store for non-idempotent write endpoints.
--
-- Migration 055 fixed POST /api/tickets by hanging an idempotency key off the
-- tickets table. That per-table approach doesn't generalise: several other
-- writes (orders, buy-for-me, rider POD/fail, customer-consolidation invoices,
-- …) are equally replay-unsafe, and some of the damage is an unconditional
-- counter bump (last_mile_runs.completed_stops) that no UNIQUE index can guard.
--
-- This table backs middleware/idempotency.js: the first request with a given
-- client-minted key reserves a row; on completion its HTTP status + JSON body
-- are cached. A replay carrying the same key (the web outbox re-sends a write
-- whose response was lost to a timeout/dropped socket) short-circuits to the
-- cached response WITHOUT re-running the handler — so no duplicate row, no
-- double counter bump, no duplicate email.
--
-- The key is a client-generated UUID and is globally unique by construction,
-- so it is the primary key on its own (user_id is kept for audit/pruning only).
--
-- Additive + idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS public.request_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  user_id         TEXT,
  method          TEXT NOT NULL,
  path            TEXT NOT NULL,
  status_code     INTEGER,
  response_body   JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

-- Supports periodic pruning of old keys (a retention job can delete rows
-- older than N days; replays only matter for a short window after the write).
CREATE INDEX IF NOT EXISTS idx_request_idempotency_created_at
  ON public.request_idempotency (created_at);
