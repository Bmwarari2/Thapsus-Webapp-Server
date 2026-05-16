-- 002_account_deletion_requests.sql
--
-- Customer-initiated account deletion with a 14-day cooldown window
-- (Spec: data-rights addendum, 2026-05-16). One active request per
-- user (partial unique index); the HTML data export is generated on
-- request, uploaded to Supabase Storage, the signed URL is recorded
-- here and emailed to the customer. A daily cron job (utils/
-- accountDeletionRunner.js) hard-deletes the user (FK CASCADE) at
-- scheduled_deletion_at and stamps completed_at.
--
-- Apply by hand in Supabase per database/manual-migrations/README.md.
-- This file is idempotent — `IF NOT EXISTS` everywhere — so reruns
-- against an environment that already has the table are a no-op.

CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- users.id is stored as TEXT in this database (Express side mints
  -- uuidv4 strings), so the FK has to be TEXT too — Postgres rejects
  -- a uuid→text FK with "incompatible types".
  user_id               TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_deletion_at TIMESTAMPTZ NOT NULL,
  cancelled_at          TIMESTAMPTZ,
  cancel_reason         TEXT,
  completed_at          TIMESTAMPTZ,
  export_storage_path   TEXT,        -- {bucket}/{user_id}/{request_id}.html
  export_signed_url     TEXT,        -- last-issued signed URL (refreshed on request)
  export_url_expires_at TIMESTAMPTZ,
  export_generated_at   TIMESTAMPTZ,
  export_emailed_at     TIMESTAMPTZ
);

-- One ACTIVE request per user. Re-requesting after a cancellation or
-- after a (failed) completion is allowed because we filter by both
-- columns being NULL.
CREATE UNIQUE INDEX IF NOT EXISTS account_deletion_requests_active_uniq
  ON public.account_deletion_requests (user_id)
  WHERE cancelled_at IS NULL AND completed_at IS NULL;

-- Speeds up the daily runner's "due rows" sweep.
CREATE INDEX IF NOT EXISTS account_deletion_requests_due_idx
  ON public.account_deletion_requests (scheduled_deletion_at)
  WHERE cancelled_at IS NULL AND completed_at IS NULL;

-- RLS — the customer's PostgREST realtime channel needs SELECT on
-- their own row only. All writes go through Express (service role,
-- bypassing RLS) so we don't need INSERT/UPDATE/DELETE policies.
ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_deletion_requests_self_select ON public.account_deletion_requests;
CREATE POLICY account_deletion_requests_self_select
  ON public.account_deletion_requests
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid()::text);
