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
  family: 0,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('⚠ Unexpected PostgreSQL pool error:', err.message);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEMA DEFINITIONS
// Each entry: { name, sql, indexes[] }
// Tables are created in dependency order (parents before children).
// ═══════════════════════════════════════════════════════════════════════════════
const TABLES = [
  {
    name: 'users',
    sql: `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      role TEXT CHECK(role IN ('customer','admin')) DEFAULT 'customer',
      warehouse_id TEXT UNIQUE NOT NULL,
      language_pref TEXT DEFAULT 'en',
      referral_code TEXT UNIQUE NOT NULL,
      referred_by TEXT REFERENCES users(id),
      wallet_balance REAL DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [],
  },
  {
    name: 'orders',
    sql: `CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tracking_number TEXT UNIQUE NOT NULL,
      retailer TEXT NOT NULL,
      market TEXT CHECK(market IN ('UK','USA','China')) NOT NULL,
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
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_orders_user_id  ON orders(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_orders_tracking ON orders(tracking_number)',
      'CREATE INDEX IF NOT EXISTS idx_orders_status   ON orders(status)',
    ],
  },
  {
    name: 'packages',
    sql: `CREATE TABLE IF NOT EXISTS packages (
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
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_packages_user_id  ON packages(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_packages_order_id ON packages(order_id)',
    ],
  },
  {
    name: 'transactions',
    sql: `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('deposit','payment','refund','referral_credit','referral_reward')) NOT NULL,
      amount REAL NOT NULL,
      currency TEXT DEFAULT 'KES',
      payment_method TEXT CHECK(payment_method IN ('mpesa','stripe','paypal','wallet','system')),
      payment_reference TEXT,
      status TEXT CHECK(status IN ('pending','completed','failed')) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id)',
    ],
  },
  {
    name: 'wallet',
    sql: `CREATE TABLE IF NOT EXISTS wallet (
      id TEXT PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      balance REAL DEFAULT 0,
      currency TEXT DEFAULT 'KES',
      last_updated TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [],
  },
  {
    name: 'referrals',
    sql: `CREATE TABLE IF NOT EXISTS referrals (
      id TEXT PRIMARY KEY,
      referrer_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      referral_code TEXT UNIQUE NOT NULL,
      status TEXT CHECK(status IN ('pending','completed')) DEFAULT 'pending',
      reward_amount REAL DEFAULT 50,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_referee  ON referrals(referee_id)',
      'CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status)',
    ],
  },
  {
    name: 'tickets',
    sql: `CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT CHECK(status IN ('open','in_progress','resolved','closed')) DEFAULT 'open',
      priority TEXT CHECK(priority IN ('low','medium','high')) DEFAULT 'medium',
      photo_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_tickets_user_id ON tickets(user_id)',
    ],
  },
  {
    name: 'ticket_messages',
    sql: `CREATE TABLE IF NOT EXISTS ticket_messages (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      sender_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [],
  },
  {
    name: 'notifications',
    sql: `CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT CHECK(type IN ('sms','email','whatsapp','in_app')) NOT NULL,
      message TEXT NOT NULL,
      is_read BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id)',
    ],
  },
  {
    name: 'admin_logs',
    sql: `CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [],
  },
  {
    name: 'exchange_rates',
    sql: `CREATE TABLE IF NOT EXISTS exchange_rates (
      id SERIAL PRIMARY KEY,
      currency_pair TEXT UNIQUE NOT NULL,
      rate REAL NOT NULL,
      updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [],
  },
  {
    name: 'password_reset_tokens',
    sql: `CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      used BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_reset_token ON password_reset_tokens(token)',
    ],
  },
  {
    name: 'backups',
    sql: `CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      checksum TEXT NOT NULL,
      status TEXT CHECK(status IN ('completed','failed','in_progress')) DEFAULT 'in_progress',
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_backups_created_at ON backups(created_at)',
    ],
  },
  {
    name: 'email_logs',
    sql: `CREATE TABLE IF NOT EXISTS email_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      email_to TEXT NOT NULL,
      email_type TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT CHECK(status IN ('sent','failed')) DEFAULT 'sent',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_email_logs_user_id ON email_logs(user_id)',
    ],
  },
  {
    name: 'error_logs',
    sql: `CREATE TABLE IF NOT EXISTS error_logs (
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
    )`,
    indexes: [
      'CREATE INDEX IF NOT EXISTS idx_error_logs_created ON error_logs(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_error_logs_level   ON error_logs(level)',
      'CREATE INDEX IF NOT EXISTS idx_error_logs_source  ON error_logs(source)',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// initializeDatabase — creates every table individually with error reporting
// ═══════════════════════════════════════════════════════════════════════════════
export async function initializeDatabase() {
  // ── Step 1: connect ──────────────────────────────────────────────────────
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

  // ── Step 2: verify connection, role, and RLS status ──────────────────────
  try {
    const versionRes = await client.query('SELECT version()');
    console.log(`✓ Database connected — ${versionRes.rows[0].version.split(' ').slice(0, 2).join(' ')}`);
  } catch (err) {
    console.error('⚠ Connected but SELECT version() failed:', err.message);
  }

  // Check which role we're connected as — must be 'postgres' to bypass RLS
  try {
    const roleRes = await client.query('SELECT current_user, current_setting(\'role\') AS session_role');
    const { current_user: dbUser, session_role: sessRole } = roleRes.rows[0];
    console.log(`✓ Connected as role: ${dbUser} (session: ${sessRole})`);

    if (dbUser !== 'postgres' && sessRole !== 'postgres') {
      console.error(`⚠ WARNING: Connected as "${dbUser}" instead of "postgres".`);
      console.error('  RLS policies may block queries. Use the direct connection string (port 5432).');
      console.error('  Go to Supabase → Settings → Database → Connection string (URI)');
    }
  } catch (err) {
    console.error('⚠ Could not check database role:', err.message);
  }

  // ── Step 3: create tables one by one ─────────────────────────────────────
  const results = { ok: [], failed: [] };

  for (const table of TABLES) {
    try {
      await client.query(table.sql);
      results.ok.push(table.name);

      // Create indexes for this table
      for (const idx of table.indexes) {
        try {
          await client.query(idx);
        } catch (idxErr) {
          console.error(`  ⚠ Index failed for ${table.name}: ${idxErr.message}`);
        }
      }
    } catch (err) {
      results.failed.push({ name: table.name, error: err.message });
      console.error(`  ✗ Table "${table.name}" failed: ${err.message}`);
    }
  }

  client.release();

  // ── Step 4: report results ───────────────────────────────────────────────
  if (results.failed.length === 0) {
    console.log(`✓ Database schema initialised — ${results.ok.length}/${TABLES.length} tables ready`);
  } else {
    console.error(`\n⚠ Database schema partially initialised:`);
    console.error(`  ✓ ${results.ok.length} tables OK: ${results.ok.join(', ')}`);
    console.error(`  ✗ ${results.failed.length} tables FAILED:`);
    for (const f of results.failed) {
      console.error(`    - ${f.name}: ${f.error}`);
    }
    console.error('');
  }

  // ── Step 5: verify key tables exist by querying information_schema ───────
  try {
    const checkRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    const existing = checkRes.rows.map(r => r.table_name);
    const expected = TABLES.map(t => t.name);
    const missing = expected.filter(t => !existing.includes(t));

    if (missing.length > 0) {
      console.error(`⚠ Missing tables in database: ${missing.join(', ')}`);
      console.error('  These tables need to be created manually or the errors above need fixing.');
    } else {
      console.log(`✓ All ${expected.length} tables verified in database`);
    }
  } catch (err) {
    console.error('⚠ Could not verify tables:', err.message);
  }

  // ── Step 6: detect and disable RLS on all app tables ─────────────────────
  // Supabase enables RLS by default. Our backend connects as 'postgres' via
  // the direct connection string and handles auth via JWT middleware, so RLS
  // would block all reads/writes unless explicit policies exist.
  try {
    const rlsRes = await pool.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public'
    `);

    const rlsEnabled = rlsRes.rows.filter(r => r.rowsecurity === true);

    if (rlsEnabled.length > 0) {
      console.log(`⚠ RLS is enabled on ${rlsEnabled.length} table(s): ${rlsEnabled.map(r => r.tablename).join(', ')}`);
      console.log('  Disabling RLS — this backend handles auth via JWT middleware...');

      for (const row of rlsEnabled) {
        try {
          await pool.query(`ALTER TABLE public."${row.tablename}" DISABLE ROW LEVEL SECURITY`);
          console.log(`  ✓ RLS disabled on "${row.tablename}"`);
        } catch (rlsErr) {
          console.error(`  ✗ Failed to disable RLS on "${row.tablename}": ${rlsErr.message}`);
        }
      }
    } else {
      console.log('✓ RLS is not enabled on any tables (OK for backend-managed auth)');
    }
  } catch (err) {
    console.error('⚠ Could not check RLS status:', err.message);
  }

  return pool;
}

export function getPool() {
  return pool;
}

export default pool;
