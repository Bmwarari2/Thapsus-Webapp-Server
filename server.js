// MUST be the first import — populates `globalThis.crypto` before any
// downstream module (uuid v4, supabase-js, our errorLogger) runs its
// own top-level lookup. See polyfills/webcrypto.js for context.
import './polyfills/webcrypto.js';

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
import { startLogRetention } from './utils/logRetention.js';
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
  const adminHash     = bcrypt.hashSync(adminPassword, 10);
  const adminRefCode  = generateReferralCode();
  const warehouseId   = `TC-ADM-${Date.now()}`;

  // Wallet replaced by user_credits in PR A / migration 028. Seed the
  // bootstrap admin into the new shape so first-boot doesn't crash with
  // "column wallet_balance does not exist" on a fresh deploy.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO users (id, email, password, name, phone, role, warehouse_id, language_pref, referral_code, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [adminId, adminEmail, adminHash, 'Thapsus Cargo Admin', '+254700000000', 'admin', warehouseId, 'en', adminRefCode, true]
    );
    await client.query(
      `INSERT INTO user_credits (user_id, balance_kes, updated_at)
       VALUES ($1, 0, NOW())
       ON CONFLICT (user_id) DO NOTHING`,
      [adminId]
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
// import walletRoutes from './routes/wallet.js'; // REMOVED in PR A — wallet replaced by payments + credits (migration 028).
import paymentsRoutes, { stripeWebhookHandler, lipanaWebhookHandler } from './routes/payments.js';
import adminPaymentsRoutes from './routes/adminPayments.js';
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
import retailersRoutes     from './routes/retailers.js';
// ── Framework v2 routes ───────────────────────────────────────────────────────
import consolidationsV2Routes from './routes/consolidationsV2.js';
import customsRoutes          from './routes/customs.js';
import insuranceRoutes        from './routes/insurance.js';
import lastMileRoutes         from './routes/lastMile.js';
import parcelsRoutes          from './routes/parcels.js';
import kpiRoutes              from './routes/kpi.js';
import dsarRoutes             from './routes/dsar.js';
import buyForMeRoutes         from './routes/buyForMe.js';
import opsRoutes              from './routes/ops.js';
import pricingTiersRoutes     from './routes/pricingTiers.js';
import npsRoutes              from './routes/nps.js';
import notificationsRoutes    from './routes/notifications.js';
import agentInvoicesRoutes   from './routes/agentInvoices.js';
import amlFlagsRoutes         from './routes/amlFlags.js';
import appConfigRoutes        from './routes/appConfig.js';
import customerConsolidationsRoutes from './routes/customerConsolidations.js';

const app      = express();
const PORT     = process.env.PORT     || 5000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// ── CORS ──────────────────────────────────────────────────────────────────────
// Audit M-3: fail closed. Never silently default to wildcard.
//
// If CORS_ORIGIN is unset:
//   - NODE_ENV === 'development'  → localhost allowlist (dev convenience)
//   - anything else (incl. unset) → the production allowlist
//
// To use '*' you must opt in explicitly with CORS_ORIGIN='*', and that is
// only honoured when NODE_ENV === 'development'. The previous code defaulted
// to '*' whenever NODE_ENV was anything other than 'production' — and since
// `NODE_ENV = process.env.NODE_ENV || 'development'` upstream of this block
// silently turns an unset env var into 'development', a deploy that forgets
// to set NODE_ENV would have left the API CORS-open. This change rejects
// wildcard outside of an explicit local-dev session.
const DEFAULT_PROD_CORS = 'https://www.thapsus.uk,https://thapsus.uk,https://swiftcargo-production.up.railway.app';
const DEFAULT_DEV_CORS  = 'http://localhost:5173,http://localhost:5000,http://127.0.0.1:5173,http://127.0.0.1:5000';
const CORS_ORIGIN = process.env.CORS_ORIGIN || (NODE_ENV === 'development' ? DEFAULT_DEV_CORS : DEFAULT_PROD_CORS);

if (CORS_ORIGIN === '*' && NODE_ENV !== 'development') {
  throw new Error('FATAL: CORS_ORIGIN="*" is only permitted when NODE_ENV="development". Set CORS_ORIGIN to an explicit comma-separated allowlist.');
}

app.set('trust proxy', 1);

// ── Request ID ────────────────────────────────────────────────────────────────
// Honour an incoming X-Request-Id (from a fronting proxy / load balancer);
// otherwise mint a fresh UUIDv4. Echo the value back in the response header
// so callers can correlate logs with whatever they captured client-side.
// morgan picks the id up via the :request-id token defined below, and
// errorLoggingMiddleware persists it into error_logs.meta.request_id.
app.use((req, res, next) => {
  const incoming = req.get('X-Request-Id');
  const id = (incoming && /^[A-Za-z0-9._-]{1,128}$/.test(incoming)) ? incoming : uuidv4();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
});

// ── Helmet / CSP ──────────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com"],
      // Stripe.js loads from js.stripe.com; Stripe Elements iframes load
      // from m.stripe.network and js.stripe.com; webhook redirects come
      // from hooks.stripe.com; XHRs hit api.stripe.com + r.stripe.com.
      // Stripe's official CSP guide: https://docs.stripe.com/security/guide#content-security-policy
      scriptSrc:  ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://js.stripe.com"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://js.stripe.com"],
      frameSrc:   ["'self'", "https://js.stripe.com", "https://hooks.stripe.com", "https://m.stripe.network"],
      imgSrc:     ["'self'", 'data:', 'https:', "https://www.facebook.com"],
      connectSrc: ["'self'", 'https:', 'wss:', "https://www.google-analytics.com", "https://analytics.google.com", "https://www.googletagmanager.com", "https://connect.facebook.net", "https://www.facebook.com", "https://api.stripe.com", "https://m.stripe.network", "https://r.stripe.com"],
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

// Express 5 / path-to-regexp v6 requires named splat parameters
// instead of bare `*`. `*splat` matches any subpath and stores the
// matched segments in req.params.splat (we don't read it here —
// just need the route to match every preflight).
app.options('/*splat', cors());

app.use(compression());

// morgan: emit the request id alongside the standard fields so log scraping
// can pivot on it. Custom token reads from req.requestId set above.
morgan.token('request-id', (req) => req.requestId || '-');
const MORGAN_FORMAT = NODE_ENV === 'development'
  ? ':method :url :status :response-time ms - :res[content-length] req=:request-id'
  : ':remote-addr - :remote-user [:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" req=:request-id';
app.use(morgan(MORGAN_FORMAT));
// Stripe webhook MUST receive the raw body for signature verification.
// Mount it BEFORE express.json() so the JSON parser doesn't consume the
// stream first. The handler attaches req.db itself via getPool().
app.post('/api/payments/stripe/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, _res, next) => { req.db = getPool(); next(); },
  stripeWebhookHandler
);
// Lipana M-Pesa STK webhook — same raw-body recipe; HMAC-SHA256 signature
// verification reads the unparsed bytes via X-Lipana-Signature.
app.post('/api/payments/lipana/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  (req, _res, next) => { req.db = getPool(); next(); },
  lipanaWebhookHandler
);

// Audit M-5: keep the global JSON / urlencoded body limit small (200kb) so
// a misbehaving client cannot force ~10mb of parser work on auth, admin,
// or any other non-upload endpoint. Real binary uploads (PODs, agent
// invoices, ticket attachments) bypass Express entirely — clients PUT
// to Supabase Storage via signed URLs minted by /api/*/upload-url, which
// only carry small JSON metadata. Stripe + Lipana webhooks are mounted
// above with their own raw-body parsers (1mb each) and are untouched.
app.use(express.json({ limit: '200kb' }));
app.use(express.urlencoded({ limit: '200kb', extended: true }));
app.use(sanitizeBody);
app.use(sanitizeQuery);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Universal Links — apple-app-site-association ─────────────────────────────
// Apple insists on Content-Type: application/json (no extension) and
// HTTPS, no redirects. Keep this above the SPA fallback so it always wins.
app.get('/.well-known/apple-app-site-association', (_req, res) => {
  const aasaPath = path.join(__dirname, 'client', 'public', '.well-known', 'apple-app-site-association');
  res.set({
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300',
  });
  if (fs.existsSync(aasaPath)) {
    res.sendFile(aasaPath);
  } else {
    res.status(404).end();
  }
});

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

// `dotfiles: 'deny'` so a request for /.env (or any other dotfile that
// happens to land in client/dist) returns 403 instead of being served
// or falling through to the SPA index.html. Scanners hit /.env on
// every public Express deploy — without this, the SPA fallback below
// returned 200 + index.html, which (a) lit up scanner reports as a
// "config exposed" hit and (b) wastes a real 404/403 signal.
app.use(express.static(path.join(__dirname, 'client', 'dist'), { dotfiles: 'deny' }));

// Belt-and-braces: the SPA fallback at the bottom of this file would
// otherwise re-serve index.html for any unmatched path including
// /.env, /.git, /.aws, /.docker, etc. Block them at the route layer
// so a scanner gets a clean 404 even before the SPA fallback runs.
app.use((req, res, next) => {
  const segments = req.path.split('/');
  const hasDotfile = segments.some(seg => seg.startsWith('.') && seg.length > 1);
  if (hasDotfile) return res.status(404).end();
  next();
});

// ── Rate limiting ─────────────────────────────────────────────────────────────
//
// All limits are per IP (express-rate-limit's default keyGenerator). Trust
// proxy is set to 1 above, so Railway's edge proxy IP doesn't get treated
// as the source for every request.
//
// Anything mounted as a route handler ABOVE the rate-limit `app.use(...)`
// blocks below (notably the Stripe webhook at app.post('/api/payments/stripe/webhook', …)
// near line 180) bypasses these limiters entirely — Express matches the
// route handler first and never falls through to the limiter middleware.
// That's intentional for the Stripe webhook: signature verification + the
// `stripe_events_seen` idempotency table are the right defence, and
// dropping legitimate Stripe retries on a tight IP cap is worse than the
// negligible DDoS risk of an unauthenticated webhook with raw-body
// constraints.

// Generic catch-all for any /api/ request that isn't handled by a more
// specific limiter below.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests, please try again later.' }),
});

