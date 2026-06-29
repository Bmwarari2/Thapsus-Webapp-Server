-- Migration 057 — Finance Management (business bookkeeping)
--
-- Adds a business-level finance layer on top of the existing customer-payment
-- tables (payments, customer_consolidations, agent_invoices, tudor_invoices…).
-- The customer-payment tables answer "did this customer settle their invoice";
-- this layer answers "is the BUSINESS profitable, what cash is available, and
-- are we tax-compliant" — i.e. a general ledger of money-in / money-out across
-- GBP and KES, plus tax periods for HMRC (UK) and KRA (Kenya).
--
-- Gating: a "selected admin" gets the dashboard via the new
-- users.can_manage_finances flag (set by a super-admin). The tables here are
-- server-only (Express service_role); RLS is deny-by-default with an admin-only
-- read policy for defence in depth — there is no PostgREST/client surface.
--
-- Money is stored as integer MINOR units (GBP pence, KES cents) in bigint,
-- matching the existing convention (payments.amount_due_kes bigint,
-- payments.stripe_amount_pence_gbp). No floats for money.
--
-- Idempotent — every CREATE/ALTER guarded by IF EXISTS / IF NOT EXISTS, every
-- seed uses ON CONFLICT DO NOTHING. Safe to re-run.

BEGIN;

-- ── 0. users.can_manage_finances flag ───────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS can_manage_finances boolean NOT NULL DEFAULT false;

-- ── 1. finance_accounts ─────────────────────────────────────────────────────
-- Cash / bank / mobile-money pots that hold money. "Money available" is derived
-- as opening_balance_minor + SUM(money in) − SUM(money out) per account.
CREATE TABLE IF NOT EXISTS public.finance_accounts (
    id                    text PRIMARY KEY,
    name                  text NOT NULL,
    type                  text NOT NULL CHECK (type IN ('bank','cash','mpesa','stripe','other')),
    currency              text NOT NULL CHECK (currency IN ('GBP','KES')),
    opening_balance_minor bigint NOT NULL DEFAULT 0,
    is_active             boolean NOT NULL DEFAULT true,
    created_at            timestamptz NOT NULL DEFAULT NOW()
);

-- ── 2. finance_categories ───────────────────────────────────────────────────
-- Lightweight chart of accounts used to classify each ledger line.
CREATE TABLE IF NOT EXISTS public.finance_categories (
    id                text PRIMARY KEY,
    name              text NOT NULL,
    kind              text NOT NULL CHECK (kind IN ('income','expense')),
    is_tax_deductible boolean NOT NULL DEFAULT false,
    default_tax_code  text,
    sort_order        int NOT NULL DEFAULT 100,
    is_active         boolean NOT NULL DEFAULT true
);

-- ── 3. finance_tax_codes ────────────────────────────────────────────────────
-- VAT / income-tax / withholding rates for UK (HMRC) and Kenya (KRA). Editable.
CREATE TABLE IF NOT EXISTS public.finance_tax_codes (
    id           text PRIMARY KEY,
    jurisdiction text NOT NULL CHECK (jurisdiction IN ('UK','KE')),
    name         text NOT NULL,
    kind         text NOT NULL CHECK (kind IN ('vat','income_tax','withholding')),
    rate_pct     numeric(6,3) NOT NULL DEFAULT 0,
    is_active    boolean NOT NULL DEFAULT true
);

-- ── 4. finance_transactions (the general ledger) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.finance_transactions (
    id               text PRIMARY KEY,
    direction        text NOT NULL CHECK (direction IN ('in','out')),
    amount_minor     bigint NOT NULL CHECK (amount_minor >= 0),
    currency         text NOT NULL CHECK (currency IN ('GBP','KES')),
    -- normalised both ways at entry so reports can total in either currency
    amount_gbp_minor bigint NOT NULL DEFAULT 0,
    amount_kes_minor bigint NOT NULL DEFAULT 0,
    fx_rate_gbp_kes  numeric(12,6),
    category_id      text REFERENCES public.finance_categories(id) ON DELETE SET NULL,
    account_id       text REFERENCES public.finance_accounts(id) ON DELETE SET NULL,
    occurred_on      date NOT NULL DEFAULT CURRENT_DATE,
    description      text,
    counterparty     text,
    reference        text,
    tax_code         text REFERENCES public.finance_tax_codes(id) ON DELETE SET NULL,
    tax_amount_minor bigint NOT NULL DEFAULT 0,
    -- provenance: 'manual' = hand-entered; the rest are auto-synced from the
    -- customer-payment tables and are idempotent via uq_finance_tx_source.
    source           text NOT NULL DEFAULT 'manual'
                       CHECK (source IN ('manual','payment','customer_invoice','agent_invoice','tudor_invoice')),
    source_id        text,
    attachment_url   text,
    status           text NOT NULL DEFAULT 'cleared' CHECK (status IN ('cleared','pending','void')),
    created_by       text REFERENCES public.users(id),
    created_at       timestamptz NOT NULL DEFAULT NOW(),
    updated_at       timestamptz NOT NULL DEFAULT NOW()
);

