# Thapsus Cargo Backend — Setup Guide

Local-dev walkthrough for the Express 5 API + React 19 SPA. For the why-behind-the-what (auth, RLS, webhook idempotency) read [`ARCHITECTURE.md`](./ARCHITECTURE.md) afterward.

## Prerequisites

- **Node 22.x** — pinned via `.nvmrc`. `nvm use` from the repo root.
- **A Supabase project.** Free tier is fine. You'll need the direct connection string (port 5432, not the 6543 pooler) and the JWT secret.
- **Gmail OAuth2 refresh token** — operator password-reset email only. No customer mail is sent any more; customers exist only as WhatsApp contacts, and new staff accounts get a temporary password rather than an invitation. Optional for local dev. One-time consent flow — see the Gmail section.
- **sent.dm account** with an API key and a WhatsApp sender.
- **M-Pesa Daraja sandbox credentials** (consumer key/secret, passkey, shortcode) for Lipana STK Push. Optional: production runs `MPESA_PROVIDER=manual` and never calls them.
- **A Gemini API key** (Google AI Studio) if you want the assistant to answer. Without one, inbound messages queue in the operator inbox.

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

The schema is migration-driven. The boot-time runner is **on in production** (since 2026-08-20) — deploys are automatic on merge, so migrations have to travel with the code that needs them. Locally it is off unless you set `RUN_MIGRATIONS_ON_BOOT=true`.

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

Create two **private** buckets:

| Bucket | Holds | Served as |
| --- | --- | --- |
| `receipts` | `<orderId>/<paymentId>.pdf` | `GET /r/:token` |
| `wa-media` | inbox attachments, both directions | `GET /m/:token` |

