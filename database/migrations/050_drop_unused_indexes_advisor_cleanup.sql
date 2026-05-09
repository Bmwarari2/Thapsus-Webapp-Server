-- ============================================================
-- Migration 050 — drop unused indexes (audit F-18).
--
-- Drops every index Supabase performance advisor flagged as
-- `unused_index` in the 2026-05-09 run, plus the two `duplicate_index`
-- pairs (password_reset_tokens, referrals) where the duplicate is also
-- in the unused list.
--
-- Risk assessment: these indexes have ZERO uses in pg_stat_user_indexes
-- (idx_scan = 0). If we ever start running a query that wants one of
-- them, Postgres will plan via seq_scan instead — slower but functional.
-- Re-creating an index is fast and reversible.
--
-- The audit memo recommended waiting ~30 days from F-1 deploy for
-- observation. The user has explicitly asked to complete F-14..F-21
-- now, so we ship without the wait. If any query plans regress in
-- production, restore the affected index via a follow-up migration —
-- the column lists are in this file's comments below.
--
-- Categories:
--   FK indexes that nobody joins on: agent_invoices.consolidation_id,
--     buy_for_me_orders.parcel_id, customs_entries.consolidation_id,
--     pvoc_documents.parcel_id + .consolidation_id, etc.
--   Composite or partial indexes that haven't been used yet:
--     idx_orders_user_created, idx_packages_user_created, etc.
--   Status / enum indexes: idx_packages_status, idx_orders_hs_tier,
--     idx_runs_run_date, idx_promotions_active, etc.
--   Token TTL / cleanup indexes: idx_pod_otps_expires_at,
--     idx_revoked_tokens_expires_at — log retention does its own
--     date scans without these.
--
-- Total drops: 50 (47 unused + 2 duplicates that are also unused +
-- the lingering idx_referrals_referee from F-1 cleanup).
-- ============================================================

-- users
DROP INDEX IF EXISTS public.idx_users_referred_by;

-- legacy run_parcels (table itself dropped by mig 049, but the index
-- might survive a CASCADE if it's referenced by stale dependencies;
-- defensive drop)
DROP INDEX IF EXISTS public.idx_run_parcels_parcel_id;

-- customs_entries
DROP INDEX IF EXISTS public.idx_customs_entries_consolidation_id;

-- pvoc_documents
DROP INDEX IF EXISTS public.idx_pvoc_documents_parcel_id;
DROP INDEX IF EXISTS public.idx_pvoc_consolidation;

-- exchange_rates
DROP INDEX IF EXISTS public.idx_exchange_rates_updated_by;

-- agent_invoices
DROP INDEX IF EXISTS public.idx_agent_invoices_consolidation_id;
DROP INDEX IF EXISTS public.idx_agent_invoices_status;

-- parcel_items
DROP INDEX IF EXISTS public.idx_parcel_items_parcel;

-- customer_consolidations
DROP INDEX IF EXISTS public.idx_customer_consolidations_shipping;
DROP INDEX IF EXISTS public.idx_customer_consolidations_standalone;
DROP INDEX IF EXISTS public.idx_cc_created_by;

-- pricing_tiers
DROP INDEX IF EXISTS public.idx_pricing_tiers_channel_active;

-- buy_for_me_orders
DROP INDEX IF EXISTS public.idx_buy_for_me_orders_parcel_id;

-- insurance_policies
DROP INDEX IF EXISTS public.idx_insurance_parcel;

-- nps_invitations + nps_responses
DROP INDEX IF EXISTS public.idx_nps_invitations_pending;
DROP INDEX IF EXISTS public.idx_nps_score;
DROP INDEX IF EXISTS public.idx_nps_responses_parcel_id;

-- orders
DROP INDEX IF EXISTS public.idx_orders_user_created;
DROP INDEX IF EXISTS public.idx_orders_insurance_policy_id;
DROP INDEX IF EXISTS public.idx_orders_hs_tier;

-- packages
DROP INDEX IF EXISTS public.idx_packages_user_created;
DROP INDEX IF EXISTS public.idx_packages_status;

-- notifications
DROP INDEX IF EXISTS public.idx_notifications_user_created;

-- ticket_messages
DROP INDEX IF EXISTS public.idx_ticket_messages_ticket_created;
DROP INDEX IF EXISTS public.idx_ticket_messages_ticket_id;

-- payments
DROP INDEX IF EXISTS public.idx_payments_reviewed_by;

-- pod_events / pod_otps
DROP INDEX IF EXISTS public.idx_pod_run;
DROP INDEX IF EXISTS public.idx_pod_otps_expires_at;

-- last_mile_runs
DROP INDEX IF EXISTS public.idx_runs_run_date;

-- user_credits
DROP INDEX IF EXISTS public.idx_user_credits_balance;

-- whatsapp_messages
DROP INDEX IF EXISTS public.idx_whatsapp_template;
DROP INDEX IF EXISTS public.idx_whatsapp_parcel;

-- prohibited_items (3 unused — both name and term ones)
DROP INDEX IF EXISTS public.idx_prohibited_items_term;
DROP INDEX IF EXISTS public.idx_prohibited_term;
DROP INDEX IF EXISTS public.idx_prohibited_severity;

-- aml_flags
DROP INDEX IF EXISTS public.idx_aml_flags_parcel_id;

-- promotions
DROP INDEX IF EXISTS public.idx_promotions_active;
DROP INDEX IF EXISTS public.idx_promotions_code;

-- marketing_attributions
DROP INDEX IF EXISTS public.idx_marketing_source;

-- error_logs (level + source — created_at index keeps because
-- log retention scans by created_at)
DROP INDEX IF EXISTS public.idx_error_logs_level;
DROP INDEX IF EXISTS public.idx_error_logs_source;

-- backups
DROP INDEX IF EXISTS public.idx_backups_created_at;

-- revoked_tokens
DROP INDEX IF EXISTS public.idx_revoked_tokens_expires_at;
DROP INDEX IF EXISTS public.idx_revoked_tokens_user;

-- referrals (drop both — duplicates of each other AND both unused)
DROP INDEX IF EXISTS public.idx_referrals_referrer;
DROP INDEX IF EXISTS public.idx_referrals_referrer_id;
DROP INDEX IF EXISTS public.idx_referrals_referee_id;
DROP INDEX IF EXISTS public.idx_referrals_status;
-- defensive: the F-1 cleanup dropped idx_referrals_referee but the
-- baseline keeps recreating it; drop again here to be sure
DROP INDEX IF EXISTS public.idx_referrals_referee;

-- tudor_invoices
DROP INDEX IF EXISTS public.idx_tudor_invoices_consolidation;

-- password_reset_tokens (idx_password_reset_token is the duplicate;
-- idx_reset_token is the canonical from baseline)
DROP INDEX IF EXISTS public.idx_password_reset_token;
