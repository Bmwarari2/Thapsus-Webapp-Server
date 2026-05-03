-- Migration 032 — M-Pesa /approve enforcement (audit P1.2)
--
-- Two protections layered on top of the manual M-Pesa paste flow:
--
--   1. `approval_override_reason` — when an admin verifies a payment whose
--      pasted SMS amount is LESS than amount_due_kes, they must supply a
--      written justification. Stored alongside reviewed_by/reviewed_at so
--      the audit trail captures the override decision (separate from
--      `rejection_reason` which only fires on /reject).
--
--   2. Unique M-Pesa reference among non-cancelled rows — prevents a
--      single SMS from settling two payments. The constraint deliberately
--      excludes `cancelled` rows so a customer who pasted into the wrong
--      target, switched method, and re-submitted with the same SMS isn't
--      blocked. `failed` is also excluded for symmetry (Stripe-side
--      failures shouldn't squat on a reference that was never actually
--      consumed).
--
-- Idempotent. Safe to re-run.

BEGIN;

-- ── 1. approval_override_reason ────────────────────────────────────────────
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS approval_override_reason text;

COMMENT ON COLUMN public.payments.approval_override_reason IS
  'Admin justification when /approve was forced through an amount mismatch (audit P1.2). NULL on clean approvals.';

-- ── 2. Unique M-Pesa reference (partial — only rows where settle is real) ─
-- Drop any prior version first so re-running this migration after we
-- decide to widen/narrow the predicate doesn't leave stale indexes.
DROP INDEX IF EXISTS public.uq_payments_mpesa_ref;
CREATE UNIQUE INDEX uq_payments_mpesa_ref
    ON public.payments (mpesa_reference)
 WHERE mpesa_reference IS NOT NULL
   AND status IN ('paid', 'awaiting_review');

-- ── 3. Verify ──────────────────────────────────────────────────────────────
DO $$
DECLARE
    has_col boolean;
    has_idx boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'payments'
           AND column_name  = 'approval_override_reason'
    ) INTO has_col;
    SELECT EXISTS (
        SELECT 1 FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname  = 'uq_payments_mpesa_ref'
    ) INTO has_idx;
    IF NOT (has_col AND has_idx) THEN
        RAISE EXCEPTION 'Migration 032 verification failed (col=%, idx=%)', has_col, has_idx;
    END IF;
END $$;

COMMIT;