Both links are stateless: the token is the storage path plus a truncated
HMAC keyed on `JWT_SECRET`, and the route re-signs a short-lived Supabase
URL on every click. Nothing is stored, so nothing expires. Neither
bucket is publicly readable — don't make them public to "fix" a broken
link, check the token instead.

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SITE_URL=https://thapsus.uk      # apex only — receipt and media links are built from it
```

Storage is not reachable from SQL. Deleting a customer's objects is a
separate Storage API call; a `DELETE` against `storage.objects` is
refused by Supabase and rolls the surrounding transaction back.

## 6. Gmail OAuth2

The `googleapis` client is wired in `utils/email.js`. You need a Google Cloud OAuth client (Desktop or Web), then a one-time consent to obtain a refresh token.

```
GMAIL_CLIENT_ID=...
GMAIL_CLIENT_SECRET=...
GMAIL_REFRESH_TOKEN=...
GMAIL_SENDER_EMAIL=ops@thapsus.uk
```

This is used for one thing: operator password resets. Creating a staff
account from `/ops/team` deliberately sends nothing — the temporary
password is shown once on screen and handed over out of band.

Leave them unset locally and password-reset mail is simply skipped; nothing else in the app sends email.

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
- `tests/unit/waStateMachine.test.js` — the conversation dispatcher, 113 cases: onboarding edges, empty messages, tracking formats for delivery and collection, confirmation ambiguity, payment claims, SHEIN cart requests, takeover and resume, both AI sentinels, and the facts block that tells the assistant whether a link ever arrived
- `tests/unit/waAiClassify.test.js` / `waOrderFlow.test.js` / `waCodes.test.js` — AI sentinel boundary, the quote-in-flight guard (a reply must not promise a quote nobody is preparing), pipeline edges, code minting
- `tests/unit/waQuote.test.js` / `waDeliveryFeeSettle.test.js` — quote and delivery-fee arithmetic, including the FX buffer and its 2dp rounding (both files exist because `Number(null) === 0` silently produced a zero markup and a zero fee)
- `tests/unit/orderStages.test.js` — which advance buttons the order screen offers, and that collection orders keep the shared early stages
- `tests/unit/waTemplateVars.test.js` — template bodies against their positional variable orderings
- `tests/unit/waText.test.js` — the WhatsApp markup renderer used by the inbox
- `tests/unit/sentdm.test.js` / `sentdmMedia.test.js` / `lipanaWebhook.test.js` — webhook signature verification and inbound media extraction
- `tests/unit/receiptPdf.test.js` / `receiptLink.test.js` / `mediaLink.test.js` — receipt rendering, and the two short-link token schemes
- `tests/unit/sanitize.test.js` / `idempotency.test.js` — XSS scrub middleware, `Idempotency-Key` replay
- `tests/unit/schemaDrift.test.js` / `sseEvents.test.js` — drift checker, SSE fan-out
- `tests/unit/fxRefresh.test.js` / `logRetention.test.js` — daily-cron helpers
- `tests/unit/markPaymentPaidRecovery.test.js` — the shared settlement path, including the `wa_order` branch
- `tests/unit/pricing.test.js` / `outboxShouldQueue.test.js` — legacy quote engine and web-outbox eligibility

Integration suites (require a separate `TEST_DATABASE_URL`):
- `tests/integration/appBoot.test.js` — supertest smoke through the middleware chain (404, request-id, body-size guard, sanitize), and pins `/r/` and `/m/` above the SPA fallback
- `tests/integration/auth.test.js` — login / `/me` refresh / logout / token revocation
- `tests/integration/adminCreateUser.test.js` — staff-account creation, and that the new account can actually sign in (it could not, once: `email_verified_at` was left NULL)
- `tests/integration/waCreate.test.js` — order creation end to end
- `tests/integration/roleMatrix.test.js` — table-driven role-gate matrix

Integration tests self-skip via `describe.skipIf(!process.env.TEST_DATABASE_URL)`. `tests/setup.js` installs safe placeholders for fail-fast env vars (`JWT_SECRET`, `DATABASE_URL`, etc.) so route modules can be imported without throwing.

Browser end-to-end (`tests/e2e/ops.spec.js`, Playwright against a built SPA):

```bash
npm run build && npm run test:e2e
```

## 9. Production deploy (Railway)

- `railway.toml` declares the nixpacks build (`buildCommand` installs both root + client deps and runs `vite build`), `startCommand = node server.js`, healthcheck `/health` (30s timeout), restart on failure, persistent volume mount at `/data`.
- The whole `.env` must be mirrored into Railway Variables. **Redeploy the service after any change** — env is injected at container start.
- `RUN_MIGRATIONS_ON_BOOT=true` is set permanently: each deploy applies anything missing from the `_migrations` ledger, in its own transaction, before serving. A migration that fails stops the boot rather than serving against a schema the code cannot use.
- The Lighthouse a11y gate (≥0.9) in CI prevents regressions on the public marketing pages.
- Don't rename `ci.yml` or `security.yml`. GitHub keys a workflow's enabled/disabled state to its file path; both were disabled by hand in May 2026 and only came back on 2026-08-12 by being renamed. Renaming them back would switch CI off again.

## 10. Project structure

```
Thapsus-Webapp-Server/
├── server.js                # Express bootstrap: CORS, helmet, request-id, raw-body webhooks, rate limits, routes
├── polyfills/webcrypto.js   # populates globalThis.crypto before uuid/Supabase load
├── client/                  # React 19 + Vite SPA (own package.json, own build)
│   └── src/
│       ├── api/             # axios client + typed endpoint modules
│       ├── pages/           # public site + ops/ dashboard (6 screens)
│       ├── components/      # shared UI, printable label, barcode scanner
│       └── hooks/           # SSE subscriptions
├── database/
│   ├── init.js              # pg.Pool, _migrations ledger, opt-in runner
│   ├── migrations/          # 0000 baseline … 0018 (0004 is the WhatsApp core)
│   └── schema-snapshot.json # drift-checker baseline
├── middleware/
│   ├── auth.js              # HS256-pinned verify, revocation, password-changed-at, is_active
│   ├── sanitize.js          # xss-lib scrub, MAX_DEPTH=16, MAX_KEYS=256
│   └── idempotency.js       # Idempotency-Key replay
├── routes/                  # 17 modules — wa* are the live surface, plus /r and /m redirects;
│                            #  orders/parcels/tracking drain legacy work
├── utils/                   # wa* (sentdm, state machine, AI, send, order flow, payments, quote,
│                            #  codes, settings, template vars, staff alerts), receiptPdf,
│                            #  receiptLink, mediaLink, markPaymentPaid, fx, email
├── scripts/                 # migrate, check-schema-drift, gen-templates, register-sentdm-webhook,
│                            #  seed-dev, smoke, prerender
├── tests/                   # vitest + supertest (unit/, integration/) and playwright (e2e/)
├── sentdm-templates.json    # the 11 WhatsApp templates — GENERATED, edit utils/waTemplateVars.js
├── .github/workflows/       # ci.yml (unit, integration+migrations+drift, e2e, lighthouse), security.yml
├── railway.toml
└── .env.example
```

## Features (current)

### Customer — WhatsApp only
- The first reply leads with what we do and what we charge, then invites a product link — it does not open with a questionnaire
- Name and delivery address are collected while the customer is already waiting on a quote; both present mints a permanent Customer Code (`TC-####`). No M-Pesa number is asked for
- Send a product link, get a KES quote (USD→KES at the mid rate plus the FX buffer, × per-order markup, last-mile fee included for delivery orders)
- A SHEIN product link is answered with a request for the cart link — a product link often won't open on our side and never shows the size or colour picked
- Confirm with "yes", pay the Buy Goods till, get a Tracking Code (`TRK-####`) and a PDF receipt
- Text the tracking code any time for a live status reply, worded for delivery or collection
- Gemini assistant for general questions, fenced away from money and prices

