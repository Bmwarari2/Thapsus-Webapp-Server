-- ============================================================
-- Comprehensive idempotency repair for migration 001.
--
-- `CREATE TABLE IF NOT EXISTS` is a no-op when the table already
-- exists, so any environment that has a half-built copy of one of
-- the v2 tables (e.g. `last_mile_runs` without `rider_id`, or
-- `consolidations` without `status`) breaks on the follow-on
-- `CREATE INDEX ... ON <table>(<column>)` line:
--
--    ERROR: 42703: column "<column>" does not exist
--
-- This file ALTERs every table migration 001 creates, adding any
-- missing columns. Re-runnable as many times as you like.
--
-- Run order:
--   1. database/migrations/000_repair_phase4_tables.sql   ← THIS FILE
--   2. database/migrations/001_framework_v2_additions.sql
--   3. database/migrations/002_packages_v2_alignment.sql
--   4. database/migrations/003_realtime_publication.sql
--
-- FK constraints are intentionally omitted from these ALTERs —
-- adding a FK to existing rows that may not satisfy it would
-- fail. The CREATE TABLE in 001 still installs FKs on a fresh
-- instance; the columns added here are simply present so the
-- indexes can be built.
-- ============================================================

-- ── 3. consolidations ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.consolidations
  ADD COLUMN IF NOT EXISTS week_start        DATE,
  ADD COLUMN IF NOT EXISTS cutoff_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS departure_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS arrival_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS total_kg          REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_parcels     INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS master_awb_no     TEXT,
  ADD COLUMN IF NOT EXISTS master_awb_pdf    TEXT,
  ADD COLUMN IF NOT EXISTS tudor_invoice_no  TEXT,
  ADD COLUMN IF NOT EXISTS tudor_invoice_pdf TEXT,
  ADD COLUMN IF NOT EXISTS manifest_pdf      TEXT,
  ADD COLUMN IF NOT EXISTS assigned_agent_id TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 4. pallets ──────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pallets
  ADD COLUMN IF NOT EXISTS consolidation_id  TEXT,
  ADD COLUMN IF NOT EXISTS label             TEXT,
  ADD COLUMN IF NOT EXISTS weight_kg         REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url         TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 5. parcel_items ─────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.parcel_items
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS qty               INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit_value_gbp    REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hs_code           TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 6. customs_entries ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.customs_entries
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS agent_id          TEXT,
  ADD COLUMN IF NOT EXISTS idf_no            TEXT,
  ADD COLUMN IF NOT EXISTS entry_no          TEXT,
  ADD COLUMN IF NOT EXISTS cif_kes           REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duty_kes          REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_kes           REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS idf_kes           REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rdl_kes           REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS admin_fee_kes     REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 7. pvoc_documents ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pvoc_documents
  ADD COLUMN IF NOT EXISTS consolidation_id  TEXT,
  ADD COLUMN IF NOT EXISTS type              TEXT,
  ADD COLUMN IF NOT EXISTS doc_url           TEXT,
  ADD COLUMN IF NOT EXISTS issued_by         TEXT,
  ADD COLUMN IF NOT EXISTS issued_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 8. insurance_policies ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.insurance_policies
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS tier              TEXT,
  ADD COLUMN IF NOT EXISTS declared_value_gbp REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS premium_gbp       REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cert_pdf_url      TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_gbp        REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 9. pricing_tiers ────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pricing_tiers
  ADD COLUMN IF NOT EXISTS channel           TEXT,
  ADD COLUMN IF NOT EXISTS min_kg            REAL,
  ADD COLUMN IF NOT EXISTS max_kg            REAL,
  ADD COLUMN IF NOT EXISTS gbp_per_kg        REAL,
  ADD COLUMN IF NOT EXISTS effective_from    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS effective_to      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 10. fees ────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.fees
  ADD COLUMN IF NOT EXISTS code              TEXT,
  ADD COLUMN IF NOT EXISTS label             TEXT,
  ADD COLUMN IF NOT EXISTS currency          TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS amount            REAL,
  ADD COLUMN IF NOT EXISTS is_percentage     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS effective_from    TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS effective_to      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 11. promotions ──────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.promotions
  ADD COLUMN IF NOT EXISTS code              TEXT,
  ADD COLUMN IF NOT EXISTS type              TEXT,
  ADD COLUMN IF NOT EXISTS value             REAL,
  ADD COLUMN IF NOT EXISTS valid_from        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS valid_to          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS max_uses          INTEGER,
  ADD COLUMN IF NOT EXISTS uses              INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active         BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 12. last_mile_runs ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.last_mile_runs
  ADD COLUMN IF NOT EXISTS rider_id          TEXT,
  ADD COLUMN IF NOT EXISTS zone              TEXT,
  ADD COLUMN IF NOT EXISTS run_date          DATE,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS total_stops       INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed_stops   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 13. pod_events ──────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.pod_events
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS run_id            TEXT,
  ADD COLUMN IF NOT EXISTS rider_id          TEXT,
  ADD COLUMN IF NOT EXISTS result            TEXT,
  ADD COLUMN IF NOT EXISTS captured_at       TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS photo_url         TEXT,
  ADD COLUMN IF NOT EXISTS signature_url     TEXT,
  ADD COLUMN IF NOT EXISTS otp_used          TEXT,
  ADD COLUMN IF NOT EXISTS recipient_name    TEXT,
  ADD COLUMN IF NOT EXISTS recipient_phone   TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 14. agent_invoices ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.agent_invoices
  ADD COLUMN IF NOT EXISTS agent_id          TEXT,
  ADD COLUMN IF NOT EXISTS consolidation_id  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_no        TEXT,
  ADD COLUMN IF NOT EXISTS amount_kes        REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS doc_url           TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;

