-- ============================================================
-- Migration 006 — Sprint 1 v1.1 feature columns + buckets
--
-- Bundles four small additive schema changes that pair with iOS PRs:
--
--  1. customs_entries.doc_url (S1-12) — optional URL of the IDF / KRA
--     document the clearing agent attaches when filing the entry.
--
--  2. ticket_messages.attachment_url (S1-5) — optional photo / PDF
--     uploaded by the customer or admin when chatting on a ticket.
--
--  3. ticket-attachments storage bucket (S1-5) — private, served via
--     signed URLs minted by the new
--     POST /api/tickets/attachments/upload-url endpoint.
--
--  4. (No new column for delivery_address — already present on
--     public.users; the server just wasn't reading it on PUT
--     /api/auth/profile. That's wired in routes/auth.js, not here.)
--
-- Idempotent. Re-runnable on every Railway boot.
-- ============================================================

-- 1. customs_entries.doc_url
ALTER TABLE customs_entries
  ADD COLUMN IF NOT EXISTS doc_url TEXT;

-- 2. ticket_messages.attachment_url
ALTER TABLE ticket_messages
  ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- 3. ticket-attachments bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ticket-attachments', 'ticket-attachments', false)
ON CONFLICT (id) DO UPDATE SET public = false;
