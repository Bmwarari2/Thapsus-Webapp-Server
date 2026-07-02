-- 037_users_password_changed_at.sql
--
-- Audit P6.2 follow-up: complete the auth-flow hardening from PR #107.
-- That PR added token revocation on PUT /api/auth/password (the user
-- holds the JWT in the request and we can revoke it directly), but
-- /reset-password — the very flow you'd use after suspecting compromise
-- — couldn't revoke because it has no JWT in hand. Without a server-
-- side marker, every previously-issued JWT remained valid for up to 30
-- days after a password reset.
--
-- This adds `users.password_changed_at`. authMiddleware (next commit)
-- compares each incoming JWT's `iat` against this timestamp and
-- rejects tokens issued before the latest password change. That's
-- one extra DB lookup per authenticated request, folded into the
-- existing revoked_tokens check so it's still a single round-trip.
--
-- Backfill: existing rows get `created_at` (the user signed up at
-- that time, so any token they currently hold has iat >= created_at —
-- nothing gets logged out on deploy). New rows default to NOW().
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + UPDATE WHERE NULL.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;

UPDATE users
   SET password_changed_at = created_at
 WHERE password_changed_at IS NULL;

ALTER TABLE users
  ALTER COLUMN password_changed_at SET DEFAULT NOW();

ALTER TABLE users
  ALTER COLUMN password_changed_at SET NOT NULL;
