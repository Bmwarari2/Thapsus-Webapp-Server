-- 026_buy_for_me_quote_lifecycle.sql
-- Buy-for-me quote/accept/reject lifecycle additions.
--
-- Pre-existing schema (migration 001) used a status CHECK constraint with
-- {pending_quote, quoted, paid, purchased, received, shipped, cancelled} and
-- had no place to record why a customer rejected a quote. This migration:
--   1. Drops the legacy named CHECK so we can extend the enum with 'rejected'.
--   2. Adds customer_decision_reason (free text, used on accept/reject).
--   3. Adds quoted_at / decided_at audit columns so the operator can sort
--      the queue by "waited longest" and reporting can compute time-to-quote.
-- All steps are idempotent so a re-run on a partially-applied DB is safe.

-- 1. Replace status CHECK to include 'rejected'.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.buy_for_me_orders'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.buy_for_me_orders DROP CONSTRAINT %I', cname);
  END IF;
END$$;

ALTER TABLE public.buy_for_me_orders
  ADD CONSTRAINT buy_for_me_orders_status_check
  CHECK (status IN (
    'pending_quote','quoted','paid','purchased','received',
    'shipped','cancelled','rejected'
  ));

-- 2. Free-text reason supplied by the customer on accept/reject.
ALTER TABLE public.buy_for_me_orders
  ADD COLUMN IF NOT EXISTS customer_decision_reason TEXT;

-- 3. Lifecycle audit timestamps.
ALTER TABLE public.buy_for_me_orders
  ADD COLUMN IF NOT EXISTS quoted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ;
