# Thapsus Cargo Backend — Setup Guide

Local-dev walkthrough for the Express 5 API + React 19 SPA. For the why-behind-the-what (auth, RLS, webhook idempotency) read [`ARCHITECTURE.md`](./ARCHITECTURE.md) afterward.

## Prerequisites

- **Node 22.x** — pinned via `.nvmrc`. `nvm use` from the repo root.
- **A Supabase project.** Free tier is fine. You'll need the direct connection string (port 5432, not the 6543 pooler) and the JWT secret.
- **Gmail OAuth2 refresh token** for transactional email (registration confirmations, ticket replies, receipts, DSAR exports). One-time consent flow — see Gmail section.
- **Stripe test keys** (publishable + secret + webhook secret).
- **M-Pesa Daraja sandbox credentials** (consumer key/secret, passkey, shortcode) for Lipana STK Push.

## 1. Install

```bash
nvm use                # Node 22
npm install
cp .env.example .env
```

## 2. Configure `.env`

Minimum to boot locally:

```bash
PORT=5000
NODE_ENV=development

# Auth
JWT_SECRET=<32+ random chars>
JWT_EXPIRY=7d

# DB — Supabase direct connection (port 5432). Port 6543 is read-only.
DATABASE_URL=postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres

# Bootstrap admin (server refuses to boot if ADMIN_PASSWORD is unset)
ADMIN_EMAIL=admin@thapsus.uk
ADMIN_PASSWORD=<strong-pwd>

# CORS — dev permits localhost; production needs an explicit allowlist
CORS_ORIGIN=http://localhost:5173

# Supabase short-lived JWT (matches Supabase → Settings → API → JWT Settings)
SUPABASE_JWT_SECRET=<from Supabase dashboard>
SUPABASE_JWT_TTL_SECONDS=3600
```

For real workflows you'll also need the payment + email vars in the next sections.

## 3. Provision the database

The schema is migration-driven. The boot-time runner is **opt-in** (since 2026-05-11) — set `RUN_MIGRATIONS_ON_BOOT=true` only when you want it to apply.

First-time provision against an empty Supabase project:

```bash
RUN_MIGRATIONS_ON_BOOT=true npm start
```

The server reads `database/migrations/*.sql` in alphabetical order, applies anything missing from the `_migrations` ledger, then calls `ensureAdminUser()` to seed the admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Watch the console for `[init] migrations applied: N`.

For every subsequent run, drop the flag (or set it to `false`) so the server boots without touching DDL:

```bash
npm start
```

If you need to apply a single SQL file out-of-band, paste it into the Supabase SQL Editor; the `_migrations` ledger is the source of truth for what's already applied.

## 4. Stripe webhook (cards)

1. In the Stripe dashboard create a restricted key and a webhook endpoint pointed at `https://<your-host>/api/payments/stripe/webhook`.
2. Set the secret in `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_...
   STRIPE_PUBLISHABLE_KEY=pk_test_...
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
3. The webhook route is mounted with `express.raw({ limit: '1mb' })` **before** `express.json()` so `stripe.webhooks.constructEvent()` sees the unmodified body. Don't reorder that in `server.js`.
4. Idempotency: every accepted event is inserted into `stripe_events_seen` (PK on `event_id`); retries short-circuit on conflict. The shared "money received" side-effect lives in `utils/markPaymentPaid.js` and is called from both webhooks plus the admin M-Pesa approval route.

For local dev use the Stripe CLI:

```bash
stripe listen --forward-to localhost:5000/api/payments/stripe/webhook
```

## 5. M-Pesa Lipana STK Push

```
MPESA_PROVIDER=lipana
MPESA_CONSUMER_KEY=...
MPESA_CONSUMER_SECRET=...
MPESA_PASSKEY=...
MPESA_SHORTCODE=...
MPESA_BUSINESS_TYPE=till   # or paybill
```

The Lipana webhook is at `/api/payments/lipana/webhook`. It verifies HMAC-SHA256 over the raw body against `X-Lipana-Signature` and inserts into `lipana_events_seen` for idempotency. `MPESA_PROVIDER=manual` falls back to the legacy SMS-approval flow (admin posts STK confirmation manually).

## 6. Gmail OAuth2

The `googleapis` client is wired in `utils/email.js`. You need a Google Cloud OAuth client (Desktop or Web), then a one-time consent to obtain a refresh token.

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=ops@thapsus.uk
```

