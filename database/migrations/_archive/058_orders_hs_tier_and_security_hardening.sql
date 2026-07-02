-- Migration 058 — restore orders.hs_tier + RLS hardening
--
-- Two unrelated but both production-impacting fixes, bundled because they
-- were found in the same audit pass. Fully idempotent + safe to re-run.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- 1. orders.hs_tier  (CRITICAL — blocks ALL order creation)
-- ─────────────────────────────────────────────────────────────────────────────
-- The application reads and writes `orders.hs_tier` in three hot paths:
--   • routes/orders.js   POST /api/orders                 (customer self-serve)
--   • routes/admin.js    POST /api/admin/orders/create-for-client (admin)
--   • routes/ops.js      POST /api/ops/parcels/:id/receive (operator stamps tier)
-- and reads it back in the order-detail cost recompute (routes/orders.js GET /:id).
--
-- The column existed in an earlier environment (migration 050 still drops the
-- now-removed `idx_orders_hs_tier` index) but its CREATE/ALTER DDL was never
-- captured in this migration set, so a freshly-provisioned database has the
-- code referencing a column that does not exist. Every INSERT/UPDATE that
-- includes `hs_tier` fails with:
--     ERROR: 42703: column "hs_tier" of relation "orders" does not exist
-- which surfaces to the admin / customer as a 500 "Failed to create order".
--
-- Re-add it as a nullable TEXT column. The application already validates the
-- value against utils/pricing.js::HS_TIERS before writing, so no CHECK
-- constraint is added here (BFM auto-created orders and legacy rows may carry
-- NULL, which the read path tolerates via `order.hs_tier || null`).
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS hs_tier TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. push_subscriptions RLS  (SECURITY — Supabase advisor ERROR
--    0013_rls_disabled_in_public)
-- ─────────────────────────────────────────────────────────────────────────────
-- public.push_subscriptions (migration 054) was created WITHOUT row-level
-- security. It is in the `public` schema and therefore exposed through
-- PostgREST, so any holder of the anon/publishable key can read every user's
-- Web Push endpoint + p256dh/auth keys (enough to spoof or harvest push
-- targets). Every other server-only table in this project is RLS
-- deny-by-default; this one was missed.
--
-- The Express backend connects with the postgres/service-role pool
-- (database/init.js) which BYPASSES RLS, so locking the table down does not
-- affect routes/push.js or utils/webpush.js. Enable RLS and add an explicit
-- deny-all policy (documents intent + clears the advisor's "no policy" INFO).
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions deny client access" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions deny client access"
    ON public.push_subscriptions
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. auth_otps explicit deny  (SECURITY — Supabase advisor INFO
--    0008_rls_enabled_no_policy)
-- ─────────────────────────────────────────────────────────────────────────────
-- public.auth_otps has RLS enabled but no policy, so it already denies all
-- PostgREST access (correct + secure — OTPs are server-only). This adds an
-- explicit, named deny-all policy so the lock-down is self-documenting in
-- pg_policies and the advisor stops flagging it. Service-role pool is
-- unaffected (bypasses RLS).
DROP POLICY IF EXISTS "auth_otps deny client access" ON public.auth_otps;
CREATE POLICY "auth_otps deny client access"
    ON public.auth_otps
    FOR ALL
    TO anon, authenticated
    USING (false)
    WITH CHECK (false);

-- ─────────────────────────────────────────────────────────────────────────────
-- NOTE (not fixable in SQL): the Supabase advisor also reports
-- 0Auth "Leaked Password Protection Disabled" (WARN). That is an Auth project
-- setting, not schema. Enable it in the Supabase dashboard:
--   Authentication → Policies → Password protection → enable
--   "Check against HaveIBeenPwned". (Docs:
--   https://supabase.com/docs/guides/auth/password-security)
