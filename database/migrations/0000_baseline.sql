--
-- 0000_baseline.sql — consolidated schema baseline (generated 2026-07-02)
--
-- Authoritative snapshot of the LIVE Supabase schema (project
-- zzdfxsfuhosuqvsugtfd), captured during the 2026-07 functionality audit
-- after per-object fingerprint reconciliation (columns, constraints,
-- indexes, functions, triggers, RLS flags, policies) matched live exactly.
--
-- This file replaces the 60+ historical migrations (now under _archive/)
-- as the starting point for any fresh database. New migrations begin at
-- 0001 and apply on top of this.
--
-- On vanilla Postgres (local dev / CI) apply database/dev/supabase-shims.sql
-- FIRST — this file references the anon/authenticated/service_role roles and
-- functions that call auth.uid()/auth.jwt(), which Supabase provides natively.
--

CREATE EXTENSION IF NOT EXISTS pgcrypto;

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET standard_conforming_strings = on;
-- NB: pg_dump's set_config('search_path','') is intentionally omitted — it is
-- session-scoped and would break the migrate runner's unqualified ledger
-- INSERT after this file applies. Every statement below is schema-qualified.
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: current_user_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_user_id() RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::jsonb ->> 'sub',
    ''
  );
$$;


--
-- Name: is_thapsus_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_thapsus_admin() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'app_role',
    ''
  ) = 'admin';
$$;


--
-- Name: is_thapsus_staff(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_thapsus_staff() RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT COALESCE(
    auth.jwt() -> 'user_metadata' ->> 'app_role',
    ''
  ) IN ('admin','operator','clearing_agent','rider');
$$;


--
-- Name: touch_customer_consolidations_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_customer_consolidations_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;


--
-- Name: touch_finance_tx_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_finance_tx_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;


--
-- Name: touch_payments_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.touch_payments_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: _migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE IF NOT EXISTS public._migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: account_deletion_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_deletion_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    scheduled_deletion_at timestamp with time zone NOT NULL,
    cancelled_at timestamp with time zone,
    cancel_reason text,
    completed_at timestamp with time zone,
    export_storage_path text,
    export_signed_url text,
    export_url_expires_at timestamp with time zone,
    export_generated_at timestamp with time zone,
    export_emailed_at timestamp with time zone
);


--
-- Name: admin_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_logs (
    id text NOT NULL,
    admin_id text,
    action text NOT NULL,
    details text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: agent_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_invoices (
    id text NOT NULL,
    agent_id text NOT NULL,
    consolidation_id text,
    invoice_no text,
    amount_kes real DEFAULT 0 NOT NULL,
    doc_url text,
    status text DEFAULT 'submitted'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    CONSTRAINT agent_invoices_status_check CHECK ((status = ANY (ARRAY['submitted'::text, 'approved'::text, 'paid'::text, 'rejected'::text])))
);


--
-- Name: aml_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.aml_flags (
    id text NOT NULL,
    user_id text NOT NULL,
    parcel_id text,
    reason text NOT NULL,
    status text DEFAULT 'open'::text,
    resolved_at timestamp with time zone,
    resolved_by text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT aml_flags_status_check CHECK ((status = ANY (ARRAY['open'::text, 'cleared'::text, 'escalated'::text])))
);


--
-- Name: auth_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_otps (
    id text NOT NULL,
    user_id text NOT NULL,
    code_hash bytea NOT NULL,
    purpose text DEFAULT 'login_2fa'::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.auth_otps FORCE ROW LEVEL SECURITY;


--
-- Name: backups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.backups (
    id text NOT NULL,
    filename text NOT NULL,
    filepath text NOT NULL,
    size_bytes integer NOT NULL,
    checksum text NOT NULL,
    status text DEFAULT 'in_progress'::text,
    created_by text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT backups_status_check CHECK ((status = ANY (ARRAY['completed'::text, 'failed'::text, 'in_progress'::text])))
);


--
-- Name: buy_for_me_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buy_for_me_orders (
    id text NOT NULL,
    user_id text NOT NULL,
    retailer_url text NOT NULL,
    item_name text NOT NULL,
    size text,
    qty integer DEFAULT 1 NOT NULL,
    notes text,
    estimate_gbp real,
    markup_pct real DEFAULT 10,
    status text DEFAULT 'pending_quote'::text,
    parcel_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    customer_decision_reason text,
    quoted_at timestamp with time zone,
    decided_at timestamp with time zone,
    admin_decision_reason text,
    alternative_url text,
    alternative_note text,
    CONSTRAINT buy_for_me_orders_status_check CHECK ((status = ANY (ARRAY['pending_quote'::text, 'quoted'::text, 'paid'::text, 'purchased'::text, 'received'::text, 'shipped'::text, 'cancelled'::text, 'rejected'::text, 'alternative_offered'::text])))
);


--
-- Name: compliance_trainings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.compliance_trainings (
    id text NOT NULL,
    user_id text NOT NULL,
    course text NOT NULL,
    completed_at timestamp with time zone NOT NULL,
    expires_at timestamp with time zone,
    cert_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: consolidations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consolidations (
    id text NOT NULL,
    week_start date NOT NULL,
    cutoff_at timestamp with time zone NOT NULL,
    departure_at timestamp with time zone,
    arrival_at timestamp with time zone,
    status text DEFAULT 'open'::text,
    total_kg real DEFAULT 0,
    total_parcels integer DEFAULT 0,
    master_awb_no text,
    master_awb_pdf text,
    tudor_invoice_no text,
    tudor_invoice_pdf text,
    manifest_pdf text,
    assigned_agent_id text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT consolidations_status_check CHECK ((status = ANY (ARRAY['open'::text, 'closed'::text, 'in_transit'::text, 'arrived'::text, 'cleared'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: credit_ledger; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credit_ledger (
    id text NOT NULL,
    user_id text NOT NULL,
    delta_kes bigint NOT NULL,
    reason text NOT NULL,
    source_id text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT credit_ledger_reason_check CHECK ((reason = ANY (ARRAY['referral'::text, 'manual'::text, 'consumed_payment'::text, 'refund'::text])))
);

ALTER TABLE ONLY public.credit_ledger FORCE ROW LEVEL SECURITY;


--
-- Name: customer_consolidations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customer_consolidations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id text NOT NULL,
    shipping_consolidation_id text,
    status text DEFAULT 'pending'::text NOT NULL,
    invoice_amount numeric(12,2),
    invoice_currency text DEFAULT 'KES'::text NOT NULL,
    invoice_status text,
    invoice_paid_at timestamp with time zone,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    description text,
    is_standalone boolean DEFAULT false NOT NULL,
    CONSTRAINT customer_consolidations_invoice_currency_check CHECK (((invoice_currency IS NULL) OR (invoice_currency = ANY (ARRAY['GBP'::text, 'KES'::text])))),
    CONSTRAINT customer_consolidations_invoice_status_check CHECK (((invoice_status IS NULL) OR (invoice_status = ANY (ARRAY['pending'::text, 'paid'::text])))),
    CONSTRAINT customer_consolidations_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'invoiced'::text, 'paid'::text, 'shipped'::text])))
);

ALTER TABLE ONLY public.customer_consolidations FORCE ROW LEVEL SECURITY;


--
-- Name: customs_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customs_entries (
    id text NOT NULL,
    parcel_id text NOT NULL,
    agent_id text,
    idf_no text,
    entry_no text,
    cif_kes real DEFAULT 0,
    duty_kes real DEFAULT 0,
    vat_kes real DEFAULT 0,
    idf_kes real DEFAULT 0,
    rdl_kes real DEFAULT 0,
    admin_fee_kes real DEFAULT 0,
    status text DEFAULT 'draft'::text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    doc_url text,
    CONSTRAINT customs_entries_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'idf_submitted'::text, 'entry_filed'::text, 'duty_paid'::text, 'released'::text, 'rejected'::text])))
);


--
-- Name: customs_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.customs_tiers (
    tier_key character varying(50) NOT NULL,
    label text NOT NULL,
    duty_pct numeric(6,4) NOT NULL,
    vat_pct numeric(6,4) DEFAULT 0.16 NOT NULL,
    idf_pct numeric(6,4) DEFAULT 0.035 NOT NULL,
    rdl_pct numeric(6,4) DEFAULT 0.02 NOT NULL,
    notes text,
    is_active boolean DEFAULT true NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: dsar_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsar_requests (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    status text DEFAULT 'open'::text,
    due_at timestamp with time zone,
    fulfilled_at timestamp with time zone,
    export_url text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT dsar_requests_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'fulfilled'::text, 'rejected'::text]))),
    CONSTRAINT dsar_requests_type_check CHECK ((type = ANY (ARRAY['export'::text, 'erase'::text])))
);


