-- Migration 030 — admin standalone invoices (PR 5)
--
-- Until PR 5, every customer_consolidations row required parcels (the
-- admin grouped received-at-warehouse parcels into a per-user batch and
-- then issued an invoice for shipping).
--
-- PR 5 lets the admin issue a *standalone* invoice — a one-off charge
-- with a free-text description (e.g. "Customs penalty", "Storage fee",
-- "Off-platform settlement"). It piggybacks on the existing
-- customer_consolidations machinery so the customer pays it via the
-- same PayInvoiceModal / PayInvoiceView flow (target_kind='consolidation')
-- and the same single state-machine flips it to 'paid'.
--
-- Schema additions (idempotent):
--   1. `description` column — what the invoice is for (visible to customer).
--   2. `is_standalone` boolean — true for admin-issued one-offs (no
--      parcels attached); operator dispatch flow filters these out.
--
-- Idempotent — every ALTER guarded by IF NOT EXISTS.

BEGIN;

ALTER TABLE public.customer_consolidations
    ADD COLUMN IF NOT EXISTS description text;

ALTER TABLE public.customer_consolidations
    ADD COLUMN IF NOT EXISTS is_standalone boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_customer_consolidations_standalone
    ON public.customer_consolidations (is_standalone, status)
    WHERE is_standalone = true;

DO $$
DECLARE
    has_description boolean;
    has_standalone  boolean;
BEGIN
    SELECT COUNT(*) > 0 INTO has_description
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'customer_consolidations'
       AND column_name = 'description';
    SELECT COUNT(*) > 0 INTO has_standalone
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'customer_consolidations'
       AND column_name = 'is_standalone';
    IF NOT (has_description AND has_standalone) THEN
        RAISE EXCEPTION
          'Migration 030 verification failed (description=%, is_standalone=%)',
          has_description, has_standalone;
    END IF;
END $$;

COMMIT;