### Operator dashboard
- Unified WhatsApp inbox, live over SSE, with a per-chat AI toggle, media attachments both directions, and WhatsApp markup rendered rather than shown as asterisks
- Five-column pipeline board, global `TC-`/`TRK-` search, camera + wedge barcode scanning
- Quote entry with live KES preview and per-order markup — the preview names the FX buffer and the day's mid rate so a cost is not discounted away as margin; delivery method and Pickup Mtaani point; status advance with automatic customer alerts
- Collection orders skip dispatch and delivery — their only action is "Mark as collected"
- Manual M-Pesa approval queue (admin)
- Promo toggle to waive last-mile delivery fees, globally or per order
- Staff accounts created with a temporary password shown once; no invitation email
- 100 × 150 mm thermal parcel labels with Code128 barcodes

### Payments
- Manual M-Pesa Buy Goods with admin approval (`MPESA_PROVIDER=manual`)
- Lipana STK Push implemented behind the same flag, with HMAC webhook + `lipana_events_seen` idempotency
- Shared settlement path (`utils/markPaymentPaid.js`) for every payment route

### Security
- Helmet + strict CSP; HSTS 1y `includeSubDomains` `preload`
- CORS fails closed in production (`'*'` rejected unless `NODE_ENV=development`)
- 200 KB global body limit; uploads bypass Express via Supabase Storage signed URLs
- Tiered rate limiting (auth 10/15m, signed-URL mints 30/15m, tracking and the `/r` + `/m` redirects 60/15m, global 200/15m); webhooks bypass
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

### A customer never got the arrival / dispatch / receipt message
Almost certainly the 24-hour window. Free text is refused outside it, and
those three land two to three weeks after the customer last wrote in, so
their window is always shut. Check `/ops/settings` → template map has a
name for the slot, and that the name still exists in the sent.dm console
— a missing template errors as `132001`. All eleven slots ship mapped by
default; a stored map merges over the defaults per key, so a partially
filled map no longer blanks the rest.

### An inbox attachment shows a broken image
The `wa-media` bucket is private by design and served through `/m/`.
Check the link is a `/m/<token>` URL and that `SITE_URL` is the apex
host — not that the bucket needs making public. For inbound media,
sent.dm does not put the file on the hydrated message, so
`extractInboundMedia()` reads the raw webhook envelope; if a new payload
shape appears, both the message and the envelope are logged.

### The assistant stops replying
Read the Railway logs for a Gemini `404 … model is no longer available`. `GEMINI_MODEL` should be unset so discovery picks a live model; if it is pinned to a retired name, clear it. `/ops/settings` runs a self-test that surfaces this.

### CORS errors in production
Check `CORS_ORIGIN` is a comma-separated allowlist of origins (e.g. `https://thapsus.uk,https://www.thapsus.uk`). `'*'` is rejected outside development.

### `process.env.GMAIL_*` looks empty
Railway only injects env on container restart. Redeploy after editing variables.

### Port already in use
Override `PORT` in `.env`.

### Tests fail with `JWT_SECRET is required`
`tests/setup.js` installs safe placeholders, but only via vitest. If you import a route file from a one-off script, set the env yourself.

## License

MIT — Thapsus Cargo team.
