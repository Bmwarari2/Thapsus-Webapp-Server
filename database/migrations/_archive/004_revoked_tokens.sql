-- ============================================================
-- Migration 004 — sc_token revocation list
--
-- Backs the POST /api/auth/logout flow added in the same PR. The
-- middleware checks a SHA-256 hash of the bearer token against this
-- table on every authenticated request; a row in here means the token
-- was explicitly invalidated by a logout call and must no longer be
-- accepted, even though its `exp` claim hasn't elapsed yet.
--
-- We store only the SHA-256 hash (not the raw token) so a database
-- compromise doesn't hand attackers a list of usable tokens.
--
-- expires_at mirrors the JWT's `exp` so a daily cleanup task can
-- reclaim space:
--
--    DELETE FROM revoked_tokens WHERE expires_at < NOW();
--
-- Run order: idempotent, additive. Re-runnable on every boot.
-- ============================================================

CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_sha256 BYTEA PRIMARY KEY,
  user_id UUID NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
  ON revoked_tokens(expires_at);

CREATE INDEX IF NOT EXISTS idx_revoked_tokens_user
  ON revoked_tokens(user_id);

-- RLS: this table is server-only. The webapp + iOS speak to it only
-- through the Express service role (req.db), never through PostgREST.
-- Enable RLS with no SELECT policy so any direct PostgREST read returns
-- zero rows; the JWT helper RPCs continue to work because they run
-- under SECURITY DEFINER.
ALTER TABLE revoked_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE revoked_tokens FORCE ROW LEVEL SECURITY;