--
-- Name: electronics_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.electronics_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    item_key character varying(50) NOT NULL,
    fee_gbp numeric(10,2) NOT NULL,
    updated_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    label text,
    min_weight_kg numeric(6,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: email_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_logs (
    id text NOT NULL,
    user_id text,
    email_to text NOT NULL,
    email_type text NOT NULL,
    subject text NOT NULL,
    status text DEFAULT 'sent'::text,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT email_logs_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text])))
);


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text,
    token_sha256 bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: error_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.error_logs (
    id text NOT NULL,
    level text DEFAULT 'error'::text,
    source text NOT NULL,
    message text NOT NULL,
    stack text,
    method text,
    path text,
    status_code integer,
    user_id text,
    meta text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT error_logs_level_check CHECK ((level = ANY (ARRAY['error'::text, 'warn'::text, 'fatal'::text])))
);


--
-- Name: exchange_rates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.exchange_rates (
    id integer NOT NULL,
    currency_pair text NOT NULL,
    rate real NOT NULL,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.exchange_rates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: exchange_rates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.exchange_rates_id_seq OWNED BY public.exchange_rates.id;


--
-- Name: fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.fees (
    id text NOT NULL,
    code text NOT NULL,
    label text NOT NULL,
    currency text DEFAULT 'GBP'::text,
    amount real NOT NULL,
    is_percentage boolean DEFAULT false,
    effective_from timestamp with time zone DEFAULT now(),
    effective_to timestamp with time zone,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT fees_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text])))
);


--
-- Name: finance_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_accounts (
    id text NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    currency text NOT NULL,
    opening_balance_minor bigint DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_accounts_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text]))),
    CONSTRAINT finance_accounts_type_check CHECK ((type = ANY (ARRAY['bank'::text, 'cash'::text, 'mpesa'::text, 'stripe'::text, 'other'::text])))
);

ALTER TABLE ONLY public.finance_accounts FORCE ROW LEVEL SECURITY;


--
-- Name: finance_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_categories (
    id text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    is_tax_deductible boolean DEFAULT false NOT NULL,
    default_tax_code text,
    sort_order integer DEFAULT 100 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT finance_categories_kind_check CHECK ((kind = ANY (ARRAY['income'::text, 'expense'::text])))
);

ALTER TABLE ONLY public.finance_categories FORCE ROW LEVEL SECURITY;


--
-- Name: finance_report_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_report_snapshots (
    id text NOT NULL,
    kind text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    reporting_currency text DEFAULT 'GBP'::text NOT NULL,
    payload jsonb NOT NULL,
    generated_by text,
    generated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_report_snapshots_kind_check CHECK ((kind = ANY (ARRAY['pnl'::text, 'cashflow'::text, 'tax'::text]))),
    CONSTRAINT finance_report_snapshots_reporting_currency_check CHECK ((reporting_currency = ANY (ARRAY['GBP'::text, 'KES'::text])))
);

ALTER TABLE ONLY public.finance_report_snapshots FORCE ROW LEVEL SECURITY;


--
-- Name: finance_tax_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_tax_codes (
    id text NOT NULL,
    jurisdiction text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    rate_pct numeric(6,3) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    CONSTRAINT finance_tax_codes_jurisdiction_check CHECK ((jurisdiction = ANY (ARRAY['UK'::text, 'KE'::text]))),
    CONSTRAINT finance_tax_codes_kind_check CHECK ((kind = ANY (ARRAY['vat'::text, 'income_tax'::text, 'withholding'::text])))
);

ALTER TABLE ONLY public.finance_tax_codes FORCE ROW LEVEL SECURITY;


--
-- Name: finance_tax_periods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_tax_periods (
    id text NOT NULL,
    jurisdiction text NOT NULL,
    tax_kind text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    filed_on date,
    paid_on date,
    reference text,
    amount_due_minor bigint DEFAULT 0 NOT NULL,
    currency text DEFAULT 'GBP'::text NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_tax_periods_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text]))),
    CONSTRAINT finance_tax_periods_jurisdiction_check CHECK ((jurisdiction = ANY (ARRAY['UK'::text, 'KE'::text]))),
    CONSTRAINT finance_tax_periods_status_check CHECK ((status = ANY (ARRAY['open'::text, 'due'::text, 'filed'::text, 'overdue'::text, 'paid'::text]))),
    CONSTRAINT finance_tax_periods_tax_kind_check CHECK ((tax_kind = ANY (ARRAY['vat'::text, 'income_tax'::text])))
);

ALTER TABLE ONLY public.finance_tax_periods FORCE ROW LEVEL SECURITY;


--
-- Name: finance_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finance_transactions (
    id text NOT NULL,
    direction text NOT NULL,
    amount_minor bigint NOT NULL,
    currency text NOT NULL,
    amount_gbp_minor bigint DEFAULT 0 NOT NULL,
    amount_kes_minor bigint DEFAULT 0 NOT NULL,
    fx_rate_gbp_kes numeric(12,6),
    category_id text,
    account_id text,
    occurred_on date DEFAULT CURRENT_DATE NOT NULL,
    description text,
    counterparty text,
    reference text,
    tax_code text,
    tax_amount_minor bigint DEFAULT 0 NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    source_id text,
    attachment_url text,
    status text DEFAULT 'cleared'::text NOT NULL,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT finance_transactions_amount_minor_check CHECK ((amount_minor >= 0)),
    CONSTRAINT finance_transactions_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text]))),
    CONSTRAINT finance_transactions_direction_check CHECK ((direction = ANY (ARRAY['in'::text, 'out'::text]))),
    CONSTRAINT finance_transactions_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'payment'::text, 'customer_invoice'::text, 'agent_invoice'::text, 'tudor_invoice'::text]))),
    CONSTRAINT finance_transactions_status_check CHECK ((status = ANY (ARRAY['cleared'::text, 'pending'::text, 'void'::text])))
);

ALTER TABLE ONLY public.finance_transactions FORCE ROW LEVEL SECURITY;