// Tightened from 20 → 10. Even at 10/15min a real user mistyping their
// password 5×/min still gets through; 20 was generous enough that a
// credential-stuffing attacker could meaningfully iterate.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many authentication attempts. Please wait 15 minutes and try again.' }),
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

// Strict cap on reset-token redemption to slow a token-brute-force.
// Reset tokens are random uuids, so guessing is statistically infeasible
// in a 1-hour window even at the network limit, but defence-in-depth
// matters for tokens that gate password rotation.
const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many password reset attempts. Please request a new reset link and try again.',
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

// Cap on signed-upload-URL minting. The upload itself goes direct to
// Supabase storage (we never see the bytes), but unbounded mint requests
// could burn Supabase quota and inflate storage costs. 30/15min is
// well above any legitimate user — riders capture 1 POD per stop, ops
// receive a handful of parcels per shift.
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many upload requests. Please wait a few minutes and try again.',
    }),
});

// Public tracking endpoint is unauthenticated by design (anyone with a
// tracking number can poll status). The keyspace is now ~4B/day after T10
// but per-IP enumeration should still be capped — 60 hits / 15 min is
// generous for a real recipient refreshing the timeline.
const trackingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({
      success: false,
      message: 'Too many tracking lookups. Please wait a few minutes.',
    }),
});

