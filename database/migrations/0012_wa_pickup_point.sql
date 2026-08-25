-- 0012_wa_pickup_point.sql — the team chooses the Pickup Mtaani agent.
--
-- ⚠ DEPLOY ORDER: apply BEFORE the code. The order endpoint writes
-- pickup_point, so the column must already exist.
--
-- A customer asked whether we had a point in Hurlingham and the
-- assistant answered "yes, we deliver to Pickup Mtaani points in
-- Hurlingham for KSh 300". It happened to be true — Hurlingham is on
-- the agent list, agent BU.KE BRANDS — but nothing consulted that list.
-- The assistant guessed, and the next neighbourhood would have been
-- guessed at too.
--
-- Which agent a parcel goes to is an operational decision: agents open
-- and close, some take bulky items and some do not, and only the team
-- sees the current list. So the customer names an area, and staff set
-- the point here. The assistant is told never to confirm one.
--
-- Nullable and unset on existing rows: an order already in flight was
-- agreed without this, and inventing a point for it would be the same
-- mistake in a different place.

ALTER TABLE public.wa_orders
  ADD COLUMN IF NOT EXISTS pickup_point text;

COMMENT ON COLUMN public.wa_orders.pickup_point IS
  'Pickup Mtaani agent assigned by staff. The customer asks for an area; the team picks the agent.';