--
-- Name: hs_code_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hs_code_tiers (
    hs_prefix character varying(10) NOT NULL,
    tier_key character varying(50) NOT NULL,
    notes text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: insurance_policies; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.insurance_policies (
    id text NOT NULL,
    parcel_id text NOT NULL,
    user_id text NOT NULL,
    tier text NOT NULL,
    declared_value_gbp real DEFAULT 0 NOT NULL,
    premium_gbp real DEFAULT 0 NOT NULL,
    cert_pdf_url text,
    status text DEFAULT 'active'::text,
    claimed_at timestamp with time zone,
    payout_gbp real DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT insurance_policies_status_check CHECK ((status = ANY (ARRAY['active'::text, 'claimed'::text, 'expired'::text, 'cancelled'::text]))),
    CONSTRAINT insurance_policies_tier_check CHECK ((tier = ANY (ARRAY['standard'::text, 'plus'::text, 'premier'::text, 'custom'::text])))
);


--
-- Name: last_mile_run_parcels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.last_mile_run_parcels (
    run_id text NOT NULL,
    parcel_id text NOT NULL,
    "position" integer NOT NULL,
    delivery_address_override text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.last_mile_run_parcels FORCE ROW LEVEL SECURITY;


--
-- Name: last_mile_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.last_mile_runs (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    rider_id text,
    zone text NOT NULL,
    run_date date NOT NULL,
    status text DEFAULT 'planned'::text,
    total_stops integer DEFAULT 0,
    completed_stops integer DEFAULT 0,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT last_mile_runs_status_check CHECK ((status = ANY (ARRAY['planned'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: lipana_events_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lipana_events_seen (
    event_id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.lipana_events_seen FORCE ROW LEVEL SECURITY;


--
-- Name: marketing_attributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_attributions (
    id text NOT NULL,
    user_id text NOT NULL,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    referrer text,
    landing_path text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    message text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notifications_type_check CHECK ((type = ANY (ARRAY['sms'::text, 'email'::text, 'whatsapp'::text, 'in_app'::text])))
);


--
-- Name: nps_invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nps_invitations (
    id text NOT NULL,
    user_id text,
    order_id text,
    responded_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: nps_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nps_responses (
    id text NOT NULL,
    user_id text,
    parcel_id text,
    score integer NOT NULL,
    comment text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT nps_responses_score_check CHECK (((score >= 0) AND (score <= 10)))
);


--
-- Name: orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.orders (
    id text NOT NULL,
    user_id text NOT NULL,
    tracking_number text NOT NULL,
    retailer text NOT NULL,
    status text DEFAULT 'pending'::text,
    description text NOT NULL,
    weight_kg real,
    dimensions_json text,
    shipping_speed text DEFAULT 'economy'::text,
    insurance boolean DEFAULT false,
    declared_value real DEFAULT 0,
    estimated_cost real,
    actual_cost real,
    customs_duty real DEFAULT 0,
    electronics_item text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    consolidation_id text,
    volumetric_kg real,
    chargeable_kg real,
    hold_reason text,
    hold_resolved_at timestamp with time zone,
    photographed_at timestamp with time zone,
    insurance_tier text,
    insurance_premium_gbp real DEFAULT 0,
    order_notes text,
    hs_tier text,
    CONSTRAINT orders_insurance_tier_check CHECK ((insurance_tier = ANY (ARRAY['standard'::text, 'plus'::text, 'premier'::text, 'custom'::text]))),
    CONSTRAINT orders_shipping_speed_check CHECK ((shipping_speed = ANY (ARRAY['economy'::text, 'express'::text]))),
    CONSTRAINT orders_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'received_at_warehouse'::text, 'consolidating'::text, 'in_transit'::text, 'customs'::text, 'out_for_delivery'::text, 'delivered'::text, 'cancelled'::text])))
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id text NOT NULL,
    order_id text NOT NULL,
    user_id text NOT NULL,
    description text NOT NULL,
    weight_kg real,
    status text DEFAULT 'pre_registered'::text,
    warehouse_location text,
    is_consolidated boolean DEFAULT false,
    consolidated_with text,
    received_at timestamp with time zone,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    barcode text,
    screening_result text,
    insurance_policy_id text,
    customer_consolidation_id uuid,
    consolidation_id text,
    CONSTRAINT packages_screening_result_check CHECK ((screening_result = ANY (ARRAY['clean'::text, 'held'::text, 'dg_suspect'::text]))),
    CONSTRAINT packages_status_check CHECK ((status = ANY (ARRAY['pre_registered'::text, 'received_at_warehouse'::text, 'photographed'::text, 'weighed'::text, 'screened'::text, 'manifested'::text, 'in_transit'::text, 'jkia_arrived'::text, 'awaiting_duty_payment'::text, 'released'::text, 'out_for_delivery'::text, 'delivered'::text, 'held'::text, 'held_at_nairobi_hub'::text, 'abandoned'::text, 'lost'::text])))
);


--
-- Name: pallets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pallets (
    id text NOT NULL,
    consolidation_id text NOT NULL,
    label text NOT NULL,
    weight_kg real DEFAULT 0,
    photo_url text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: parcel_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.parcel_items (
    id text NOT NULL,
    parcel_id text NOT NULL,
    description text NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit_value_gbp real DEFAULT 0 NOT NULL,
    hs_code text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id text NOT NULL,
    user_id text NOT NULL,
    token text NOT NULL,
    token_sha256 bytea,
    expires_at timestamp with time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id text NOT NULL,
    user_id text NOT NULL,
    target_kind text NOT NULL,
    target_id text NOT NULL,
    amount_gross_kes bigint NOT NULL,
    amount_credit_kes bigint DEFAULT 0 NOT NULL,
    amount_due_kes bigint NOT NULL,
    currency text DEFAULT 'KES'::text NOT NULL,
    method text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    stripe_payment_intent_id text,
    stripe_charge_id text,
    stripe_amount_pence_gbp bigint,
    stripe_fx_rate_kes_gbp numeric(12,6),
    mpesa_message_raw text,
    mpesa_reference text,
    mpesa_phone text,
    mpesa_message_amount_kes bigint,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    rejection_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_at timestamp with time zone,
    approval_override_reason text,
    mpesa_provider text,
    lipana_transaction_id text,
    lipana_checkout_request_id text,
    mpesa_phone_used text,
    CONSTRAINT payments_amount_credit_kes_check CHECK ((amount_credit_kes >= 0)),
    CONSTRAINT payments_amount_due_kes_check CHECK ((amount_due_kes >= 0)),
    CONSTRAINT payments_amount_gross_kes_check CHECK ((amount_gross_kes >= 0)),
    CONSTRAINT payments_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text]))),
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['stripe'::text, 'mpesa'::text]))),
    CONSTRAINT payments_mpesa_provider_chk CHECK (((mpesa_provider IS NULL) OR (mpesa_provider = ANY (ARRAY['manual'::text, 'lipana'::text])))),
    CONSTRAINT payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'awaiting_review'::text, 'paid'::text, 'failed'::text, 'rejected'::text, 'cancelled'::text]))),
    CONSTRAINT payments_target_kind_check CHECK ((target_kind = ANY (ARRAY['consolidation'::text, 'buy_for_me'::text, 'order'::text])))
);

ALTER TABLE ONLY public.payments REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.payments FORCE ROW LEVEL SECURITY;


--
-- Name: COLUMN payments.approval_override_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.approval_override_reason IS 'Admin justification when /approve was forced through an amount mismatch (audit P1.2). NULL on clean approvals.';


--
-- Name: COLUMN payments.mpesa_provider; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.mpesa_provider IS 'Which M-Pesa flow drove this row: ''manual'' (paste-SMS) or ''lipana'' (STK Push). NULL on pre-038 rows.';


--
-- Name: COLUMN payments.lipana_transaction_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.lipana_transaction_id IS 'Lipana TXN id returned from /transactions/push-stk. UNIQUE — webhook redelivery guard.';


--
-- Name: COLUMN payments.lipana_checkout_request_id; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.lipana_checkout_request_id IS 'Lipana ws_CO_… checkout-request id. iOS polls /payments/:id/status with this in flight.';


--
-- Name: COLUMN payments.mpesa_phone_used; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.payments.mpesa_phone_used IS 'Phone number the STK push was sent to (E.164-ish, normalized to 254XXXXXXXXX).';


--
-- Name: pod_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_events (
    id text DEFAULT (gen_random_uuid())::text NOT NULL,
    parcel_id text NOT NULL,
    run_id text,
    rider_id text,
    result text DEFAULT 'delivered'::text,
    captured_at timestamp with time zone DEFAULT now(),
    photo_url text,
    signature_url text,
    otp_used text,
    recipient_name text,
    recipient_phone text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    photo_path text,
    signature_path text,
    CONSTRAINT pod_events_result_check CHECK ((result = ANY (ARRAY['delivered'::text, 'failed'::text, 'reattempt'::text, 'held'::text])))
);


--
-- Name: pod_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pod_otps (
    parcel_id text NOT NULL,
    otp_hash bytea NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed boolean DEFAULT false NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.pod_otps FORCE ROW LEVEL SECURITY;


--
-- Name: pricing_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_settings (
    key text NOT NULL,
    value numeric(12,4) NOT NULL,
    currency character varying(3),
    is_percent boolean DEFAULT false NOT NULL,
    label text,
    notes text,
    updated_by text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pricing_tiers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pricing_tiers (
    id text NOT NULL,
    channel text NOT NULL,
    min_kg real NOT NULL,
    max_kg real NOT NULL,
    gbp_per_kg real NOT NULL,
    effective_from timestamp with time zone DEFAULT now(),
    effective_to timestamp with time zone,
    is_active boolean DEFAULT true,
    notes text,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: prohibited_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prohibited_items (
    id text NOT NULL,
    term text NOT NULL,
    severity text DEFAULT 'prohibited'::text,
    jurisdiction text DEFAULT 'KE'::text,
    language text DEFAULT 'en'::text,
    reason text,
    last_reviewed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT prohibited_items_severity_check CHECK ((severity = ANY (ARRAY['prohibited'::text, 'restricted'::text])))
);


--
-- Name: promotions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.promotions (
    id text NOT NULL,
    code text NOT NULL,
    type text NOT NULL,
    value real NOT NULL,
    valid_from timestamp with time zone DEFAULT now(),
    valid_to timestamp with time zone,
    max_uses integer,
    uses integer DEFAULT 0,
    is_active boolean DEFAULT true,
    description text,
    created_at timestamp with time zone DEFAULT now(),
    currency text DEFAULT 'GBP'::text,
    CONSTRAINT promotions_currency_check CHECK ((currency = ANY (ARRAY['GBP'::text, 'KES'::text]))),
    CONSTRAINT promotions_type_check CHECK ((type = ANY (ARRAY['flat_gbp_per_kg'::text, 'percent_off'::text, 'fixed_off'::text])))
);


--
-- Name: push_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_subscriptions (
    id text NOT NULL,
    user_id text NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    user_agent text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pvoc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pvoc_documents (
    id text NOT NULL,
    consolidation_id text NOT NULL,
    type text NOT NULL,
    doc_url text NOT NULL,
    issued_by text,
    issued_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT pvoc_documents_type_check CHECK ((type = ANY (ARRAY['coc'::text, 'rfc'::text, 'exemption'::text, 'other'::text])))
);


--
-- Name: referrals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.referrals (
    id text NOT NULL,
    referrer_id text NOT NULL,
    referee_id text,
    referral_code text NOT NULL,
    status text DEFAULT 'pending'::text,
    reward_amount real DEFAULT 50,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT referrals_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text])))
);