// Both specific limiters AND the catch-all `limiter` below run on a
// matching request — express-rate-limit doesn't short-circuit on a
// previous limiter. So a hit to /api/auth/login increments BOTH the
// authLimiter counter (the binding 10/15min constraint) and the global
// 200/15min counter. Order of registration here is for readability only.
//
// Auth (unauthenticated, brute-force surface)
app.use('/api/auth/login',           authLimiter);
app.use('/api/auth/register',        authLimiter);
app.use('/api/auth/password',        authLimiter);          // PUT — change-password (authenticated, but limited to slow session-hijack brute force)
app.use('/api/auth/reset-password',  resetPasswordLimiter);
app.use('/api/auth/forgot-password', forgotPasswordLimiter);

// Payments (cost + abuse surface). The bare POST /api/payments creates
// a Stripe PaymentIntent (or M-Pesa pending row), which costs Stripe
// API quota and is the typical card-testing vector. GETs to
// /api/payments/:id are status reads (cheap) and don't need a tighter
// cap; the M-Pesa confirmation submit has its own cap below; webhooks
// bypass these entirely (see top-of-section note).
app.use('/api/payments', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') {
    return paymentLimiter(req, res, next);
  }
  next();
});
app.use('/api/payment',                          paymentLimiter); // legacy /api/payment (read-only order lookup)
app.use('/api/payments/:id/mpesa-confirmation',  paymentLimiter);