-- One ledger row per auto-synced source object → re-running the sync is a no-op.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_tx_source
    ON public.finance_transactions (source, source_id)
    WHERE source <> 'manual';

CREATE INDEX IF NOT EXISTS idx_finance_tx_occurred
    ON public.finance_transactions (occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tx_dir_occurred
    ON public.finance_transactions (direction, occurred_on DESC);
CREATE INDEX IF NOT EXISTS idx_finance_tx_category
    ON public.finance_transactions (category_id);
CREATE INDEX IF NOT EXISTS idx_finance_tx_account
    ON public.finance_transactions (account_id);

-- updated_at touch (mirrors trg_payments_updated_at in 028)
-- search_path pinned to '' (advisor 0011 / migration 040 convention): the body
-- only touches NEW + NOW() (pg_catalog, always resolvable), so an empty
-- search_path is safe and stops a mutable-search_path security warning.
CREATE OR REPLACE FUNCTION public.touch_finance_tx_updated_at()
RETURNS trigger LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_finance_tx_updated_at ON public.finance_transactions;
CREATE TRIGGER trg_finance_tx_updated_at
    BEFORE UPDATE ON public.finance_transactions
    FOR EACH ROW EXECUTE FUNCTION public.touch_finance_tx_updated_at();

-- ── 5. finance_tax_periods ──────────────────────────────────────────────────
-- Filing windows + compliance status. amount_due_minor is the net tax for the
-- window (derived from the ledger by the app); a period is "overdue" when
-- due_date < today and status NOT IN ('filed','paid').
CREATE TABLE IF NOT EXISTS public.finance_tax_periods (
    id               text PRIMARY KEY,
    jurisdiction     text NOT NULL CHECK (jurisdiction IN ('UK','KE')),
    tax_kind         text NOT NULL CHECK (tax_kind IN ('vat','income_tax')),
    period_start     date NOT NULL,
    period_end       date NOT NULL,
    due_date         date NOT NULL,
    status           text NOT NULL DEFAULT 'open'
                       CHECK (status IN ('open','due','filed','overdue','paid')),
    filed_on         date,
    paid_on          date,
    reference        text,
    amount_due_minor bigint NOT NULL DEFAULT 0,
    currency         text NOT NULL DEFAULT 'GBP' CHECK (currency IN ('GBP','KES')),
    notes            text,
    created_at       timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_tax_periods_due
    ON public.finance_tax_periods (due_date);

-- ── 6. finance_report_snapshots ─────────────────────────────────────────────
-- Frozen point-in-time reports (e.g. a closed month) for the audit record.
-- Day-to-day reports are computed live; this is only for locking history.
CREATE TABLE IF NOT EXISTS public.finance_report_snapshots (
    id                 text PRIMARY KEY,
    kind               text NOT NULL CHECK (kind IN ('pnl','cashflow','tax')),
    period_start       date NOT NULL,
    period_end         date NOT NULL,
    reporting_currency text NOT NULL DEFAULT 'GBP' CHECK (reporting_currency IN ('GBP','KES')),
    payload            jsonb NOT NULL,
    generated_by       text REFERENCES public.users(id),
    generated_at       timestamptz NOT NULL DEFAULT NOW()
);

-- ── 7. RLS — server-only, deny-by-default + admin read ──────────────────────
-- These tables are written only by Express (service_role bypasses RLS). The
-- policies exist purely as defence in depth so a stray PostgREST token can't
-- read business financials. is_thapsus_admin() reads
-- auth.jwt()->user_metadata->>app_role (migration 027) so no recursion.
DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'finance_accounts','finance_categories','finance_tax_codes',
        'finance_transactions','finance_tax_periods','finance_report_snapshots'
    ] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE public.%I FORCE  ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_read', t);
        EXECUTE format(
            'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_thapsus_admin())',
            t || '_admin_read', t);
    END LOOP;
END $$;

-- ── 8. Seeds — tax codes, categories, default accounts ──────────────────────
-- UK (HMRC) + Kenya (KRA) VAT presets, plus an income-tax / withholding stub.
INSERT INTO public.finance_tax_codes (id, jurisdiction, name, kind, rate_pct) VALUES
    ('TAX-UK-VAT-STD',  'UK', 'UK VAT — Standard (20%)', 'vat',         20.000),
    ('TAX-UK-VAT-RED',  'UK', 'UK VAT — Reduced (5%)',   'vat',          5.000),
    ('TAX-UK-VAT-ZERO', 'UK', 'UK VAT — Zero-rated (0%)','vat',          0.000),
    ('TAX-UK-VAT-EXMPT','UK', 'UK VAT — Exempt',         'vat',          0.000),
    ('TAX-UK-CT',       'UK', 'UK Corporation Tax',      'income_tax',  25.000),
    ('TAX-KE-VAT-STD',  'KE', 'KE VAT — Standard (16%)', 'vat',         16.000),
    ('TAX-KE-VAT-ZERO', 'KE', 'KE VAT — Zero-rated (0%)','vat',          0.000),
    ('TAX-KE-VAT-EXMPT','KE', 'KE VAT — Exempt',         'vat',          0.000),
    ('TAX-KE-IT',       'KE', 'KE Income Tax',           'income_tax',  30.000),
    ('TAX-KE-WHT',      'KE', 'KE Withholding Tax (5%)', 'withholding',  5.000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_categories (id, name, kind, is_tax_deductible, sort_order) VALUES
    ('CAT-INC-SHIPPING','Shipping revenue',        'income',  false, 10),
    ('CAT-INC-BFM',     'Buy-for-me commission',   'income',  false, 20),
    ('CAT-INC-INVOICE', 'Customer invoices',       'income',  false, 30),
    ('CAT-INC-OTHER',   'Other income',            'income',  false, 90),
    ('CAT-EXP-SUPPLIER','Supplier cost',           'expense', true,  110),
    ('CAT-EXP-AGENT',   'Clearing agent fees',     'expense', true,  120),
    ('CAT-EXP-CUSTOMS', 'Customs & duties',        'expense', true,  130),
    ('CAT-EXP-FREIGHT', 'Freight & transport',     'expense', true,  140),
    ('CAT-EXP-SALARY',  'Salaries & wages',        'expense', true,  150),
    ('CAT-EXP-RENT',    'Rent & utilities',        'expense', true,  160),
    ('CAT-EXP-SOFTWARE','Software & SaaS',         'expense', true,  170),
    ('CAT-EXP-FEES',    'Bank & processing fees',  'expense', true,  180),
    ('CAT-EXP-MARKET',  'Marketing & advertising', 'expense', true,  190),
    ('CAT-EXP-OTHER',   'Other expenses',          'expense', true,  900)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.finance_accounts (id, name, type, currency) VALUES
    ('ACC-STRIPE-GBP', 'Stripe (GBP)',      'stripe', 'GBP'),
    ('ACC-MPESA-KES',  'M-Pesa (KES)',      'mpesa',  'KES'),
    ('ACC-BANK-GBP',   'UK Bank (GBP)',     'bank',   'GBP'),
    ('ACC-BANK-KES',   'Kenya Bank (KES)',  'bank',   'KES'),
    ('ACC-CASH-KES',   'Petty cash (KES)',  'cash',   'KES')
ON CONFLICT (id) DO NOTHING;

-- ── 9. Verify ───────────────────────────────────────────────────────────────
DO $$
DECLARE
    tx_ok    boolean;
    flag_ok  boolean;
BEGIN
    SELECT to_regclass('public.finance_transactions') IS NOT NULL INTO tx_ok;
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'users'
           AND column_name = 'can_manage_finances'
    ) INTO flag_ok;
    IF NOT (tx_ok AND flag_ok) THEN
        RAISE EXCEPTION 'Migration 057 verification failed (finance_transactions=%, can_manage_finances=%)',
            tx_ok, flag_ok;
    END IF;
END $$;

COMMIT;
