import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { initializeDatabase, getPool } from './database/init.js';
import { logError, errorLoggingMiddleware, logRouteError } from './utils/errorLogger.js';
import { sanitizeBody, sanitizeQuery } from './middleware/sanitize.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

function generateReferralCode() {
  return `REF${Date.now()}${Math.random().toString(36).substr(2, 9)}`.toUpperCase();
}

async function ensureAdminUser(pool) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@thapsus.uk';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    throw new Error('FATAL: ADMIN_PASSWORD env var is not set');
  }

  const { rows } = await pool.query(
    `SELECT id, email FROM users WHERE role = $1 OR email = $2 LIMIT 1`,
    ['admin', adminEmail]
  );

  if (rows.length > 0) {
    console.log(`✓ Admin user already exists: ${rows[0].email}`);
    return;
  }

  const adminId       = uuidv4();
  const adminWalletId = uuidv4();
  const adminHash     = bcrypt.hashSync(adminPassword, 10);
  const adminRefCode  = generateReferralCode();
  const warehouseId   = `TC-ADM-${Date.now()}`;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, language_pref, referral_code, wallet_balance, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [adminId, adminEmail, adminHash, 'Thapsus Cargo Admin', '+254700000000', 'admin', warehouseId, 'en', adminRefCode, 0, true]
    );
    await client.query(
      `INSERT INTO wallet (id, user_id, balance, currency) VALUES ($1,$2,$3,$4)`,
      [adminWalletId, adminId, 0, 'KES']
    );
    await client.query('COMMIT');
    console.log(`✓ Admin user created: ${adminEmail}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────
import authRoutes          from './routes/auth.js';
import ordersRoutes        from './routes/orders.js';
import trackingRoutes      from './routes/tracking.js';
import adminRoutes         from './routes/admin.js';
import walletRoutes        from './routes/wallet.js';
import exchangeRoutes      from './routes/exchange.js';
import referralRoutes      from './routes/referral.js';
import ticketsRoutes       from './routes/tickets.js';
import pricingRoutes       from './routes/pricing.js';
import consolidationRoutes from './routes/consolidation.js';
import prohibitedRoutes    from './routes/prohibited.js';
import backupRoutes        from './routes/backup.js';
import eventsRoutes        from './routes/events.js';
import paymentRoutes       from './routes/payment.js';
import sitemapRoutes       from './routes/sitemap.js';
import warehouseRoutes     from './routes/warehouse.js';
// ── Framework v2 routes ───────────────────────────────────────────────────────
import consolidationsV2Routes from './routes/consolidationsV2.js';
import customsRoutes          from './routes/customs.js';
import insuranceRoutes        from './routes/insurance.js';
import lastMileRoutes         from './routes/lastMile.js';
import kpiRoutes              from './routes/kpi.js';
import dsarRoutes             from './routes/dsar.js';
import buyForMeRoutes         from './routes/buyForMe.js';
import opsRoutes              from './routes/ops.js';
import pricingTiersRoutes     from './routes/pricingTiers.js';
import npsRoutes              from './routes/nps.js';

const app      = express();
const PORT     = process.env.PORT     || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── CORS ──────────────────────────────────────────────────────────────────────
// In production we require an explicit allowlist of origins and will fail fast
// if a wildcard is configured to avoid accidentally exposing the API.
const DEFAULT_PROD_CORS = 'https://www.thapsus.uk,https://thapsus.uk,https://swiftcargo-production.up.railway.app';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'production' ? DEFAULT_PROD_CORS : '*');

if (NODE_ENV === 'production' && CORS_ORIGIN === '*') {
  throw new Error('FATAL: In production, CORS_ORIGIN must be an explicit allowlist, not "*".');
}

app.set('trust proxy', 1);

// ── Helmet / CSP ──────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://connect.facebook.net"],
      imgSrc:     ["'self'", 'data:', 'https:', "https://www.facebook.com"],
      connectSrc: ["'self'", 'https:', 'wss:', "https://www.google-analytics.com", "https://analytics.google.com", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://www.facebook.com"],
    },
  },
  // Strict-Transport-Security: enforce HTTPS for 1 year + include subdomains
  strictTransportSecurity: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// ── CORS middleware ───────────────────────────────────────────────────────────
if (CORS_ORIGIN === '*') {
  app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'], optionsSuccessStatus: 200 }));
} else {
  const allowList = CORS_ORIGIN.split(',').map(o => o.trim());
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowList.includes(origin)) return cb(null, true);
      cb(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
    optionsSuccessStatus: 200,
    methods: ['GET','POST','PUT','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization'],
  }));
}

app.options('*', cors());

app.use(compression());
app.use(morgan(NODE_ENV === 'development' ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(sanitizeBody);
app.use(sanitizeQuery);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Service Worker ────────────────────────────────────────────────────────────
// Serve sw.js with no-cache headers so browsers always fetch the latest version.
// If the built file doesn't exist yet (e.g. first cold deploy before `npm run
// build` completes) we fall back to a minimal no-op SW served inline so the
// server never throws ENOENT and the app remains fully functional.
const SW_DIST_PATH = path.join(__dirname, 'client', 'dist', 'sw.js');
const SW_NO_OP = [
  '// Thapsus Cargo — no-op service worker fallback',
  'self.addEventListener("install",  e => self.skipWaiting());',
  'self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));',
  'self.addEventListener("fetch",    () => {});',
].join('\n');

app.get('/sw.js', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Content-Type':  'application/javascript',
  });
  // Use the built file when available, otherwise send the inline no-op fallback
  if (fs.existsSync(SW_DIST_PATH)) {
    res.sendFile(SW_DIST_PATH);
  } else {
    console.warn('[sw.js] dist file not found — serving no-op fallback');
    res.send(SW_NO_OP);
  }
});

