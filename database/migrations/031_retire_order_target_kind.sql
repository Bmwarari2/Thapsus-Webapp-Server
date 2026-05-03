-- Migration 031 — retire `target_kind = 'order'` from payments (audit P1.1)
--
-- The order branch in `loadTarget` (routes/payments.js) read
-- `orders.estimated_cost` as KES, but that field is stored in GBP (see
-- `routes/orders.js` POST + `utils/pricing.js`). A direct order-pay would
-- have settled a £X invoice for KSh X — a ~165× under-charge.
--
-- Production never reached the branch (iOS / webapp only POST
-- target_kind ∈ {consolidation, buy_for_me}; customer shipping flows
-- through customer_consolidations invoices), so the cancel step below is
-- expected to find zero rows on live. We still run it defensively and
-- log the count via RAISE NOTICE so a re-run on a stale staging copy
-- surfaces.
--
-- Idempotent. Safe to re-run.
--
-- Reverting: drop the new CHECK and recreate the wider one. But do NOT
-- re-enable `target_kind='order'` without first fixing the GBP→KES
-- conversion in `loadTarget` (mirror the buy_for_me branch).

BEGIN;

-- ── 1. Cancel any historical pending/awaiting_review rows ──────────────────
-- Defensive — should be zero. Anything that already settled stays paid;
-- we don't rewrite history.
DO $$
DECLARE
    cancelled_count int;
BEGIN
    UPDATE public.payments
       SET status = 'cancelled',
           rejection_reason = COALESCE(rejection_reason, 'target_kind=order retired by migration 031'),
           updated_at = NOW()
     WHERE target_kind = 'order'
       AND status IN ('pending', 'awaiting_review');
    GET DIAGNOSTICS cancelled_count = ROW_COUNT;
    RAISE NOTICE 'migration 031: cancelled % open order-target payment(s)', cancelled_count;
END $$;

-- ── 2. Narrow the CHECK constraint ────────────────────────────────────────
-- DROP+ADD because we don't know the current constraint name on every
-- environment (migration 028 created an anonymous CHECK).
DO $$
DECLARE
    cname text;
BEGIN
    SELECT conname INTO cname
      FROM pg_constraint
     WHERE conrelid = 'public.payments'::regclass
       AND contype  = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%target_kind%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT %I', cname);
    END IF;
END $$;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_target_kind_check
    CHECK (target_kind IN ('consolidation', 'buy_for_me', 'order'));
-- 'order' stays in the CHECK so historical rows (if any survived the
-- cancel above as 'paid'/'rejected'/etc.) remain valid. New writes are
-- gated at the route layer (routes/payments.js POST validator).

-- ── 3. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    open_orders int;
BEGIN
    SELECT COUNT(*) INTO open_orders
      FROM public.payments
     WHERE target_kind = 'order'
       AND status IN ('pending', 'awaiting_review');
    IF open_orders > 0 THEN
        RAISE EXCEPTION
            'Migration 031 verification failed: % open order-target payment(s) remain', open_orders;
    END IF;
END $$;

COMMIT;
