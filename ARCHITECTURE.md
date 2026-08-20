# Architecture

How the backend, the WhatsApp layer and the operator dashboard fit
together. Written for a developer who has read `README.md` and wants the
why-behind-the-what — the conversation dispatcher, the AI boundary, auth,
RLS, webhook idempotency, and the non-obvious invariants the code
depends on.

For what the system used to be and why it changed, see
[`REBUILD.md`](./REBUILD.md). For run/deploy instructions see
[`SETUP.md`](./SETUP.md) and [`CUTOVER.md`](./CUTOVER.md).

---

## 1. Top-level shape

```
   ┌──────────────┐                        ┌──────────────────┐
   │  Customer    │                        │  Operator/Admin  │
   │  (WhatsApp)  │                        │  (browser)       │
   └──────┬───────┘                        └────────┬─────────┘
          │                                         │ HTTP + JWT
          ▼                                         ▼
   ┌───────────┐   webhook    ┌──────────────────────────────────────┐
   │  sent.dm  │─────────────▶│  Express 5 (server.js, routes/*)     │
   │  (WhatsApp│◀─────────────│   • the only write path              │
   │   BSP)    │   send API   │   • auth, roles, rate limits, sanitize│
   └───────────┘              │   • serves the built SPA             │
                              └──┬────────────┬───────────┬──────────┘
                                 │            │           │
                                 ▼            ▼           ▼
                        ┌────────────┐ ┌───────────┐ ┌──────────────┐
                        │  Postgres  │ │ Supabase  │ │  Gemini /    │
                        │ (Supabase) │ │  Storage  │ │  Lipana /    │
                        │ RLS forced │ │ (private) │ │  Frankfurter │
                        └────────────┘ └───────────┘ └──────────────┘
                                 │
                                 │ SSE (/api/events)
                                 ▼
                        operator dashboard, live
```

One server, one database, two human surfaces: a WhatsApp thread for the
customer and a React dashboard for staff. There is no customer web
account and no mobile app consuming this API.

---

## 2. The WhatsApp layer

Six modules, each with one job. If you are changing conversation
behaviour, it is almost certainly in the second one.

| Module | Responsibility |
| --- | --- |
| `utils/sentdm.js` | The only place that knows the provider. Send text/template, fetch delivery activities, verify webhook signatures, manage the registration. |
| `utils/waStateMachine.js` | Decides what happens on an inbound message. |
| `utils/waSend.js` | The single outbound path — persists to `wa_messages`, bumps the conversation head, broadcasts SSE. Bot, templates and operators all go through it, so the transcript is complete. |
| `utils/waOrderFlow.js` | `transition()` — validates the edge, stamps the timestamp, writes the audit row, sends the customer alert, broadcasts. |
| `utils/waAi.js` | Gemini. Onboarding turns and knowledge-base answers. Nothing else. |
| `utils/waPayments.js` | Get-or-create the `awaiting_review` payment row, attach M-Pesa references. |

### Inbound path

```
POST /api/wa/webhook  (raw body, mounted before express.json)
  → verify Svix-style HMAC: x-webhook-id, x-webhook-timestamp, x-webhook-signature
  → dedupe on wa_messages.provider_message_id
  → persist inbound row, bump unread, SSE to dashboards
  → 200 ACK
  → handleInbound() runs after the ACK
```

The ACK comes before the bot reply on purpose: a slow Gemini call must
never make the provider think delivery failed and retry.

### Dispatch order

`handleInbound()` runs these in order and returns at the first match.
Money and state resolve **before** the assistant is consulted, so no
model output can move an order or quote a price:

1. **Human takeover** — if `human_takeover_at` is set and the chat hasn't
   been quiet for `ai_resume_after_minutes`, the assistant stays silent.
   Runs first so it covers onboarding too.
2. **Onboarding** — contact isn't `active` yet.
3. **Tracking auto-reply** — a `TRK-####` anywhere in the text.
4. **Quote confirmation** — a yes-like reply *and exactly one* order in
   `quoted`. Zero or several is ambiguous and goes to a human.
5. **Payment claim** — "I've paid" or a pasted M-Pesa SMS.
6. **AI fall-through** — everything else.

Conversation state lives entirely on `wa_contacts.state`
(`new → awaiting_name → awaiting_address → awaiting_mpesa → active`,
plus `blocked`). No in-memory sessions, so a restart never loses a
customer mid-signup.

### The AI boundary

The assistant is deliberately fenced. It may read the knowledge base and
a rendered summary of that customer's own orders; it may state a status,
tracking code, date or agreed total from that summary. It may not quote a
price, confirm anything, promise a date, or claim an action was taken —
those paths ran before it.

