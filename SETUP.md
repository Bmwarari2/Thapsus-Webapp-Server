# Thapsus Cargo Backend — Setup Guide

Local-dev walkthrough for the Express 5 API + React 19 SPA. For the why-behind-the-what (auth, RLS, webhook idempotency) read [`ARCHITECTURE.md`](./ARCHITECTURE.md) afterward.

## Prerequisites

- **Node 22.x** — pinned via `.nvmrc`. `nvm use` from the repo root.
- **A Supabase project.** Free tier is fine. You'll need the direct connection string (port 5432, not the 6543 pooler) and the JWT secret.
- **Gmail OAuth2 refresh token** for transactional email (registration confirmations, ticket replies, receipts, DSAR exports). One-time consent flow — see Gmail section.
- **sent.dm account** with an API key and a WhatsApp sender.
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

For a working WhatsApp flow you also need the sent.dm, M-Pesa and Supabase Storage vars in the next sections.

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

## 4. sent.dm (WhatsApp)

WhatsApp is the customer surface, so this is the integration to get right.

```
SENTDM_API_KEY=<from the sent.dm console>
SENTDM_WEBHOOK_SECRET=whsec_...
# SENTDM_BASE_URL=https://api.sent.dm   # optional override
```

Register the inbound webhook against your deployment:

```bash
node scripts/register-sentdm-webhook.mjs --url https://<your-host>/api/wa/webhook
node scripts/register-sentdm-webhook.mjs --list        # what is registered now
node scripts/register-sentdm-webhook.mjs --events      # recent delivery attempts
node scripts/register-sentdm-webhook.mjs --activate    # re-arm a disabled endpoint
node scripts/register-sentdm-webhook.mjs --rotate      # new signing secret
```

Use the **apex** host. A `www.` endpoint is not served and the webhook
will sit in `RETRYING` with a null status code — this cost us an
afternoon once already. `/ops/settings` has an in-app webhook doctor
that shows the live registration and recent events, and can re-point it.

The route is mounted with `express.raw()` **before** `express.json()` so
the Svix-style signature verifies against the unmodified body. Don't
reorder that in `server.js`. Idempotency comes from the unique
`wa_messages.provider_message_id`.

Two provider behaviours worth reading `utils/sentdm.js` for before you
debug anything: free text rides a system template so newlines are
rejected and flattened, and `inbound_number` is the *sender* while
`outbound_number` is our own line.

## 5. Payments — M-Pesa

Production runs manual Buy Goods payments. Lipana withdrew STK Push for
regulatory reasons.

```
MPESA_PROVIDER=manual
MPESA_TILL_NUMBER=5530500
```

The customer pays the till, replies on WhatsApp, and an admin approves
from `/ops/payments` or the order screen. Approval mints the tracking
code and sends the receipt.

STK Push is still implemented and returns if a provider becomes
available:

```
MPESA_PROVIDER=lipana
LIPANA_API_KEY=...
LIPANA_BASE_URL=...
LIPANA_WEBHOOK_SECRET=...
```

Its webhook is `/api/payments/lipana/webhook` — HMAC-SHA256 over the raw
body, idempotent via `lipana_events_seen`. The shared "money received"
side effect lives in `utils/markPaymentPaid.js` and is called from the
webhook **and** the admin approval routes. Never duplicate it.

## 5a. Gemini assistant (optional)

```
GEMINI_API_KEY=<Google AI Studio key>
# GEMINI_MODEL=...   # leave unset — see below
```

Leave `GEMINI_MODEL` unset. The model is discovered from the ListModels
API and cached for 6 hours, because Google retires model names on a
rolling basis and a hardcoded default silently takes the assistant down.

Turn the assistant on and paste the knowledge base at `/ops/settings`.
Without a key, or with the toggle off, inbound messages simply queue in
the operator inbox.

## 5b. Supabase Storage

