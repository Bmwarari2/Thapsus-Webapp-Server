-- ============================================================
-- Migration 047 — explicit deny SELECT/DELETE on storage.objects
-- (audit F-14).
--
-- Currently storage.objects has only INSERT and UPDATE policies (for
-- the agent-invoices bucket via mig 023 + 025). SELECT and DELETE
-- default-deny via PostgREST anyway, but the absence of an explicit
-- policy makes it easy for a future operator to accidentally add a
-- permissive one (e.g. `FOR SELECT USING (true)`) without realising
-- they're opening up every signed-URL-only bucket to anon reads.
--
-- This migration adds a `false` SELECT and DELETE policy with a
-- descriptive name, so:
--   1. the intent is documented in pg_policies
--   2. anyone running `\d storage.objects` sees the deny is deliberate
--   3. an accidental permissive SELECT later on would have to drop or
--      override THIS named policy, prompting review
--
-- The policies cover all buckets currently in use (agent-invoices,
-- pods, ticket-attachments) — content access goes through signed URLs
-- minted by the server's service-role key, NOT through PostgREST RLS.
-- ============================================================

DROP POLICY IF EXISTS "storage objects deny anon select" ON storage.objects;
CREATE POLICY "storage objects deny anon select"
    ON storage.objects
    FOR SELECT
    TO anon, authenticated
    USING (false);

DROP POLICY IF EXISTS "storage objects deny anon delete" ON storage.objects;
CREATE POLICY "storage objects deny anon delete"
    ON storage.objects
    FOR DELETE
    TO anon, authenticated
    USING (false);

-- Note: INSERT + UPDATE policies for the agent-invoices bucket already
-- exist (mig 023 + 025) and are NOT affected. Service-role queries from
-- the Express backend bypass RLS entirely, so signed-URL minting and
-- presigned-PUT uploads continue to work unchanged.