--
-- Name: request_idempotency; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_idempotency (
    idempotency_key text NOT NULL,
    user_id text,
    method text NOT NULL,
    path text NOT NULL,
    status_code integer,
    response_body jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: retailers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.retailers (
    id text NOT NULL,
    name text NOT NULL,
    country text NOT NULL,
    base_url text NOT NULL,
    logo_url text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 100 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT retailers_country_check CHECK ((country = ANY (ARRAY['UK'::text, 'Other'::text])))
);

ALTER TABLE ONLY public.retailers FORCE ROW LEVEL SECURITY;


--
-- Name: revoked_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.revoked_tokens (
    token_sha256 bytea NOT NULL,
    user_id uuid NOT NULL,
    revoked_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL
);

ALTER TABLE ONLY public.revoked_tokens FORCE ROW LEVEL SECURITY;


--
-- Name: stripe_events_seen; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stripe_events_seen (
    event_id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.stripe_events_seen FORCE ROW LEVEL SECURITY;


--
-- Name: ticket_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ticket_messages (
    id text NOT NULL,
    ticket_id text NOT NULL,
    sender_id text NOT NULL,
    message text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    attachment_url text
);


--
-- Name: tickets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tickets (
    id text NOT NULL,
    user_id text NOT NULL,
    subject text NOT NULL,
    description text NOT NULL,
    status text DEFAULT 'open'::text,
    priority text DEFAULT 'medium'::text,
    photo_url text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    idempotency_key text,
    CONSTRAINT tickets_priority_check CHECK ((priority = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))),
    CONSTRAINT tickets_status_check CHECK ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'resolved'::text, 'closed'::text])))
);


--
-- Name: transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transactions (
    id text NOT NULL,
    user_id text NOT NULL,
    type text NOT NULL,
    amount real NOT NULL,
    currency text DEFAULT 'KES'::text,
    payment_method text,
    payment_reference text,
    status text DEFAULT 'pending'::text,
    created_at timestamp with time zone DEFAULT now(),
    idempotency_key text,
    reconciled_at timestamp with time zone,
    processor_fee_gbp real DEFAULT 0,
    CONSTRAINT transactions_currency_check CHECK (((currency IS NULL) OR (currency = ANY (ARRAY['GBP'::text, 'KES'::text])))),
    CONSTRAINT transactions_payment_method_check CHECK ((payment_method = ANY (ARRAY['mpesa'::text, 'stripe'::text, 'paypal'::text, 'wallet'::text]))),
    CONSTRAINT transactions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'failed'::text]))),
    CONSTRAINT transactions_type_check CHECK ((type = ANY (ARRAY['deposit'::text, 'payment'::text, 'refund'::text, 'referral_credit'::text])))
);


--
-- Name: tudor_invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tudor_invoices (
    id text NOT NULL,
    consolidation_id text,
    invoice_no text,
    amount_gbp real DEFAULT 0 NOT NULL,
    breakdown_json text,
    doc_url text,
    status text DEFAULT 'received'::text,
    created_at timestamp with time zone DEFAULT now(),
    paid_at timestamp with time zone,
    CONSTRAINT tudor_invoices_status_check CHECK ((status = ANY (ARRAY['received'::text, 'approved'::text, 'paid'::text, 'disputed'::text])))
);


--
-- Name: user_credits; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_credits (
    user_id text NOT NULL,
    balance_kes bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE ONLY public.user_credits REPLICA IDENTITY FULL;

ALTER TABLE ONLY public.user_credits FORCE ROW LEVEL SECURITY;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    name text NOT NULL,
    full_name text,
    phone text NOT NULL,
    role text DEFAULT 'customer'::text,
    warehouse_id text NOT NULL,
    language_pref text DEFAULT 'en'::text,
    referral_code text NOT NULL,
    referred_by text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    country_of_residence text,
    kyc_status text DEFAULT 'none'::text,
    kyc_doc_url text,
    marketing_consent_at timestamp with time zone,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    two_fa_enabled boolean DEFAULT false,
    password_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    delivery_address text,
    admin_notes text,
    email_verified_at timestamp with time zone,
    whatsapp_opt_in boolean DEFAULT false NOT NULL,
    phone_2fa_enabled boolean DEFAULT false NOT NULL,
    can_manage_finances boolean DEFAULT false NOT NULL,
    CONSTRAINT users_kyc_status_check CHECK ((kyc_status = ANY (ARRAY['none'::text, 'pending'::text, 'verified'::text, 'rejected'::text]))),
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['customer'::text, 'admin'::text, 'operator'::text, 'clearing_agent'::text, 'rider'::text])))
);


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id text NOT NULL,
    user_id text,
    parcel_id text,
    template text NOT NULL,
    payload_json text,
    status text DEFAULT 'queued'::text,
    language text DEFAULT 'en'::text,
    sent_at timestamp with time zone,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT whatsapp_messages_status_check CHECK ((status = ANY (ARRAY['queued'::text, 'sent'::text, 'failed'::text, 'delivered'::text, 'read'::text])))
);

ALTER TABLE ONLY public.whatsapp_messages FORCE ROW LEVEL SECURITY;


--
-- Name: exchange_rates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates ALTER COLUMN id SET DEFAULT nextval('public.exchange_rates_id_seq'::regclass);


--
-- Name: _migrations _migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_migrations_pkey') THEN
    ALTER TABLE ONLY public._migrations ADD CONSTRAINT _migrations_pkey PRIMARY KEY (filename);
  END IF;
END $$;


--
-- Name: account_deletion_requests account_deletion_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_pkey PRIMARY KEY (id);


--
-- Name: admin_logs admin_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_pkey PRIMARY KEY (id);


--
-- Name: agent_invoices agent_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invoices
    ADD CONSTRAINT agent_invoices_pkey PRIMARY KEY (id);


--
-- Name: aml_flags aml_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_flags
    ADD CONSTRAINT aml_flags_pkey PRIMARY KEY (id);


--
-- Name: auth_otps auth_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otps
    ADD CONSTRAINT auth_otps_pkey PRIMARY KEY (id);


--
-- Name: backups backups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_pkey PRIMARY KEY (id);


--
-- Name: buy_for_me_orders buy_for_me_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_for_me_orders
    ADD CONSTRAINT buy_for_me_orders_pkey PRIMARY KEY (id);


--
-- Name: compliance_trainings compliance_trainings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_trainings
    ADD CONSTRAINT compliance_trainings_pkey PRIMARY KEY (id);


--
-- Name: consolidations consolidations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consolidations
    ADD CONSTRAINT consolidations_pkey PRIMARY KEY (id);


--
-- Name: credit_ledger credit_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_pkey PRIMARY KEY (id);


--
-- Name: customer_consolidations customer_consolidations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consolidations
    ADD CONSTRAINT customer_consolidations_pkey PRIMARY KEY (id);


--
-- Name: customs_entries customs_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customs_entries
    ADD CONSTRAINT customs_entries_pkey PRIMARY KEY (id);


--
-- Name: customs_tiers customs_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customs_tiers
    ADD CONSTRAINT customs_tiers_pkey PRIMARY KEY (tier_key);


--
-- Name: dsar_requests dsar_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsar_requests
    ADD CONSTRAINT dsar_requests_pkey PRIMARY KEY (id);


--
-- Name: electronics_fees electronics_fees_item_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electronics_fees
    ADD CONSTRAINT electronics_fees_item_key_key UNIQUE (item_key);


--
-- Name: electronics_fees electronics_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.electronics_fees
    ADD CONSTRAINT electronics_fees_pkey PRIMARY KEY (id);


--
-- Name: email_logs email_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_key UNIQUE (token);


--
-- Name: error_logs error_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.error_logs
    ADD CONSTRAINT error_logs_pkey PRIMARY KEY (id);


--
-- Name: exchange_rates exchange_rates_currency_pair_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_currency_pair_key UNIQUE (currency_pair);


--
-- Name: exchange_rates exchange_rates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_pkey PRIMARY KEY (id);


--
-- Name: fees fees_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_code_key UNIQUE (code);


--
-- Name: fees fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.fees
    ADD CONSTRAINT fees_pkey PRIMARY KEY (id);


--
-- Name: finance_accounts finance_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_accounts
    ADD CONSTRAINT finance_accounts_pkey PRIMARY KEY (id);


--
-- Name: finance_categories finance_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_categories
    ADD CONSTRAINT finance_categories_pkey PRIMARY KEY (id);


--
-- Name: finance_report_snapshots finance_report_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_report_snapshots
    ADD CONSTRAINT finance_report_snapshots_pkey PRIMARY KEY (id);


--
-- Name: finance_tax_codes finance_tax_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_tax_codes
    ADD CONSTRAINT finance_tax_codes_pkey PRIMARY KEY (id);


--
-- Name: finance_tax_periods finance_tax_periods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_tax_periods
    ADD CONSTRAINT finance_tax_periods_pkey PRIMARY KEY (id);


--
-- Name: finance_transactions finance_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_pkey PRIMARY KEY (id);