It has three possible outcomes, tagged rather than stringly-typed so a
control token can't reach a customer:

| Outcome | Meaning | Effect |
| --- | --- | --- |
| `reply` | It answered | Send the text |
| `HANDOFF` | A person is needed | Acknowledge, set takeover, page staff |
| `OFF_TOPIC` | Nothing to do with us | Say what we do handle (max once/hour), no alert, no takeover |

`classifyReply()` in `utils/waAi.js` is the boundary. An empty generation
classifies as `handoff`, so every failure mode degrades to the pre-AI
behaviour: a human picks it up.

**The model is discovered, not hardcoded.** `resolveModel()` calls
ListModels, ranks candidates, caches for 6 hours and self-heals on a 404.
Google retires model names on a rolling basis; a hardcoded default took
the assistant down in production once already.

### Outbound copy constraints

sent.dm delivers free text through a system template, and WhatsApp
forbids newlines, tabs and 4+ space runs inside template variables. A
multi-line body is rejected with `VALIDATION_008` and retried flattened
(`\n\n` → ` — `, `\n` → ` · `). After the first rejection the client
flattens up front instead of paying a wasted round-trip every time.

**Consequence: all customer copy must read correctly as one line.** The
tracking reply is a plain sentence or two for exactly this reason — an
earlier version used a labelled block with a progress bar, and flattening
turned it into a run-on smear. Approved templates are exempt: their body
text can contain newlines, only the *variables* can't.

---

## 3. Data model

WhatsApp tables (migration `0004`, extended by `0005`):

```
wa_contacts ──1:N──▶ wa_messages
     │
     └────1:N──────▶ wa_orders ──1:N──▶ wa_order_events
                          │
                          └──1:N──▶ payments (target_kind='wa_order')
wa_settings   key/value, operator-editable
```

- `wa_contacts.customer_code` — `TC-####` from `wa_customer_code_seq`, minted when onboarding completes.
- `wa_orders.tracking_code` — `TRK-####` from `wa_tracking_code_seq`, minted **inside the payment transaction**, so the code exists the instant money lands.
- `wa_messages.provider_message_id` — unique; the inbound dedupe key and the handle delivery-status callbacks update.
- `wa_orders` snapshots `usd_price`, `fx_rate`, `markup_pct` and `quote_kes` at quote time. Never recompute a historical quote from today's rate.

`payments` was extended rather than duplicated: `user_id` is nullable,
`wa_contact_id` was added, `target_kind` accepts `'wa_order'`, and a
CHECK enforces that a payment has exactly one owner kind. That means the
WhatsApp flow reuses `utils/markPaymentPaid.js` unchanged.

### Pipeline

```
quoting ─▶ quoted ─▶ confirmed ─▶ paid ─▶ purchased ─▶ in_kenya ─┬─▶ dispatched ─▶ delivered
   │          │          │                                       │
   └──────────┴──────────┴─▶ cancelled          delivery_fee_pending ─┘
```

Edges are declared in `EDGES` in `utils/waOrderFlow.js` and enforced —
`advance` refuses anything not on the list, and `paid` can't be forced by
an operator at all because money moves through the payments machinery.
Board columns collapse this to five: Quoting `{quoting, quoted,
confirmed}`, Paid, Purchased, In Kenya `{in_kenya,
delivery_fee_pending}`, Delivered `{dispatched, delivered}`.

The **promo toggle** decides the `in_kenya` branch: `promo_active` +
`promo_type=waive_fee` waives the last-mile fee and goes straight to
dispatchable; otherwise the order lands in `delivery_fee_pending`.

---

## 4. Payments

M-Pesa STK Push is coded (`utils/lipanaClient.js`, webhook, `pending`
payment rows) but **off** — Lipana withdrew service for regulatory
reasons, so `MPESA_PROVIDER=manual` in production and `stkAvailable()`
gates the UI.

The manual path holds one invariant: **the moment a customer owes money,
an `awaiting_review` payment row exists.** Three code paths can create
it — WhatsApp quote confirmation, the operator's "send till
instructions", and "payment received" — and all three go through
`ensureManualPayment()`, so none of them can produce a duplicate.

Approval runs through `markPaymentPaid()`, the same function the Lipana
and (formerly) Stripe webhooks call. It opens its own transaction,
flips the payment, flips the target row and mints the tracking code
atomically, then fires post-commit side effects (tracking code message,
receipt generation, receipt link). Never duplicate that logic; change it
in one place.

---

## 5. Receipts

Rendered with pdfkit — pure JS, no headless browser, Railway-safe — to a
private Supabase Storage bucket at `receipts/<orderId>/<paymentId>.pdf`
with upsert.

