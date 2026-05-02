-- ============================================================
-- Migration 023 — pod_events path-only columns (B1)
--
-- Background
-- ----------
-- pod_events currently stores POD photos and signatures as full
-- URLs in `photo_url` / `signature_url`.  When the `pods` bucket
-- was provisioned (migration 015) it was created PRIVATE, so those
-- stored URLs are now meaningless to clients — a public-style URL
-- against a private bucket 400s on read.  The canonical pattern
-- (mirrors agent-invoices post-migration 005) is to store the
-- bucket-relative PATH and mint a short-lived signed URL on demand.
--
-- This migration:
--   • Adds `photo_path TEXT` and `signature_path TEXT` columns.
--   • Backfills them from the existing URL columns by stripping
--     everything up to and including `/pods/` so what remains is
--     the bucket-relative path.  Bare paths (no host) copy as-is.
--   • Leaves the legacy `photo_url` / `signature_url` columns in
--     place for now; routes/lastMile.js will fall back to extracting
--     a path from them during the rollout window.  A follow-up
--     migration next sprint will drop them.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, backfill is gated on the
-- new path column being NULL so re-runs are no-ops.
-- ============================================================

BEGIN;

ALTER TABLE public.pod_events
  ADD COLUMN IF NOT EXISTS photo_path     TEXT,
  ADD COLUMN IF NOT EXISTS signature_path TEXT;

-- Backfill photo_path from photo_url:
--   • If the URL contains '/storage/v1/object/.../pods/', everything
--     after that '/pods/' marker is the bucket-relative path.
--   • If the value is already a bare path (no '://'), copy as-is.
--   • Otherwise leave NULL — the URL is for a different bucket or
--     unparseable, and the route fallback will surface it as a 404.
UPDATE public.pod_events
   SET photo_path = CASE
     WHEN photo_url IS NULL OR photo_url = ''
       THEN NULL
     WHEN position('://' IN photo_url) = 0
       THEN photo_url
     WHEN photo_url LIKE '%/storage/v1/object/%/pods/%'
       THEN substring(photo_url FROM '/pods/(.*)$')
     ELSE NULL
   END
 WHERE photo_path IS NULL
   AND photo_url IS NOT NULL
   AND photo_url <> '';

-- Same shape for signature_path.
UPDATE public.pod_events
   SET signature_path = CASE
     WHEN signature_url IS NULL OR signature_url = ''
       THEN NULL
     WHEN position('://' IN signature_url) = 0
       THEN signature_url
     WHEN signature_url LIKE '%/storage/v1/object/%/pods/%'
       THEN substring(signature_url FROM '/pods/(.*)$')
     ELSE NULL
   END
 WHERE signature_path IS NULL
   AND signature_url IS NOT NULL
   AND signature_url <> '';

COMMIT;