-- ── 15. tudor_invoices ──────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.tudor_invoices
  ADD COLUMN IF NOT EXISTS consolidation_id  TEXT,
  ADD COLUMN IF NOT EXISTS invoice_no        TEXT,
  ADD COLUMN IF NOT EXISTS amount_gbp        REAL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS breakdown_json    TEXT,
  ADD COLUMN IF NOT EXISTS doc_url           TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS paid_at           TIMESTAMPTZ;

-- ── 16. whatsapp_messages ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS template          TEXT,
  ADD COLUMN IF NOT EXISTS payload_json      TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS language          TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS sent_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 17. dsar_requests ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.dsar_requests
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS type              TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS due_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfilled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS export_url        TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 18. aml_flags ───────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.aml_flags
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS reason            TEXT,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS resolved_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by       TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 19. marketing_attributions ──────────────────────────────────────────────
ALTER TABLE IF EXISTS public.marketing_attributions
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS utm_source        TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium        TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign      TEXT,
  ADD COLUMN IF NOT EXISTS referrer          TEXT,
  ADD COLUMN IF NOT EXISTS landing_path      TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 20. compliance_trainings ────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.compliance_trainings
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS course            TEXT,
  ADD COLUMN IF NOT EXISTS completed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cert_url          TEXT,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 21. prohibited_items ────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.prohibited_items
  ADD COLUMN IF NOT EXISTS term              TEXT,
  ADD COLUMN IF NOT EXISTS severity          TEXT DEFAULT 'prohibited',
  ADD COLUMN IF NOT EXISTS jurisdiction      TEXT DEFAULT 'KE',
  ADD COLUMN IF NOT EXISTS language          TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS reason            TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at  TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 22. nps_responses ───────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.nps_responses
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS score             INTEGER,
  ADD COLUMN IF NOT EXISTS comment           TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW();

-- ── 23. buy_for_me_orders ───────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.buy_for_me_orders
  ADD COLUMN IF NOT EXISTS user_id           TEXT,
  ADD COLUMN IF NOT EXISTS retailer_url      TEXT,
  ADD COLUMN IF NOT EXISTS item_name         TEXT,
  ADD COLUMN IF NOT EXISTS size              TEXT,
  ADD COLUMN IF NOT EXISTS qty               INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notes             TEXT,
  ADD COLUMN IF NOT EXISTS estimate_gbp      REAL,
  ADD COLUMN IF NOT EXISTS markup_pct        REAL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS status            TEXT,
  ADD COLUMN IF NOT EXISTS parcel_id         TEXT,
  ADD COLUMN IF NOT EXISTS created_at        TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at        TIMESTAMPTZ DEFAULT NOW();

-- ── End of repair ───────────────────────────────────────────────────────────
-- After this runs cleanly, re-attempt 001_framework_v2_additions.sql.