Delivery is a **short link**, not the signed URL. A Supabase signed URL
is ~600 characters of JWT, which arrives on WhatsApp as a wall of text
and expires after 7 days. Instead:

```
https://thapsus.uk/r/TRK-8821.<12-char HMAC>
        └─ GET /r/:token → verify → sign a fresh 10-minute URL → 302
```

The token is stateless: tracking code plus a truncated HMAC over the
order id, keyed on `JWT_SECRET`. No column, no migration, no cleanup, and
the link never goes stale because it re-signs per click. Rotating
`JWT_SECRET` invalidates every outstanding link — that is the intended
revocation mechanism.

`/r` is mounted **above** the SPA fallback and behind the public tracking
rate limiter. `tests/integration/appBoot.test.js` pins that ordering.

---

## 6. Authentication

Only staff have accounts. Customer self-registration is 410-stubbed.

### Token model

- **`sc_token`** — HS256 JWT, `Authorization: Bearer`. Payload
  `{ id, email, role, warehouse_id, iat }`, expiry `JWT_EXPIRY` (default
  `7d`). Silent refresh on `GET /auth/me` attaches `refreshed_token` when
  the current one is near expiry; the SPA also refreshes on tab focus.
- **`supabase_token`** — minted on demand by
  `POST /api/auth/supabase-token` for direct PostgREST access under RLS.
  Nothing in this repo's web client uses it; it is kept for out-of-band
  tooling.

### Defence-in-depth chain

Four layers on every authenticated request (`middleware/auth.js`,
`checkAuthStatus()` — one round trip):

1. **Signature**, with algorithms pinned to `['HS256']` to block
   algorithm-confusion.
2. **Revocation** — `revoked_tokens` holds SHA-256 hashes from
   `POST /api/auth/logout`. Plaintext is never stored.
3. **`password_changed_at`** — any JWT whose `iat` predates it is
   rejected, which is what makes a password reset actually invalidate
   outstanding sessions.
4. **`is_active`** — a live lookup, so deactivating a user takes effect
   on the next request.

### Roles

`requireRole(...allowed)`; admins always pass. Live roles are `operator`
and `admin`. `customer`, `clearing_agent`, `rider` and `influencer` rows
still exist in the database from the old system but have no surface to
log into. `tests/integration/roleMatrix.test.js` exercises the matrix.

Money approval is admin-only — `routes/adminPayments.js` and
`POST /api/wa/orders/:id/mark-paid`. Everything else in the pipeline is
operator-level.

---

## 7. RLS posture

All public tables have RLS enabled, and the `wa_*` tables have it
**forced**. The model is backend-mediated writes, defence-in-depth reads:

- Express holds the service-role key and is the only writer, so RLS is a
  second line rather than the first gate.
- Read policies are mostly `self_or_staff`, with staff-detection helpers
  (`is_admin`, `is_operator`, `is_thapsus_staff`) as Postgres functions
  with locked-down `search_path`.
- Some tables carry explicit `qual = false` deny policies
  (`password_reset_tokens`, `revoked_tokens`, `lipana_events_seen`, …) —
  never readable from any client role.

When in doubt read `pg_policies` directly.

---

## 8. Webhook idempotency

Two webhooks mount before `express.json()` so signatures verify against
the raw body:

- `POST /api/wa/webhook` — sent.dm, Svix-style HMAC over
  `${id}.${timestamp}.${rawBody}`. Idempotent via the unique
  `wa_messages.provider_message_id`, which is also what makes a replay
  harmless — so the staleness bound is 24h, not the Svix-conventional
  300s. sent.dm reuses the original signature on every retry, so a tight
  window rejects any event their queue holds.
- `POST /api/payments/lipana/webhook` — HMAC over the raw body,
  idempotent via `lipana_events_seen (event_id PK)`.

Both short-circuit on replay so retries land twice but run side effects
once. Webhooks bypass every rate limiter — the signature is the defence,
and dropping a legitimate retry is worse than the cost surface.

---

## 9. Body-parsing and middleware order

`server.js`, in order, with the why:

1. `helmet` — CSP, HSTS (1y, `includeSubDomains`, `preload`).
2. `cors` — explicit allowlist; boot throws on `CORS_ORIGIN='*'` outside development.
3. **Request-ID** — from a validated `X-Request-Id` or a fresh UUIDv4. Echoed back, threaded into morgan and `error_logs.meta.request_id`.
4. `compression`
5. `morgan`
6. **Raw-body webhook routes** (`express.raw({ limit: '1mb' })`) — must precede the JSON parser.
7. `express.json` / `express.urlencoded`, capped at **200kb**. Real binary uploads bypass Express entirely: clients PUT to Supabase Storage via signed URLs minted by `/api/*/upload-url`.
8. `sanitizeBody` / `sanitizeQuery` — XSS scrub with bounded recursion (16) and key count (256) so a hostile payload can't pin the event loop. Express 5's lazy `req.query` getter is replaced via `Object.defineProperty`; plain assignment is a no-op.
9. **Rate limiters** — 10/15min auth and payments, 30/15min signed-URL mints, 60/15min public tracking and `/r`, 200/15min global.
10. Routes.
11. SPA fallback `app.get(/^\/(?!api).*/, …)`.
12. JSON 404 + error logger.

