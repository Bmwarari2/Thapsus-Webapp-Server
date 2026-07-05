-- 0002_influencer_referrals.sql — influencer referral tracking.
--
-- A SEPARATE system from the existing account-to-account referral scheme
-- (users.referral_code / users.referred_by / the `referrals` table, which
-- pays KES 50 of wallet credit to both parties). That one requires the
-- referrer to be a registered customer.
--
-- This one is admin-driven: the admin mints a short code for a marketing
-- influencer who has NO account. The influencer shares a link
-- (https://<app>/i/<CODE>) that lands the recipient on a branded page
-- carrying the influencer's name and prompts them to create an account +
-- paste the item link(s) they want shipped. The admin then tracks, per
-- code: how many people opened the link (click_count), how many created
-- an account (attributed users), and how many placed an order
-- (influencer_conversions) — the numbers they need to compensate the
-- influencer. Nothing here touches the customer-facing credit ledger.
--
-- Additive + idempotent: safe to re-run.

-- 1) The admin-generated codes. `code` is the human-shareable token and the
--    primary key; there is deliberately NO user_id / owner account.
CREATE TABLE IF NOT EXISTS public.influencer_codes (
    code               text PRIMARY KEY,
    influencer_name    text NOT NULL,
    influencer_contact text,
    reward_per_order   numeric,
    notes              text,
    is_active          boolean DEFAULT true NOT NULL,
    click_count        integer DEFAULT 0 NOT NULL,
    created_by         text REFERENCES public.users(id) ON DELETE SET NULL,
    created_at         timestamp with time zone DEFAULT now() NOT NULL,
    updated_at         timestamp with time zone DEFAULT now() NOT NULL
);

-- 2) Attribution stamp on the account created via a code. Kept distinct from
--    the account-referral columns so the two schemes never collide.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS influencer_code text
    REFERENCES public.influencer_codes(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_influencer_code
  ON public.users (influencer_code) WHERE influencer_code IS NOT NULL;

-- 3) One row per attributed customer's FIRST order (of either kind), so the
--    admin has an itemised, payable list. UNIQUE(user_id) keeps a customer
--    counted once no matter how many orders they later place.
CREATE TABLE IF NOT EXISTS public.influencer_conversions (
    id            text PRIMARY KEY,
    code          text NOT NULL REFERENCES public.influencer_codes(code) ON DELETE CASCADE,
    user_id       text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    order_ref     text,
    order_kind    text NOT NULL DEFAULT 'order',
    converted_at  timestamp with time zone DEFAULT now() NOT NULL,
    payout_status text NOT NULL DEFAULT 'unpaid',
    payout_at     timestamp with time zone,
    payout_note   text,
    CONSTRAINT influencer_conversions_order_kind_check
      CHECK (order_kind = ANY (ARRAY['order'::text, 'buy_for_me'::text])),
    CONSTRAINT influencer_conversions_payout_status_check
      CHECK (payout_status = ANY (ARRAY['unpaid'::text, 'paid'::text])),
    CONSTRAINT influencer_conversions_user_unique UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_influencer_conversions_code
  ON public.influencer_conversions (code);

-- Grants — mirror the baseline's schema-wide grant to the Supabase roles so a
-- freshly-migrated DB matches live. The Express service connects as the table
-- owner and bypasses RLS; these roles matter only for direct PostgREST access.
GRANT ALL ON TABLE public.influencer_codes       TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.influencer_conversions TO anon, authenticated, service_role;

-- RLS: staff-only reads, matching the posture of buy_for_me_orders / referrals.
-- All writes flow through the Express API (owner connection), never PostgREST.
ALTER TABLE public.influencer_codes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_conversions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "influencer_codes staff read" ON public.influencer_codes;
CREATE POLICY "influencer_codes staff read" ON public.influencer_codes
  FOR SELECT TO authenticated
  USING ((SELECT public.is_thapsus_staff() AS is_thapsus_staff));

DROP POLICY IF EXISTS "influencer_conversions staff read" ON public.influencer_conversions;
CREATE POLICY "influencer_conversions staff read" ON public.influencer_conversions
  FOR SELECT TO authenticated
  USING ((SELECT public.is_thapsus_staff() AS is_thapsus_staff));
