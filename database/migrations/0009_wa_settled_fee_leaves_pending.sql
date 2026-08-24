-- 0009_wa_settled_fee_leaves_pending.sql — a paid fee is not a pending fee.
--
-- ⚠ DEPLOY ORDER: either way round. This only corrects existing rows;
-- the code fix stops new ones from getting stuck.
--
-- 'delivery_fee_pending' is a statement about money owed. Two paths
-- settled the debt without leaving that status:
--
--   * markPaymentPaid stamped delivery_fee_paid_at and returned
--   * POST /wa/orders/:id/waive-fee set delivery_fee_waived and returned
--
-- Both left status = 'delivery_fee_pending'. The order detail screen
-- reads the fee card from delivery_fee_paid_at/delivery_fee_waived and
-- the status badge from status, so one order showed "Paid" and
-- "DELIVERY FEE PENDING" at the same time. Dispatch still worked — the
-- edge from delivery_fee_pending to dispatched exists — so this misread
-- as broken without ever blocking anything.
--
-- These orders are in Kenya with nothing outstanding, waiting on
-- dispatch, which is exactly what 'in_kenya' means.

-- One statement, so the audit rows are exactly the rows corrected. A
-- second query matching on updated_at would also sweep up any unrelated
-- order that happened to be touched in the same window.
WITH corrected AS (
  UPDATE public.wa_orders
     SET status     = 'in_kenya',
         updated_at = NOW()
   WHERE status = 'delivery_fee_pending'
     AND (delivery_fee_paid_at IS NOT NULL OR delivery_fee_waived = true)
  RETURNING id
)
INSERT INTO public.wa_order_events (id, order_id, from_status, to_status, note)
SELECT gen_random_uuid()::text, id, 'delivery_fee_pending', 'in_kenya',
       'Fee was already settled — status corrected by migration 0009'
  FROM corrected;
