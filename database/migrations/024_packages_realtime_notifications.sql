-- Migration 024 — add packages + notifications to supabase_realtime
--
-- The May 2026 lifecycle audit found that iOS only had a live realtime
-- channel for `orders`. Status flips on `packages` (operator intake,
-- consolidation, dispatch, POD) reached the local cache only after the
-- next pull-to-refresh, so an operator on one device couldn't see
-- another operator's intake immediately and the customer's tracking
-- card showed a stale package row even after orders.status flipped.
--
-- `notifications` joins the publication too: the new
-- utils/parcelStatusNotify.js fan-out helper inserts in-app rows at
-- every lifecycle stage, and the iOS NotificationInbox can only
-- surface them in real time if the publication emits the inserts.
--
-- Idempotent — same pattern as migration 008.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['packages','notifications']) LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
             WHERE pubname = 'supabase_realtime'
               AND schemaname = 'public'
               AND tablename = t
        ) AND EXISTS (
            SELECT 1 FROM pg_class
             WHERE relname = t
               AND relnamespace = 'public'::regnamespace
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;
