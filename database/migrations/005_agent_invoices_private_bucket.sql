-- ============================================================
-- Migration 005 — privatise the agent-invoices storage bucket
--
-- Audit finding §1.2 / S-1: agent-invoices PDFs (KES amounts, IDF numbers,
-- agent identity) were sitting in a PUBLIC bucket with guessable URLs:
--
--   https://<ref>.supabase.co/storage/v1/object/public/agent-invoices/<agentId>/<ts>.pdf
--
-- Anyone with the URL could read them. This migration flips the bucket
-- private. Reads now go through Express's GET /agent-invoices/:id/
-- document-url which returns a 5-minute signed URL via the service role.
-- Uploads go through POST /agent-invoices/upload-url which mints a signed
-- upload URL (no Supabase JWT required at the upload site itself).
--
-- Idempotent: UPDATE is a no-op once public is already false.
-- ============================================================

UPDATE storage.buckets
   SET public = false
 WHERE id = 'agent-invoices';
