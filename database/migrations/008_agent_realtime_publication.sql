-- Migration 008 — agent realtime publication (audit S2-5).
--
-- The Supabase Realtime publication `supabase_realtime` controls which
-- tables emit Postgres-changes events to subscribers. Subscribing to a
-- table that's NOT in the publication is a silent failure — the channel
-- joins fine but never receives a row. The 2026-04-30 audit found three
-- agent-flow tables that iOS reads heavily but were missing from the
-- publication, and one customer-flow bug (`orders` itself).
--
-- Tables added:
--   • orders            — customer order list realtime (was silently dead)
--   • agent_invoices    — agent invoice list live status flips
--   • customs_entries   — agent customs status progression live
--   • pallets           — operator pallet load-in live updates
--
-- Idempotent: `ALTER PUBLICATION ... ADD TABLE IF NOT EXISTS` doesn't
-- exist in Postgres 15, so we check pg_publication_tables first.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY['orders','agent_invoices','customs_entries','pallets']) LOOP
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
