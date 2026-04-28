# Thapsus Cargo — webapp + API (`Swiftcargo-main`)

UK ↔ China → Kenya consolidation logistics, backed by an Express API on Railway and Postgres on Supabase. The companion iOS app lives in [`thapsus-mobile`](https://github.com/Bmwarari2/thapsus-mobile) (private).

## Stack

- **API:** Node 20+, Express 4, ES modules, deployed to Railway.
- **DB:** Postgres on Supabase. Realtime via Postgres logical replication. Schema is migration-driven (see below).
- **Auth:** Express mints `sc_token` (JWT) for `/api/*`, plus a short-lived `supabase_token` for PostgREST/Realtime under RLS.
- **Email:** Gmail API via `googleapis` with OAuth2 refresh tokens.
- **Frontend:** React 18 + Vite under `client/`.

## Local dev

```bash
npm install
cp .env.example .env   # fill in JWT_SECRET, SUPABASE_JWT_SECRET, GMAIL_*, etc.
npm run start          # API on :5000
cd client && npm install && npm run dev   # SPA on :5173
```

## Database migrations

All schema lives under `database/`:

```
database/
├── schema.sql                                    # initial v1 tables
└── migrations/
    ├── 000_repair_phase4_tables.sql              # idempotency repair (run only if 001 fails)
    └── 001_framework_v2_additions.sql            # spec §5 — consolidations, customs, last-mile, etc.
```

The iOS repo carries follow-on migrations that should be applied after 001 in this order:

```
thapsus-mobile/server-patches/database/migrations/
├── 002_packages_v2_alignment.sql                 # status taxonomy + v2 parcel columns
└── 003_realtime_publication.sql                  # publishes packages + consolidations to supabase_realtime
```

### Migration order

Run, in order, in Supabase Dashboard → SQL Editor → New query → Run:

1. `database/schema.sql` (skip if a Supabase project already has it).
2. `database/migrations/001_framework_v2_additions.sql`.
3. `thapsus-mobile/server-patches/database/migrations/002_packages_v2_alignment.sql`.
4. `thapsus-mobile/server-patches/database/migrations/003_realtime_publication.sql`.

Every migration is idempotent — re-running is safe.

### If migration 001 throws `ERROR: 42703: column "<X>" does not exist`

This happens when an earlier attempt left one of the v2 tables (e.g. `last_mile_runs`, `consolidations`, `dsar_requests`) half-built. `CREATE TABLE IF NOT EXISTS` is a no-op once the table exists, so the follow-on `CREATE INDEX … ON <table>(<column>)` references a column that was never created.

The fix: run **`database/migrations/000_repair_phase4_tables.sql`** first, then re-run 001. The repair script issues `ALTER TABLE … ADD COLUMN IF NOT EXISTS` for every column on every table 001 creates, bringing the schema up to spec without dropping data. Foreign-key constraints are intentionally omitted from the repair so existing rows that don't satisfy them don't block the upgrade — 001's `CREATE TABLE` still installs FKs on a fresh instance.

## Required env vars on Railway

| Var | Used by | Notes |
| --- | --- | --- |
| `JWT_SECRET` | Express auth | Long random string. |
| `JWT_EXPIRY` | Express auth | Default `30d`. |
| `SUPABASE_JWT_SECRET` | `utils/supabaseJwt.js` | Matches Supabase → Project Settings → API → JWT Settings. |
| `SUPABASE_JWT_TTL_SECONDS` | Same | Optional, defaults to 3600. |
| `GMAIL_CLIENT_ID` | `utils/email.js` | OAuth2 client ID. |
| `GMAIL_CLIENT_SECRET` | Same | OAuth2 client secret. |
| `GMAIL_REFRESH_TOKEN` | Same | Refresh token from a one-time consent flow. |
| `GMAIL_SENDER_EMAIL` | Same | Mailbox the OAuth client is authorised to send as. |
| `SUPPORT_EMAIL` | Tickets | Defaults to sender if unset. |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First-run seed | Used to create the initial admin row at boot. |
| `CORS_ORIGIN` | Express | Comma-separated allowlist in production; `*` is rejected. |
| `FRONTEND_URL` / `APP_URL` | Email links | Public URL of the SPA. |

After changing any var on Railway, **redeploy the service** — Node reads `process.env` at call time but Railway only injects new env on container restart. The iOS Admin Console's email diagnostic exposes whether the running process actually sees the credentials.

## Routing overview

```
/api/auth                — login, register, profile, password reset, supabase-token
/api/orders              — customer orders + lookups
/api/admin               — provisioning, orders edit/cancel, payments approval, error logs, email diagnostics
/api/wallet, /api/payment, /api/exchange    — wallet + payment flows
/api/notifications       — customer inbox
/api/tickets             — support tickets (customer scope + /admin/all for admins)
/api/buy-for-me          — concierge orders (create, pay, cancel, operator queue)
/api/insurance           — declared-value insurance quote / issue / claim
/api/consolidations      — operator consolidation suite + /current public banner + /customer/:id summary
/api/customs, /api/last-mile, /api/dsar, /api/referral
/api/prohibited          — categories + DB-backed search + admin CRUD
/api/pricing-tiers       — public tiers/fees + admin promotions
/api/agent-invoices      — clearing-agent invoices + admin queue
/api/admin/aml-flags     — AML review queue
/.well-known/apple-app-site-association  — Universal Links manifest for the iOS app
```

## Smoke tests

```bash
# Auth + supabase token
curl -s -X POST https://your-app.up.railway.app/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq .supabase_token

# Public pricing
curl -s https://your-app.up.railway.app/api/pricing-tiers/tiers
curl -s https://your-app.up.railway.app/api/pricing-tiers/fees

# Public prohibited categories
curl -s https://your-app.up.railway.app/api/prohibited/categories

# AASA (Universal Links)
curl -i https://thapsus.uk/.well-known/apple-app-site-association
# Expect: 200 with Content-Type: application/json
```

## iOS companion repo

`thapsus-mobile` is the Kotlin Multiplatform shared module + SwiftUI app. It consumes every endpoint listed above. Notable directories:

```
thapsus-mobile/
├── shared/          # Kotlin (DTOs, repos, ViewModels, QuoteEngine)
├── iosApp/          # SwiftUI app
└── server-patches/  # SQL + setup notes that belong on this repo or in Supabase
```

If you change a public API contract here, sync the iOS DTOs in `shared/src/commonMain/kotlin/com/thapsus/cargo/data/dto/`.
