-- 001_retire_shipping_rates.sql
--
-- Option-1 work — kill the legacy `shipping_rates` per-market table.
-- The new pricing model already uses `pricing_settings.base_shipping_per_kg`
-- (seeded in migration 051). After this migration, the engine reads
-- only that single global value.
--
-- Pair with the matching code PR that drops:
--   - routes/pricing.js  GET/PUT /api/pricing/rates
--   - routes/admin.js    GET/PUT /api/admin/shipping-rates
--   - utils/pricing.js   DEFAULT_RATES_GBP + rates_gbp override
--   - client ShippingRatesPanel + pricingApi.getRates +
--                       adminApi.getShippingRates/setShippingRates
--
-- Apply manually in Supabase SQL Editor. Do not place this file under
-- database/migrations/ — that directory's auto-runner is disabled but
-- this is also kept here for clarity-of-purpose.

BEGIN;

-- 1. Drop the legacy per-market rates table. No FKs depend on it.
DROP TABLE IF EXISTS shipping_rates;

-- 2. Set the canonical UK per-kg rate. £9 was the value the web UI
--    was advertising via shipping_rates pre-strip; pricing_settings
--    had been seeded at £8 in migration 051. This UPDATE brings the
--    two into alignment after the strip.
UPDATE pricing_settings
   SET base_shipping_per_kg = 9
 WHERE base_shipping_per_kg IS DISTINCT FROM 9;

COMMIT;
