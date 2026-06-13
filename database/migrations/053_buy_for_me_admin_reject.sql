-- 053_buy_for_me_admin_reject.sql
-- Lets an operator/admin decline a buy-for-me request with a reason.
--
-- The existing `customer_decision_reason` (migration 026) records why the
-- *customer* rejected a quote. Staff declines are a distinct event (e.g.
-- prohibited item, can't be sourced), so we store them in their own column
-- to keep the two reasons unambiguous on the customer's order card.
-- Additive + idempotent: safe to re-run.

ALTER TABLE public.buy_for_me_orders
  ADD COLUMN IF NOT EXISTS admin_decision_reason TEXT;
