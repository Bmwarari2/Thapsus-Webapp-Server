-- ============================================================
-- Migration 042 — codify columns previously only added by the
-- bootstrap script's "Step 8 column migrations" loop.
--
-- Context: database/init.js used to ALTER TABLE … ADD COLUMN
-- IF NOT EXISTS on every Railway boot. We're removing that
-- bootstrap path so forward migrations are the single source
-- of truth (audit C-1). All four columns already exist in the
-- live database; this migration just records them in the
-- migration ledger so a fresh Supabase project provisioned
-- only via database/migrations/ ends up with the same shape.
--
-- Idempotent — every statement uses IF NOT EXISTS.
-- ============================================================

-- 1. orders.electronics_item — kept for parity with old schema.sql §orders;
--    referenced by NewOrderView's electronics-classification flow.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS electronics_item TEXT;

-- 2. orders.order_notes — operator/admin freeform notes attached to an order.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_notes TEXT;

-- 3. users.delivery_address — customer's delivery address; PUT /api/auth/profile
--    writes this. Live envs already have it; restated here for fresh provisions.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS delivery_address TEXT;

-- 4. users.admin_notes — admin-only freeform notes about a user.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS admin_notes TEXT;
