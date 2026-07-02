-- ============================================================
-- Migration 009 — pod_otps for delivery OTP validation (T6)
--
-- Replaces the trust-the-rider stub (`otp_used` was passed
-- through to pod_events but never validated) with a proper
-- one-time-code flow:
--
--   • A row is upserted with `otp_hash = sha256(otp)` when a
--     parcel transitions to 'out_for_delivery'.
--   • The plain OTP is delivered to the recipient via the
--     existing notifications channel.
--   • The rider's POST /api/last-mile/rider/runs/:runId/pod must
--     submit the OTP, which the server hashes and compares.
--   • On success the row is marked consumed.
--
-- Idempotent — table + indexes are CREATE IF NOT EXISTS.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.pod_otps (
  parcel_id   TEXT PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  otp_hash    BYTEA       NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  consumed    BOOLEAN     NOT NULL DEFAULT FALSE,
  consumed_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_otps_expires_at ON public.pod_otps(expires_at);

-- Lock down. Rider/operator/admin paths read via the service
-- role; customers should never see the OTP table directly.
ALTER TABLE public.pod_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pod_otps FORCE ROW LEVEL SECURITY;

-- No public SELECT policy — only the Postgres role used by the
-- Node API (which bypasses RLS) reads/writes this table.

COMMIT;