Create a **private** bucket named `receipts`. PDF receipts are written to
`receipts/<orderId>/<paymentId>.pdf`; the customer gets a short
`/r/<token>` link that re-signs on each click.

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SITE_URL=https://thapsus.uk      # apex only — receipt links are built from it
```

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

The SPA calls the API on `http://localhost:5000` (configured in `client/src/api/`). Log in with the bootstrap admin — there is no customer-facing sign-up.

## 8. Tests

```bash
npm test                       # vitest run
npm run test:watch
npm run test:coverage          # v8 coverage over middleware/, routes/, utils/
npm run test:db                # standalone DB connectivity smoke
```

Unit suites (no DB required):
- `tests/unit/sanitize.test.js` — XSS scrub middleware
- `tests/unit/waStateMachine.test.js` — the conversation dispatcher, 61 cases
- `tests/unit/waAiClassify.test.js` / `waOrderFlow.test.js` / `waCodes.test.js` — AI sentinel boundary, pipeline edges, code minting
- `tests/unit/sentdm.test.js` / `lipanaWebhook.test.js` — webhook signature verification
- `tests/unit/receiptPdf.test.js` / `receiptLink.test.js` — receipt rendering and short links
- `tests/unit/deprecation.test.js` — RFC 8594 header emission
- `tests/unit/fxRefresh.test.js` / `logRetention.test.js` — daily-cron helpers
- `tests/unit/outboxShouldQueue.test.js` — web-outbox eligibility
- `tests/unit/pricing.test.js` — six-knob quote engine

Integration suites (require a separate `TEST_DATABASE_URL`):
- `tests/integration/appBoot.test.js` — supertest smoke through the middleware chain (404, request-id, body-size guard, sanitize)
- `tests/integration/auth.test.js` — register / login / `/me` refresh / logout / token revocation
- `tests/integration/roleMatrix.test.js` — table-driven 5×5 role-gate matrix

Integration tests self-skip via `describe.skipIf(!process.env.TEST_DATABASE_URL)`. `tests/setup.js` installs safe placeholders for fail-fast env vars (`JWT_SECRET`, `DATABASE_URL`, etc.) so route modules can be imported without throwing.

## 9. Production deploy (Railway)

- `railway.toml` declares the nixpacks build (`buildCommand` installs both root + client deps and runs `vite build`), `startCommand = node server.js`, healthcheck `/health` (30s timeout), restart on failure, persistent volume mount at `/data`.
- The whole `.env` must be mirrored into Railway Variables. **Redeploy the service after any change** — env is injected at container start.
- Toggle `RUN_MIGRATIONS_ON_BOOT=true` on a one-shot deploy when you intend to push schema, then turn it off again.
- The Lighthouse a11y gate (≥0.9) in CI prevents regressions on the public marketing pages.

## 10. Project structure

```
Thapsus-Webapp-Server/
├── server.js                # Express bootstrap: CORS, helmet, request-id, raw-body webhooks, rate limits, routes
├── polyfills/webcrypto.js   # populates globalThis.crypto before uuid/Supabase load
├── client/                  # React 19 + Vite SPA (own package.json, own build)
│   └── src/
│       ├── api/             # axios client + typed endpoint modules
│       ├── pages/           # public site + ops/ dashboard (5 screens)
│       ├── components/      # shared UI, printable label, barcode scanner
│       └── hooks/           # SSE subscriptions
├── database/
│   ├── init.js              # pg.Pool, _migrations ledger, opt-in runner
│   ├── migrations/          # 0000 baseline … 0005 WhatsApp takeover + memory
│   └── schema-snapshot.json # drift-checker baseline
├── middleware/
│   ├── auth.js              # HS256-pinned verify, revocation, password-changed-at, is_active
│   ├── sanitize.js          # xss-lib scrub, MAX_DEPTH=16, MAX_KEYS=256
│   └── idempotency.js       # Idempotency-Key replay
├── routes/                  # 17 modules — wa* are the live surface, the rest drain legacy work
├── utils/                   # wa* (sentdm, state machine, AI, send, order flow, payments, codes,
│                            #  settings, staff alerts), receiptPdf, receiptLink, markPaymentPaid, fx, email
├── scripts/                 # migrate, check-schema-drift, register-sentdm-webhook, smoke, prerender
├── tests/                   # vitest + supertest (unit/ and integration/)
├── sentdm-templates.json    # the 13 WhatsApp templates, ready to upload
├── .github/workflows/       # test.yml (unit + integration + lighthouse), codeql.yml
├── railway.toml
└── .env.example
```