---

## 10. Realtime

`GET /api/events` (SSE) fans out to the dashboard. Chosen over WebSocket
because HTTP/2 multiplexing is free and `EventSource` auto-reconnects.

Event types: `wa_inbox_update` (new message either direction),
`wa_pipeline_update` (order status moved), `wa_new_customer` (onboarding
completed). Handlers update the row, return 200, then emit — the emit is
best-effort and never blocks or fails a mutation.

---

## 11. Things that look weird but are intentional

- **Retired tables were never dropped.** Renaming or dropping breaks the drift checker for no gain, and legacy orders still read them. A later `0006_legacy_readonly.sql` may revoke writes; actual DROPs stay owner-triggered.
- **`routes/orders.js` and `parcels.js` are still mounted.** Two pre-WhatsApp orders are still open, and public tracking falls back to them. `POST /api/orders` is 410-stubbed so no *new* legacy orders can be created while the read surface stays alive. `routes/ops.js` went with the console it served.
- **`utils/lipanaClient.js` and the STK code paths are dead but present.** `MPESA_PROVIDER` flips them back on if a provider becomes available. Deleting them would mean rewriting the integration from scratch.
- **The migration auto-runner is on in production.** It was opt-in, to keep concurrent deploys from racing on DDL — but Railway runs one instance and deploys are automatic on merge, so the real risk was the other one: code arriving ahead of its column. That happened on 2026-08-20 and took order creation down. Each migration still runs in its own transaction against the `_migrations` ledger, so a re-boot applies nothing.
- **The drift checker can't parse `FOR UPDATE OF <alias>`.** Queries use plain single-table `FOR UPDATE` and a separate fetch instead. It isn't a style preference.
- **Free-text sends are flattened.** See §2 — this is a WhatsApp template-variable rule, not a formatting choice, and it is why copy avoids multi-line layout.
- **`inbound_number` is the *sender*** in sent.dm's webhook payload, and `outbound_number` is our own line. The names read backwards. The sender is resolved authoritatively via `GET /v3/messages/{id}` with the payload as fallback.
- **The receipt is A5.** Every one is opened on a phone; A4 left a third of the page empty.
- **`apple-app-site-association`** is served by an explicit handler above the SPA wildcard because Apple's validator is strict about content type and redirects. Keep it above the fallback if you touch routing.

---

## 12. Tests

```bash
npm test                      # vitest; integration self-skips without TEST_DATABASE_URL
npm run check:drift -- --snapshot
npm run build
```

The WhatsApp layer's behaviour lives in `tests/unit/waStateMachine.test.js`
(61 cases) — onboarding edges and validation gates, tracking-code
formats, confirmation ambiguity, payment-claim matching and its
deliberate non-matches, takeover and auto-resume, both AI sentinels, and
that the reply survives flattening. `waAiClassify` covers the sentinel
boundary, `waOrderFlow` the transition edges, `sentdm` signature
verification, `receiptPdf` and `receiptLink` the customer artefacts.

CI (`.github/workflows/ci.yml`) runs four jobs on every PR: unit +
client build, a Postgres-backed integration job that also gates
migrations and schema drift, a Playwright e2e pass over the operator
screens, and a Lighthouse accessibility assertion. `security.yml` runs
CodeQL `security-extended` weekly.

Both workflows were **disabled manually in May 2026** and only came back
on 2026-08-12. GitHub keys that state to the workflow's file path, which
is why they were renamed from `test.yml` / `codeql.yml` — a new path
registers a new, enabled workflow. Renaming them back would switch CI
off again.

---

## 13. Where to look next

- [`REBUILD.md`](./REBUILD.md) — what changed in the rebuild and why.
- [`API_REFERENCE.md`](./API_REFERENCE.md) — endpoint contracts (`routes/*.js` is authoritative).
- [`CUTOVER.md`](./CUTOVER.md) — deploy runbook.
- [`SECURITY.md`](./SECURITY.md) — disclosure policy + threat model.
- `database/MIGRATIONS.md` — how to add a migration safely.
- `sentdm-templates.json` — the 13 WhatsApp templates, ready to upload.

---

*Last updated 2026-08-12 (WhatsApp-first rebuild).*
