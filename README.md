# Thapsus Cargo — WhatsApp-first parcel forwarding

Customers in Kenya send a product link over WhatsApp; we buy it abroad,
ship it, and deliver it to their door. The whole customer journey happens
inside one WhatsApp conversation. This repo is the Express 5 API that
runs that conversation, plus the small React dashboard operators use to
work the pipeline behind it.

> **The system was rebuilt in August 2026.** It previously carried a
> customer portal, influencer programme, clearing-agent and rider
> portals, a finance module, consolidation and buy-for-me flows and
> Stripe. All of that is gone. See [`REBUILD.md`](./REBUILD.md) for what
> changed and why.

## Stack

- **API:** Node **22.x**, Express **5**, ES modules, deployed to Railway.
- **DB:** Postgres on Supabase, accessed through a raw `pg` pool. Schema is migration-driven.
- **Messaging:** [sent.dm](https://sent.dm) v3 for WhatsApp — inbound webhook + outbound text/template.
- **Assistant:** Gemini via Google AI Studio, scoped to onboarding and knowledge-base answers. Never touches money.
- **Payments:** M-Pesa. STK Push (Lipana) is coded but disabled — production runs manual Buy Goods till payments with admin approval.
- **Frontend:** React **19** + Vite under `client/`, Tailwind 3, react-router 7. Served by the same Express process.
- **Realtime:** Server-Sent Events to the operator dashboard.
- **PDF:** pdfkit for receipts; files land in a private Supabase Storage bucket.

## How it works

```
WhatsApp ──▶ POST /api/wa/webhook ──▶ persist + SSE ──▶ waStateMachine.handleInbound
                                                              │
      ┌───────────────────────────────────────────────────────┤
      │  1. human takeover?   → stay quiet, operator has it
      │  2. onboarding        → name, address, M-Pesa → TC-####
      │  3. TRK-#### in text  → live status reply
      │  4. "yes" to a quote  → confirm + open payment + till details
      │  5. "I have paid"     → verifying reply + staff alert
      │  6. anything else     → Gemini (knowledge base + their orders)
      └───────────────────────────────────────────────────────┘
```

Money and state run **before** the assistant is ever consulted, and stay
fully deterministic. The pipeline is `quoting → quoted → confirmed → paid
→ purchased → in_kenya → (delivery_fee_pending) → dispatched →
delivered`, with `cancelled` reachable from the early stages.

Customer codes (`TC-1042`) and tracking codes (`TRK-8821`) come from
Postgres sequences and are the customer's identity on parcels and in
conversation.

## Local dev

```bash
nvm use                # Node 22 (see .nvmrc)
npm install
cp .env.example .env   # fill in JWT_SECRET, DATABASE_URL, ADMIN_*, SENTDM_*, GEMINI_API_KEY
npm start              # API + built SPA on :5000

cd client && npm install && npm run dev   # SPA dev server on :5173
```

[`SETUP.md`](./SETUP.md) has the full walkthrough — Supabase bootstrap,
sent.dm webhook registration, Gmail OAuth for operator password reset.

## Environment

| Var | Used by | Notes |
| --- | --- | --- |
| `JWT_SECRET` | auth, receipt links | Long random string. Rotating it invalidates every session **and every outstanding receipt link**. |
| `DATABASE_URL` | `database/init.js` | Supabase **direct** connection, port 5432 (6543 is read-only and blocks DDL). |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first-run seed | Boot aborts if `ADMIN_PASSWORD` is unset. |
| `SENTDM_API_KEY` | `utils/sentdm.js` | `x-api-key` for the sent.dm v3 API. |
| `SENTDM_WEBHOOK_SECRET` | `routes/waWebhook.js` | `whsec_…`; Svix-style HMAC verification. |
| `SENTDM_BASE_URL` | `utils/sentdm.js` | Optional, defaults to `https://api.sent.dm`. |
| `GEMINI_API_KEY` | `utils/waAi.js` | Google AI Studio key. Without it the assistant is off and messages queue in the inbox. |
| `GEMINI_MODEL` | `utils/waAi.js` | Optional pin. **Leave unset** — the model is discovered from ListModels, because Google retires names on a rolling basis. |
| `MPESA_PROVIDER` | payments | `manual` in production. `lipana` re-enables STK Push. |
| `MPESA_TILL_NUMBER` | payments | Buy Goods till quoted to customers. |
| `LIPANA_API_KEY` / `LIPANA_BASE_URL` / `LIPANA_WEBHOOK_SECRET` | `utils/lipanaClient.js` | Only needed when `MPESA_PROVIDER=lipana`. |
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | `utils/supabaseAdmin.js` | Storage signing for receipts and inbox media. |
| `SUPABASE_JWT_SECRET` | `utils/supabaseJwt.js` | Matches Supabase → Settings → API → JWT Settings. |
| `SITE_URL` (or `APP_URL` / `FRONTEND_URL`) | receipt links, sitemap | **Apex domain only** — a `www.` host is not served and is stripped automatically. |
| `GMAIL_*` | `utils/email.js` | Operator password-reset mail. |
| `CORS_ORIGIN` | Express | Comma-separated allowlist in production; `'*'` is rejected outside development. |
| `RUN_MIGRATIONS_ON_BOOT` | `database/init.js` | Off by default. Set `true` only when intentionally provisioning. |
| `TEST_DATABASE_URL` | CI | Integration suites self-skip without it. |

FX (`utils/fxRefresh.js`) refreshes `USD_KES` daily from frankfurter.dev —
quoting reads it directly. Log retention prunes `error_logs` /
`admin_logs` / `email_logs` daily. Both start in `server.js` and stop on
SIGTERM/SIGINT.

Railway only injects new env on container restart, so **redeploy after
changing a variable**.

## Database

Schema lives in `database/migrations/`, applied through the `_migrations`
ledger. The boot-time runner is opt-in (`RUN_MIGRATIONS_ON_BOOT=true`) so
concurrent Railway deploys can't race on DDL.

```
0000_baseline.sql                      # base tables + indexes
0000a_baseline_reference_data.sql      # seed reference rows
0001_drop_plaintext_tokens.sql
0002_influencer_referrals.sql          # retired feature, tables left in place
0003_influencer_accounts_and_analytics.sql
0004_wa_core.sql                       # WhatsApp core — see below
0005_wa_human_takeover_and_memory.sql  # takeover + AI memory columns
```

`0004` adds `wa_contacts`, `wa_messages`, `wa_orders`, `wa_order_events`
and `wa_settings`, the two code sequences, and extends `payments` so a
payment can belong to a WhatsApp contact instead of a user. It is
additive only. Every table has RLS enabled and forced; the API is the
only writer.

```bash
npm run migrate            # apply pending migrations
npm run migrate:check      # what would run
npm run check:drift        # code SQL vs live schema
npm run schema:snapshot    # refresh database/schema-snapshot.json after a migration
```

**Retired tables are never dropped or renamed.** Dropping them breaks the
drift tooling for no operational gain, and legacy orders still read them.

## Routing overview

```
POST /api/wa/webhook              — inbound WhatsApp (raw body, HMAC-verified, mounted pre-json)
     /api/wa/conversations…       — operator inbox: threads, messages, send, read, per-chat AI toggle
     /api/wa/orders…              — pipeline: list/search, quote, confirm, request payment, mark paid,
                                    advance, waive fee, receipt, scan resolver
     /api/wa/settings             — markup, promo, fees, welcome media, template map, AI, staff alerts,
                                    webhook doctor (admin)
     /api/admin/payments          — manual M-Pesa approval queue (admin)
     /api/auth                    — operator login, /me, password reset, logout, supabase-token
     /api/tracking/:code          — public tracking (wa_orders first, legacy orders as fallback)
     /api/events                  — SSE fanout to the dashboard
     /api/exchange, /api/app-config
GET  /r/:token                    — short receipt link → signed PDF redirect
     /sitemap.xml, /robots.txt, /health

     /api/orders, /api/parcels, /api/ops, /api/admin   — legacy drain, operator-only
POST /api/orders                  — 410 Gone: new orders come through WhatsApp
POST /api/auth/register           — 410 Gone: no customer accounts
```

[`API_REFERENCE.md`](./API_REFERENCE.md) has the full list; `routes/*.js`
is authoritative.

## Operator dashboard

| Route | Who | What |
| --- | --- | --- |
| `/ops/inbox` | operator | Unified WhatsApp inbox, live over SSE |
| `/ops/pipeline` | operator | Five-column board, global code search, barcode scanner |
| `/ops/orders/:id` | operator | Quote, payment, status, fee, receipt, printable label |
| `/ops/payments` | admin | Manual M-Pesa approval queue |
| `/ops/settings` | admin | Markup, promo, AI knowledge base, templates, webhook doctor |
| `/ops` | operator | Legacy warehouse console — drains pre-WhatsApp parcels |
| `/admin` | admin | User management + error logs |

## Testing & CI

```bash
npm test                  # vitest; integration suites self-skip without TEST_DATABASE_URL
npm run test:coverage
npm run check:drift -- --snapshot
npm run build             # client build + article prerender
npm run smoke             # deployed smoke checks
```

Unit suites: `waStateMachine`, `waAiClassify`, `waOrderFlow`, `waCodes`,
`sentdm`, `receiptPdf`, `receiptLink`, `markPaymentPaidRecovery`,
`lipanaWebhook`, `pricing`, `fxRefresh`, `logRetention`, `sanitize`,
`idempotency`, `outboxShouldQueue`, `schemaDrift`. Integration (gated on
`TEST_DATABASE_URL`): `appBoot`, `auth`, `roleMatrix`.

GitHub Actions runs unit, integration and Lighthouse on every PR. CodeQL
runs `security-extended` weekly and on PR.

## Further reading

- [`REBUILD.md`](./REBUILD.md) — what changed in the rebuild and why.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — auth, RLS, webhooks, middleware ordering, the WhatsApp layer.
- [`API_REFERENCE.md`](./API_REFERENCE.md) — endpoint contracts.
- [`CUTOVER.md`](./CUTOVER.md) — deploy runbook and go-live checks.
- [`SETUP.md`](./SETUP.md) — local dev and third-party wiring.
- [`SECURITY.md`](./SECURITY.md) — disclosure policy and threat model.
