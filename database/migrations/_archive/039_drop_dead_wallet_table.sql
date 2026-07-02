-- Migration 039 — Drop the dead public.wallet table
--
-- The wallet model was retired in migration 028 (`payments_and_credits`)
-- when we replaced wallet-based balances with `user_credits` +
-- `credit_ledger`. Migration 028 dropped `users.wallet_balance` but left
-- the standalone `wallet` table behind. Audit on 2026-05-07 confirmed
-- the table is empty (0 rows) and not referenced by any live route or
-- shared KMP code — only stale comments noting "post the wallet rip".
--
-- Supabase's `rls_disabled_in_public` advisor flagged the table for
-- having RLS disabled. Rather than enable RLS on a dead table, drop it.
--
-- Already applied to the live project via the Supabase MCP; this file
-- pins the change in migration history so future provisions match prod.

DROP TABLE IF EXISTS public.wallet;
