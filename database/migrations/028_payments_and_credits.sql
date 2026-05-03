-- Migration 028 — Stripe + M-Pesa payments, referral credits, wallet rip
--
-- Replaces the wallet/transactions debit model with a per-payment row keyed
-- by (target_kind, target_id). Two methods supported on every "money in"
-- surface:
--   - stripe   → Stripe PaymentIntent in GBP (UK account); webhook flips
--                payments.status='paid' and the target row in the same txn.
--   - mpesa    → customer pastes the M-Pesa confirmation SMS; admin reviews
--                the queue and approves/rejects. No Daraja STK push (yet).
--
-- Referral rewards no longer hit a wallet. They become per-user credit (KES)
-- that's automatically applied to reduce the next payment's amount_due.
--
-- Pre-launch: every user is a test account. We DROP the wallet table and
-- the wallet-related users.wallet_balance column. `transactions` stays as a
-- passive read-only ledger for old rows (no new inserts from this migration
-- forward).
--
-- Idempotent — every CREATE/ALTER guarded by IF EXISTS / IF NOT EXISTS.

BEGIN;

-- ── 1. user_credits + credit_ledger ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_credits (
    user_id      text PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
    balance_kes  bigint NOT NULL DEFAULT 0,
    updated_at   timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_credits_balance
    ON public.user_credits (balance_kes) WHERE balance_kes > 0;

CREATE TABLE IF NOT EXISTS public.credit_ledger (
    id          text PRIMARY KEY,
    user_id     text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    delta_kes   bigint NOT NULL,
    reason      text NOT NULL CHECK (reason IN ('referral','manual','consumed_payment','refund')),
    source_id   text,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created
    ON public.credit_ledger (user_id, created_at DESC);

-- ── 2. payments table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payments (
    id                       text PRIMARY KEY,
    user_id                  text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    target_kind              text NOT NULL CHECK (target_kind IN ('order','consolidation','buy_for_me')),
    target_id                text NOT NULL,
    amount_gross_kes         bigint NOT NULL CHECK (amount_gross_kes >= 0),
    amount_credit_kes        bigint NOT NULL DEFAULT 0 CHECK (amount_credit_kes >= 0),
    amount_due_kes           bigint NOT NULL CHECK (amount_due_kes >= 0),
    currency                 text NOT NULL DEFAULT 'KES',
    method                   text NOT NULL CHECK (method IN ('stripe','mpesa')),
    status                   text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','awaiting_review','paid','failed','rejected','cancelled')),
    -- Stripe-specific
    stripe_payment_intent_id text UNIQUE,
    stripe_charge_id         text,
    stripe_amount_pence_gbp  bigint,
    stripe_fx_rate_kes_gbp   numeric(12,6),
    -- M-Pesa-specific
    mpesa_message_raw        text,
    mpesa_reference          text,
    mpesa_phone              text,
    mpesa_message_amount_kes bigint,
    -- review trail
    reviewed_by              text REFERENCES public.users(id),
    reviewed_at              timestamptz,
    rejection_reason         text,
    -- timestamps
    created_at               timestamptz NOT NULL DEFAULT NOW(),
    updated_at               timestamptz NOT NULL DEFAULT NOW(),
    paid_at                  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_payments_user_created
    ON public.payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_target
    ON public.payments (target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_payments_status
    ON public.payments (status) WHERE status IN ('pending','awaiting_review');
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_stripe_pi
    ON public.payments (stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_payments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.touch_payments_updated_at();

-- ── 3. stripe_events_seen (webhook idempotency) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.stripe_events_seen (
    event_id    text PRIMARY KEY,
    event_type  text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT NOW()
);

-- ── 4. RLS — every new table forced + self-or-staff SELECT ────────────────
-- Per feedback_rls_required.md and feedback_rls_helpers_no_users_query.md.
-- Helpers (is_thapsus_staff/admin) read auth.jwt()->user_metadata->>app_role —
-- migration 027 — so these policies don't recurse.

ALTER TABLE public.user_credits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_credits     FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events_seen FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_credits self-or-staff read" ON public.user_credits;
CREATE POLICY "user_credits self-or-staff read" ON public.user_credits
  FOR SELECT TO authenticated
  USING (user_id = (auth.jwt()->>'sub')::text OR public.is_thapsus_staff());

DROP POLICY IF EXISTS "credit_ledger self-or-staff read" ON public.credit_ledger;
CREATE POLICY "credit_ledger self-or-staff read" ON public.credit_ledger
  FOR SELECT TO authenticated
  USING (user_id = (auth.jwt()->>'sub')::text OR public.is_thapsus_staff());

DROP POLICY IF EXISTS "payments self-or-staff read" ON public.payments;
CREATE POLICY "payments self-or-staff read" ON public.payments
  FOR SELECT TO authenticated
  USING (user_id = (auth.jwt()->>'sub')::text OR public.is_thapsus_staff());

-- stripe_events_seen has no client surface — admin only
DROP POLICY IF EXISTS "stripe_events_seen admin read" ON public.stripe_events_seen;
CREATE POLICY "stripe_events_seen admin read" ON public.stripe_events_seen
  FOR SELECT TO authenticated
  USING (public.is_thapsus_admin());

-- ── 5. Realtime publication — payments + user_credits ──────────────────────
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.payments';
        EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.user_credits';
    END IF;
EXCEPTION WHEN duplicate_object THEN
    NULL; -- already in publication
END $$;
ALTER TABLE public.payments     REPLICA IDENTITY FULL;
ALTER TABLE public.user_credits REPLICA IDENTITY FULL;

-- ── 6. Backfill referral rewards into user_credits ─────────────────────────
-- Each completed referral (status='completed') credited KES 50 to BOTH
-- referrer and referee under the old wallet model. Mirror that into the
-- credit ledger so users keep their earned reward post-cutover.
INSERT INTO public.user_credits (user_id, balance_kes, updated_at)
SELECT u.id, 0, NOW()
  FROM public.users u
 WHERE NOT EXISTS (SELECT 1 FROM public.user_credits c WHERE c.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

DO $$
DECLARE
    r record;
BEGIN
    FOR r IN
        SELECT id, referrer_id, referee_id, COALESCE(reward_amount, 50) AS amt
          FROM public.referrals
         WHERE status = 'completed'
    LOOP
        -- referrer side
        IF NOT EXISTS (
            SELECT 1 FROM public.credit_ledger
             WHERE source_id = r.id AND user_id = r.referrer_id AND reason = 'referral'
        ) THEN
            INSERT INTO public.credit_ledger (id, user_id, delta_kes, reason, source_id, note)
            VALUES ('CRD-RFR-' || r.id || '-A', r.referrer_id, r.amt, 'referral', r.id, 'Backfill: referral reward (referrer)');
            UPDATE public.user_credits
               SET balance_kes = balance_kes + r.amt, updated_at = NOW()
             WHERE user_id = r.referrer_id;
        END IF;
        -- referee side
        IF NOT EXISTS (
            SELECT 1 FROM public.credit_ledger
             WHERE source_id = r.id AND user_id = r.referee_id AND reason = 'referral'
        ) THEN
            INSERT INTO public.credit_ledger (id, user_id, delta_kes, reason, source_id, note)
            VALUES ('CRD-RFR-' || r.id || '-B', r.referee_id, r.amt, 'referral', r.id, 'Backfill: referral reward (referee)');
            UPDATE public.user_credits
               SET balance_kes = balance_kes + r.amt, updated_at = NOW()
             WHERE user_id = r.referee_id;
        END IF;
    END LOOP;
END $$;

-- ── 7. Drop the wallet completely ──────────────────────────────────────────
-- Pre-launch app, every account is a test account, no real money in flight.
-- transactions stays as a passive ledger (no new writes from this migration
-- forward; old rows preserved for accounting context).
DROP TABLE IF EXISTS public.wallet CASCADE;

-- Old `users.wallet_balance` column still ALTER'd everywhere; drop it.
ALTER TABLE public.users DROP COLUMN IF EXISTS wallet_balance;

-- ── 8. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    payments_ok boolean;
    credits_ok boolean;
    wallet_gone boolean;
BEGIN
    SELECT to_regclass('public.payments') IS NOT NULL INTO payments_ok;
    SELECT to_regclass('public.user_credits') IS NOT NULL INTO credits_ok;
    SELECT to_regclass('public.wallet') IS NULL INTO wallet_gone;
    IF NOT (payments_ok AND credits_ok AND wallet_gone) THEN
        RAISE EXCEPTION
            'Migration 028 verification failed (payments=%, credits=%, wallet_gone=%)',
            payments_ok, credits_ok, wallet_gone;
    END IF;
END $$;

COMMIT;
