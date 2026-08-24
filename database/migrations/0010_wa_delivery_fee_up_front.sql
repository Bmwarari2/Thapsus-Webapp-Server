-- 0010_wa_delivery_fee_up_front.sql — charge last-mile with the order.
--
-- ⚠ DEPLOY ORDER: apply BEFORE the code. routes/waOrders.js writes
-- delivery_method and delivery_fee_in_quote on every quote, so the
-- INSERT/UPDATE names columns that must already exist.
--
-- The last-mile fee used to be collected on arrival: the parcel landed,
-- the order went to 'delivery_fee_pending', and the customer was asked
-- for a second payment two to three weeks after the first. That is a
-- second chance to lose the money, and it arrives long after the
-- customer has stopped thinking about the order.
--
-- The fee is now quoted and paid with the order. It applies to delivery
-- and not to collection, so an order has to record which the customer
-- chose:
--
--   delivery_method       'delivery' | 'collection', per order — a
--                         customer may collect one parcel and have the
--                         next one delivered.
--   delivery_fee_in_quote whether quote_kes already includes the fee.
--                         Recorded rather than inferred: an order quoted
--                         before this change has a fee of NULL and owes
--                         it on arrival, and nothing about the row size
--                         distinguishes that from a collection order.
--
-- The contact-level preference is what the assistant learns during
-- signup ("I'll collect from town"), and only seeds the operator's
-- default at quote time. The order's own value is what bills.
--
-- Nothing is backfilled. In-flight orders keep the arrival-fee flow
-- they were quoted under, which is the only honest thing to do — the
-- customer agreed to a total that did not include the fee.

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS delivery_method text,
  ADD COLUMN IF NOT EXISTS delivery_fee_in_quote boolean DEFAULT false NOT NULL;

ALTER TABLE public.wa_contacts
  ADD COLUMN IF NOT EXISTS delivery_preference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wa_orders_delivery_method_check'
  ) THEN
    ALTER TABLE public.wa_orders
      ADD CONSTRAINT wa_orders_delivery_method_check
      CHECK (delivery_method IS NULL OR delivery_method IN ('delivery', 'collection'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'wa_contacts_delivery_preference_check'
  ) THEN
    ALTER TABLE public.wa_contacts
      ADD CONSTRAINT wa_contacts_delivery_preference_check
      CHECK (delivery_preference IS NULL OR delivery_preference IN ('delivery', 'collection'));
  END IF;
END $$;

COMMENT ON COLUMN public.wa_orders.delivery_method IS
  'delivery | collection — decides whether the last-mile fee is charged.';
COMMENT ON COLUMN public.wa_orders.delivery_fee_in_quote IS
  'True when quote_kes already includes delivery_fee_kes, so no fee is requested on arrival.';
COMMENT ON COLUMN public.wa_contacts.delivery_preference IS
  'What the customer said at signup. Seeds the operator default; the order column bills.';
