-- ============================================================
-- Migration 015 — provision the `pods` storage bucket (D19)
--
-- The rider POD flow PUTs photos + signatures via signed-upload
-- URLs minted by POST /api/last-mile/pod/upload-url.  Without the
-- bucket existing on the Supabase project the endpoint 500s with
-- `StorageApiError: The related resource does not exist`.
--
-- Provisions the bucket as PRIVATE from day one (mirrors the
-- post-PR-#35 stance for agent-invoices).  Reads go through a
-- short-lived signed URL minted by the server; uploads go through
-- the signed-upload URL flow added in PR #47.
--
-- Layout inside the bucket:
--   pod/<parcel_id>/<ts>.jpg          ← POD capture photo
--   signatures/<parcel_id>/<ts>.png   ← recipient signature pad
--
-- Idempotent: ON CONFLICT DO UPDATE keeps the desired flags
-- regardless of any prior partial provision.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('pods', 'pods', false, 10 * 1024 * 1024)
ON CONFLICT (id) DO UPDATE
   SET public = EXCLUDED.public,
       file_size_limit = EXCLUDED.file_size_limit;
