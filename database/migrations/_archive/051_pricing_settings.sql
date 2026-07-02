-- ============================================================
-- 051_pricing_settings.sql — simplified six-knob pricing model.
--
-- Introduces three new tables backing the admin-editable pricing
-- model and seeds them with the current hardcoded values in
-- utils/pricing.js so the calculator behaviour does not change
-- the moment this migration lands.
--
-- Tables
--   pricing_settings  key/value tunables (base_shipping_per_kg,
--                     base_handling_fee, card_processing_pct, dim_divisor)
--   customs_tiers     per-tier duty/VAT/IDF/RDL bands (replaces the
--                     HS_TIERS constant in utils/pricing.js)
--   hs_code_tiers     HS-code-prefix → tier mapping (longest-prefix
--                     match resolves an item to a customs tier)
--
-- Also formalises the existing electronics_fees table (created
-- lazily by PUT /api/pricing/electronics) with the extra columns
-- (label, min_weight_kg, is_active) the UI needs.
--
-- The legacy shipping_rates rows are LEFT IN PLACE — the move
-- from per-market £/kg to a single base_shipping_per_kg is a
-- behaviour change, not a schema drop. Keeping the rows lets us
-- roll back without losing data.
-- ============================================================

-- ── 1. pricing_settings (the four tunables) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_settings (
  key         TEXT PRIMARY KEY,
  value       NUMERIC(12,4) NOT NULL,
  currency    VARCHAR(3),                      -- 'GBP' or NULL for % / unitless
  is_percent  BOOLEAN      NOT NULL DEFAULT FALSE,
  label       TEXT,
  notes       TEXT,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed only when missing — re-running this migration must be a no-op.
INSERT INTO pricing_settings (key, value, currency, is_percent, label, notes)
SELECT 'base_shipping_per_kg', 8.0000, 'GBP', FALSE,
       'Base shipping (£ per kg)',
       'Applied to the chargeable weight = max(actual_kg, vol_kg). Replaces the per-market rates in shipping_rates.'
WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE key = 'base_shipping_per_kg');

INSERT INTO pricing_settings (key, value, currency, is_percent, label, notes)
SELECT 'base_handling_fee', 3.0000, 'GBP', FALSE,
       'Base handling fee (flat £)',
       'Single flat handling fee per order. Replaces max(£3, 0.5 × kg).'
WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE key = 'base_handling_fee');

INSERT INTO pricing_settings (key, value, currency, is_percent, label, notes)
SELECT 'card_processing_pct', 0.0000, NULL, TRUE,
       'Card processing surcharge (%)',
       'Multiplied by the FULL subtotal (shipping + handling + special + customs_est). Stored as a fraction, e.g. 0.03 for 3%.'
WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE key = 'card_processing_pct');

INSERT INTO pricing_settings (key, value, currency, is_percent, label, notes)
SELECT 'dim_divisor', 5000.0000, NULL, FALSE,
       'Volumetric divisor',
       'Used to compute vol_kg = (L × W × H) / divisor. 5000 = courier convention; 6000 = IATA.'
WHERE NOT EXISTS (SELECT 1 FROM pricing_settings WHERE key = 'dim_divisor');


