-- Migration 004 — email verification
-- =====================================================================
-- Adds an email-verification gate to /api/auth/register + /login.
-- Mirrors the password_reset_tokens table shape (token_sha256, expiry,
-- single-use flag, ON DELETE CASCADE from users). Existing users are
-- backfilled to verified=NOW() so live customers don't get locked out
-- on the day this ships — the gate only enforces for new registrations.
--
-- Touchpoints (server code that lands alongside this migration):
--   • routes/auth.js:/register   → mints token, sends email, returns
--                                  201 + verification_required=true
--                                  WITHOUT a JWT (was: returned JWT).
--   • routes/auth.js:/login      → rejects with 403 + code='email_unverified'
--                                  when users.email_verified_at IS NULL.
--   • routes/auth.js:/verify-email   → new POST, consumes the token,
--                                      stamps email_verified_at, mints JWT.
--   • routes/auth.js:/resend-verification → new POST, mints a fresh token.
--   • utils/email.js:sendEmailVerificationEmail → new template.
--
-- Apply via the Supabase SQL Editor for prod
-- (project zzdfxsfuhosuqvsugtfd). Wrapped in BEGIN/COMMIT so a partial
-- failure rolls back. Safe to re-run — every DDL is IF NOT EXISTS-guarded.

BEGIN;

-- 1. users.email_verified_at — nullable timestamp; when populated, the
--    user has confirmed their email and may sign in.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;

-- 2. Backfill every pre-existing user as verified. They've already been
--    transacting with us; forcing re-verification on the day this
--    ships would mass-lock the customer base.
UPDATE public.users
   SET email_verified_at = NOW()
 WHERE email_verified_at IS NULL;

-- 3. email_verification_tokens — single-use, hashed-at-rest, expires
--    after 24h. Modeled after password_reset_tokens (mig 010 baseline +
--    mig 010 sha256). The plaintext `token` column stays nullable for
--    parity with reset-token shape; new rows write only token_sha256.
CREATE TABLE IF NOT EXISTS public.email_verification_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token         TEXT UNIQUE,
  token_sha256  BYTEA NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  used          BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup paths for /verify-email (by hash) and for sweeping
-- expired/used rows.
CREATE INDEX IF NOT EXISTS idx_email_verification_token_sha
  ON public.email_verification_tokens(token_sha256);
CREATE INDEX IF NOT EXISTS idx_email_verification_user
  ON public.email_verification_tokens(user_id);

-- 4. RLS — same lockdown the audit applied to password_reset_tokens.
--    Tokens are written + read exclusively by the Express service_role
--    pool; no authenticated/anon access is appropriate. Enable RLS with
--    a deny-all policy so future audit advisors don't flag
--    `rls_enabled_no_policy`.
ALTER TABLE public.email_verification_tokens
  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'email_verification_tokens'
       AND policyname = 'no_user_access'
  ) THEN
    EXECUTE 'CREATE POLICY no_user_access ON public.email_verification_tokens FOR ALL USING (false)';
  END IF;
END
$$;

COMMIT;