--
-- Name: hs_code_tiers hs_code_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hs_code_tiers
    ADD CONSTRAINT hs_code_tiers_pkey PRIMARY KEY (hs_prefix);


--
-- Name: insurance_policies insurance_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_pkey PRIMARY KEY (id);


--
-- Name: last_mile_run_parcels last_mile_run_parcels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_mile_run_parcels
    ADD CONSTRAINT last_mile_run_parcels_pkey PRIMARY KEY (run_id, parcel_id);


--
-- Name: last_mile_runs last_mile_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_mile_runs
    ADD CONSTRAINT last_mile_runs_pkey PRIMARY KEY (id);


--
-- Name: lipana_events_seen lipana_events_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lipana_events_seen
    ADD CONSTRAINT lipana_events_seen_pkey PRIMARY KEY (event_id);


--
-- Name: marketing_attributions marketing_attributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_attributions
    ADD CONSTRAINT marketing_attributions_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: nps_invitations nps_invitations_order_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_order_id_key UNIQUE (order_id);


--
-- Name: nps_invitations nps_invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_pkey PRIMARY KEY (id);


--
-- Name: nps_responses nps_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_responses
    ADD CONSTRAINT nps_responses_pkey PRIMARY KEY (id);


--
-- Name: orders orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);


--
-- Name: orders orders_tracking_number_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_tracking_number_key UNIQUE (tracking_number);


--
-- Name: packages packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: pallets pallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallets
    ADD CONSTRAINT pallets_pkey PRIMARY KEY (id);


--
-- Name: parcel_items parcel_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_items
    ADD CONSTRAINT parcel_items_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payments payments_stripe_payment_intent_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_stripe_payment_intent_id_key UNIQUE (stripe_payment_intent_id);


--
-- Name: pod_events pod_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_events
    ADD CONSTRAINT pod_events_pkey PRIMARY KEY (id);


--
-- Name: pod_otps pod_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_otps
    ADD CONSTRAINT pod_otps_pkey PRIMARY KEY (parcel_id);


--
-- Name: pricing_settings pricing_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_settings
    ADD CONSTRAINT pricing_settings_pkey PRIMARY KEY (key);


--
-- Name: pricing_tiers pricing_tiers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_tiers
    ADD CONSTRAINT pricing_tiers_pkey PRIMARY KEY (id);


--
-- Name: prohibited_items prohibited_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prohibited_items
    ADD CONSTRAINT prohibited_items_pkey PRIMARY KEY (id);


--
-- Name: promotions promotions_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_code_key UNIQUE (code);


--
-- Name: promotions promotions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.promotions
    ADD CONSTRAINT promotions_pkey PRIMARY KEY (id);


--
-- Name: push_subscriptions push_subscriptions_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);


--
-- Name: push_subscriptions push_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);


--
-- Name: pvoc_documents pvoc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvoc_documents
    ADD CONSTRAINT pvoc_documents_pkey PRIMARY KEY (id);


--
-- Name: referrals referrals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_pkey PRIMARY KEY (id);


--
-- Name: request_idempotency request_idempotency_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_idempotency
    ADD CONSTRAINT request_idempotency_pkey PRIMARY KEY (idempotency_key);


--
-- Name: retailers retailers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.retailers
    ADD CONSTRAINT retailers_pkey PRIMARY KEY (id);


--
-- Name: revoked_tokens revoked_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.revoked_tokens
    ADD CONSTRAINT revoked_tokens_pkey PRIMARY KEY (token_sha256);


--
-- Name: stripe_events_seen stripe_events_seen_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stripe_events_seen
    ADD CONSTRAINT stripe_events_seen_pkey PRIMARY KEY (event_id);


--
-- Name: ticket_messages ticket_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_pkey PRIMARY KEY (id);


--
-- Name: tickets tickets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);


--
-- Name: transactions transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);


--
-- Name: tudor_invoices tudor_invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tudor_invoices
    ADD CONSTRAINT tudor_invoices_pkey PRIMARY KEY (id);


--
-- Name: user_credits user_credits_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_credits
    ADD CONSTRAINT user_credits_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: users users_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referral_code_key UNIQUE (referral_code);


--
-- Name: users users_warehouse_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_warehouse_id_key UNIQUE (warehouse_id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: account_deletion_requests_active_uniq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_deletion_requests_active_uniq ON public.account_deletion_requests USING btree (user_id) WHERE ((cancelled_at IS NULL) AND (completed_at IS NULL));


--
-- Name: account_deletion_requests_due_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX account_deletion_requests_due_idx ON public.account_deletion_requests USING btree (scheduled_deletion_at) WHERE ((cancelled_at IS NULL) AND (completed_at IS NULL));


--
-- Name: idx_admin_logs_admin_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_logs_admin_id ON public.admin_logs USING btree (admin_id);


--
-- Name: idx_agent_invoices_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_invoices_agent ON public.agent_invoices USING btree (agent_id);


--
-- Name: idx_agent_invoices_consolidation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_agent_invoices_consolidation_id ON public.agent_invoices USING btree (consolidation_id);


--
-- Name: idx_aml_flags_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aml_flags_parcel_id ON public.aml_flags USING btree (parcel_id);


--
-- Name: idx_aml_flags_resolved_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aml_flags_resolved_by ON public.aml_flags USING btree (resolved_by);


--
-- Name: idx_aml_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aml_status ON public.aml_flags USING btree (status);


--
-- Name: idx_aml_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_aml_user ON public.aml_flags USING btree (user_id);


--
-- Name: idx_auth_otps_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otps_expires_at ON public.auth_otps USING btree (expires_at);


--
-- Name: idx_auth_otps_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_auth_otps_user_id ON public.auth_otps USING btree (user_id);


--
-- Name: idx_backups_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_backups_created_by ON public.backups USING btree (created_by);


--
-- Name: idx_bfm_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bfm_status ON public.buy_for_me_orders USING btree (status);


--
-- Name: idx_bfm_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bfm_user ON public.buy_for_me_orders USING btree (user_id);


--
-- Name: idx_buy_for_me_orders_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_buy_for_me_orders_parcel_id ON public.buy_for_me_orders USING btree (parcel_id);


--
-- Name: idx_consolidations_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consolidations_agent ON public.consolidations USING btree (assigned_agent_id);


--
-- Name: idx_consolidations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consolidations_status ON public.consolidations USING btree (status);


--
-- Name: idx_consolidations_week_start; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consolidations_week_start ON public.consolidations USING btree (week_start);


--
-- Name: idx_credit_ledger_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_credit_ledger_user_created ON public.credit_ledger USING btree (user_id, created_at DESC);


--
-- Name: idx_customer_consolidations_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_consolidations_created_by ON public.customer_consolidations USING btree (created_by);


--
-- Name: idx_customer_consolidations_shipping_cons_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_consolidations_shipping_cons_id ON public.customer_consolidations USING btree (shipping_consolidation_id);


--
-- Name: idx_customer_consolidations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_consolidations_status ON public.customer_consolidations USING btree (status);


--
-- Name: idx_customer_consolidations_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customer_consolidations_user ON public.customer_consolidations USING btree (user_id);


--
-- Name: idx_customs_entries_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customs_entries_agent ON public.customs_entries USING btree (agent_id);


--
-- Name: idx_customs_entries_parcel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customs_entries_parcel ON public.customs_entries USING btree (parcel_id);


--
-- Name: idx_customs_entries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customs_entries_status ON public.customs_entries USING btree (status);


--
-- Name: idx_customs_tiers_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_customs_tiers_updated_by ON public.customs_tiers USING btree (updated_by);


--
-- Name: idx_dsar_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsar_status ON public.dsar_requests USING btree (status);


--
-- Name: idx_dsar_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsar_user ON public.dsar_requests USING btree (user_id);


--
-- Name: idx_email_logs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_logs_user_id ON public.email_logs USING btree (user_id);


--
-- Name: idx_email_verification_token_sha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_token_sha ON public.email_verification_tokens USING btree (token_sha256);


--
-- Name: idx_email_verification_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_verification_user ON public.email_verification_tokens USING btree (user_id);


--
-- Name: idx_error_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_error_logs_created ON public.error_logs USING btree (created_at);


--
-- Name: idx_exchange_rates_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_exchange_rates_updated_by ON public.exchange_rates USING btree (updated_by);


--
-- Name: idx_finance_report_snapshots_generated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_report_snapshots_generated_by ON public.finance_report_snapshots USING btree (generated_by);


--
-- Name: idx_finance_tax_periods_due; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tax_periods_due ON public.finance_tax_periods USING btree (due_date);


--
-- Name: idx_finance_transactions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_transactions_created_by ON public.finance_transactions USING btree (created_by);


--
-- Name: idx_finance_transactions_tax_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_transactions_tax_code ON public.finance_transactions USING btree (tax_code);


--
-- Name: idx_finance_tx_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tx_account ON public.finance_transactions USING btree (account_id);


--
-- Name: idx_finance_tx_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tx_category ON public.finance_transactions USING btree (category_id);


--
-- Name: idx_finance_tx_dir_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tx_dir_occurred ON public.finance_transactions USING btree (direction, occurred_on DESC);


--
-- Name: idx_finance_tx_occurred; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_finance_tx_occurred ON public.finance_transactions USING btree (occurred_on DESC);


--
-- Name: idx_hs_code_tiers_tier_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hs_code_tiers_tier_key ON public.hs_code_tiers USING btree (tier_key);


--
-- Name: idx_hs_code_tiers_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hs_code_tiers_updated_by ON public.hs_code_tiers USING btree (updated_by);


--
-- Name: idx_insurance_policies_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_policies_parcel_id ON public.insurance_policies USING btree (parcel_id);


--
-- Name: idx_insurance_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_insurance_user ON public.insurance_policies USING btree (user_id);


--
-- Name: idx_last_mile_run_parcels_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_last_mile_run_parcels_parcel_id ON public.last_mile_run_parcels USING btree (parcel_id);


--
-- Name: idx_last_mile_run_parcels_run_id_position; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_last_mile_run_parcels_run_id_position ON public.last_mile_run_parcels USING btree (run_id, "position");


--
-- Name: idx_marketing_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_user ON public.marketing_attributions USING btree (user_id);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id);


