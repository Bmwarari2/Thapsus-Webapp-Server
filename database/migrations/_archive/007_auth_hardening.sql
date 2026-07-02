-- Migration 007 — Supabase auth hardening (audit S2-7).
--
-- Closes the Supabase database linter warnings flagged by the 2026-04-30
-- audit pass:
--   • 0028 / 0029 anon|authenticated_security_definer_function_executable
--     for `is_thapsus_admin()` / `is_thapsus_staff()`.
--   • 0008 rls_enabled_no_policy for `revoked_tokens` + `password_reset_tokens`.
--
-- Why SECURITY INVOKER is safe here:
--   Both functions look up the calling user's own row in `public.users` via
--   `(auth.jwt()->>'sub')::text`. The `users` table RLS policy
--   `self_or_staff` already permits a user to read their own row, so the
--   function returns the same result whether it runs as the owner or the
--   caller. Switching to INVOKER removes the "elevated function callable
--   via /rest/v1/rpc" risk that the SECURITY DEFINER linter is flagging.
--
-- Why a deny-all policy on the token tables:
--   Both tables are server-internal: `revoked_tokens` is written by the
--   /api/auth/logout middleware and read by the JWT verifier;
--   `password_reset_tokens` is written by the reset-email hook and consumed
--   by the reset endpoint. service_role bypasses RLS, so all server traffic
--   continues to work; we add an explicit `using (false)` permissive policy
--   so direct PostgREST reads from anon/authenticated return 0 rows
--   instead of erroring with "no policy" + clears the linter warning.

ALTER FUNCTION public.is_thapsus_admin() SECURITY INVOKER;
ALTER FUNCTION public.is_thapsus_staff() SECURITY INVOKER;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'revoked_tokens' AND relnamespace = 'public'::regnamespace) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy
             WHERE polname = 'no_user_access'
               AND polrelid = 'public.revoked_tokens'::regclass
        ) THEN
            EXECUTE 'CREATE POLICY no_user_access ON public.revoked_tokens FOR ALL USING (false)';
        END IF;
    END IF;
END $$;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'password_reset_tokens' AND relnamespace = 'public'::regnamespace) THEN
        IF NOT EXISTS (
            SELECT 1 FROM pg_policy
             WHERE polname = 'no_user_access'
               AND polrelid = 'public.password_reset_tokens'::regclass
        ) THEN
            EXECUTE 'CREATE POLICY no_user_access ON public.password_reset_tokens FOR ALL USING (false)';
        END IF;
    END IF;
END $$;
