-- ============================================================
-- Seed the `pricing_tiers` table with the Tudor Freight UK_air
-- rate card. Mirrors the inserts at the bottom of migration 001
-- but is safe to run on its own — every INSERT is gated by a
-- NOT EXISTS guard, so re-running is a no-op.
--
-- Symptoms this fixes:
--   GET /api/pricing-tiers/tiers → {"success":true,"tiers":[]}
--   iOS calculator: "Couldn't price — No pricing tiers available."
--   Or, on a DB that still carries the legacy gbp_per_kg_pence
--   column with NOT NULL:
--     ERROR: 23502: null value in column "gbp_per_kg_pence" of
--     relation "pricing_tiers" violates not-null constraint
--
-- The legacy `gbp_per_kg_pence` (Long) was renamed to `gbp_per_kg`
-- (Double, full GBP) during the Phase 4 schema bridge. The webapp
-- API and iOS DTOs only use `gbp_per_kg` now, so this script first
-- removes the NOT NULL on the legacy column and backfills it from
-- the new column for any rows already present, then drops it.
-- ============================================================

-- ── 1. Migrate away from the legacy `gbp_per_kg_pence` column ──
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'pricing_tiers'
       AND column_name  = 'gbp_per_kg_pence'
  ) THEN
    -- Drop the NOT NULL so existing rows can stay during the migration.
    ALTER TABLE public.pricing_tiers
      ALTER COLUMN gbp_per_kg_pence DROP NOT NULL;

    -- Backfill the new column from the legacy one for rows that have
    -- a pence value but no full-GBP value.
    UPDATE public.pricing_tiers
       SET gbp_per_kg = gbp_per_kg_pence / 100.0
     WHERE gbp_per_kg IS NULL
       AND gbp_per_kg_pence IS NOT NULL;

    -- Drop the legacy column entirely. The API and iOS no longer
    -- reference it — nothing reads from it anymore.
    ALTER TABLE public.pricing_tiers
      DROP COLUMN IF EXISTS gbp_per_kg_pence;
  END IF;
END $$;

-- Make sure the new column is at least non-null going forward.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name   = 'pricing_tiers'
       AND column_name  = 'gbp_per_kg'
  ) THEN
    ALTER TABLE public.pricing_tiers
      ALTER COLUMN gbp_per_kg SET NOT NULL;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    -- Some rows still null; leave nullable for now. Seed below populates them.
    NULL;
END $$;

-- ── 2. Seed the Tudor Freight rate card ──
-- UK air freight (the channel iOS picks by default).
INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-uk-air-001', 'UK_air', 0,   5,  14.00, TRUE, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=0);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-uk-air-002', 'UK_air', 5,  10,  12.00, TRUE, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=5);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-uk-air-003', 'UK_air', 10, 25,  10.00, TRUE, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=10);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-uk-air-004', 'UK_air', 25, 100,  9.00, TRUE, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=25);

-- China air (placeholder — adjust gbp_per_kg once Tudor confirms).
INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-cn-air-001', 'China_air', 0,   5,  16.00, TRUE, 'China rate placeholder'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='China_air' AND min_kg=0);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-cn-air-002', 'China_air', 5,  10,  14.00, TRUE, 'China rate placeholder'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='China_air' AND min_kg=5);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-cn-air-003', 'China_air', 10, 25,  12.00, TRUE, 'China rate placeholder'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='China_air' AND min_kg=10);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-cn-air-004', 'China_air', 25, 100, 11.00, TRUE, 'China rate placeholder'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='China_air' AND min_kg=25);

-- UK sea (slow boat — used for bulky non-urgent goods).
INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, is_active, notes)
SELECT 'pt-uk-sea-001', 'UK_sea', 0,   100, 6.00, TRUE, 'UK sea rate placeholder'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_sea');

-- Sanity check — drop into Supabase SQL Editor's results pane after running.
SELECT channel, min_kg, max_kg, gbp_per_kg, is_active
  FROM pricing_tiers
 ORDER BY channel, min_kg;
