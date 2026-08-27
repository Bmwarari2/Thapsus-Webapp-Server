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
- **Assistant:** Gemini via Google AI Studio, scoped to onboarding and knowledge-base answers. Opens with what we do and what we charge, then collects name and address while the customer waits on a quote. Never touches money.
- **Payments:** M-Pesa. STK Push (Lipana) is coded but disabled — production runs manual Buy Goods till payments with admin approval.
- **Frontend:** React **19** + Vite under `client/`, Tailwind 3, react-router 7. Served by the same Express process.
- **Realtime:** Server-Sent Events to the operator dashboard.
- **PDF:** pdfkit for receipts; files land in a private Supabase Storage bucket.

## How it works

```
WhatsApp ──▶ POST /api/wa/webhook ──▶ persist + SSE ──▶ waStateMachine.handleInbound
                                                              │
      ┌───────────────────────────────────────────────────────┤
      │  0. empty message?    → leave it in the inbox, answer nothing
      │  1. human takeover?   → stay quiet, operator has it
      │  1b. a product link?  → page staff: only a person can quote it
      │  1c. SHEIN, no cart?  → ask for the cart, with the how-to
      │  2. onboarding        → rates first, then name + address → TC-####
      │  3. TRK-#### in text  → live status reply
      │  4. "yes" to a quote  → confirm + open payment + till details
      │  5. "I have paid"     → verifying reply + staff alert
      │  6. anything else     → Gemini (knowledge base + their orders)
      └───────────────────────────────────────────────────────┘
```

Money and state run **before** the assistant is ever consulted, and stay
fully deterministic. The pipeline is `quoting → quoted → confirmed → paid
→ purchased → in_kenya → dispatched → delivered`, with `collected` as the
terminal state for a customer picking up at the CBD office, `cancelled`
reachable from the early stages, and `delivery_fee_pending` reached only
by orders quoted before the last-mile fee moved into the quote.

The last-mile fee is charged **with the order**, not on arrival:
`wa_settings.default_delivery_fee_kes` (KSh 300 out of the box) for
delivery or a Pickup Mtaani point, nothing for collection. Which
Mtaani agent a parcel goes to is the team's decision — the assistant is
forbidden from naming or confirming one.

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
| `RUN_MIGRATIONS_ON_BOOT` | `database/init.js` | **`true` in production.** Deploys land automatically on merge; migrations have to land with them. |
| `TEST_DATABASE_URL` | CI | Integration suites self-skip without it. |
| `WA_SWEEP_INTERVAL_MINUTES` | `utils/waSweeper.js` | Sweeper cadence, default 5. |
| `WA_SLA_PAYMENT_MINUTES` / `WA_SLA_UNANSWERED_MINUTES` | `utils/waSweeper.js` | Minutes before the one-shot staff reminder fires, default 15 each. |

FX (`utils/fxRefresh.js`) refreshes `USD_KES` daily from frankfurter.dev.
That is a **mid-market** rate, so quoting does not use it raw:
`wa_settings.fx_buffer_pct` (default 2.5) lifts it to the rate a quote is
priced at, covering the KES→GBP spread the business actually pays. The
buffer is deliberately separate from the service margin — the margin gets
promoted and waived, this is cost recovery and must not be. Log retention prunes `error_logs` /
`admin_logs` / `email_logs` daily. The sweeper (`utils/waSweeper.js`,
every 5 minutes) is the safety net for anything that fires once and can
be missed — it retries failed sends, re-fires lost post-payment hooks,
sends the revenue nudges (`utils/waNudges.js`, kill switch in
/ops/settings), and pages staff for payments awaiting review, unanswered
messages, and stalled or expired orders. **Every staff reminder fires
once per condition** — 15 minutes in for payments and conversations —
and each has a mute: bell-off buttons in the inbox ("No reply needed")
and the payments queue write the same claim stamp the sweeper checks. A
recurring condition (a new customer message, a new payment row) re-arms
its reminder naturally; see ARCHITECTURE.md §11. All of these start in
`server.js` and stop on SIGTERM/SIGINT.

