-- 0014_payments_hardening.sql — money-safety backstops for the manual
-- M-Pesa flow.
--
-- ⚠ DEPLOY ORDER: additive apart from the duplicate-row cleanup, which
-- only touches rows the code already treats as superseded. Safe to apply
-- before the code that reads it deploys: migrate → deploy.

-- ── 1. One open payment per WhatsApp order, enforced by the database ─────────
-- utils/waPayments.ensureManualPayment was check-then-insert with no
-- uniqueness backstop. Two near-simultaneous calls — a customer sending
-- "yes" twice, or the YES handler racing an operator's request-payment
-- click — created two awaiting_review rows for one order. Settling the
-- second later re-announced "payment received", generated a second
-- receipt over the first, and left the books showing two settled
-- payments for one order.
--
-- Cancel duplicate open rows first (keep the newest — it is the one the
-- state machine stamps references onto), then add the index. 'cancelled'
-- is the status the code already uses for a superseded payment attempt,
-- and markPaymentPaid refuses to settle it.
UPDATE public.payments p
   SET status = 'cancelled', updated_at = NOW()
 WHERE p.target_kind = 'wa_order'
   AND p.status IN ('pending', 'awaiting_review')
   AND EXISTS (
     SELECT 1 FROM public.payments newer
      WHERE newer.target_kind = 'wa_order'
        AND newer.target_id = p.target_id
        AND newer.status IN ('pending', 'awaiting_review')
        AND (newer.created_at, newer.id) > (p.created_at, p.id)
   );

-- Scoped to wa_order on purpose: the legacy web flow can hold several
-- open rows per target across payment retries, and this index is about
-- the WhatsApp race, not about re-modelling legacy behaviour.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_open_wa_order
    ON public.payments (target_id)
 WHERE target_kind = 'wa_order' AND status IN ('pending', 'awaiting_review');

-- ── 2. What the reviewer actually saw ────────────────────────────────────────
-- Approval used to record only WHO approved, not what they verified. A
-- KSh 15,000 payment against a KSh 17,094 quote could be approved
-- silently, and the receipt stamped PAID for the full amount. The
-- reviewer now enters the amount they matched on the till statement;
-- the mismatch guard and the receipt both read it.
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS amount_received_kes bigint;

-- ── 3. Outbound retry bookkeeping ────────────────────────────────────────────
-- Failed sends had no retry anywhere — the sweeper (utils/waSweeper.js)
-- retries recent failed free-text messages once, and needs to remember
-- which rows it has already tried.
ALTER TABLE public.wa_messages
    ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0 NOT NULL;
