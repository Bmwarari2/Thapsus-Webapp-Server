-- ============================================================
-- Migration 010 — password_reset_tokens.token_sha256 (T9)
--
-- Stores a SHA-256 hash of every reset token alongside the legacy
-- plaintext column.  Read path migrates to the hash so a database
-- dump cannot be replayed — the only material that lets you
-- consume a token is the raw value emailed to the user.
--
-- The plaintext `token` column is intentionally kept for one
-- release cycle so existing in-flight reset emails (issued before
-- the deploy) still resolve.  A follow-up migration will drop it.
--
-- Idempotent.  Safe to re-run.
-- ============================================================

BEGIN;

ALTER TABLE public.password_reset_tokens
  ADD COLUMN IF NOT EXISTS token_sha256 BYTEA;

-- Backfill any existing rows so the new read path can find them.
-- digest() is provided by pgcrypto, which Supabase has enabled by
-- default; falling back to a no-op if the extension is missing
-- keeps the migration safe on minimal Postgres setups.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto') THEN
    EXECUTE $sql$
      UPDATE public.password_reset_tokens
         SET token_sha256 = digest(token, 'sha256')
       WHERE token_sha256 IS NULL
         AND token IS NOT NULL
    $sql$;
  END IF;
END $$;

-- Unique index on the hash so a stray duplicate plaintext can't
-- bypass the lookup.  Allows NULL during the migration window.
CREATE UNIQUE INDEX IF NOT EXISTS idx_password_reset_tokens_sha256
  ON public.password_reset_tokens (token_sha256)
  WHERE token_sha256 IS NOT NULL;

COMMIT;
