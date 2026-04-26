-- ============================================================
-- Migration 001 — Framework v2 additions
--
-- Additive only.  Idempotent.  Safe to run repeatedly.
-- Implements every new table and column listed in
-- Thapsus Webapp Spec §5 (delta against existing Supabase
-- schema in database/schema.sql).
--
-- Run order:
--   1. database/schema.sql        (existing tables — already live)
--   2. database/migrations/001_*  (this file)
--
-- Convention:
--   • CREATE TABLE IF NOT EXISTS         — idempotent table creation
--   • ALTER TABLE … ADD COLUMN IF NOT…   — idempotent column add
--   • DO $$ BEGIN … EXCEPTION … END $$;  — idempotent constraint /
--                                          enum / index where IF NOT
--                                          EXISTS is not supported
-- ============================================================

-- ── 1. Roles enum widening on users ─────────────────────────────────────────
-- The original users.role allows ('customer','admin').  Framework v2 adds
-- operator, clearing_agent and rider.  Postgres CHECK constraints can't be
-- altered in place — we drop and recreate, which is safe because every
-- existing row is already 'customer' or 'admin'.
DO $$
BEGIN
  ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
EXCEPTION WHEN undefined_object THEN
  NULL;
END $$;

ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer','admin','operator','clearing_agent','rider'));

-- ── 2. New columns on existing tables ───────────────────────────────────────
ALTER TABLE users ADD COLUMN IF NOT EXISTS country_of_residence TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_status            TEXT
  CHECK (kyc_status IN ('none','pending','verified','rejected')) DEFAULT 'none';
ALTER TABLE users ADD COLUMN IF NOT EXISTS kyc_doc_url           TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent_at  TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_source            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_medium            TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS utm_campaign          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS two_fa_enabled        BOOLEAN DEFAULT FALSE;

ALTER TABLE orders ADD COLUMN IF NOT EXISTS consolidation_id     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS volumetric_kg        REAL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS chargeable_kg        REAL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_reason          TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS hold_resolved_at     TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS photographed_at      TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insurance_tier       TEXT
  CHECK (insurance_tier IN ('standard','plus','premier','custom'));
ALTER TABLE orders ADD COLUMN IF NOT EXISTS insurance_premium_gbp REAL DEFAULT 0;

ALTER TABLE packages ADD COLUMN IF NOT EXISTS barcode             TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS screening_result    TEXT
  CHECK (screening_result IN ('clean','held','dg_suspect'));
ALTER TABLE packages ADD COLUMN IF NOT EXISTS insurance_policy_id TEXT;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_packages_barcode_unique
    ON packages(barcode) WHERE barcode IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS idempotency_key   TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled_at     TIMESTAMPTZ;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS processor_fee_gbp REAL DEFAULT 0;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_idempotency_unique
    ON transactions(idempotency_key) WHERE idempotency_key IS NOT NULL;
EXCEPTION WHEN duplicate_table THEN
  NULL;
END $$;