--
-- Name: idx_nps_invitations_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_invitations_user_id ON public.nps_invitations USING btree (user_id);


--
-- Name: idx_nps_responses_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_responses_parcel_id ON public.nps_responses USING btree (parcel_id);


--
-- Name: idx_nps_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nps_user ON public.nps_responses USING btree (user_id);


--
-- Name: idx_orders_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_consolidation ON public.orders USING btree (consolidation_id) WHERE (consolidation_id IS NOT NULL);


--
-- Name: idx_orders_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_status ON public.orders USING btree (status);


--
-- Name: idx_orders_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_orders_user_id ON public.orders USING btree (user_id);


--
-- Name: idx_packages_barcode_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_packages_barcode_unique ON public.packages USING btree (barcode) WHERE (barcode IS NOT NULL);


--
-- Name: idx_packages_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packages_consolidation ON public.packages USING btree (consolidation_id) WHERE (consolidation_id IS NOT NULL);


--
-- Name: idx_packages_customer_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packages_customer_consolidation ON public.packages USING btree (customer_consolidation_id);


--
-- Name: idx_packages_order_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packages_order_id ON public.packages USING btree (order_id);


--
-- Name: idx_packages_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_packages_user_id ON public.packages USING btree (user_id);


--
-- Name: idx_pallets_consolidation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pallets_consolidation ON public.pallets USING btree (consolidation_id);


--
-- Name: idx_parcel_items_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_parcel_items_parcel_id ON public.parcel_items USING btree (parcel_id);


--
-- Name: idx_password_reset_tokens_sha256; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_password_reset_tokens_sha256 ON public.password_reset_tokens USING btree (token_sha256) WHERE (token_sha256 IS NOT NULL);


--
-- Name: idx_password_reset_tokens_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_password_reset_tokens_user_id ON public.password_reset_tokens USING btree (user_id);


--
-- Name: idx_payments_reviewed_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_reviewed_by ON public.payments USING btree (reviewed_by);


--
-- Name: idx_payments_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_status ON public.payments USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'awaiting_review'::text]));


--
-- Name: idx_payments_target; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_target ON public.payments USING btree (target_kind, target_id);


--
-- Name: idx_payments_user_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_user_created ON public.payments USING btree (user_id, created_at DESC);


--
-- Name: idx_pod_events_run_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_events_run_id ON public.pod_events USING btree (run_id);


--
-- Name: idx_pod_parcel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_parcel ON public.pod_events USING btree (parcel_id);


--
-- Name: idx_pod_rider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pod_rider ON public.pod_events USING btree (rider_id);


--
-- Name: idx_pricing_settings_updated_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pricing_settings_updated_by ON public.pricing_settings USING btree (updated_by);


--
-- Name: idx_push_subs_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_push_subs_user ON public.push_subscriptions USING btree (user_id);


--
-- Name: idx_pvoc_documents_consolidation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pvoc_documents_consolidation_id ON public.pvoc_documents USING btree (consolidation_id);


--
-- Name: idx_referrals_referee_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referee_id ON public.referrals USING btree (referee_id);


--
-- Name: idx_referrals_referrer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_referrals_referrer_id ON public.referrals USING btree (referrer_id);


--
-- Name: idx_request_idempotency_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_request_idempotency_created_at ON public.request_idempotency USING btree (created_at);


--
-- Name: idx_retailers_active_sorted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_retailers_active_sorted ON public.retailers USING btree (is_active, sort_order, name);


--
-- Name: idx_runs_rider; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_runs_rider ON public.last_mile_runs USING btree (rider_id);


--
-- Name: idx_runs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_runs_status ON public.last_mile_runs USING btree (status);


--
-- Name: idx_ticket_messages_sender_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_messages_sender_id ON public.ticket_messages USING btree (sender_id);


--
-- Name: idx_ticket_messages_ticket_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ticket_messages_ticket_id ON public.ticket_messages USING btree (ticket_id);


--
-- Name: idx_tickets_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tickets_user_id ON public.tickets USING btree (user_id);


--
-- Name: idx_tickets_user_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_tickets_user_idempotency_unique ON public.tickets USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_trainings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_trainings_user ON public.compliance_trainings USING btree (user_id);


--
-- Name: idx_transactions_idempotency_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_transactions_idempotency_unique ON public.transactions USING btree (idempotency_key) WHERE (idempotency_key IS NOT NULL);


--
-- Name: idx_transactions_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);


--
-- Name: idx_tudor_invoices_consolidation_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tudor_invoices_consolidation_id ON public.tudor_invoices USING btree (consolidation_id);


--
-- Name: idx_users_referred_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_referred_by ON public.users USING btree (referred_by);


--
-- Name: idx_whatsapp_messages_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_created_at ON public.whatsapp_messages USING btree (created_at);


--
-- Name: idx_whatsapp_messages_parcel_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_parcel_id ON public.whatsapp_messages USING btree (parcel_id);


--
-- Name: idx_whatsapp_messages_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_user_id ON public.whatsapp_messages USING btree (user_id);


--
-- Name: uq_finance_tx_source; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_finance_tx_source ON public.finance_transactions USING btree (source, source_id) WHERE (source <> 'manual'::text);


--
-- Name: uq_payments_lipana_txn; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payments_lipana_txn ON public.payments USING btree (lipana_transaction_id) WHERE ((lipana_transaction_id IS NOT NULL) AND (status = ANY (ARRAY['paid'::text, 'awaiting_review'::text, 'pending'::text])));


--
-- Name: uq_payments_mpesa_ref; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_payments_mpesa_ref ON public.payments USING btree (mpesa_reference) WHERE ((mpesa_reference IS NOT NULL) AND (status = ANY (ARRAY['paid'::text, 'awaiting_review'::text])));


--
-- Name: customer_consolidations trg_customer_consolidations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_customer_consolidations_updated_at BEFORE UPDATE ON public.customer_consolidations FOR EACH ROW EXECUTE FUNCTION public.touch_customer_consolidations_updated_at();


--
-- Name: finance_transactions trg_finance_tx_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_finance_tx_updated_at BEFORE UPDATE ON public.finance_transactions FOR EACH ROW EXECUTE FUNCTION public.touch_finance_tx_updated_at();


--
-- Name: payments trg_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_payments_updated_at();


--
-- Name: account_deletion_requests account_deletion_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_deletion_requests
    ADD CONSTRAINT account_deletion_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: admin_logs admin_logs_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_logs
    ADD CONSTRAINT admin_logs_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: agent_invoices agent_invoices_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invoices
    ADD CONSTRAINT agent_invoices_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: agent_invoices agent_invoices_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_invoices
    ADD CONSTRAINT agent_invoices_consolidation_id_fkey FOREIGN KEY (consolidation_id) REFERENCES public.consolidations(id) ON DELETE SET NULL;