## Features (current)

### Customer — WhatsApp only
- Conversational onboarding to a permanent Customer Code (`TC-####`)
- Send a product link, get a KES quote (live USD→KES × configurable markup)
- Confirm with "yes", pay the Buy Goods till, get a Tracking Code (`TRK-####`) and a PDF receipt
- Text the tracking code any time for a live status reply
- Gemini assistant for general questions, fenced away from money and prices

### Operator dashboard
- Unified WhatsApp inbox, live over SSE, with a per-chat AI toggle
- Five-column pipeline board, global `TC-`/`TRK-` search, camera + wedge barcode scanning
- Quote entry with live KES preview; status advance with automatic customer alerts
- Manual M-Pesa approval queue (admin)
- Promo toggle to waive last-mile delivery fees, globally or per order
- 100 × 150 mm thermal parcel labels with Code128 barcodes

### Payments
- Manual M-Pesa Buy Goods with admin approval (`MPESA_PROVIDER=manual`)
- Lipana STK Push implemented behind the same flag, with HMAC webhook + `lipana_events_seen` idempotency
- Shared settlement path (`utils/markPaymentPaid.js`) for every payment route

### Security
- Helmet + strict CSP; HSTS 1y `includeSubDomains` `preload`
- CORS fails closed in production (`'*'` rejected unless `NODE_ENV=development`)
- 200 KB global body limit; uploads bypass Express via Supabase Storage signed URLs
- Tiered rate limiting (auth 10/15m, signed-URL mints 30/15m, tracking and `/r` 60/15m, global 200/15m); webhooks bypass
- XSS sanitiser with bounded recursion + key count
- Pinned JWT algorithm `HS256`; revocation by SHA-256 hash; password reset bumps `password_changed_at`
- RLS enabled on every public table, forced on the `wa_*` tables
- CodeQL SAST weekly; Dependabot grouped patches

## Test credentials

There is no baked-in sample dataset, and there are no customer accounts — customers exist only as WhatsApp contacts. The first admin row is created from `ADMIN_EMAIL` / `ADMIN_PASSWORD` at boot; add further operators from the admin dashboard.

## Troubleshooting

### `ECONNREFUSED` / can't reach DB
Verify `DATABASE_URL` uses the **direct** Supabase connection (port 5432). The 6543 pooler is read-only and rejects DDL — useful for read traffic but not for `npm start` with migrations enabled.

### Webhook signature verification fails
Almost always one of: `SENTDM_WEBHOOK_SECRET` mismatched against the sent.dm console (rotate with `scripts/register-sentdm-webhook.mjs --rotate` and re-paste), or someone reordered `express.json()` ahead of the raw-body webhook routes in `server.js`. The raw mount must come **first**.

### Inbound WhatsApp messages never arrive
Check `/ops/settings` → webhook doctor. A registration stuck in `RETRYING` with a null status code almost always means the endpoint points at a host that isn't served — `www.` instead of the apex, most often. Repair it from that screen or with `scripts/register-sentdm-webhook.mjs --url https://<apex>/api/wa/webhook`.

### The assistant stops replying
Read the Railway logs for a Gemini `404 … model is no longer available`. `GEMINI_MODEL` should be unset so discovery picks a live model; if it is pinned to a retired name, clear it. `/ops/settings` runs a self-test that surfaces this.

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