// ── Sitemap & Robots (dynamic, before static so they take precedence) ────────
app.use(sitemapRoutes);

app.use(express.static(path.join(__dirname, 'client', 'dist')));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests, please try again later.' }),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many login attempts. Please wait 15 minutes and try again.' }),
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many password reset requests. Please wait 1 hour and try again.',
    }),
});

const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many payment submissions. Please try again later.',
    }),
});

// existing
app.use('/api/', limiter);
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// new
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/payment',              paymentLimiter);
app.use('/api/wallet/mpesa-confirm', paymentLimiter);

// ── Disable caching on API routes ────────────────────────────────────────────
app.set('etag', false);
app.use('/api', (req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  next();
});

// ── Attach pool to every request ──────────────────────────────────────────────
app.use((req, res, next) => { req.db = getPool(); next(); });

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await getPool().query('SELECT 1');
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = `error: ${e.message}`;
  }
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    database: dbStatus,
    cors_origin: CORS_ORIGIN,
    realtime: 'SSE',
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/orders',        ordersRoutes);
app.use('/api/tracking',      trackingRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/wallet',        walletRoutes);
app.use('/api/exchange',      exchangeRoutes);
app.use('/api/referral',      referralRoutes);
app.use('/api/tickets',       ticketsRoutes);
app.use('/api/pricing',       pricingRoutes);
app.use('/api/consolidation', consolidationRoutes);
app.use('/api/prohibited',    prohibitedRoutes);
app.use('/api/admin/backups', backupRoutes);
app.use('/api/events',        eventsRoutes);
app.use('/api/payment',       paymentRoutes);
app.use('/api/warehouse',     warehouseRoutes);

// ── Framework v2 mounts ───────────────────────────────────────────────────────
app.use('/api/consolidations', consolidationsV2Routes);
app.use('/api/customs',        customsRoutes);
app.use('/api/insurance',      insuranceRoutes);
app.use('/api/last-mile',      lastMileRoutes);
app.use('/api/kpi',            kpiRoutes);
app.use('/api/dsar',           dsarRoutes);
app.use('/api/buy-for-me',     buyForMeRoutes);
app.use('/api/ops',            opsRoutes);
app.use('/api/pricing-tiers',  pricingTiersRoutes);
app.use('/api/nps',            npsRoutes);

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get(/^\/(?!api).*/, (req, res) => {
  res.sendFile(path.join(__dirname, 'client', 'dist', 'index.html'));
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found', path: req.path });
});

// ── Error logging middleware (logs to error_logs table) ───────────────────────
app.use(errorLoggingMiddleware);

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (err.name === 'MulterError') {
    if (err.code === 'FILE_TOO_LARGE')
      return res.status(400).json({ success: false, message: 'File size exceeds maximum allowed' });
    return res.status(400).json({ success: false, message: 'File upload error' });
  }
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
async function start() {
  try {
    await initializeDatabase();
    const pool = getPool();
    await ensureAdminUser(pool);

    const server = app.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════╗
║         THAPSUS CARGO BACKEND            ║
║   Shipping & Forwarding Service          ║
╚══════════════════════════════════════════╝

Server   →  http://localhost:${PORT}
Env      →  ${NODE_ENV}
Database →  PostgreSQL (Supabase)
CORS     →  ${CORS_ORIGIN}
Realtime →  SSE (/api/events)

Ready ✨
`);
    });

    server.keepAliveTimeout = 65_000;
    server.headersTimeout   = 70_000;

    process.on('SIGTERM', () => {
      console.log('SIGTERM — shutting down gracefully');
      server.close(() => { pool.end(); process.exit(0); });
    });
    process.on('SIGINT', () => {
      console.log('SIGINT — shutting down gracefully');
      server.close(() => { pool.end(); process.exit(0); });
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      logError({ level: 'fatal', source: 'unhandled', message: err.message, stack: err.stack });
    });
    process.on('unhandledRejection', (reason) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : null;
      console.error('Unhandled Rejection:', reason);
      logError({ level: 'fatal', source: 'unhandled', message: msg, stack });
    });

  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
export default app;