--
-- Name: aml_flags aml_flags_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_flags
    ADD CONSTRAINT aml_flags_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: aml_flags aml_flags_resolved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_flags
    ADD CONSTRAINT aml_flags_resolved_by_fkey FOREIGN KEY (resolved_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: aml_flags aml_flags_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.aml_flags
    ADD CONSTRAINT aml_flags_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: auth_otps auth_otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_otps
    ADD CONSTRAINT auth_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: backups backups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.backups
    ADD CONSTRAINT backups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: buy_for_me_orders buy_for_me_orders_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_for_me_orders
    ADD CONSTRAINT buy_for_me_orders_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: buy_for_me_orders buy_for_me_orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buy_for_me_orders
    ADD CONSTRAINT buy_for_me_orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: compliance_trainings compliance_trainings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.compliance_trainings
    ADD CONSTRAINT compliance_trainings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: consolidations consolidations_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consolidations
    ADD CONSTRAINT consolidations_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: credit_ledger credit_ledger_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credit_ledger
    ADD CONSTRAINT credit_ledger_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customer_consolidations customer_consolidations_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consolidations
    ADD CONSTRAINT customer_consolidations_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customer_consolidations customer_consolidations_shipping_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consolidations
    ADD CONSTRAINT customer_consolidations_shipping_consolidation_id_fkey FOREIGN KEY (shipping_consolidation_id) REFERENCES public.consolidations(id) ON DELETE SET NULL;


--
-- Name: customer_consolidations customer_consolidations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customer_consolidations
    ADD CONSTRAINT customer_consolidations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: customs_entries customs_entries_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customs_entries
    ADD CONSTRAINT customs_entries_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: customs_entries customs_entries_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customs_entries
    ADD CONSTRAINT customs_entries_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: customs_tiers customs_tiers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.customs_tiers
    ADD CONSTRAINT customs_tiers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: dsar_requests dsar_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsar_requests
    ADD CONSTRAINT dsar_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: email_logs email_logs_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_logs
    ADD CONSTRAINT email_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: email_verification_tokens email_verification_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: exchange_rates exchange_rates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.exchange_rates
    ADD CONSTRAINT exchange_rates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: finance_report_snapshots finance_report_snapshots_generated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_report_snapshots
    ADD CONSTRAINT finance_report_snapshots_generated_by_fkey FOREIGN KEY (generated_by) REFERENCES public.users(id);


--
-- Name: finance_transactions finance_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.finance_accounts(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE SET NULL;


--
-- Name: finance_transactions finance_transactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: finance_transactions finance_transactions_tax_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finance_transactions
    ADD CONSTRAINT finance_transactions_tax_code_fkey FOREIGN KEY (tax_code) REFERENCES public.finance_tax_codes(id) ON DELETE SET NULL;


--
-- Name: hs_code_tiers hs_code_tiers_tier_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hs_code_tiers
    ADD CONSTRAINT hs_code_tiers_tier_key_fkey FOREIGN KEY (tier_key) REFERENCES public.customs_tiers(tier_key) ON DELETE RESTRICT;


--
-- Name: hs_code_tiers hs_code_tiers_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hs_code_tiers
    ADD CONSTRAINT hs_code_tiers_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: insurance_policies insurance_policies_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: insurance_policies insurance_policies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.insurance_policies
    ADD CONSTRAINT insurance_policies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: last_mile_run_parcels last_mile_run_parcels_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_mile_run_parcels
    ADD CONSTRAINT last_mile_run_parcels_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: last_mile_run_parcels last_mile_run_parcels_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_mile_run_parcels
    ADD CONSTRAINT last_mile_run_parcels_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.last_mile_runs(id) ON DELETE CASCADE;


--
-- Name: last_mile_runs last_mile_runs_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.last_mile_runs
    ADD CONSTRAINT last_mile_runs_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: marketing_attributions marketing_attributions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_attributions
    ADD CONSTRAINT marketing_attributions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nps_invitations nps_invitations_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: nps_invitations nps_invitations_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_invitations
    ADD CONSTRAINT nps_invitations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: nps_responses nps_responses_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_responses
    ADD CONSTRAINT nps_responses_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: nps_responses nps_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nps_responses
    ADD CONSTRAINT nps_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: orders orders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.orders
    ADD CONSTRAINT orders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: packages packages_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_consolidation_id_fkey FOREIGN KEY (consolidation_id) REFERENCES public.consolidations(id) ON DELETE SET NULL;


--
-- Name: packages packages_customer_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_customer_consolidation_id_fkey FOREIGN KEY (customer_consolidation_id) REFERENCES public.customer_consolidations(id) ON DELETE SET NULL;


--
-- Name: packages packages_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: packages packages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pallets pallets_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pallets
    ADD CONSTRAINT pallets_consolidation_id_fkey FOREIGN KEY (consolidation_id) REFERENCES public.consolidations(id) ON DELETE CASCADE;


--
-- Name: parcel_items parcel_items_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.parcel_items
    ADD CONSTRAINT parcel_items_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: payments payments_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: payments payments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pod_events pod_events_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_events
    ADD CONSTRAINT pod_events_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: pod_events pod_events_rider_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_events
    ADD CONSTRAINT pod_events_rider_id_fkey FOREIGN KEY (rider_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: pod_events pod_events_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_events
    ADD CONSTRAINT pod_events_run_id_fkey FOREIGN KEY (run_id) REFERENCES public.last_mile_runs(id) ON DELETE SET NULL;


--
-- Name: pod_otps pod_otps_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pod_otps
    ADD CONSTRAINT pod_otps_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE CASCADE;


--
-- Name: pricing_settings pricing_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pricing_settings
    ADD CONSTRAINT pricing_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: push_subscriptions push_subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: pvoc_documents pvoc_documents_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pvoc_documents
    ADD CONSTRAINT pvoc_documents_consolidation_id_fkey FOREIGN KEY (consolidation_id) REFERENCES public.consolidations(id) ON DELETE CASCADE;


--
-- Name: referrals referrals_referee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referee_id_fkey FOREIGN KEY (referee_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: referrals referrals_referrer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.referrals
    ADD CONSTRAINT referrals_referrer_id_fkey FOREIGN KEY (referrer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ticket_messages ticket_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: ticket_messages ticket_messages_ticket_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ticket_messages
    ADD CONSTRAINT ticket_messages_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES public.tickets(id) ON DELETE CASCADE;


--
-- Name: tickets tickets_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT tickets_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: transactions transactions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transactions
    ADD CONSTRAINT transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: tudor_invoices tudor_invoices_consolidation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tudor_invoices
    ADD CONSTRAINT tudor_invoices_consolidation_id_fkey FOREIGN KEY (consolidation_id) REFERENCES public.consolidations(id) ON DELETE SET NULL;


--
-- Name: user_credits user_credits_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_credits
    ADD CONSTRAINT user_credits_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: users users_referred_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.users(id);


--
-- Name: whatsapp_messages whatsapp_messages_parcel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_parcel_id_fkey FOREIGN KEY (parcel_id) REFERENCES public.orders(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages whatsapp_messages_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: _migrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._migrations ENABLE ROW LEVEL SECURITY;

--
-- Name: _migrations _migrations admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "_migrations admin-only read" ON public._migrations FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: account_deletion_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: account_deletion_requests account_deletion_requests_self_or_staff_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY account_deletion_requests_self_or_staff_select ON public.account_deletion_requests FOR SELECT TO authenticated USING (((user_id = ( SELECT public.current_user_id() AS current_user_id)) OR (user_id = (( SELECT auth.uid() AS uid))::text) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: admin_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_logs admin_logs admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "admin_logs admin-only read" ON public.admin_logs FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: agent_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: agent_invoices agent_invoices staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "agent_invoices staff-only read" ON public.agent_invoices FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: aml_flags aml staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "aml staff-only read" ON public.aml_flags FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: aml_flags; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.aml_flags ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.auth_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: auth_otps auth_otps deny client access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "auth_otps deny client access" ON public.auth_otps TO anon, authenticated USING (false) WITH CHECK (false);


--
-- Name: backups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.backups ENABLE ROW LEVEL SECURITY;

--
-- Name: backups backups admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "backups admin-only read" ON public.backups FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: buy_for_me_orders buy_for_me self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "buy_for_me self-or-staff read" ON public.buy_for_me_orders FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: buy_for_me_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buy_for_me_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: compliance_trainings compliance admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "compliance admin-only read" ON public.compliance_trainings FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: compliance_trainings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.compliance_trainings ENABLE ROW LEVEL SECURITY;

--
-- Name: consolidations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.consolidations ENABLE ROW LEVEL SECURITY;

--
-- Name: consolidations consolidations authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "consolidations authed read" ON public.consolidations FOR SELECT TO authenticated USING (true);


--
-- Name: credit_ledger; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;

--
-- Name: credit_ledger credit_ledger self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "credit_ledger self-or-staff read" ON public.credit_ledger FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: customer_consolidations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customer_consolidations ENABLE ROW LEVEL SECURITY;

--
-- Name: customer_consolidations customer_consolidations_owner_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY customer_consolidations_owner_select ON public.customer_consolidations FOR SELECT TO authenticated USING (((( SELECT auth.uid() AS uid))::text = user_id));


--
-- Name: customs_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customs_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: customs_entries customs_entries staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customs_entries staff-only read" ON public.customs_entries FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: customs_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.customs_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: customs_tiers customs_tiers authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "customs_tiers authed read" ON public.customs_tiers FOR SELECT TO authenticated USING (true);


--
-- Name: dsar_requests dsar self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "dsar self-or-staff read" ON public.dsar_requests FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: dsar_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dsar_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: electronics_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.electronics_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: electronics_fees electronics_fees authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "electronics_fees authed read" ON public.electronics_fees FOR SELECT TO authenticated USING (true);


--
-- Name: email_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_logs email_logs admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "email_logs admin-only read" ON public.email_logs FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: email_verification_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_verification_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: error_logs error_logs admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "error_logs admin-only read" ON public.error_logs FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: exchange_rates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;

--
-- Name: exchange_rates exchange_rates authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "exchange_rates authed read" ON public.exchange_rates FOR SELECT TO authenticated USING (true);


--
-- Name: fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.fees ENABLE ROW LEVEL SECURITY;

--
-- Name: fees fees authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "fees authed read" ON public.fees FOR SELECT TO authenticated USING (true);


--
-- Name: finance_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_accounts finance_accounts_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_accounts_admin_read ON public.finance_accounts FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: finance_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_categories finance_categories_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_categories_admin_read ON public.finance_categories FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: finance_report_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_report_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_report_snapshots finance_report_snapshots_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_report_snapshots_admin_read ON public.finance_report_snapshots FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: finance_tax_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_tax_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_tax_codes finance_tax_codes_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tax_codes_admin_read ON public.finance_tax_codes FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: finance_tax_periods; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_tax_periods ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_tax_periods finance_tax_periods_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_tax_periods_admin_read ON public.finance_tax_periods FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: finance_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.finance_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: finance_transactions finance_transactions_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY finance_transactions_admin_read ON public.finance_transactions FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: hs_code_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hs_code_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: hs_code_tiers hs_code_tiers authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "hs_code_tiers authed read" ON public.hs_code_tiers FOR SELECT TO authenticated USING (true);


--
-- Name: insurance_policies insurance self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "insurance self-or-staff read" ON public.insurance_policies FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: insurance_policies; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.insurance_policies ENABLE ROW LEVEL SECURITY;

--
-- Name: last_mile_run_parcels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.last_mile_run_parcels ENABLE ROW LEVEL SECURITY;

--
-- Name: last_mile_run_parcels last_mile_run_parcels_deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY last_mile_run_parcels_deny_authenticated ON public.last_mile_run_parcels TO anon, authenticated USING (false) WITH CHECK (false);


--
-- Name: last_mile_runs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.last_mile_runs ENABLE ROW LEVEL SECURITY;

--
-- Name: last_mile_runs last_mile_runs staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "last_mile_runs staff-only read" ON public.last_mile_runs FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: lipana_events_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lipana_events_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: lipana_events_seen lipana_events_seen admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "lipana_events_seen admin read" ON public.lipana_events_seen FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: marketing_attributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_attributions ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_attributions marketing_attributions staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "marketing_attributions staff-only read" ON public.marketing_attributions FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: email_verification_tokens no_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_user_access ON public.email_verification_tokens USING (false);


--
-- Name: password_reset_tokens no_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_user_access ON public.password_reset_tokens USING (false);


--
-- Name: revoked_tokens no_user_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY no_user_access ON public.revoked_tokens USING (false);


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications self-or-staff read" ON public.notifications FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: nps_invitations nps invitations self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nps invitations self-or-staff read" ON public.nps_invitations FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: nps_responses nps self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "nps self-or-staff read" ON public.nps_responses FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: nps_invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nps_invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: nps_responses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

--
-- Name: orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

--
-- Name: orders orders self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "orders self-or-staff read" ON public.orders FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: packages packages self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "packages self-or-staff read" ON public.packages FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: pallets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pallets ENABLE ROW LEVEL SECURITY;

--
-- Name: pallets pallets authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pallets authed read" ON public.pallets FOR SELECT TO authenticated USING (true);


--
-- Name: parcel_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.parcel_items ENABLE ROW LEVEL SECURITY;

--
-- Name: parcel_items parcel_items self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "parcel_items self-or-staff read" ON public.parcel_items FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.packages p
  WHERE ((p.id = parcel_items.parcel_id) AND ((p.user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff))))));


--
-- Name: password_reset_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.password_reset_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "payments self-or-staff read" ON public.payments FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: pod_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_events ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_events pod_events staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pod_events staff-only read" ON public.pod_events FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: pod_otps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pod_otps ENABLE ROW LEVEL SECURITY;

--
-- Name: pod_otps pod_otps_deny_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY pod_otps_deny_authenticated ON public.pod_otps TO anon, authenticated USING (false) WITH CHECK (false);


--
-- Name: pricing_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_settings pricing_settings authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pricing_settings authed read" ON public.pricing_settings FOR SELECT TO authenticated USING (true);


--
-- Name: pricing_tiers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

--
-- Name: pricing_tiers pricing_tiers authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pricing_tiers authed read" ON public.pricing_tiers FOR SELECT TO authenticated USING (true);


--
-- Name: prohibited_items prohibited authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "prohibited authed read" ON public.prohibited_items FOR SELECT TO authenticated USING (true);


--
-- Name: prohibited_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.prohibited_items ENABLE ROW LEVEL SECURITY;

--
-- Name: promotions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

--
-- Name: promotions promotions authed read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "promotions authed read" ON public.promotions FOR SELECT TO authenticated USING (true);


--
-- Name: push_subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: push_subscriptions push_subscriptions deny client access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push_subscriptions deny client access" ON public.push_subscriptions TO anon, authenticated USING (false) WITH CHECK (false);


--
-- Name: pvoc_documents pvoc staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pvoc staff-only read" ON public.pvoc_documents FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: pvoc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pvoc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

--
-- Name: referrals referrals participants-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "referrals participants-or-staff read" ON public.referrals FOR SELECT TO authenticated USING (((referrer_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR (referee_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: request_idempotency; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.request_idempotency ENABLE ROW LEVEL SECURITY;

--
-- Name: request_idempotency request_idempotency deny client access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "request_idempotency deny client access" ON public.request_idempotency TO anon, authenticated USING (false) WITH CHECK (false);


--
-- Name: retailers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;

--
-- Name: retailers retailers admin delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "retailers admin delete" ON public.retailers FOR DELETE TO authenticated USING (( SELECT public.is_thapsus_admin() AS is_thapsus_admin));


--
-- Name: retailers retailers admin insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "retailers admin insert" ON public.retailers FOR INSERT TO authenticated WITH CHECK (( SELECT public.is_thapsus_admin() AS is_thapsus_admin));


--
-- Name: retailers retailers admin update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "retailers admin update" ON public.retailers FOR UPDATE TO authenticated USING (( SELECT public.is_thapsus_admin() AS is_thapsus_admin)) WITH CHECK (( SELECT public.is_thapsus_admin() AS is_thapsus_admin));


--
-- Name: retailers retailers select all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "retailers select all" ON public.retailers FOR SELECT TO anon, authenticated USING (((is_active = true) OR ( SELECT public.is_thapsus_admin() AS is_thapsus_admin)));


--
-- Name: revoked_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.revoked_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_events_seen; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.stripe_events_seen ENABLE ROW LEVEL SECURITY;

--
-- Name: stripe_events_seen stripe_events_seen admin read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "stripe_events_seen admin read" ON public.stripe_events_seen FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: ticket_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: ticket_messages ticket_messages thread-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ticket_messages thread-or-staff read" ON public.ticket_messages FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.tickets t
  WHERE ((t.id = ticket_messages.ticket_id) AND ((t.user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff))))));


--
-- Name: tickets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;

--
-- Name: tickets tickets self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tickets self-or-staff read" ON public.tickets FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: transactions transactions self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "transactions self-or-staff read" ON public.transactions FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: tudor_invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tudor_invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: tudor_invoices tudor_invoices staff-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tudor_invoices staff-only read" ON public.tudor_invoices FOR SELECT TO authenticated USING (public.is_thapsus_staff());


--
-- Name: user_credits; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

--
-- Name: user_credits user_credits self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "user_credits self-or-staff read" ON public.user_credits FOR SELECT TO authenticated USING (((user_id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: users; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

--
-- Name: users users self-or-staff read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "users self-or-staff read" ON public.users FOR SELECT TO authenticated USING (((id = (( SELECT auth.jwt() AS jwt) ->> 'sub'::text)) OR ( SELECT public.is_thapsus_staff() AS is_thapsus_staff)));


--
-- Name: whatsapp_messages whatsapp admin-only read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "whatsapp admin-only read" ON public.whatsapp_messages FOR SELECT TO authenticated USING (public.is_thapsus_admin());


--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--




--
-- Grants — mirror of live: ALL on every public table/sequence/function to
-- the three PostgREST roles (Supabase default privileges). RLS (above) is
-- the actual gate; these grants let PostgREST reach the tables at all.
--

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
