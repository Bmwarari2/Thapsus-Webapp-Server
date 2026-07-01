-- Migration 060 — performance index cleanup (Supabase performance advisors)
--
-- Two safe, high-value changes driven by the performance advisor:
--
-- 1. Covering indexes for 31 foreign keys that had none. Without a covering
--    index, every ON DELETE CASCADE/SET NULL and every join across the FK does
--    a sequential scan on the child table. Advisor: 0001_unindexed_foreign_keys.
--
-- 2. Drop two genuinely-redundant duplicate indexes (advisor:
--    0009_duplicate_index):
--      • whatsapp_messages: idx_whatsapp_user duplicates idx_whatsapp_messages_user_id
--        (both plain btree on user_id) — drop the older, keep the conventional name.
--      • payments: uq_payments_stripe_pi duplicates the constraint-backed
--        payments_stripe_payment_intent_id_key (both UNIQUE on
--        stripe_payment_intent_id) — drop the standalone index; the UNIQUE
--        constraint still enforces uniqueness.
--
-- NOT done here — dropping "unused" indexes (advisor 0005_unused_index): on this
-- database EVERY index reports idx_scan = 0, including primary keys and unique
-- constraints, i.e. the stats window carries essentially no query traffic. That
-- makes "unused" meaningless as a drop signal right now; revisit after the DB
-- has accumulated representative production traffic. This migration therefore
-- only ADDS indexes and removes provable duplicates.
--
-- Plain CREATE INDEX (not CONCURRENTLY) so the whole migration stays in one
-- transaction; every child table here is tiny so the brief lock is negligible.
-- Fully idempotent — safe to re-run.

-- ── 1. FK covering indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id                       ON public.admin_logs (admin_id);
CREATE INDEX IF NOT EXISTS idx_agent_invoices_consolidation_id           ON public.agent_invoices (consolidation_id);
CREATE INDEX IF NOT EXISTS idx_aml_flags_parcel_id                       ON public.aml_flags (parcel_id);
CREATE INDEX IF NOT EXISTS idx_aml_flags_resolved_by                     ON public.aml_flags (resolved_by);
CREATE INDEX IF NOT EXISTS idx_backups_created_by                        ON public.backups (created_by);
CREATE INDEX IF NOT EXISTS idx_buy_for_me_orders_parcel_id               ON public.buy_for_me_orders (parcel_id);
CREATE INDEX IF NOT EXISTS idx_customer_consolidations_shipping_cons_id  ON public.customer_consolidations (shipping_consolidation_id);
CREATE INDEX IF NOT EXISTS idx_customer_consolidations_created_by        ON public.customer_consolidations (created_by);
CREATE INDEX IF NOT EXISTS idx_customs_tiers_updated_by                  ON public.customs_tiers (updated_by);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_updated_by                 ON public.exchange_rates (updated_by);
CREATE INDEX IF NOT EXISTS idx_finance_report_snapshots_generated_by     ON public.finance_report_snapshots (generated_by);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_created_by           ON public.finance_transactions (created_by);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_tax_code             ON public.finance_transactions (tax_code);
CREATE INDEX IF NOT EXISTS idx_hs_code_tiers_tier_key                    ON public.hs_code_tiers (tier_key);
CREATE INDEX IF NOT EXISTS idx_hs_code_tiers_updated_by                  ON public.hs_code_tiers (updated_by);
CREATE INDEX IF NOT EXISTS idx_insurance_policies_parcel_id              ON public.insurance_policies (parcel_id);
CREATE INDEX IF NOT EXISTS idx_nps_invitations_user_id                   ON public.nps_invitations (user_id);
CREATE INDEX IF NOT EXISTS idx_nps_responses_parcel_id                   ON public.nps_responses (parcel_id);
CREATE INDEX IF NOT EXISTS idx_parcel_items_parcel_id                    ON public.parcel_items (parcel_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id             ON public.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reviewed_by                      ON public.payments (reviewed_by);
CREATE INDEX IF NOT EXISTS idx_pod_events_run_id                         ON public.pod_events (run_id);
CREATE INDEX IF NOT EXISTS idx_pricing_settings_updated_by               ON public.pricing_settings (updated_by);
CREATE INDEX IF NOT EXISTS idx_pvoc_documents_consolidation_id           ON public.pvoc_documents (consolidation_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id                      ON public.referrals (referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id                     ON public.referrals (referrer_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_sender_id                 ON public.ticket_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id                 ON public.ticket_messages (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tudor_invoices_consolidation_id           ON public.tudor_invoices (consolidation_id);
CREATE INDEX IF NOT EXISTS idx_users_referred_by                         ON public.users (referred_by);
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_parcel_id               ON public.whatsapp_messages (parcel_id);

-- ── 2. Drop redundant duplicate indexes ─────────────────────────────────────
DROP INDEX IF EXISTS public.idx_whatsapp_user;
DROP INDEX IF EXISTS public.uq_payments_stripe_pi;
