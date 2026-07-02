-- 0001_drop_plaintext_tokens.sql — end the plaintext-token grace period.
--
-- ⚠ DEPLOY ORDER: apply this AFTER the code that stops writing the
-- plaintext `token` column is deployed (the commit that ships this file).
-- Pre-0001 code INSERTs into `token`; dropping the column first hard-500s
-- registration, forgot-password, and admin user creation on the running
-- deployment. The new code runs fine against the pre-0001 schema (token
-- simply stays NULL), so the safe sequence is strictly: deploy → migrate.
--
-- password_reset_tokens and email_verification_tokens carried BOTH the
-- plaintext token and its SHA-256 since migration 010 introduced
-- hash-at-rest, so links emailed before that migration kept resolving via a
-- legacy `OR token = $n` branch. Three admin-side writers (users/create,
-- resend-welcome, admin reset-password) still wrote plaintext-only rows and
-- leaned on that branch. All writers and lookups are hash-only as of this
-- change, so the plaintext columns — the whole reason a DB dump could mint
-- password changes / verified accounts — can finally go.
--
-- Backfill first: any live plaintext-only row gets its hash computed
-- (digest() from pgcrypto — public schema on the dev shims, extensions on
-- Supabase; both are on the search_path), so outstanding emailed links
-- issued by the plaintext-only writers keep working across the deploy.

UPDATE public.password_reset_tokens
   SET token_sha256 = digest(token, 'sha256')
 WHERE token_sha256 IS NULL AND token IS NOT NULL;

UPDATE public.email_verification_tokens
   SET token_sha256 = digest(token, 'sha256')
 WHERE token_sha256 IS NULL AND token IS NOT NULL;

-- Rows with neither form are unredeemable — remove instead of blocking the
-- NOT NULL below.
DELETE FROM public.password_reset_tokens WHERE token_sha256 IS NULL;

ALTER TABLE public.password_reset_tokens DROP COLUMN IF EXISTS token;
ALTER TABLE public.email_verification_tokens DROP COLUMN IF EXISTS token;

ALTER TABLE public.password_reset_tokens ALTER COLUMN token_sha256 SET NOT NULL;
