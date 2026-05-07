-- Migration 038 — Lipana M-Pesa STK Push
--
-- Adds first-class STK Push support on top of the existing manual
-- "paste-the-SMS" M-Pesa flow. Lipana (lipana.dev) wraps Daraja's STK
-- behind a clean API: server POSTs phone+amount, customer enters their
-- M-Pesa PIN on their phone, Lipana fires a webhook back when the money
-- moves. The manual paste flow stays as a fallback for STK failures
-- (timeouts, customer paying from a different number, etc.).
--
-- Schema additions:
--
--   1. payments.mpesa_provider        — 'manual' | 'lipana' | NULL.
--      NULL on legacy rows; new mpesa rows tag the provider that drove
--      them so admin queues + analytics can split the two flows.
--
--   2. payments.lipana_transaction_id — Lipana's TXNxxxxxxxxx id; UNIQUE
--      among non-cancelled rows so a webhook redelivery can't settle two
--      payments. Surfaces in receipts as the M-Pesa reference for the
--      Lipana flow (replaces the 10-char SMS code in the manual flow).
--
--   3. payments.lipana_checkout_request_id — `ws_CO_…` id from Lipana,
--      used by the iOS poller while the customer is on the PIN prompt.
--
--   4. payments.mpesa_phone_used      — phone number the STK was sent to.
--      `mpesa_phone` already exists for the parsed-from-SMS sender phone;
--      separate column so the admin queue can show "STK sent to X, paid
--      from Y" if those ever diverge (Safaricom occasionally reroutes).
--
--   5. lipana_events_seen             — webhook idempotency table, mirrors
--      stripe_events_seen.
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ── 1. payments columns ────────────────────────────────────────────────────
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS mpesa_provider             text,
    ADD COLUMN IF NOT EXISTS lipana_transaction_id      text,
    ADD COLUMN IF NOT EXISTS lipana_checkout_request_id text,
    ADD COLUMN IF NOT EXISTS mpesa_phone_used           text;

-- CHECK constraint on mpesa_provider — keep nullable so existing rows
-- (mpesa_provider IS NULL) don't fail. New mpesa rows are required by
-- the route handler to set this.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conname = 'payments_mpesa_provider_chk'
    ) THEN
        ALTER TABLE public.payments
            ADD CONSTRAINT payments_mpesa_provider_chk
            CHECK (mpesa_provider IS NULL OR mpesa_provider IN ('manual','lipana'));
    END IF;
END $$;

COMMENT ON COLUMN public.payments.mpesa_provider IS
  'Which M-Pesa flow drove this row: ''manual'' (paste-SMS) or ''lipana'' (STK Push). NULL on pre-038 rows.';
COMMENT ON COLUMN public.payments.lipana_transaction_id IS
  'Lipana TXN id returned from /transactions/push-stk. UNIQUE — webhook redelivery guard.';
COMMENT ON COLUMN public.payments.lipana_checkout_request_id IS
  'Lipana ws_CO_… checkout-request id. iOS polls /payments/:id/status with this in flight.';
COMMENT ON COLUMN public.payments.mpesa_phone_used IS
  'Phone number the STK push was sent to (E.164-ish, normalized to 254XXXXXXXXX).';

-- ── 2. Unique index on lipana_transaction_id (partial — exclude cancelled) ─
DROP INDEX IF EXISTS public.uq_payments_lipana_txn;
CREATE UNIQUE INDEX uq_payments_lipana_txn
    ON public.payments (lipana_transaction_id)
 WHERE lipana_transaction_id IS NOT NULL
   AND status IN ('paid','awaiting_review','pending');

-- ── 3. lipana_events_seen (webhook idempotency) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.lipana_events_seen (
    event_id    text PRIMARY KEY,
    event_type  text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT NOW()
);

ALTER TABLE public.lipana_events_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lipana_events_seen FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lipana_events_seen admin read" ON public.lipana_events_seen;
CREATE POLICY "lipana_events_seen admin read" ON public.lipana_events_seen
  FOR SELECT TO authenticated
  USING (public.is_thapsus_admin());

-- ── 4. Verify ─────────────────────────────────────────────────────────────
DO $$
DECLARE
    has_provider boolean;
    has_txn      boolean;
    has_idx      boolean;
    has_events   boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='payments' AND column_name='mpesa_provider'
    ) INTO has_provider;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema='public' AND table_name='payments' AND column_name='lipana_transaction_id'
    ) INTO has_txn;
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname='public' AND indexname='uq_payments_lipana_txn'
    ) INTO has_idx;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema='public' AND table_name='lipana_events_seen'
    ) INTO has_events;
    IF NOT (has_provider AND has_txn AND has_idx AND has_events) THEN
        RAISE EXCEPTION 'Migration 038 verification failed (provider=%, txn=%, idx=%, events=%)',
                        has_provider, has_txn, has_idx, has_events;
    END IF;
END $$;

COMMIT;
