import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

// ── Validate DATABASE_URL before anything else ──────────────────────────────
const rawUrl = process.env.DATABASE_URL;

if (!rawUrl) {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: DATABASE_URL is not set                                  ║
║                                                                  ║
║  Steps to fix:                                                   ║
║  1. Go to supabase.com → your project → Settings → Database      ║
║  2. Copy the "Connection string" (URI format)                    ║
║  3. In Railway: your service → Variables → add DATABASE_URL      ║
║                                                                  ║
║  Expected format:                                                ║
║  postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres ║
╚══════════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

// Validate it is a real URL before pg even tries to parse it
try {
  const parsed = new URL(rawUrl);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error(`Protocol must be postgres:// or postgresql://, got: ${parsed.protocol}`);
  }
  console.log(`✓ DATABASE_URL validated — host: ${parsed.hostname}`);
} catch (err) {
  console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: DATABASE_URL is set but is not a valid PostgreSQL URL    ║
║                                                                  ║
║  Error: ${err.message.padEnd(54)}║
║                                                                  ║
║  Common mistakes:                                                ║
║  • Password contains special chars — URL-encode them             ║
║    e.g. @ → %40   # → %23   $ → %24   & → %26                   ║
║  • Missing protocol (must start with postgresql://)              ║
║  • Copied the "Direct connection" string with [YOUR-PASSWORD]    ║
║    placeholder still in it — replace it with your real password  ║
║                                                                  ║
║  Expected format:                                                ║
║  postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres ║
╚══════════════════════════════════════════════════════════════════╝
  `);
  process.exit(1);
}

/**
 * PostgreSQL connection pool (Supabase)
 *
 * family: 0  → allow BOTH IPv4 and IPv6 (Node resolves whichever the host returns)
 * ssl        → required for Supabase
 */
const pool = new Pool({
  connectionString: rawUrl,
  ssl: { rejectUnauthorized: false },
  // 0 = auto (IPv4 + IPv6), 4 = IPv4 only, 6 = IPv6 only
  // Supabase now exposes IPv6 endpoints; 0 lets Node pick the fastest.
  family: 0,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err.message);
});

/**
 * Run the schema migration (CREATE TABLE IF NOT EXISTS).
 * Safe to call on every startup — never drops or truncates data.
 */
export async function initializeDatabase() {
  let client;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error(`
╔══════════════════════════════════════════════════════════════════╗
║  FATAL: Could not connect to the database                        ║
║                                                                  ║
║  Check that:                                                     ║
║  1. Your DATABASE_URL password is correct                        ║
║  2. Your Supabase project is active (not paused)                 ║
║  3. The host/port in the URL is correct                          ║
║                                                                  ║
║  Error: ${err.message.substring(0, 54).padEnd(54)}║
╚══════════════════════════════════════════════════════════════════╝
    `);
    throw err;
  }

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        role TEXT CHECK(role IN ('customer', 'admin')) DEFAULT 'customer',
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
        market TEXT CHECK(market IN ('UK', 'USA', 'China')) NOT NULL,
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
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS packages (
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        description TEXT NOT NULL,
        weight_kg REAL,
        status TEXT CHECK(status IN ('pending','received','consolidating','in_transit','customs','out_for_delivery','delivered','lost')) DEFAULT 'pending',
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
        type TEXT CHECK(type IN ('deposit','payment','refund','referral_credit','referral_reward')) NOT NULL,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'KES',
        payment_method TEXT CHECK(payment_method IN ('mpesa','stripe','paypal','wallet','system')),
        payment_reference TEXT,
        status TEXT CHECK(status IN ('pending','completed','failed')) DEFAULT 'pending',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

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
        referral_code TEXT UNIQUE NOT NULL,
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

      CREATE INDEX IF NOT EXISTS idx_orders_user_id       ON orders(user_id);
      CREATE INDEX IF NOT EXISTS idx_orders_tracking      ON orders(tracking_number);
      CREATE INDEX IF NOT EXISTS idx_orders_status        ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_packages_user_id     ON packages(user_id);
      CREATE INDEX IF NOT EXISTS idx_packages_order_id    ON packages(order_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_tickets_user_id      ON tickets(user_id);
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referrer   ON referrals(referrer_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_referee    ON referrals(referee_id);
      CREATE INDEX IF NOT EXISTS idx_referrals_status     ON referrals(status);
      CREATE INDEX IF NOT EXISTS idx_reset_token          ON password_reset_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_backups_created_at   ON backups(created_at);
    `);
    console.log('✓ Database schema initialised (PostgreSQL / Supabase) — IPv4 + IPv6 enabled');
  } finally {
    client.release();
  }
  return pool;
}

export function getPool() {
  return pool;
}

export default pool;