-- ── 2. customs_tiers (replaces the HS_TIERS constant) ───────────────────────
CREATE TABLE IF NOT EXISTS customs_tiers (
  tier_key    VARCHAR(50) PRIMARY KEY,
  label       TEXT        NOT NULL,
  duty_pct    NUMERIC(6,4) NOT NULL,
  vat_pct     NUMERIC(6,4) NOT NULL DEFAULT 0.16,
  idf_pct     NUMERIC(6,4) NOT NULL DEFAULT 0.035,
  rdl_pct     NUMERIC(6,4) NOT NULL DEFAULT 0.02,
  notes       TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed from the existing HS_TIERS constant in utils/pricing.js.
-- Numbers are KRA 2024 EAC CET bands; admin can adjust live afterwards.
INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'general', 'General goods (default)', 0.2500, 0.16,
       'Default 25% duty band — most clothing, footwear, toys, household goods.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'general');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'electronics', 'Consumer electronics', 0.0000, 0.16,
       'Phones, laptops, screens — duty-free at 0% but 16% VAT still applies.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'electronics');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'clothing_textiles', 'Clothing & textiles', 0.2500, 0.16,
       'Apparel, footwear, fabric — 25% duty band.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'clothing_textiles');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'food_processed', 'Processed food / supplements', 0.3500, 0.16,
       'Sensitive list — 35% duty band.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'food_processed');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'raw_materials', 'Raw materials / inputs', 0.0000, 0.16,
       'Industrial inputs and raw materials — 0% duty.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'raw_materials');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'books_media', 'Books / printed media', 0.0000, 0.0000,
       'Books, journals — 0% duty AND zero-rated for VAT.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'books_media');

INSERT INTO customs_tiers (tier_key, label, duty_pct, vat_pct, notes)
SELECT 'zero_rated', 'Zero-rated (medical / exempt)', 0.0000, 0.0000,
       'Medical supplies and other gazetted exemptions — 0% duty, 0% VAT.'
WHERE NOT EXISTS (SELECT 1 FROM customs_tiers WHERE tier_key = 'zero_rated');


-- ── 3. hs_code_tiers (prefix → tier map; longest prefix wins) ──────────────
CREATE TABLE IF NOT EXISTS hs_code_tiers (
  hs_prefix   VARCHAR(10) PRIMARY KEY,
  tier_key    VARCHAR(50) NOT NULL REFERENCES customs_tiers(tier_key) ON DELETE RESTRICT,
  notes       TEXT,
  updated_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Starter map. Only the high-frequency categories Thapsus ships day-to-day —
-- admin can extend via PUT /api/pricing/hs-codes. Items whose hs_code does
-- not match any prefix fall back to the 'general' tier.
INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '8517', 'electronics', 'Phones, smartphones, networking gear (HS Chapter 85.17)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '8517');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '8471', 'electronics', 'Automatic data-processing machines (laptops, desktops)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '8471');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '8528', 'electronics', 'Monitors, projectors, television receivers'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '8528');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '6109', 'clothing_textiles', 'T-shirts, singlets, vests (HS 61.09)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '6109');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '6203', 'clothing_textiles', 'Men''s suits, trousers (HS 62.03)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '6203');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '6204', 'clothing_textiles', 'Women''s suits, dresses (HS 62.04)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '6204');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '6403', 'clothing_textiles', 'Footwear with leather uppers (HS 64.03)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '6403');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '4901', 'books_media', 'Printed books, brochures (HS 49.01)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '4901');

INSERT INTO hs_code_tiers (hs_prefix, tier_key, notes)
SELECT '3004', 'zero_rated', 'Medicaments packaged for retail sale (HS 30.04)'
WHERE NOT EXISTS (SELECT 1 FROM hs_code_tiers WHERE hs_prefix = '3004');


-- ── 4. electronics_fees — formalise the lazily-created table ───────────────
-- routes/pricing.js's PUT /electronics creates this with only (item_key, fee_gbp,
-- updated_by, updated_at). Add label + min_weight_kg + is_active so the UI can
-- render and CRUD it like the rest of the pricing model.
CREATE TABLE IF NOT EXISTS electronics_fees (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key    VARCHAR(50) NOT NULL UNIQUE,
  fee_gbp     NUMERIC(10,2) NOT NULL,
  updated_by  UUID,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE electronics_fees ADD COLUMN IF NOT EXISTS label         TEXT;
ALTER TABLE electronics_fees ADD COLUMN IF NOT EXISTS min_weight_kg NUMERIC(6,2) NOT NULL DEFAULT 0;
ALTER TABLE electronics_fees ADD COLUMN IF NOT EXISTS is_active     BOOLEAN      NOT NULL DEFAULT TRUE;

-- Seed the three defaults from ELECTRONICS_HANDLING in utils/pricing.js.
-- Existing rows (created by older PUTs) keep their fee_gbp and just gain
-- the new metadata columns via UPDATE.
INSERT INTO electronics_fees (item_key, fee_gbp, label, min_weight_kg)
SELECT 'phone', 75.00, 'Phone', 1
WHERE NOT EXISTS (SELECT 1 FROM electronics_fees WHERE item_key = 'phone');

INSERT INTO electronics_fees (item_key, fee_gbp, label, min_weight_kg)
SELECT 'laptop', 65.00, 'Laptop / Accessories', 1
WHERE NOT EXISTS (SELECT 1 FROM electronics_fees WHERE item_key = 'laptop');

INSERT INTO electronics_fees (item_key, fee_gbp, label, min_weight_kg)
SELECT 'tv_monitor', 65.00, 'TV / Screen / Monitor', 1
WHERE NOT EXISTS (SELECT 1 FROM electronics_fees WHERE item_key = 'tv_monitor');

-- Backfill label for any pre-existing rows that arrived via the lazy
-- table-creation path (no label column).
UPDATE electronics_fees SET label = 'Phone'                  WHERE item_key = 'phone'      AND label IS NULL;
UPDATE electronics_fees SET label = 'Laptop / Accessories'   WHERE item_key = 'laptop'     AND label IS NULL;
UPDATE electronics_fees SET label = 'TV / Screen / Monitor'  WHERE item_key = 'tv_monitor' AND label IS NULL;
