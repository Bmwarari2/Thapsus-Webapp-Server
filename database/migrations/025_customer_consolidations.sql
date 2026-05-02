-- Migration 025 — customer_consolidations + invoice fields (Phase 2)
--
-- Splits the consolidation concept into two tiers:
--
--   1. customer_consolidations  — per-user grouping. An admin selects
--                                 several of a user's `received_at_warehouse`
--                                 packages, groups them under one row, and
--                                 stamps an invoice (amount + currency).
--                                 The user pays this invoice once before
--                                 shipping happens.
--
--   2. consolidations           — pre-existing table; from now on it
--                                 represents the *shipping* tier (the
--                                 weekly UK→NBO flight unit going to the
--                                 forwarder). Multiple customer_consolidations
--                                 attach to one shipping consolidation.
--
-- packages get a new `customer_consolidation_id` FK. The legacy
-- `packages.consolidation_id` column stays — it now means
-- "shipping_consolidation_id" — and is set automatically by app code
-- when a customer_consolidation is attached to a shipping consolidation.
--
-- Status enum (text + CHECK; matches the lifecycle the brief outlined):
--   pending   → just created, no invoice issued yet
--   invoiced  → admin has set invoice_amount; customer email fired
--   paid      → customer paid (admin marked, or wallet auto-deducted)
--   shipped   → attached to a shipping consolidation that has departed

CREATE TABLE IF NOT EXISTS public.customer_consolidations (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    shipping_consolidation_id   uuid NULL REFERENCES public.consolidations(id) ON DELETE SET NULL,
    status                      text NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending','invoiced','paid','shipped')),
    invoice_amount              numeric(12,2) NULL,
    invoice_currency            text NOT NULL DEFAULT 'KES',
    invoice_status              text NULL CHECK (invoice_status IS NULL OR invoice_status IN ('pending','paid')),
    invoice_paid_at             timestamptz NULL,
    notes                       text NULL,
    created_by                  text NULL REFERENCES public.users(id) ON DELETE SET NULL,
    created_at                  timestamptz NOT NULL DEFAULT NOW(),
    updated_at                  timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_consolidations_user
    ON public.customer_consolidations (user_id);
CREATE INDEX IF NOT EXISTS idx_customer_consolidations_shipping
    ON public.customer_consolidations (shipping_consolidation_id);
CREATE INDEX IF NOT EXISTS idx_customer_consolidations_status
    ON public.customer_consolidations (status);

-- Per the brief: customer pays one invoice covering all parcels in the
-- group. The customer-consolidation owns the linkage; packages reference
-- it via this nullable FK. Old `packages.consolidation_id` keeps its
-- meaning ("shipping consolidation id") so existing operator queries
-- don't break — app code mirrors it from the customer-consolidation when
-- the latter is batched into a shipping consolidation.
ALTER TABLE public.packages
    ADD COLUMN IF NOT EXISTS customer_consolidation_id uuid NULL
    REFERENCES public.customer_consolidations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_packages_customer_consolidation
    ON public.packages (customer_consolidation_id);

-- RLS — every public table needs RLS enabled + a SELECT policy in the
-- same migration (memory: feedback_rls_required.md). Customer reads
-- their own rows; admin/operator/clearing_agent service role reads all
-- via the existing pg pool (Express bypasses RLS on writes).
ALTER TABLE public.customer_consolidations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_consolidations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_consolidations_owner_select ON public.customer_consolidations;
CREATE POLICY customer_consolidations_owner_select
    ON public.customer_consolidations
    FOR SELECT
    USING (auth.uid()::text = user_id);

-- Realtime subscription so the iOS customer's tracking screen flips to
-- "invoice ready" the moment the admin issues it. Mirrors migration 024.
DO $$
DECLARE
    t TEXT := 'customer_consolidations';
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
         WHERE pubname = 'supabase_realtime'
           AND schemaname = 'public'
           AND tablename = t
    ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
END $$;

-- updated_at auto-bump trigger so app code doesn't have to remember it
-- on every UPDATE. Mirrors the pattern other tables use.
CREATE OR REPLACE FUNCTION public.touch_customer_consolidations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_customer_consolidations_updated_at ON public.customer_consolidations;
CREATE TRIGGER trg_customer_consolidations_updated_at
    BEFORE UPDATE ON public.customer_consolidations
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_customer_consolidations_updated_at();
