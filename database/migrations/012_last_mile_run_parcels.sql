-- ============================================================
-- Migration 012 — last_mile_run_parcels join table (D7)
--
-- Replaces the parcel↔run encoding that previously lived in
-- `last_mile_runs.notes -> 'planned_parcels'` JSON with a real
-- relational join table.
--
-- Why move:
--   • The JSON blob has no FK, so a typo or stale UI could write
--     a non-existent parcel id and the failure surfaced only at
--     run-activation time inside a transaction.
--   • PATCH /runs/:id accepted `notes` as a generic string,
--     letting an operator clobber `planned_parcels` accidentally.
--   • `total_stops` was frozen at create time; if PATCH ever
--     edited the JSON, completion math drifted.
--   • Deduping a parcel across active runs required a JSON
--     LATERAL probe instead of a normal index lookup.
--
-- Run order:
--   ... migrations 002 / 003 / 003a / 009 / 010 / 011 …
--   012_last_mile_run_parcels.sql                   ← THIS FILE
--
-- The legacy `last_mile_runs.notes` column stays — operators may
-- still leave free-form notes there. Only `planned_parcels` moves.
-- Backfills any pre-existing JSON; idempotent and safe to re-run.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.last_mile_run_parcels (
  run_id                     UUID NOT NULL REFERENCES public.last_mile_runs(id) ON DELETE CASCADE,
  parcel_id                  TEXT NOT NULL REFERENCES public.orders(id)         ON DELETE CASCADE,
  position                   INT  NOT NULL,
  delivery_address_override  TEXT,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (run_id, parcel_id)
);

CREATE INDEX IF NOT EXISTS idx_last_mile_run_parcels_parcel_id
  ON public.last_mile_run_parcels (parcel_id);

CREATE INDEX IF NOT EXISTS idx_last_mile_run_parcels_run_id_position
  ON public.last_mile_run_parcels (run_id, position);

-- Backfill any existing JSON on legacy installs. Empty on the
-- production DB at the time this migration was authored, but
-- clones / staging may carry runs from before the table existed.
INSERT INTO public.last_mile_run_parcels (run_id, parcel_id, position)
SELECT r.id,
       p.parcel_id,
       (p.ord - 1)::int AS position
  FROM public.last_mile_runs r
  CROSS JOIN LATERAL jsonb_array_elements_text(
    COALESCE((r.notes::jsonb)->'planned_parcels', '[]'::jsonb)
  ) WITH ORDINALITY AS p(parcel_id, ord)
 WHERE EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p.parcel_id)
ON CONFLICT (run_id, parcel_id) DO NOTHING;

-- RLS: Node API uses the service role (bypasses RLS), so we mirror
-- the lock-down used on pod_otps / agent invoices.
ALTER TABLE public.last_mile_run_parcels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.last_mile_run_parcels FORCE ROW LEVEL SECURITY;

COMMIT;
