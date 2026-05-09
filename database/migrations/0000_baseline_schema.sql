-- ============================================================
-- Migration 0000 — baseline schema (audit F-baseline).
--
-- Lifts what used to be database/schema.sql into the migration
-- chain so a fresh Supabase project can be provisioned via
-- `node server.js` alone, without anyone having to remember to
-- paste schema.sql into the SQL Editor first.
--
-- Naming: prefixed `0000_` so it sorts before the existing
-- `000_repair_phase4_tables.sql` and runs first.
--
-- Idempotent — every CREATE uses `IF NOT EXISTS`. Live envs
-- already have all of these objects, so this migration applies
-- as a no-op there; the migration ledger just records the file.
--
-- Layered on top by:
--   • migrations 001…044 — every additive column, index, RLS
--     policy, audit fix, etc.
--   • migrations 042–044 in particular — codify the four
--     `ALTER TABLE … ADD COLUMN` lines the bootstrap loop used
--     to run; drop the dead `wallet` table; drop the unused
--     `password_hash` column.
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT,
  phone TEXT NOT NULL,
  role TEXT CHECK(role IN ('customer', 'admin', 'operator', 'clearing_agent', 'rider')) DEFAULT 'customer',
  warehouse_id TEXT UNIQUE NOT NULL,
  language_pref TEXT DEFAULT 'en',
  referral_code TEXT UNIQUE NOT NULL,
  referred_by TEXT REFERENCES users(id),
  wallet_balance REAL DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tracking_number TEXT UNIQUE NOT NULL,
  retailer TEXT NOT NULL,
  market TEXT CHECK(market IN ('UK', 'China')) NOT NULL,
  status TEXT CHECK(status IN ('pending','received_at_warehouse','consolidating','in_transit','customs','out_for_delivery','delivered','cancelled')) DEFAULT 'pending',
  description TEXT NOT NULL,
  weight_kg REAL,
  dimensions_json TEXT,
  shipping_speed TEXT CHECK(shipping_speed IN ('economy','express')) DEFAULT 'economy',
  insurance BOOLEAN DEFAULT FALSE,
  declared_value REAL DEFAULT 0,
  estimated_cost REAL,
  actual_cost REAL,
  customs_duty REAL DEFAULT 0,
  electronics_item TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  weight_kg REAL,
  status TEXT CHECK(status IN ('pre_registered','received_at_warehouse','photographed','weighed','screened','manifested','in_transit','jkia_arrived','awaiting_duty_payment','released','out_for_delivery','delivered','held','held_at_nairobi_hub','abandoned','lost')) DEFAULT 'pre_registered',
  warehouse_location TEXT,
  is_consolidated BOOLEAN DEFAULT FALSE,
  consolidated_with TEXT,
  received_at TIMESTAMPTZ,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('deposit','payment','refund','referral_credit')) NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'KES',
  payment_method TEXT CHECK(payment_method IN ('mpesa','stripe','paypal','wallet')),
  payment_reference TEXT,
  status TEXT CHECK(status IN ('pending','completed','failed')) DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- public.wallet — created here so live-DB-shape matches the migration chain.
-- Mig 043 drops it for real, after mig 039 already tried (the bootstrap was
-- re-creating it on every boot). Live envs no-op; fresh envs create-then-drop.
CREATE TABLE IF NOT EXISTS wallet (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  balance REAL DEFAULT 0,
  currency TEXT DEFAULT 'KES',
  last_updated TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  -- referral_code is NOT unique globally: many referees can use the same
  -- referrer's code. The stored value is suffixed with the referee ID to
  -- keep rows distinct. See routes/auth.js for insertion logic.
  referral_code TEXT NOT NULL,
  status TEXT CHECK(status IN ('pending','completed')) DEFAULT 'pending',
  reward_amount REAL DEFAULT 50,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT CHECK(status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
  priority TEXT CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT CHECK(type IN ('sms','email','whatsapp','in_app')) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS exchange_rates (
  id SERIAL PRIMARY KEY,
  currency_pair TEXT UNIQUE NOT NULL,
  rate REAL NOT NULL,
  updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL,
  token_sha256 BYTEA,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  checksum TEXT NOT NULL,
  status TEXT CHECK(status IN ('completed','failed','in_progress')) DEFAULT 'in_progress',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS email_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  email_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT CHECK(status IN ('sent','failed')) DEFAULT 'sent',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- error_logs was missing from the legacy database/schema.sql but the
-- bootstrap loop in init.js created it; utils/errorLogger.js depends on
-- it. Restore here so a migrations-only fresh provision is complete.
CREATE TABLE IF NOT EXISTS error_logs (
  id TEXT PRIMARY KEY,
  level TEXT CHECK(level IN ('error','warn','fatal')) DEFAULT 'error',
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  method TEXT,
  path TEXT,
  status_code INTEGER,
  user_id TEXT,
  meta TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
-- tracking_number is already UNIQUE (orders_tracking_number_key); a
-- secondary btree on the same column would only add write cost. Audit
-- P5.3 dropped the live duplicate (migration 034); leaving this line
-- removed so fresh installs match.
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_packages_user_id ON packages(user_id);
CREATE INDEX IF NOT EXISTS idx_packages_order_id ON packages(order_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at);
CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs(level);
CREATE INDEX IF NOT EXISTS idx_error_logs_source ON error_logs(source);
