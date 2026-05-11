-- 052_drop_market_column.sql
--
-- UK-only migration, final DB step.
--
-- Drops the `orders.market` column entirely (was CHECK IN ('UK','China')),
-- retires the USA + China rows in `retailers`, tightens the
-- `retailers.country` CHECK to UK-only, and deletes the
-- `pricing_tiers` rows for the China_air channel.
--
-- This migration is destructive and is intended to run only against
-- a dev/test database — there is no back-fill of historical China
-- orders. If you find production rows with `market='China'`, abort
-- this migration and back-fill first.
--
-- Sequencing assumption: web (PR #202) and iOS (PR #57) are already
-- on prod and no client sends `market: 'China'` anymore. The
-- Express routes get tightened in the same PR as this migration
-- so the validator and the schema can never disagree.

BEGIN;

-- Safety check: refuse to run if any production-looking rows still
-- carry market='China'. Dev/test has only synthetic orders so this
-- should be 0. A non-zero count aborts the transaction.
DO $$
DECLARE
  china_count integer;
BEGIN
  SELECT count(*) INTO china_count FROM orders WHERE market = 'China';
  IF china_count > 50 THEN
    RAISE EXCEPTION 'Aborting migration 052: % orders still have market=''China''. '
                    'Back-fill to ''UK'' or DELETE before running this migration.',
                    china_count;
  END IF;
END $$;

-- 1. Wipe the synthetic China orders. Cascade through packages,
--    payments, etc. via existing FKs.
DELETE FROM orders WHERE market = 'China';

-- 2. Drop the column. The inline CHECK constraint goes with it.
ALTER TABLE orders DROP COLUMN market;

-- 3. Retailers: clear non-UK seed rows, then tighten the country
--    CHECK. The constraint was created inline in migration 029 with
--    the default name; DROP IF EXISTS keeps this idempotent.
DELETE FROM retailers WHERE country IN ('USA','China');
ALTER TABLE retailers DROP CONSTRAINT IF EXISTS retailers_country_check;
ALTER TABLE retailers ADD CONSTRAINT retailers_country_check
  CHECK (country IN ('UK','Other'));

-- 4. pricing_tiers: the four China_air placeholder rows from
--    001a_seed_pricing_tiers.sql. The QuoteEngine no longer reads
--    pricing_tiers (replaced by pricing_settings in mig 051) but
--    DROP for tidiness so an admin browsing the table doesn't see
--    a defunct market.
DELETE FROM pricing_tiers WHERE channel = 'China_air';

COMMIT;
