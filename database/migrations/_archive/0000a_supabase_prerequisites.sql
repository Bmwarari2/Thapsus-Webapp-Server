-- Migration 0000a — Supabase prerequisites (helper predicates + auth_otps)
--
-- These objects existed on the live database but were created out-of-band by
-- `server-patch-*` migrations that are recorded in the `_migrations` ledger yet
-- were never present in this directory. That made the migration set
-- non-hermetic: `007_auth_hardening.sql` ALTERs `is_thapsus_admin()` /
-- `is_thapsus_staff()`, and many RLS policies call them, but nothing here
-- created them — so a fresh database could not be provisioned from
-- `database/migrations/` alone. Migration 058 likewise references `auth_otps`.
--
-- This file codifies the exact live definitions so a clean provision works. It
-- is ordered right after `0000_baseline_schema.sql` (filename sorts before
-- `001_*`) and before `007_*`, i.e. before anything that depends on them.
-- Every statement is idempotent; the functions use CREATE OR REPLACE with the
-- verbatim live bodies, so re-applying against the live project is a no-op.
--
-- Depends on: Supabase's `auth.jwt()` and `request.jwt.claims` GUC (present on
-- every Supabase project). The Express backend uses the service-role pool and
-- does not call these predicates; they exist for the PostgREST/RLS surface.

-- ── Caller identity + role predicates ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.current_user_id()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_thapsus_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'app_role',
    ''
  ) = 'admin';
$function$;

CREATE OR REPLACE FUNCTION public.is_thapsus_staff()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'app_role',
    ''
  ) IN ('admin','operator','clearing_agent','rider');
$function$;

-- ── auth_otps (login 2FA one-time codes) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.auth_otps (
  id          text        NOT NULL PRIMARY KEY,
  user_id     text        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  code_hash   bytea       NOT NULL,
  purpose     text        NOT NULL DEFAULT 'login_2fa',
  expires_at  timestamptz NOT NULL,
  consumed    boolean     NOT NULL DEFAULT false,
  attempts    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_auth_otps_user_id    ON public.auth_otps (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_otps_expires_at ON public.auth_otps (expires_at);

-- Server-only table: RLS on, deny-by-default (explicit deny policy is added by
-- migration 058). The service-role pool bypasses RLS.
ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;