// Signed-upload-URL mints (Supabase storage cost surface). Each of these
// corresponds to a `POST .../upload-url` (or POD variant) handler that
// returns a 5-minute signed URL the client uses to PUT bytes directly
// into a Supabase storage bucket. We never see the bytes — but unbounded
// mint requests can still inflate Supabase storage cost or be used as a
// vehicle to enumerate parcel/ticket ids.
app.use('/api/last-mile/pod/upload-url',           uploadLimiter); // rider POD photo + signature
app.use('/api/tickets/attachments/upload-url',     uploadLimiter); // support ticket attachment
app.use('/api/parcels/upload-url',                 uploadLimiter); // operator intake photo
app.use('/api/agent-invoices/upload-url',          uploadLimiter); // clearing-agent invoice PDF

// Tracking (public, unauthenticated)
app.use('/api/tracking', trackingLimiter);

// Catch-all — anything not matched above. Mount LAST so the specific
// limiters above get first crack.
app.use('/api/', limiter);

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
// /api/wallet REMOVED — wallet table dropped in migration 028. Stub responds
// with 410 Gone so any stale iOS/web client gets a clear "switch to /api/payments"
// signal instead of a confusing 404.
//
// Express 5 / path-to-regexp v6: bare `*` glob isn't valid; use a
// named splat. `/*splat` is optional (matches the bare path too) and
// `*splat` captures any subpath under /api/wallet — we don't read
// the captured value, the match is the whole point.
app.all('/api/wallet{/*splat}', (_req, res) => res.status(410).json({
  success: false,
  message: 'Wallet has been removed. Use POST /api/payments instead.',
}));
app.use('/api/payments',         paymentsRoutes);
app.use('/api/admin/payments',   adminPaymentsRoutes);
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
app.use('/api/retailers',     retailersRoutes);

// ── Framework v2 mounts ───────────────────────────────────────────────────────
app.use('/api/consolidations', consolidationsV2Routes);
app.use('/api/customs',        customsRoutes);
app.use('/api/insurance',      insuranceRoutes);
app.use('/api/last-mile',      lastMileRoutes);
app.use('/api/parcels',        parcelsRoutes);
app.use('/api/kpi',            kpiRoutes);
app.use('/api/dsar',           dsarRoutes);
app.use('/api/buy-for-me',     buyForMeRoutes);
app.use('/api/ops',            opsRoutes);
app.use('/api/pricing-tiers',  pricingTiersRoutes);
app.use('/api/nps',            npsRoutes);
app.use('/api/notifications',  notificationsRoutes);
app.use('/api/agent-invoices', agentInvoicesRoutes);
app.use('/api/admin/aml-flags', amlFlagsRoutes);
app.use('/api/app-config',     appConfigRoutes);
app.use('/api/customer-consolidations', customerConsolidationsRoutes);

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

    // Audit W6.5 — daily prune of error_logs / admin_logs / email_logs
    // by configurable age. Returns a cancel handle wired into the
    // SIGTERM/SIGINT path so the timer doesn't keep the event loop
    // alive during graceful shutdown.
    const stopLogRetention = startLogRetention(pool);

    const shutdown = (signal) => {
      console.log(`${signal} — shutting down gracefully`);
      try { stopLogRetention?.() } catch { /* ignore */ }
      server.close(() => { pool.end(); process.exit(0); });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
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

// Only auto-boot when this file is the actual entry point (`node server.js`,
// `npm start`, Railway). When imported by the test suite (vitest /
// supertest) we want the assembled `app` to be returned as-is, with no
// listen() call, no DB pool open, and no admin bootstrap. The `start`
// function is still exported so a test harness can opt in if it ever
// needs the full boot path.
const isEntryPoint = process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url);
if (isEntryPoint) {
  start();
}

export { start };
export default app;
