-- 0011_wa_collected_status.sql — a collected parcel was never dispatched.
--
-- ⚠ DEPLOY ORDER: apply BEFORE the code. The advance endpoint writes
-- status = 'collected', which the CHECK constraint must already allow.
--
-- Collection customers come to the CBD office. Nothing is dispatched and
-- no rider calls, but the pipeline had one path out of 'in_kenya' —
-- dispatched, then delivered — so TRK-8831 was told it was "ready to
-- collect at Stanbank House", and seventeen seconds later that it was
-- "out for delivery to your address" and a rider would call. Both
-- messages were true of the status and false of the parcel.
--
-- 'collected' is that missing terminal state. It is reached from
-- 'in_kenya' (and from 'delivery_fee_pending', for a collection order
-- quoted before the fee moved into the quote), and it goes nowhere.
--
-- The timestamp reuses delivered_at rather than adding a column: it
-- means "the customer has it", which is exactly as true of a parcel
-- picked up over the counter as one handed over at a door, and every
-- reader of that column — receipts, tracking replies — stays correct
-- without knowing about this.

ALTER TABLE public.wa_orders DROP CONSTRAINT IF EXISTS wa_orders_status_check;

ALTER TABLE public.wa_orders
  ADD CONSTRAINT wa_orders_status_check CHECK ((status = ANY (ARRAY[
      'quoting'::text, 'quoted'::text, 'confirmed'::text, 'paid'::text,
      'purchased'::text, 'in_kenya'::text, 'delivery_fee_pending'::text,
      'dispatched'::text, 'delivered'::text, 'collected'::text,
      'cancelled'::text])));

-- Nothing is backfilled. TRK-8831 really was walked through dispatch and
-- delivery, and rewriting that history would hide the bug rather than
-- record it. New collection orders take the new path.
