-- 033_currency_check_constraints.sql
--
-- Audit P5.2: every currency column on the payments-era tables is plain
-- text with no CHECK. Live values are clean (verified via pg_stat: only
-- 'GBP' and 'KES' across all five columns), but a typo from a future
-- admin route or a migration shim could quietly land 'USD' / 'gbp' /
-- 'Ksh' rows that downstream invoice rendering can't make sense of.
--
-- This migration adds CHECK constraints on the five currency columns:
--
--   • customer_consolidations.invoice_currency  (default 'KES')
--   • payments.currency                          (default 'KES')
--   • fees.currency                              (default 'GBP')
--   • promotions.currency                        (default 'GBP')
--   • transactions.currency                      (nullable, default 'KES')
--
-- exchange_rates.currency_pair is deliberately NOT touched — it stores
-- a directional pair string (e.g. 'GBP_KES'), which is a different
-- shape and has its own normalisation upstream.
--
-- Idempotent: each ADD CONSTRAINT is wrapped in a DO block that checks
-- pg_constraint first and emits RAISE NOTICE on already-present rather
-- than failing. Constraint name pattern matches the live convention
-- (`<table>_currency_check`).
--
-- Backfill: none required — pg_stat showed only valid values. The
-- script does an explicit count beforehand and RAISE EXCEPTIONs if any
-- row would violate the new constraint, so a partially migrated
-- environment can't silently round-trip with bad data.

DO $$
DECLARE
  bad_rows int;
BEGIN
  SELECT COUNT(*) INTO bad_rows FROM customer_consolidations
   WHERE invoice_currency IS NOT NULL AND invoice_currency NOT IN ('GBP','KES');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'customer_consolidations.invoice_currency has % rows outside (GBP, KES). Fix before migrating.', bad_rows;
  END IF;

  SELECT COUNT(*) INTO bad_rows FROM payments
   WHERE currency IS NOT NULL AND currency NOT IN ('GBP','KES');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'payments.currency has % rows outside (GBP, KES). Fix before migrating.', bad_rows;
  END IF;

  SELECT COUNT(*) INTO bad_rows FROM fees
   WHERE currency IS NOT NULL AND currency NOT IN ('GBP','KES');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'fees.currency has % rows outside (GBP, KES). Fix before migrating.', bad_rows;
  END IF;

  SELECT COUNT(*) INTO bad_rows FROM promotions
   WHERE currency IS NOT NULL AND currency NOT IN ('GBP','KES');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'promotions.currency has % rows outside (GBP, KES). Fix before migrating.', bad_rows;
  END IF;

  SELECT COUNT(*) INTO bad_rows FROM transactions
   WHERE currency IS NOT NULL AND currency NOT IN ('GBP','KES');
  IF bad_rows > 0 THEN
    RAISE EXCEPTION 'transactions.currency has % rows outside (GBP, KES). Fix before migrating.', bad_rows;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'customer_consolidations'
      AND c.conname = 'customer_consolidations_invoice_currency_check'
  ) THEN
    ALTER TABLE customer_consolidations
      ADD CONSTRAINT customer_consolidations_invoice_currency_check
      CHECK (invoice_currency IS NULL OR invoice_currency IN ('GBP','KES'));
    RAISE NOTICE 'Added customer_consolidations_invoice_currency_check';
  ELSE
    RAISE NOTICE 'customer_consolidations_invoice_currency_check already present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'payments'
      AND c.conname = 'payments_currency_check'
  ) THEN
    ALTER TABLE payments
      ADD CONSTRAINT payments_currency_check
      CHECK (currency IN ('GBP','KES'));
    RAISE NOTICE 'Added payments_currency_check';
  ELSE
    RAISE NOTICE 'payments_currency_check already present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'fees'
      AND c.conname = 'fees_currency_check'
  ) THEN
    ALTER TABLE fees
      ADD CONSTRAINT fees_currency_check
      CHECK (currency IN ('GBP','KES'));
    RAISE NOTICE 'Added fees_currency_check';
  ELSE
    RAISE NOTICE 'fees_currency_check already present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'promotions'
      AND c.conname = 'promotions_currency_check'
  ) THEN
    ALTER TABLE promotions
      ADD CONSTRAINT promotions_currency_check
      CHECK (currency IN ('GBP','KES'));
    RAISE NOTICE 'Added promotions_currency_check';
  ELSE
    RAISE NOTICE 'promotions_currency_check already present';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
     JOIN pg_class rel ON rel.oid = c.conrelid
    WHERE rel.relname = 'transactions'
      AND c.conname = 'transactions_currency_check'
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_currency_check
      CHECK (currency IS NULL OR currency IN ('GBP','KES'));
    RAISE NOTICE 'Added transactions_currency_check';
  ELSE
    RAISE NOTICE 'transactions_currency_check already present';
  END IF;
END $$;
