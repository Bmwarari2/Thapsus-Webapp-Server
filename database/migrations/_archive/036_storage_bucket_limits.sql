-- 036_storage_bucket_limits.sql
--
-- Audit P6.3 (file-upload sanitisation): three of our four storage
-- buckets had no file_size_limit and none had allowed_mime_types
-- restricted. Without these, a caller with a valid signed-upload URL
-- can PUT arbitrary bytes (any size, any content-type) into the
-- bucket — which is fine in theory because the upload endpoints
-- already authenticate the caller and rate-limit (PR #98), but
-- defence-in-depth at the storage layer is essentially free.
--
-- Caps are intentionally generous so they don't break legitimate
-- captures (a high-resolution iPhone JPEG runs ~3-5 MB; the rider
-- POD signature is a few hundred KB; agent invoice PDFs scanned at
-- normal resolution are well under 10 MB):
--
--   parcels             5 MB,  image/jpeg only            (operator intake photo)
--   pods               10 MB,  image/jpeg + image/png     (POD photo + signature pad)
--   agent-invoices     10 MB,  application/pdf only       (clearing-agent invoice)
--   ticket-attachments 10 MB,  common image + pdf         (support attachment)
--
-- Idempotent: each UPDATE is a straight UPDATE on storage.buckets,
-- safe to re-run on every Railway boot.

UPDATE storage.buckets
   SET file_size_limit    = 5 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg']
 WHERE id = 'parcels';

UPDATE storage.buckets
   SET file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = ARRAY['image/jpeg', 'image/png']
 WHERE id = 'pods';

UPDATE storage.buckets
   SET file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = ARRAY['application/pdf']
 WHERE id = 'agent-invoices';

UPDATE storage.buckets
   SET file_size_limit    = 10 * 1024 * 1024,
       allowed_mime_types = ARRAY[
         'image/jpeg',
         'image/png',
         'image/heic',
         'image/heif',
         'application/pdf'
       ]
 WHERE id = 'ticket-attachments';
