-- 0003_influencer_accounts_and_analytics.sql
--
-- Takes the influencer programme (migration 0002) from "admin-only codes" to
-- "influencers have their own login + analytics dashboard":
--
--   1. A new `influencer` user role, so an influencer can sign in and see
--      only their own performance (never the customer/ops/admin surfaces).
--   2. `influencer_codes.owner_user_id` links a code to the influencer
--      account that owns/views it. Admin provisions the account and assigns
--      the code(s); one account can own several codes.
--   3. `influencer_link_events` records every link OPEN (not just a counter),
--      enriched with coarse IP-estimated location, so the dashboard can show
--      where clicks come from and — via `converted` — how many people opened
--      the link but never signed up.
--
-- Privacy: we never store the raw IP. `ip_hash` is a salted SHA-256 used only
-- to count unique visitors; the human-meaningful fields are the coarse
-- country/region/city resolved at capture time. Consistent with the app's
-- DSAR/GDPR posture.
--
-- Additive + idempotent.

-- 1) Add the influencer role to the users CHECK constraint.
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role = ANY (ARRAY[
    'customer'::text, 'admin'::text, 'operator'::text,
    'clearing_agent'::text, 'rider'::text, 'influencer'::text
  ]));

-- 2) Link a code to the influencer account that owns it.
ALTER TABLE public.influencer_codes
  ADD COLUMN IF NOT EXISTS owner_user_id text
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_influencer_codes_owner
  ON public.influencer_codes (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- 3) Per-open event log with coarse geolocation.
CREATE TABLE IF NOT EXISTS public.influencer_link_events (
    id            text PRIMARY KEY,
    code          text NOT NULL REFERENCES public.influencer_codes(code) ON DELETE CASCADE,
    occurred_at   timestamp with time zone NOT NULL DEFAULT now(),
    ip_hash       text,
    country       text,
    country_code  text,
    region        text,
    city          text,
    latitude      numeric,
    longitude     numeric,
    device_type   text,
    referrer      text,
    user_agent    text,
    converted     boolean NOT NULL DEFAULT false,
    user_id       text REFERENCES public.users(id) ON DELETE SET NULL,
    converted_at  timestamp with time zone
);

CREATE INDEX IF NOT EXISTS idx_influencer_link_events_code_time
  ON public.influencer_link_events (code, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_influencer_link_events_converted
  ON public.influencer_link_events (code, converted);

-- Grants + staff-only RLS, mirroring the 0002 tables. Influencers read their
-- own analytics through the Express API (owner connection), never PostgREST.
GRANT ALL ON TABLE public.influencer_link_events TO anon, authenticated, service_role;

ALTER TABLE public.influencer_link_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "influencer_link_events staff read" ON public.influencer_link_events;
CREATE POLICY "influencer_link_events staff read" ON public.influencer_link_events
  FOR SELECT TO authenticated
  USING ((SELECT public.is_thapsus_staff() AS is_thapsus_staff));
