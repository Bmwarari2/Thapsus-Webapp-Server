-- 0007_wa_supplier_ref.sql — the retailer's own order number.
--
-- ⚠ DEPLOY ORDER: additive only — safe to apply before or after the code
-- that reads it. Pre-0007 code ignores the column entirely.
--
-- When we buy a customer's items, SHEIN (or whoever) gives us an order
-- number of their own. Until now that lived nowhere: to answer "which of
-- our parcels were in SHEIN order SO12345678?" — the question you ask
-- when a supplier splits a shipment, refunds a line, or a box arrives
-- with only their paperwork inside — someone had to remember.
--
-- Deliberately a plain column and not a join table. One supplier order
-- covers many of ours, which a shared value already expresses; the
-- reverse (one of our orders spanning two supplier purchases) is not a
-- shape this business has, and a join table would cost a whole editing
-- surface to model something nobody has needed.
--
-- Not named shein_* on purpose. The business forwards from whatever shop
-- the customer links to, and the first Amazon order should not need a
-- migration.

ALTER TABLE public.wa_orders ADD COLUMN IF NOT EXISTS supplier_ref text;

-- Grouping lookup: "show me everything in this supplier order". Partial,
-- because most rows never carry one and there is no reason to index the
-- nulls.
CREATE INDEX IF NOT EXISTS wa_orders_supplier_ref_idx
    ON public.wa_orders (supplier_ref)
    WHERE supplier_ref IS NOT NULL;

-- Case-insensitive search from the pipeline box, so a reference typed in
-- lower case still finds the group.
CREATE INDEX IF NOT EXISTS wa_orders_supplier_ref_lower_idx
    ON public.wa_orders (lower(supplier_ref))
    WHERE supplier_ref IS NOT NULL;