If the running process can't see these, the admin email diagnostic (Admin Console → Email Diagnostics) shows precisely which vars are missing.

## 7. Run the SPA

In a second shell:

```bash
cd client
npm install
npm run dev          # Vite on :5173
```

The SPA calls the API on `http://localhost:5000` (configured in `client/src/api/`). Stripe Elements expects `VITE_STRIPE_PUBLISHABLE_KEY` in `client/.env`.

## 8. Tests

```bash
npm test                       # vitest run
npm run test:watch
npm run test:coverage          # v8 coverage over middleware/, routes/, utils/
npm run test:db                # standalone DB connectivity smoke
```

Unit suites (no DB required):
- `tests/unit/sanitize.test.js` — XSS scrub middleware
- `tests/unit/stripeWebhook.test.js` / `lipanaWebhook.test.js` — payment webhook branches with mocked SDKs
- `tests/unit/deprecation.test.js` — RFC 8594 header emission
- `tests/unit/fxRefresh.test.js` / `logRetention.test.js` — daily-cron helpers
- `tests/unit/outboxShouldQueue.test.js` — web-outbox eligibility
- `tests/unit/pricing.test.js` — six-knob quote engine

Integration suites (require a separate `TEST_DATABASE_URL`):
- `tests/integration/appBoot.test.js` — supertest smoke through the middleware chain (404, request-id, body-size guard, sanitize)
- `tests/integration/auth.test.js` — register / login / `/me` refresh / logout / token revocation
- `tests/integration/roleMatrix.test.js` — table-driven 5×5 role-gate matrix

Integration tests self-skip via `describe.skipIf(!process.env.TEST_DATABASE_URL)`. `tests/setup.js` installs safe placeholders for fail-fast env vars (`JWT_SECRET`, `STRIPE_SECRET_KEY`, etc.) so route modules can be imported without throwing.

## 9. Production deploy (Railway)

- `railway.toml` declares the nixpacks build (`buildCommand` installs both root + client deps and runs `vite build`), `startCommand = node server.js`, healthcheck `/health` (30s timeout), restart on failure, persistent volume mount at `/data`.
- The whole `.env` must be mirrored into Railway Variables. **Redeploy the service after any change** — env is injected at container start.
- Toggle `RUN_MIGRATIONS_ON_BOOT=true` on a one-shot deploy when you intend to push schema, then turn it off again.
- The Lighthouse a11y gate (≥0.9) in CI prevents regressions on the public marketing pages.

## 10. Project structure

```
swiftcargo-main/
├── server.js                # Express bootstrap (~700 LOC): CORS, helmet, request-id, raw-body webhooks, rate limit, routes
├── polyfills/webcrypto.js   # populates globalThis.crypto before uuid/Supabase load
├── client/                  # React 19 + Vite SPA (own package.json, own build)
│   └── src/
│       ├── api/             # axios client + outbox interceptor
│       ├── pages/           # 40+ pages (customer, admin, ops, partner)
│       ├── components/      # shared UI
│       └── ...
├── database/
│   ├── init.js              # pg.Pool, _migrations ledger, opt-in runner
│   ├── seed.js
│   ├── migrations/          # numbered forward-only migrations (0000..052+)
│   ├── manual-migrations/   # out-of-band SQL
│   └── scripts/             # purge_test_data.sql, etc.
├── middleware/
│   ├── auth.js              # HS256-pinned JWT verify, revocation, password-changed-at, is_active
│   ├── sanitize.js          # xss-lib scrub, MAX_DEPTH=16, MAX_KEYS=256
│   └── deprecation.js       # RFC 8594 Deprecation/Sunset/Link headers
├── routes/                  # 36 route modules — see README.md routing overview
├── utils/                   # 22 helpers: email, fx, lipanaClient, stripeClient, pricing, …
├── public/                  # service worker, PWA manifest
├── tests/                   # vitest + supertest
│   ├── unit/
│   └── integration/
├── .github/workflows/       # test.yml (unit + integration + lighthouse), codeql.yml
├── railway.toml
├── .lighthouserc.json
├── vitest.config.js
├── package.json
└── .env.example
```