-- ── 3. Consolidations (weekly UK→NBO flight unit) ───────────────────────────
CREATE TABLE IF NOT EXISTS consolidations (
  id                TEXT PRIMARY KEY,
  week_start        DATE NOT NULL,
  cutoff_at         TIMESTAMPTZ NOT NULL,
  departure_at      TIMESTAMPTZ,
  arrival_at        TIMESTAMPTZ,
  status            TEXT CHECK (status IN
                      ('open','closed','in_transit','arrived','cleared','delivered','cancelled'))
                      DEFAULT 'open',
  total_kg          REAL DEFAULT 0,
  total_parcels     INTEGER DEFAULT 0,
  master_awb_no     TEXT,
  master_awb_pdf    TEXT,
  tudor_invoice_no  TEXT,
  tudor_invoice_pdf TEXT,
  manifest_pdf      TEXT,
  assigned_agent_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidations_status     ON consolidations(status);
CREATE INDEX IF NOT EXISTS idx_consolidations_week_start ON consolidations(week_start);
CREATE INDEX IF NOT EXISTS idx_consolidations_agent      ON consolidations(assigned_agent_id);

-- ── 4. Pallets within a consolidation ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS pallets (
  id                TEXT PRIMARY KEY,
  consolidation_id  TEXT NOT NULL REFERENCES consolidations(id) ON DELETE CASCADE,
  label             TEXT NOT NULL,
  weight_kg         REAL DEFAULT 0,
  photo_url         TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pallets_consolidation ON pallets(consolidation_id);

-- ── 5. Parcel items (HS classification line-items) ──────────────────────────
CREATE TABLE IF NOT EXISTS parcel_items (
  id              TEXT PRIMARY KEY,
  parcel_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  description     TEXT NOT NULL,
  qty             INTEGER NOT NULL DEFAULT 1,
  unit_value_gbp  REAL NOT NULL DEFAULT 0,
  hs_code         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_parcel_items_parcel ON parcel_items(parcel_id);

-- ── 6. Customs entries (Kenya KRA ledger, per parcel) ───────────────────────
CREATE TABLE IF NOT EXISTS customs_entries (
  id          TEXT PRIMARY KEY,
  parcel_id   TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  agent_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  idf_no      TEXT,
  entry_no    TEXT,
  cif_kes     REAL DEFAULT 0,
  duty_kes    REAL DEFAULT 0,
  vat_kes     REAL DEFAULT 0,
  idf_kes     REAL DEFAULT 0,
  rdl_kes     REAL DEFAULT 0,
  admin_fee_kes REAL DEFAULT 0,
  status      TEXT CHECK (status IN
                ('draft','idf_submitted','entry_filed','duty_paid','released','rejected'))
                DEFAULT 'draft',
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customs_entries_parcel ON customs_entries(parcel_id);
CREATE INDEX IF NOT EXISTS idx_customs_entries_agent  ON customs_entries(agent_id);
CREATE INDEX IF NOT EXISTS idx_customs_entries_status ON customs_entries(status);

-- ── 7. PVoC documents (Certificates of Conformity per consolidation) ────────
CREATE TABLE IF NOT EXISTS pvoc_documents (
  id               TEXT PRIMARY KEY,
  consolidation_id TEXT NOT NULL REFERENCES consolidations(id) ON DELETE CASCADE,
  type             TEXT CHECK (type IN ('coc','rfc','exemption','other')) NOT NULL,
  doc_url          TEXT NOT NULL,
  issued_by        TEXT,
  issued_at        TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pvoc_consolidation ON pvoc_documents(consolidation_id);

-- ── 8. Insurance policies (declared-value cover per parcel) ─────────────────
CREATE TABLE IF NOT EXISTS insurance_policies (
  id                  TEXT PRIMARY KEY,
  parcel_id           TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                TEXT CHECK (tier IN ('standard','plus','premier','custom')) NOT NULL,
  declared_value_gbp  REAL NOT NULL DEFAULT 0,
  premium_gbp         REAL NOT NULL DEFAULT 0,
  cert_pdf_url        TEXT,
  status              TEXT CHECK (status IN ('active','claimed','expired','cancelled'))
                        DEFAULT 'active',
  claimed_at          TIMESTAMPTZ,
  payout_gbp          REAL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_insurance_parcel ON insurance_policies(parcel_id);
CREATE INDEX IF NOT EXISTS idx_insurance_user   ON insurance_policies(user_id);

-- ── 9. Pricing tiers (editable weight-band ladder) ──────────────────────────
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id              TEXT PRIMARY KEY,
  channel         TEXT NOT NULL,                  -- 'UK_air','UK_sea','China_air'
  min_kg          REAL NOT NULL,
  max_kg          REAL NOT NULL,
  gbp_per_kg      REAL NOT NULL,
  effective_from  TIMESTAMPTZ DEFAULT NOW(),
  effective_to    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_tiers_channel_active
  ON pricing_tiers(channel, is_active);

-- ── 10. Fees (editable fee schedule) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fees (
  id              TEXT PRIMARY KEY,
  code            TEXT UNIQUE NOT NULL,           -- 'uk_handling','trunking','agent','rider','admin_pct'
  label           TEXT NOT NULL,
  currency        TEXT DEFAULT 'GBP',
  amount          REAL NOT NULL,
  is_percentage   BOOLEAN DEFAULT FALSE,
  effective_from  TIMESTAMPTZ DEFAULT NOW(),
  effective_to    TIMESTAMPTZ,
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 11. Promotions (promo codes) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id          TEXT PRIMARY KEY,
  code        TEXT UNIQUE NOT NULL,
  type        TEXT CHECK (type IN ('flat_gbp_per_kg','percent_off','fixed_off')) NOT NULL,
  value       REAL NOT NULL,
  valid_from  TIMESTAMPTZ DEFAULT NOW(),
  valid_to    TIMESTAMPTZ,
  max_uses    INTEGER,
  uses        INTEGER DEFAULT 0,
  is_active   BOOLEAN DEFAULT TRUE,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_promotions_code   ON promotions(code);
CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);

-- ── 12. Last-mile runs (Nairobi rider runs) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS last_mile_runs (
  id            TEXT PRIMARY KEY,
  rider_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  zone          TEXT NOT NULL,                    -- westlands, kilimani, karen, kasarani, eastlands
  run_date      DATE NOT NULL,
  status        TEXT CHECK (status IN
                  ('planned','in_progress','completed','cancelled'))
                  DEFAULT 'planned',
  total_stops   INTEGER DEFAULT 0,
  completed_stops INTEGER DEFAULT 0,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_runs_rider     ON last_mile_runs(rider_id);
CREATE INDEX IF NOT EXISTS idx_runs_run_date  ON last_mile_runs(run_date);
CREATE INDEX IF NOT EXISTS idx_runs_status    ON last_mile_runs(status);

-- ── 13. POD events (proof of delivery) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS pod_events (
  id              TEXT PRIMARY KEY,
  parcel_id       TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  run_id          TEXT REFERENCES last_mile_runs(id) ON DELETE SET NULL,
  rider_id        TEXT REFERENCES users(id) ON DELETE SET NULL,
  result          TEXT CHECK (result IN ('delivered','failed','reattempt','held'))
                    DEFAULT 'delivered',
  captured_at     TIMESTAMPTZ DEFAULT NOW(),
  photo_url       TEXT,
  signature_url   TEXT,
  otp_used        TEXT,
  recipient_name  TEXT,
  recipient_phone TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pod_parcel ON pod_events(parcel_id);
CREATE INDEX IF NOT EXISTS idx_pod_run    ON pod_events(run_id);
CREATE INDEX IF NOT EXISTS idx_pod_rider  ON pod_events(rider_id);

-- ── 14. Agent invoices (Kenya clearing agent → Thapsus) ─────────────────────
CREATE TABLE IF NOT EXISTS agent_invoices (
  id               TEXT PRIMARY KEY,
  agent_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consolidation_id TEXT REFERENCES consolidations(id) ON DELETE SET NULL,
  invoice_no       TEXT,
  amount_kes       REAL NOT NULL DEFAULT 0,
  doc_url          TEXT,
  status           TEXT CHECK (status IN
                     ('submitted','approved','paid','rejected'))
                     DEFAULT 'submitted',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  paid_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_invoices_agent  ON agent_invoices(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_invoices_status ON agent_invoices(status);

-- ── 15. Tudor invoices (Tudor Freight → Thapsus) ────────────────────────────
CREATE TABLE IF NOT EXISTS tudor_invoices (
  id               TEXT PRIMARY KEY,
  consolidation_id TEXT REFERENCES consolidations(id) ON DELETE SET NULL,
  invoice_no       TEXT,
  amount_gbp       REAL NOT NULL DEFAULT 0,
  breakdown_json   TEXT,
  doc_url          TEXT,
  status           TEXT CHECK (status IN
                     ('received','approved','paid','disputed'))
                     DEFAULT 'received',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  paid_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tudor_invoices_consolidation
  ON tudor_invoices(consolidation_id);

-- ── 16. WhatsApp messages (outbound template log) ───────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  parcel_id   TEXT REFERENCES orders(id) ON DELETE SET NULL,
  template    TEXT NOT NULL,                -- 'received_at_warehouse','in_transit',
                                            -- 'customs_cleared','out_for_delivery'
  payload_json TEXT,
  status      TEXT CHECK (status IN ('queued','sent','failed','delivered','read'))
                DEFAULT 'queued',
  language    TEXT DEFAULT 'en',
  sent_at     TIMESTAMPTZ,
  error       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_user     ON whatsapp_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_parcel   ON whatsapp_messages(parcel_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_template ON whatsapp_messages(template);

-- ── 17. DSAR requests (GDPR data subject access) ────────────────────────────
CREATE TABLE IF NOT EXISTS dsar_requests (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          TEXT CHECK (type IN ('export','erase')) NOT NULL,
  status        TEXT CHECK (status IN
                  ('open','in_progress','fulfilled','rejected'))
                  DEFAULT 'open',
  due_at        TIMESTAMPTZ,
  fulfilled_at  TIMESTAMPTZ,
  export_url    TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dsar_user   ON dsar_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_dsar_status ON dsar_requests(status);

-- ── 18. AML flags (over-£1k declared values etc.) ───────────────────────────
CREATE TABLE IF NOT EXISTS aml_flags (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parcel_id    TEXT REFERENCES orders(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL,
  status       TEXT CHECK (status IN ('open','cleared','escalated')) DEFAULT 'open',
  resolved_at  TIMESTAMPTZ,
  resolved_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_aml_user   ON aml_flags(user_id);
CREATE INDEX IF NOT EXISTS idx_aml_status ON aml_flags(status);

-- ── 19. Marketing attributions (UTM rollup) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS marketing_attributions (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,
  referrer     TEXT,
  landing_path TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_user   ON marketing_attributions(user_id);
CREATE INDEX IF NOT EXISTS idx_marketing_source ON marketing_attributions(utm_source);

-- ── 20. Compliance trainings (IATA DGR + GDPR) ──────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_trainings (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course       TEXT NOT NULL,                 -- 'iata_dgr_cat6','gdpr_awareness'
  completed_at TIMESTAMPTZ NOT NULL,
  expires_at   TIMESTAMPTZ,
  cert_url     TEXT,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trainings_user ON compliance_trainings(user_id);

-- ── 21. Prohibited items (editable dictionary) ──────────────────────────────
CREATE TABLE IF NOT EXISTS prohibited_items (
  id                TEXT PRIMARY KEY,
  term              TEXT NOT NULL,
  severity          TEXT CHECK (severity IN ('prohibited','restricted')) DEFAULT 'prohibited',
  jurisdiction      TEXT DEFAULT 'KE',
  language          TEXT DEFAULT 'en',
  reason            TEXT,
  last_reviewed_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prohibited_term     ON prohibited_items(term);
CREATE INDEX IF NOT EXISTS idx_prohibited_severity ON prohibited_items(severity);

-- ── 22. NPS responses ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nps_responses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT REFERENCES users(id) ON DELETE SET NULL,
  parcel_id   TEXT REFERENCES orders(id) ON DELETE SET NULL,
  score       INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  comment     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nps_user    ON nps_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_nps_score   ON nps_responses(score);

-- ── 23. Buy-for-me concierge orders ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buy_for_me_orders (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  retailer_url    TEXT NOT NULL,
  item_name       TEXT NOT NULL,
  size            TEXT,
  qty             INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  estimate_gbp    REAL,
  markup_pct      REAL DEFAULT 10,
  status          TEXT CHECK (status IN
                    ('pending_quote','quoted','paid','purchased','received','shipped','cancelled'))
                    DEFAULT 'pending_quote',
  parcel_id       TEXT REFERENCES orders(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bfm_user   ON buy_for_me_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_bfm_status ON buy_for_me_orders(status);

-- ── 24. Seed pricing tiers (Tudor Freight Nairobi rate card seed) ───────────
-- Inserted only if no pricing_tiers row exists for that channel — keeps the
-- migration idempotent without overwriting admin edits.
INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, notes)
SELECT 'pt-uk-air-001', 'UK_air',  0,    5,  14.00, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air');

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, notes)
SELECT 'pt-uk-air-002', 'UK_air',  5,   10,  12.00, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=5);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, notes)
SELECT 'pt-uk-air-003', 'UK_air', 10,   25,  10.00, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=10);

INSERT INTO pricing_tiers (id, channel, min_kg, max_kg, gbp_per_kg, notes)
SELECT 'pt-uk-air-004', 'UK_air', 25,  100,   9.00, 'Tudor Freight rate card seed'
WHERE NOT EXISTS (SELECT 1 FROM pricing_tiers WHERE channel='UK_air' AND min_kg=25);

-- ── 25. Seed fees ───────────────────────────────────────────────────────────
INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-uk-handling', 'uk_handling', 'UK warehouse handling per parcel',
       'GBP', 2.50, FALSE, 'Framework v2 §9 cost stack'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='uk_handling');

INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-trunking', 'trunking', 'Stockport → Tudor trunking',
       'GBP', 75.00, FALSE, 'Framework v2 §6 trunking budget'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='trunking');

INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-tudor-handling', 'tudor_handling', 'Tudor Freight handling',
       'GBP', 50.00, FALSE, 'Framework v2 §7 Tudor handling'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='tudor_handling');

INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-admin-pct', 'admin_pct', 'Duty pass-through admin fee',
       'GBP', 5.00, TRUE, 'Spec §4.5 — 5% on duty pass-through'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='admin_pct');

-- ── 26. Seed insurance tier reference fees ──────────────────────────────────
INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-ins-plus', 'insurance_plus', 'Insurance Plus (≤£500)',
       'GBP', 8.00, FALSE, 'Spec §4.9 declared-value insurance'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='insurance_plus');

INSERT INTO fees (id, code, label, currency, amount, is_percentage, notes)
SELECT 'fee-ins-premier', 'insurance_premier', 'Insurance Premier (≤£2 000)',
       'GBP', 3.50, TRUE, 'Spec §4.9 — 3.5% of declared value'
WHERE NOT EXISTS (SELECT 1 FROM fees WHERE code='insurance_premier');

-- ── 27. Seed prohibited items dictionary (small EN starter set) ─────────────
INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-001', 'lithium battery', 'restricted', 'KE', 'en',
       'Class 9 dangerous goods — must be declared and packaged per IATA DGR'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='lithium battery' AND language='en');

INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-002', 'firearm', 'prohibited', 'KE', 'en',
       'Firearms and parts thereof are prohibited in air consolidations'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='firearm' AND language='en');

INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-003', 'narcotic', 'prohibited', 'KE', 'en',
       'Narcotic drugs are prohibited under POCAMLA and KRA rules'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='narcotic' AND language='en');

INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-004', 'perfume', 'restricted', 'KE', 'en',
       'Alcohol-based perfumes are Class 3 flammable liquid — limited quantities only'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='perfume' AND language='en');

-- Swahili variants
INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-001-sw', 'betri ya lithium', 'restricted', 'KE', 'sw',
       'Bidhaa hatari ya darasa la 9 — lazima itangazwe na ifungashwe kwa IATA DGR'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='betri ya lithium' AND language='sw');

INSERT INTO prohibited_items (id, term, severity, jurisdiction, language, reason)
SELECT 'pi-002-sw', 'silaha', 'prohibited', 'KE', 'sw',
       'Silaha na sehemu zake zimekatazwa kwenye usafirishaji wa anga'
WHERE NOT EXISTS (SELECT 1 FROM prohibited_items WHERE term='silaha' AND language='sw');

-- ── End of migration ────────────────────────────────────────────────────────