Railway only injects new env on container restart, so **redeploy after
changing a variable**.

## Database

Schema lives in `database/migrations/`, applied through the `_migrations`
ledger. **The boot-time runner is on in production**
(`RUN_MIGRATIONS_ON_BOOT=true`): merging deploys the code automatically,
so the schema it needs has to arrive with it. It was opt-in until
2026-08-20, when a merge shipped an INSERT naming a column whose
migration nobody had run and order creation 500'd for fourteen minutes.

Each migration runs in its own transaction against the ledger, so a
second boot applies nothing. When the runner is off, boot now names what
is pending instead of only saying it is disabled.

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
     /api/wa/settings             — markup, FX buffer, promo, fees, welcome media, template map, AI,
                                    staff alerts, webhook doctor (admin)
     /api/admin/payments          — manual M-Pesa approval queue (admin)
     /api/auth                    — operator login, /me, password reset, logout, supabase-token
     /api/tracking/:code          — public tracking (wa_orders first, legacy orders as fallback)
     /api/events                  — SSE fanout to the dashboard
     /api/exchange, /api/app-config
GET  /r/:token                    — short receipt link → signed PDF redirect
GET  /m/:token                    — short media link → signed attachment redirect
     /sitemap.xml, /robots.txt, /health

     /api/orders, /api/parcels, /api/admin             — legacy drain, operator-only
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
| `/ops/settings` | admin | Markup, FX buffer, promo, AI knowledge base, templates, webhook doctor |
| `/ops/team` | admin | Staff accounts + recent server errors |

Adding a teammate sends **no email**. You set a temporary password (or
leave it blank for a generated one); it is shown once, next to their
email, to hand over in person. Only the hash is stored, so a password
dismissed uncopied means resetting the account instead.

## Testing & CI

```bash
npm test                  # vitest; integration suites self-skip without TEST_DATABASE_URL
npm run test:coverage
npm run test:e2e          # playwright over the ops screens; needs a built client
npm run check:drift -- --snapshot
npm run build             # client build + article prerender
npm run smoke             # deployed smoke checks
```

Unit suites: `waStateMachine`, `waAiClassify`, `waOrderFlow`, `waCodes`,
`waQuote`, `waDeliveryFeeSettle`, `waTemplateVars`, `waText`, `sentdm`,
`sentdmMedia`, `receiptPdf`, `receiptLink`, `mediaLink`,
`markPaymentPaidRecovery`, `lipanaWebhook`, `pricing`, `fxRefresh`,
`logRetention`, `sanitize`, `idempotency`, `sseEvents`,
`outboxShouldQueue`, `schemaDrift`. Integration (gated on
`TEST_DATABASE_URL`): `appBoot`, `auth`, `roleMatrix`, `waCreate`,
`adminCreateUser`.

GitHub Actions (`.github/workflows/ci.yml`) runs unit + client build,
Postgres-backed integration (which also gates migrations and schema
drift), Playwright e2e over the operator screens, and a Lighthouse a11y
assertion — on every PR. `security.yml` runs CodeQL weekly.

> Both workflows sat **disabled** from May to August 2026, so everything
> merged in between landed without CI. They were re-registered under new
> filenames (GitHub keys the disabled state to the path). Don't rename
> them back.

## Further reading

- [`CLAUDE.md`](./CLAUDE.md) — start here if you are about to change something: the commands, the schema-change drill, and the rules that have already cost money once.
- [`REBUILD.md`](./REBUILD.md) — what changed in the rebuild and why.
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — auth, RLS, webhooks, middleware ordering, the WhatsApp layer.
- [`API_REFERENCE.md`](./API_REFERENCE.md) — endpoint contracts.
- [`CUTOVER.md`](./CUTOVER.md) — deploy runbook and go-live checks.
- [`SETUP.md`](./SETUP.md) — local dev and third-party wiring.
- [`SECURITY.md`](./SECURITY.md) — disclosure policy and threat model.
- [`database/MIGRATIONS.md`](./database/MIGRATIONS.md) — the migration ledger and the drift guardrails.
