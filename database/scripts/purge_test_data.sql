-- purge_test_data.sql
--
-- DESTRUCTIVE — wipes every transactional row from the parcel-flow,
-- payments-era, last-mile, customer-consolidation, BFM, comms, and
-- audit tables so the lifecycle (pre-reg → intake → consolidation →
-- dispatch → POD → delivered) can be smoke-tested end-to-end against
-- a clean slate.
--
-- This file lives under database/scripts/ NOT database/migrations/
-- so the migration runner (server.js / Railway boot) ignores it.
-- Run it manually via Supabase Studio SQL editor, the MCP
-- execute_sql tool, or `psql -f database/scripts/purge_test_data.sql`.
--
-- WHAT IS PRESERVED (Section 0)
--   • users                       (account rows + role assignments)
--   • _migrations                 (Supabase migration ledger)
--   • auth.* (Supabase Auth)      (this script never touches the auth schema)
--
-- WHAT IS PURGED (Section 1 — runs by default)
--   Parcel + order roots:
--     orders, packages, parcel_items, pallets
--   Payments era (mig 028+):
--     payments, transactions, user_credits, credit_ledger,
--     stripe_events_seen
--   Consolidation chain:
--     consolidations, customer_consolidations,
--     customs_entries, agent_invoices, tudor_invoices, pvoc_documents
--   Last-mile + POD:
--     last_mile_runs, last_mile_run_parcels, run_parcels,
--     pod_events, pod_otps
--   NPS:
--     nps_invitations, nps_responses
--   Adjacent customer flows:
--     buy_for_me_orders, insurance_policies
--   Comms + tickets:
--     notifications, whatsapp_messages, tickets, ticket_messages
--   Compliance + audit:
--     dsar_requests, aml_flags, marketing_attributions,
--     compliance_trainings,
--     admin_logs, email_logs, error_logs, backups
--   Auth tokens (forces re-login on next use — desirable for a clean slate):
--     password_reset_tokens, revoked_tokens
--   Misc:
--     referrals
--
-- WHAT IS PRESERVED BY DEFAULT BUT WIPABLE (Section 2 — commented out)
--   The following tables hold ADMIN-CONFIGURED reference data that the
--   running app reads on every request. Wiping them won't crash the
--   server but will leave it in a "no rates / no catalog" state and
--   block customer order creation, BFM picker, calculator, etc.
--
--     pricing_tiers      — admin tier rates  (currently 0 rows on live)
--     shipping_rates     — admin shipping rates  (0 rows)
--     exchange_rates     — GBP/KES rate (0 rows — already needs reseed)
--     fees               — admin fee config (0 rows)
--     promotions         — admin promo codes (0 rows)
--     prohibited_items   — DG/restricted screening catalog (0 rows)
--     retailers          — curated BFM retailer catalog (17 rows on live, mig 029 seed)
--
--   Uncomment the section-2 block ONLY if you also want to drop the
--   retailers seed (you'll need to re-run mig 029 to repopulate it).
--
-- STORAGE BUCKETS
--   Files in `pods`, `parcels`, and `agent-invoices` Supabase Storage
--   buckets become orphaned after this script runs (the rows pointing
--   at their paths are gone). They don't break anything but can be
--   purged via the Supabase Storage API or the Studio UI for a
--   truly clean slate. SQL alone can't reach them.
--
-- The whole script runs in a single transaction; on any error the
-- ROLLBACK leaves the database untouched.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────
-- Section 1 — transactional + audit + comms + tokens
-- ─────────────────────────────────────────────────────────────────────
-- TRUNCATE … CASCADE handles FK chains in any order, so we can list
-- every table once. RESTART IDENTITY zeroes any sequence-backed PKs.

TRUNCATE TABLE
    -- POD + last-mile leaves first (depend on orders + last_mile_runs)
    pod_events,
    pod_otps,
    last_mile_run_parcels,
    run_parcels,
    last_mile_runs,
    -- Customs / consolidation chain
    customs_entries,
    agent_invoices,
    tudor_invoices,
    pvoc_documents,
    pallets,
    parcel_items,
    -- Customer-facing groupings + BFM + insurance
    customer_consolidations,
    consolidations,
    buy_for_me_orders,
    insurance_policies,
    -- NPS
    nps_invitations,
    nps_responses,
    -- Parcel + order roots (everything above FKs into one of these)
    packages,
    orders,
    -- Payments era (mig 028+) — payments + the credit ledger that
    -- accompanies it. user_credits is 1:1 with users; we wipe the
    -- balances by truncating and let the app re-INSERT a zero row on
    -- next read (routes/orders.js does this `ON CONFLICT DO NOTHING`).
    payments,
    transactions,
    credit_ledger,
    user_credits,
    stripe_events_seen,
    -- Comms + tickets
    notifications,
    whatsapp_messages,
    ticket_messages,
    tickets,
    -- Compliance + audit
    dsar_requests,
    aml_flags,
    marketing_attributions,
    compliance_trainings,
    admin_logs,
    email_logs,
    error_logs,
    backups,
    -- Auth tokens — force re-login + clear any expired reset links
    password_reset_tokens,
    revoked_tokens,
    -- Referral pairings (referrer→referee links — re-seeded as users
    -- invite each other again)
    referrals
RESTART IDENTITY CASCADE;

-- ─────────────────────────────────────────────────────────────────────
-- Section 2 — OPTIONAL: admin-configured reference data
-- ─────────────────────────────────────────────────────────────────────
-- Uncomment the TRUNCATE block below ONLY if you want a brand-new
-- app with no rates, no fees, no retailer catalog. The retailers
-- table in particular holds the 17-row mig 029 seed; re-running
-- migration 029 will repopulate it.
--
-- TRUNCATE TABLE
--     pricing_tiers,
--     shipping_rates,
--     exchange_rates,
--     fees,
--     promotions,
--     prohibited_items,
--     retailers
-- RESTART IDENTITY CASCADE;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────
-- Sanity check (run separately to verify post-purge counts)
-- ─────────────────────────────────────────────────────────────────────
--   SELECT 'users (preserved)' AS t, COUNT(*) FROM users
--   UNION ALL SELECT 'orders',                 COUNT(*) FROM orders
--   UNION ALL SELECT 'packages',               COUNT(*) FROM packages
--   UNION ALL SELECT 'payments',               COUNT(*) FROM payments
--   UNION ALL SELECT 'customer_consolidations',COUNT(*) FROM customer_consolidations
--   UNION ALL SELECT 'consolidations',         COUNT(*) FROM consolidations
--   UNION ALL SELECT 'buy_for_me_orders',      COUNT(*) FROM buy_for_me_orders
--   UNION ALL SELECT 'last_mile_runs',         COUNT(*) FROM last_mile_runs
--   UNION ALL SELECT 'pod_events',             COUNT(*) FROM pod_events
--   UNION ALL SELECT 'notifications',          COUNT(*) FROM notifications
--   UNION ALL SELECT 'email_logs',             COUNT(*) FROM email_logs
--   UNION ALL SELECT 'stripe_events_seen',     COUNT(*) FROM stripe_events_seen
--   UNION ALL SELECT 'user_credits',           COUNT(*) FROM user_credits
--   UNION ALL SELECT 'retailers (preserved)',  COUNT(*) FROM retailers
--   ORDER BY t;
