# Thapsus Cargo — webapp + API (`Swiftcargo-main`)

UK → Kenya parcel-forwarding, consolidation and **Buy-for-me** (concierge "Shop & ship") logistics. Backed by an Express 5 API on Railway and Postgres on Supabase. The companion native mobile apps (iOS + Android) live in [`thapsus-v1.1`](https://github.com/Bmwarari2/thapsus-v1.1) (private).

> **Product positioning (2026-05-13):** Buy-for-me is the primary customer journey across web, iOS, and Android. Standalone parcel forwarding remains supported but is no longer the default surface. China retailers were removed in 2026-05-11; the platform is UK-origin only.

## Stack

- **API:** Node **22.x**, Express **5**, ES modules, deployed to Railway.
- **DB:** Postgres on Supabase. Realtime via Postgres logical replication. Schema is migration-driven (see below).
- **Auth:** Express mints `sc_token` (JWT, HS256, default 7d) for `/api/*`, plus a short-lived `supabase_token` for PostgREST/Realtime under RLS. Tab-focus silent refresh is wired on `/auth/me`.
- **Payments:** Stripe (cards) + M-Pesa **Lipana STK Push** (live). Manual M-Pesa SMS approval is retained as a fallback via `MPESA_PROVIDER`.
- **Email:** Gmail API via `googleapis` with OAuth2 refresh tokens.
- **Frontend:** React **19** + Vite under `client/`. Tailwind 3, react-router 7, Stripe Elements, zxing barcode scanning, recharts 3 (lazy-loaded).
- **PWA:** offline-first Web Outbox (IndexedDB) + Service Worker Background Sync for rider/operator flows.

## Local dev

```bash
nvm use                # Node 22 (see .nvmrc)
npm install
cp .env.example .env   # fill in JWT_SECRET, DATABASE_URL, GMAIL_*, STRIPE_*, MPESA_*, ADMIN_*
npm start              # API on :5000
cd client && npm install && npm run dev   # SPA on :5173
```

See [`SETUP.md`](./SETUP.md) for a fuller walkthrough including Supabase project bootstrap, Gmail OAuth, and Stripe / Lipana webhook configuration.

## Database migrations

All schema lives under `database/migrations/`. The bootstrap consults the `_migrations` ledger (`filename PRIMARY KEY`) and only applies files that haven't already run.

**Important (since 2026-05-11):** the boot-time migration runner is **opt-in** — set `RUN_MIGRATIONS_ON_BOOT=true` to enable it. By default the server starts without touching the schema. This prevents Railway redeploys from racing each other on DDL while we shift migrations into the Supabase Dashboard / CI as the canonical apply path.

```
database/
├── init.js                                          # pool, _migrations ledger, opt-in runner
├── seed.js
├── migrations/
│   ├── 0000_baseline_schema.sql                     # baseline: base tables + indexes
│   ├── 000_repair_phase4_tables.sql                 # idempotency repair for v2 tables
│   ├── 001_framework_v2_additions.sql               # consolidations, customs, last-mile, …
│   └── …                                            # 002+ … 052 — additive, idempotent
├── manual-migrations/                               # out-of-band SQL (apply via Supabase Editor)
└── scripts/purge_test_data.sql
```

Migration milestones worth knowing:
- `028` retires the legacy `wallet` table in favour of `user_credits` + `credit_ledger`. `/api/wallet` now returns **HTTP 410 Gone**; replacement is `/api/payments` + Credit Centre.
- `045` renames `users.password` → `users.password_hash` (matches the bcrypt content).
- `051` adds the six-knob pricing model (`pricing_settings`, `customs_tiers`, `hs_code_tiers`, `electronics_fees`).
- `052` drops `orders.market` (only one market remains).

### Provisioning a fresh Supabase project

1. Set `DATABASE_URL` to the new project's **direct connection** string (port 5432 — the transaction pooler on 6543 is read-only and blocks DDL).
2. Boot the server with `RUN_MIGRATIONS_ON_BOOT=true` (locally `RUN_MIGRATIONS_ON_BOOT=true npm start`, on Railway as a one-shot deploy env). `init.js` opens the pool, runs every `database/migrations/*.sql` against the empty DB in alphabetical order, then `ensureAdminUser()` seeds the bootstrap admin from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
3. Turn `RUN_MIGRATIONS_ON_BOOT` back off (or remove it) for steady-state deploys.

## Required env vars on Railway

| Var | Used by | Notes |
| --- | --- | --- |
| `JWT_SECRET` | Express auth | Long random string. |
| `JWT_EXPIRY` | Express auth | Default **`7d`** (was 30d before #149). Silent refresh on `/me` keeps live sessions warm. |
| `DATABASE_URL` | `database/init.js` | Supabase direct connection (port 5432). |
| `SUPABASE_JWT_SECRET` | `utils/supabaseJwt.js` | Matches Supabase → Project Settings → API → JWT Settings. |
| `SUPABASE_JWT_TTL_SECONDS` | Same | Optional, defaults to 3600. |
| `MPESA_PROVIDER` | Payments | `lipana` (default) for STK Push; legacy SMS path stays available as fallback. |
| `MPESA_CONSUMER_KEY` / `MPESA_CONSUMER_SECRET` / `MPESA_PASSKEY` / `MPESA_SHORTCODE` / `MPESA_BUSINESS_TYPE` | `utils/lipanaClient.js` | Daraja STK credentials. |
| `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` / `STRIPE_WEBHOOK_SECRET` | `utils/stripeClient.js`, `routes/payments.js` | API version pinned at `2024-11-20.acacia`. |
| `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `GMAIL_SENDER_EMAIL` | `utils/email.js` | OAuth2 for transactional mail. |
| `SUPPORT_EMAIL` | Tickets | Defaults to sender if unset. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run seed | Used to create the initial admin row at boot. **`ADMIN_PASSWORD` must be set or boot aborts.** |
| `CORS_ORIGIN` | Express | Comma-separated allowlist in production; `'*'` is rejected when `NODE_ENV !== development`. |
| `FRONTEND_URL` / `APP_URL` / `SITE_URL` | Email links, sitemap | Public URL of the SPA. |
| `RUN_MIGRATIONS_ON_BOOT` | `database/init.js` | Set `true` only when intentionally provisioning / re-running migrations. Off by default. |
| `TEST_DATABASE_URL` | CI integration tests | Distinct DB used by the integration job in `.github/workflows/test.yml`. |

FX (`utils/fxRefresh.js`) auto-refreshes daily from `frankfurter.dev`. Log retention (`utils/logRetention.js`) prunes `error_logs` / `admin_logs` / `email_logs` on a daily cron. Both are started in `server.js` and stopped on SIGTERM/SIGINT.

After changing any var on Railway, **redeploy the service** — Node reads `process.env` at call time but Railway only injects new env on container restart. The admin email diagnostic surfaces whether the running process actually sees the credentials.

## Routing overview

```
/api/auth                 — login, register, profile, password reset, /me, /supabase-token, logout (with revocation)
/api/orders               — customer parcel orders (no market param — UK only)
/api/buy-for-me           — concierge "Shop & ship" lifecycle: create, quote, pay, cancel, operator queue
/api/payments             — Stripe + Lipana M-Pesa STK Push, payment intents, public payment lookup
/api/payments/stripe/webhook    — raw-body Stripe webhook (idempotent via stripe_events_seen)
/api/payments/lipana/webhook    — raw-body Lipana webhook (idempotent via lipana_events_seen)
/api/admin                — provisioning, orders edit/cancel, payments approval, error logs, email diagnostics
/api/adminPayments        — admin payments management surface
/api/admin/aml-flags      — AML review queue
/api/notifications        — customer inbox (/notifications) + preference toggles
/api/tickets              — support tickets (customer scope + /admin/all for staff)
/api/consolidations       — Framework v2 operator + customer consolidation surface
/api/consolidation        — v1 (deprecated; 410-ish via Deprecation/Sunset headers until 2026-05-23)
/api/customs              — customs entries, declarations
/api/last-mile            — rider runs, run-stops, POD upload, OTP
/api/insurance            — declared-value insurance quote / issue / claim
/api/dsar                 — GDPR DSAR requests + admin queue
/api/referral             — referral codes and credit
/api/prohibited           — categories + DB-backed search + admin CRUD (UK→KE catalogue seeded by mig 030)
/api/pricing              — public quote engine (six-knob model; customs hidden — KRA charges separately)
/api/pricing-tiers        — public tiers/fees + admin promotions
/api/exchange             — current FX rates and conversion
/api/agent-invoices       — clearing-agent invoices + admin queue + signed upload URLs
/api/ops                  — operations console (barcode intake, label print, manifest)
/api/parcels              — operator parcel intake
/api/customer-consolidations — customer-facing consolidation view
/api/nps                  — NPS surveys + invitations
/api/kpi                  — KPI dashboard data
/api/app-config           — runtime client config
/api/warehouse            — warehouse address config
/api/retailers            — UK retailers catalogue (filters Buy-for-me picker)
/api/sitemap              — dynamic sitemap.xml + robots.txt
/api/backup               — admin DB backups
/api/events               — Server-Sent Events fanout for web realtime
/.well-known/apple-app-site-association   — Universal Links manifest for the iOS app
/health                   — liveness probe (used by Railway healthcheck)
```

Deprecation headers (RFC 8594) are emitted by `middleware/deprecation.js` on v1 consolidation routes.

## Testing & CI

Vitest + supertest cover the backend. See [`tests/README.md`](./tests/README.md) for the contract.

```bash
npm test                  # vitest unit + integration (integration self-skips without TEST_DATABASE_URL)
npm run test:coverage     # v8 coverage over middleware/, routes/, utils/
npm run test:db           # standalone DB connectivity smoke
```

Unit suites cover: `sanitize`, `stripeWebhook`, `lipanaWebhook`, `deprecation`, `fxRefresh`, `logRetention`, `outboxShouldQueue`, `pricing`. Integration suites (gated on `TEST_DATABASE_URL`): `appBoot`, `auth`, `roleMatrix`.

GitHub Actions (`.github/workflows/test.yml`) runs three jobs on every PR / push to `JS1` and `main`:

1. **unit** — `npm ci`, `npm test`, then a client build to catch lockfile drift.
2. **integration** — Postgres-backed auth + role-matrix suite. Self-skips on Dependabot PRs and when `TEST_DATABASE_URL` is missing.
3. **lighthouse** — builds the SPA and runs `lhci collect` against `client/dist`; asserts `categories:accessibility >= 0.9`.

CodeQL (`.github/workflows/codeql.yml`) runs SAST weekly + on PR with the `security-extended` query pack. SARIF is uploaded as a workflow artifact (the repo is private and not on GHAS).

Dependabot is configured (`.github/dependabot.yml`) for npm + actions with grouped patches. Known major-bump traps are blocked.

## Smoke tests

```bash
# Auth + supabase token
curl -s -X POST https://your-app.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq '{token, supabase_token}'

# Public pricing
curl -s https://your-app.up.railway.app/api/pricing-tiers/tiers
curl -s https://your-app.up.railway.app/api/pricing-tiers/fees

# Public prohibited categories (UK→KE)
curl -s https://your-app.up.railway.app/api/prohibited/categories

# AASA (Universal Links)
curl -i https://thapsus.uk/.well-known/apple-app-site-association
# Expect: 200 with Content-Type: application/json

# Server-Sent Events (web realtime)
curl -N -H "Authorization: Bearer <sc_token>" https://your-app.up.railway.app/api/events
```

## Mobile companion repo

[`thapsus-v1.1`](https://github.com/Bmwarari2/thapsus-v1.1) ships the Kotlin Multiplatform shared core + native iOS (SwiftUI) and Android (Jetpack Compose) apps. Both consume the public API surface above. Notable directories:

```
thapsus-v1.1/
├── shared/          # Kotlin (DTOs, repos, ViewModels, QuoteEngine, prohibited catalog)
├── iosApp/          # SwiftUI app (iOS 26 Liquid Glass)
├── androidApp/      # Jetpack Compose app
└── server-patches/  # SQL + setup notes that belong on this repo or in Supabase
```

If you change a public API contract here, sync the DTOs in `shared/src/commonMain/kotlin/com/thapsus/cargo/data/dto/`.

## Further reading

- [`SETUP.md`](./SETUP.md) — local dev + Supabase / Stripe / Gmail / Lipana wiring.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — auth, RLS, webhook idempotency, middleware ordering.
- [`API_REFERENCE.md`](./API_REFERENCE.md) — endpoint contracts (routes/*.js is authoritative).
- [`SECURITY.md`](./SECURITY.md) — disclosure policy and threat model.
- [`README_BACKEND.md`](./README_BACKEND.md) — backend feature notes.
- [`SETUP_CHECKLIST.md`](./SETUP_CHECKLIST.md) — go-live checklist.
