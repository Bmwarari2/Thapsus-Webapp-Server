-- ============================================================
-- Seed the `pricing_tiers` table with the Tudor Freight UK_air
-- rate card. Mirrors the inserts at the bottom of migration 001
-- but is safe to run on its own — every INSERT is gated by a
-- NOT EXISTS guard, so re-running is a no-op.
--
-- Symptom this fixes:
--   GET /api/pricing-tiers/tiers → {"success":true,"tiers":[]}
--   iOS calculator: "Couldn't price — No pricing tiers available."
-- ============================================================

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