## Features (current)

### Core
- JWT auth with revocation + password-changed-at + is_active enforcement
- Roles: customer · operator · clearing-agent · rider · admin
- Buy-for-me primary lifecycle (request → quote → invoice → pay → receive → consolidate → dispatch → POD)
- Parcel forwarding (UK → Kenya — China retired 2026-05-11)
- Six-knob pricing model: `pricing_settings`, `customs_tiers`, `hs_code_tiers`, `electronics_fees`
- Customer KES / operator GBP currency convention. FX auto-refreshes daily from frankfurter.dev.

### Payments (live)
- Stripe Checkout / PaymentIntents with raw-body webhook + `stripe_events_seen` idempotency
- M-Pesa **Lipana STK Push** with HMAC-verified webhook + `lipana_events_seen` idempotency
- Manual M-Pesa SMS approval retained as fallback (`MPESA_PROVIDER=manual`)
- Credit ledger (`user_credits` + `credit_ledger`) — replaces retired wallet table

### Operations
- Operator console: camera-driven barcode intake (`@zxing/browser`), browser-print thermal labels, A4 consolidation manifest
- Rider runs with POD capture, signature pad, OTP
- Clearing-agent invoice queue with private signed-URL uploads
- Customer notifications inbox at `/notifications`
- Admin DSAR queue at `/admin/dsar`
- KPI dashboard + audit / error logs + admin revenue reports

### PWA
- Web Outbox: IndexedDB queue + axios interceptor replay for offline mutations
- Service Worker Background Sync for closed-tab outbox replay
- Lighthouse a11y gate (≥0.9) in CI

### Email
- Gmail API with OAuth2 refresh tokens
- Templates live in `utils/email.js`

### Security
- Helmet + strict CSP (Stripe, GA, FB pixel, Google Fonts allowlisted)
- HSTS 1y `includeSubDomains` `preload`
- CORS fails closed in production (`'*'` rejected unless `NODE_ENV=development`)
- 200 KB global body limit; uploads bypass Express via Supabase Storage signed URLs
- Tiered rate limiting (auth 10/15m, payments 10/15m, signed-URL mints 30/15m, tracking 60/15m, global 200/15m); webhooks bypass
- XSS sanitiser with bounded recursion + key count
- Pinned JWT algorithm `HS256` (defends against alg-confusion)
- Token revocation by SHA-256 hash; password-reset bumps `password_changed_at`
- CodeQL SAST weekly; Dependabot grouped patches

## Test credentials

There is no longer a baked-in sample dataset. The first admin row is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` at boot. Create customer accounts via the SPA (`/register`) or programmatically against `/api/auth/register`.

## Troubleshooting

### `ECONNREFUSED` / can't reach DB
Verify `DATABASE_URL` uses the **direct** Supabase connection (port 5432). The 6543 pooler is read-only and rejects DDL — useful for read traffic but not for `npm start` with migrations enabled.

### `ERROR: 42703: column "<X>" does not exist` during migration 001
A prior attempt left a v2 table half-built. Make sure `database/migrations/000_repair_phase4_tables.sql` is present — it runs before 001 and issues `ALTER TABLE ADD COLUMN IF NOT EXISTS` for every column 001 needs.

### Webhook signature verification fails
Almost always one of: `STRIPE_WEBHOOK_SECRET` mismatched against the Stripe dashboard, Lipana key rotated and not re-pasted, or someone reordered `express.json()` ahead of the raw-body webhook routes in `server.js`. The raw mount must come **first**.

### CORS errors in production
Check `CORS_ORIGIN` is a comma-separated allowlist of origins (e.g. `https://thapsus.uk,https://www.thapsus.uk`). `'*'` is rejected outside development.

### `process.env.GMAIL_*` looks empty
Railway only injects env on container restart. Redeploy after editing variables. The admin email diagnostic shows what the running process actually sees.

### Port already in use
Override `PORT` in `.env`.

### Tests fail with `JWT_SECRET is required`
`tests/setup.js` installs safe placeholders, but only via vitest. If you import a route file from a one-off script, set the env yourself.

## License

MIT — Thapsus Cargo team.
