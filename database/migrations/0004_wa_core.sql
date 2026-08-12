-- 0004_wa_core.sql — WhatsApp-first core: contacts, inbox, 5-stage orders.
--
-- ⚠ DEPLOY ORDER: purely ADDITIVE — safe to apply before the code that
-- reads it deploys, and the running pre-0004 code ignores every object
-- here. The safe sequence is: migrate → deploy.
--
-- The lean rebuild makes WhatsApp (via sent.dm) the primary customer
-- channel. Customers have no accounts; a `wa_contacts` row keyed by phone
-- number is the customer identity, minted a persistent Customer Code
-- (TC-1042) when onboarding completes. Orders move through a five-stage
-- pipeline (Quoting → Paid → Purchased → In Kenya → Delivered) driven by
-- operators from the dashboard, with every status change alerting the
-- customer on WhatsApp.
--
-- The legacy tables (orders, packages, buy_for_me_orders, …) are left
-- untouched for the in-flight-order drain; nothing here migrates or
-- renames them.
--
-- RLS: enabled + FORCED like every other public table. Policies are
-- staff-only SELECT — these tables carry customer PII (names, addresses,
-- phone numbers, full message history) and are written exclusively by the
-- server (Supabase's `postgres` role carries BYPASSRLS). No client-side
-- INSERT/UPDATE/DELETE policies exist, so PostgREST writes are denied.

-- ── wa_contacts — one row per WhatsApp phone number ─────────────────────────
-- Doubles as the conversation head + onboarding state machine holder.
CREATE TABLE IF NOT EXISTS public.wa_contacts (
    id text NOT NULL,
    phone text NOT NULL,                -- E.164, digits only after '+' (2547XXXXXXXX)
    customer_code text,                 -- 'TC-1042', assigned when onboarding completes
    full_name text,
    delivery_address text,
    mpesa_number text,
    state text DEFAULT 'new' NOT NULL,
    unread_count integer DEFAULT 0 NOT NULL,
    last_message_at timestamp with time zone,
    last_message_preview text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_contacts_pkey PRIMARY KEY (id),
    CONSTRAINT wa_contacts_phone_key UNIQUE (phone),
    CONSTRAINT wa_contacts_customer_code_key UNIQUE (customer_code),
    CONSTRAINT wa_contacts_state_check CHECK ((state = ANY (ARRAY[
        'new'::text, 'awaiting_name'::text, 'awaiting_address'::text,
        'awaiting_mpesa'::text, 'active'::text, 'blocked'::text]))),
    CONSTRAINT wa_contacts_unread_count_check CHECK ((unread_count >= 0))
);

CREATE INDEX IF NOT EXISTS idx_wa_contacts_last_message_at
    ON public.wa_contacts (last_message_at DESC NULLS LAST);

ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wa_contacts FORCE ROW LEVEL SECURITY;
CREATE POLICY "wa_contacts staff-only read" ON public.wa_contacts
    FOR SELECT TO authenticated USING (public.is_thapsus_staff());

-- ── wa_messages — unified inbox log, both directions ────────────────────────
CREATE TABLE IF NOT EXISTS public.wa_messages (
    id text NOT NULL,
    contact_id text NOT NULL,
    direction text NOT NULL,
    body text,
    media_url text,
    media_type text,                    -- 'image' | 'document' | …
    template_key text,                  -- outbound template name, NULL for free-form
    provider_message_id text,           -- sent.dm message id — inbound dedupe + status updates
    status text DEFAULT 'received' NOT NULL,
    error text,
    sent_by text,                       -- operator user id; NULL = bot/automation
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_messages_pkey PRIMARY KEY (id),
    CONSTRAINT wa_messages_provider_message_id_key UNIQUE (provider_message_id),
    CONSTRAINT wa_messages_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT wa_messages_status_check CHECK ((status = ANY (ARRAY[
        'received'::text, 'queued'::text, 'sent'::text,
        'delivered'::text, 'read'::text, 'failed'::text])))
);

ALTER TABLE ONLY public.wa_messages
    ADD CONSTRAINT wa_messages_contact_id_fkey FOREIGN KEY (contact_id)
    REFERENCES public.wa_contacts(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wa_messages
    ADD CONSTRAINT wa_messages_sent_by_fkey FOREIGN KEY (sent_by)
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_messages_contact_created
    ON public.wa_messages (contact_id, created_at DESC);

ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wa_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY "wa_messages staff-only read" ON public.wa_messages
    FOR SELECT TO authenticated USING (public.is_thapsus_staff());

-- ── wa_orders — the five-stage pipeline object ──────────────────────────────
-- The quote IS the order pre-payment. Pricing fields are snapshotted at
-- quote time (usd_price × fx_rate × (1 + markup_pct/100) → quote_kes) so a
-- later FX/markup change never mutates an agreed quote.
--
-- Dashboard board columns map onto statuses:
--   Quoting   = quoting | quoted | confirmed
--   Paid      = paid
--   Purchased = purchased
--   In Kenya  = in_kenya | delivery_fee_pending
--   Delivered = dispatched | delivered
CREATE TABLE IF NOT EXISTS public.wa_orders (
    id text NOT NULL,
    contact_id text NOT NULL,
    tracking_code text,                 -- 'TRK-8821', minted when payment lands
    product_links jsonb DEFAULT '[]'::jsonb NOT NULL,
    product_note text,
    usd_price numeric(12,2),
    fx_rate numeric(12,6),
    markup_pct numeric(5,2),
    quote_kes bigint,
    status text DEFAULT 'quoting' NOT NULL,
    delivery_fee_kes bigint,
    delivery_fee_waived boolean DEFAULT false NOT NULL,
    delivery_fee_paid_at timestamp with time zone,
    receipt_path text,                  -- Supabase Storage object path ('receipts' bucket)
    quoted_at timestamp with time zone,
    confirmed_at timestamp with time zone,
    paid_at timestamp with time zone,
    purchased_at timestamp with time zone,
    arrived_at timestamp with time zone,
    dispatched_at timestamp with time zone,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_orders_pkey PRIMARY KEY (id),
    CONSTRAINT wa_orders_tracking_code_key UNIQUE (tracking_code),
    CONSTRAINT wa_orders_status_check CHECK ((status = ANY (ARRAY[
        'quoting'::text, 'quoted'::text, 'confirmed'::text, 'paid'::text,
        'purchased'::text, 'in_kenya'::text, 'delivery_fee_pending'::text,
        'dispatched'::text, 'delivered'::text, 'cancelled'::text]))),
    CONSTRAINT wa_orders_usd_price_check CHECK ((usd_price IS NULL OR usd_price > 0)),
    CONSTRAINT wa_orders_quote_kes_check CHECK ((quote_kes IS NULL OR quote_kes > 0)),
    CONSTRAINT wa_orders_delivery_fee_check CHECK ((delivery_fee_kes IS NULL OR delivery_fee_kes >= 0))
);

ALTER TABLE ONLY public.wa_orders
    ADD CONSTRAINT wa_orders_contact_id_fkey FOREIGN KEY (contact_id)
    REFERENCES public.wa_contacts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_wa_orders_status  ON public.wa_orders (status);
CREATE INDEX IF NOT EXISTS idx_wa_orders_contact ON public.wa_orders (contact_id, created_at DESC);

ALTER TABLE public.wa_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wa_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "wa_orders staff-only read" ON public.wa_orders
    FOR SELECT TO authenticated USING (public.is_thapsus_staff());

-- ── wa_order_events — audit trail of every status transition ────────────────
CREATE TABLE IF NOT EXISTS public.wa_order_events (
    id text NOT NULL,
    order_id text NOT NULL,
    from_status text,
    to_status text NOT NULL,
    actor_user_id text,                 -- NULL = bot/webhook automation
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_order_events_pkey PRIMARY KEY (id)
);

ALTER TABLE ONLY public.wa_order_events
    ADD CONSTRAINT wa_order_events_order_id_fkey FOREIGN KEY (order_id)
    REFERENCES public.wa_orders(id) ON DELETE CASCADE;
ALTER TABLE ONLY public.wa_order_events
    ADD CONSTRAINT wa_order_events_actor_user_id_fkey FOREIGN KEY (actor_user_id)
    REFERENCES public.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_wa_order_events_order
    ON public.wa_order_events (order_id, created_at DESC);

ALTER TABLE public.wa_order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wa_order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "wa_order_events staff-only read" ON public.wa_order_events
    FOR SELECT TO authenticated USING (public.is_thapsus_staff());

-- ── wa_settings — small key/value store for the WhatsApp flow ───────────────
-- Text values; JSON where the key calls for it (welcome_media_urls).
CREATE TABLE IF NOT EXISTS public.wa_settings (
    key text NOT NULL,
    value text NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT wa_settings_pkey PRIMARY KEY (key)
);

ALTER TABLE public.wa_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ONLY public.wa_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY "wa_settings staff-only read" ON public.wa_settings
    FOR SELECT TO authenticated USING (public.is_thapsus_staff());

INSERT INTO public.wa_settings (key, value) VALUES
    ('markup_pct', '10'),
    ('promo_active', 'false'),
    ('promo_type', 'waive_fee'),        -- 'waive_fee' | 'discount'
    ('promo_message', ''),
    ('default_delivery_fee_kes', '300'),
    ('welcome_media_urls', '[]')
ON CONFLICT (key) DO NOTHING;

-- ── Code sequences ──────────────────────────────────────────────────────────
-- Start values chosen so early codes don't advertise "you are customer #1".
CREATE SEQUENCE IF NOT EXISTS public.wa_customer_code_seq START WITH 1042;
CREATE SEQUENCE IF NOT EXISTS public.wa_tracking_code_seq START WITH 8821;

-- ── payments: admit wa_orders as a target ───────────────────────────────────
-- WhatsApp customers have no users row, so user_id becomes nullable with a
-- CHECK that every row is still attributable to exactly one payer identity.
-- Old code always writes user_id and never 'wa_order', so it is unaffected.
ALTER TABLE public.payments ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS wa_contact_id text;
DO $$ BEGIN
    ALTER TABLE ONLY public.payments
        ADD CONSTRAINT payments_wa_contact_id_fkey FOREIGN KEY (wa_contact_id)
        REFERENCES public.wa_contacts(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_target_kind_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_target_kind_check
    CHECK ((target_kind = ANY (ARRAY['consolidation'::text, 'buy_for_me'::text, 'order'::text, 'wa_order'::text])));

DO $$ BEGIN
    ALTER TABLE public.payments ADD CONSTRAINT payments_actor_chk
        CHECK ((user_id IS NOT NULL) OR (wa_contact_id IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
