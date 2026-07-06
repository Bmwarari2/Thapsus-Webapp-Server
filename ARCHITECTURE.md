# Architecture

This document describes how Thapsus Cargo's backend, web client, and the
native iOS + Android apps fit together. It is written for a developer
joining the project who has read `README.md` and wants the why-behind-the-what
— auth flow, RLS model, Realtime subscriptions, webhook idempotency, and the
few non-obvious invariants the code depends on.

For run/deploy instructions see `SETUP.md` and `README_BACKEND.md`.

---

## 1. Top-level shape

```
                 ┌───────────────────────┐
                 │   Customer / Admin /  │
                 │   Operator / Rider /  │
                 │   Clearing-agent      │
                 └─────────┬─────────────┘
                           │ HTTP/JWT
                           ▼
   ┌──────────────────────────────────────────────────┐
   │  Express 5 backend (server.js, routes/*)         │
   │   • auth, role gates, rate limiting, sanitize    │
   │   • all writes go through here                   │
   │   • Stripe + Lipana webhooks                     │
   └──────┬─────────────────────┬──────────────┬──────┘
          │                     │              │
          ▼                     ▼              ▼
   ┌──────────────┐      ┌──────────────┐  ┌─────────────┐
   │  Postgres    │      │  Supabase    │  │  Stripe /   │
   │  (Supabase)  │      │  Storage     │  │  Lipana /   │
   │  RLS on all  │      │  private     │  │  Gmail /    │
   │  public.*    │      │  buckets     │  │  Frankfurter│
   └──────┬───────┘      └──────────────┘  └─────────────┘
          │ PostgREST + Realtime
          ▼
   ┌─────────────────────────────────────────┐
   │  Mobile clients (thapsus-v1.1)          │
   │   • iOS SwiftUI (Liquid Glass)          │
   │   • Android Jetpack Compose             │
   │   • shared KMP core (DTOs, repos, VMs)  │
   │   reads via PostgREST + Realtime        │
   └─────────────────────────────────────────┘
```

Two client surfaces (web + mobile), one Express server, one database. The
Express app is the **only** write path — mobile reads via Supabase
PostgREST + Realtime for low-latency state updates, but every mutation
routes through Express so business logic and auditing stay in one place.

---

## 2. Authentication

### Token model

Two tokens are issued per session:

- **`sc_token`** — HS256-signed JWT, used as `Authorization: Bearer <…>`
  on every Express call. Payload is `{ id, email, role, warehouse_id, iat }`.
  Expiry: `JWT_EXPIRY` env var, default **`7d`** (was 30d before PR #149).
  Silent refresh is wired on `GET /auth/me` — the server attaches a
  `refreshed_token` to that response whenever the current token is near
  expiry, and both web and iOS replace their cached token in place. The
  web client additionally refreshes on tab focus, not just on mount.
- **`supabase_token`** — Supabase JWT minted on demand by
  `POST /api/auth/supabase-token`. Used by the iOS + Android apps for
  direct PostgREST + Realtime calls under RLS.

The web client only carries `sc_token`. It hits Express, which holds the
service-role key for any direct DB work.

### Graceful 401 UX

When the server rejects a token (expired, revoked, password changed,
user deactivated) it returns 401 with a typed `code`. Clients catch this
in a single axios / Ktor interceptor and:
- Web (PR #157): toast + react-router redirect to `/login?next=<path>`.
- iOS (PR #29): banner on `SignInView`; `AuthSession` state transitions
  out of `.authenticated`.
- Android (PR #87 series): equivalent transition through `AuthEventFlags`.

### Defense-in-depth chain

Every authenticated request runs four layers in `middleware/auth.js`:

1. **JWT signature.** `jsonwebtoken.verify(token, secret, { algorithms: ['HS256'] })`.
   Algorithms are pinned to `['HS256']` to block algorithm-confusion
   attacks (older `jsonwebtoken` honoured `none`; pinning makes that
   impossible).
2. **Revocation.** `revoked_tokens` table holds SHA-256 hashes of any
   token revoked via `POST /api/auth/logout`. Plaintext is never stored.
3. **Password-changed-at invariant.** `users.password_changed_at` is
   bumped on `POST /reset-password`. Any JWT whose `iat` predates that
   timestamp is rejected. This is what makes password reset actually
   invalidate every outstanding token for the affected user. The column
   was added in migration 037; the bcrypt-content column was renamed
   `users.password` → `users.password_hash` in migration 045.
4. **`is_active`.** Admin can deactivate a user; the live DB lookup
   means JWTs minted before deactivation stop working immediately.

All four checks ride on a single round-trip query against `users` +
`revoked_tokens`. See `checkAuthStatus()` in `middleware/auth.js`.

### Role gates

`requireRole(...allowed)` in the same file. Roles: `customer`,
`operator`, `clearing_agent`, `rider`, `influencer`, `admin`. Admins always pass.
Convenience exports: `isAdmin`, `isOperator`, `isAgent`, `isRider`.
The role matrix is exercised by `tests/integration/roleMatrix.test.js`.

`influencer` (migration 0003) is a marketing-partner login confined to the
`/influencer` dashboard: the SPA's `ProtectedRoute` redirects influencers off
any route that doesn't explicitly allow their role, and the nav + customer
widgets are hidden for them.

---

## 3. RLS posture

All public tables have RLS enabled. The architecture is
**backend-mediated writes, defense-in-depth reads:**

- The Express tier holds the Supabase service-role key. All writes go
  through it, so RLS is a defense-in-depth layer, not the first gate.
- Read policies are mostly `self_or_staff` — a user can read rows they
  own or staff can read everything. Staff-detection helpers
  (`is_admin`, `is_operator`, `is_thapsus_staff`, …) live as Postgres
  functions with locked-down `search_path` (post-migration 040/041).
- A handful of tables have explicit deny policies (`pod_otps`,
  `last_mile_run_parcels`, `password_reset_tokens`, `revoked_tokens`,
  `stripe_events_seen`, `lipana_events_seen`) with `qual = false` —
  never readable from any client role, only the service-role key.
- `customer_consolidations`'s SELECT policy looks suspicious at first
  (role `{public}`) but the `qual` is `auth.uid()::text = user_id`,
  which evaluates to `false` for anon — effectively authenticated-only.

When in doubt, read `pg_policies` directly. See the Supabase advisor
cleanup migrations 040, 041, and 046 for prior remediation patterns.
The F-14 through F-18 advisor batch (migrations 046–049) ran in 2026-05-09.

---

## 4. Realtime + write fanout

### Mobile (iOS + Android)

Both mobile apps subscribe to Supabase Realtime channels for:

- `packages` — parcel status timeline updates
- `consolidations` / `customer_consolidations` — invoice state
- `notifications` — inbox

Subscriptions are scoped per-user via the Supabase JWT's `sub` claim;
RLS gates what each connection can observe. The KMP layer
(`shared/.../RealtimeSync.kt` in `thapsus-v1.1`) consolidates these
into a single coroutine flow that SwiftUI views observe via
`StateFlowObserver` and Compose collects via `collectAsState`.

### Web

The web client uses `GET /api/events` (Server-Sent Events) for the same
fanout signal — different transport, same intent. SSE was chosen over
WebSocket because the browser uses HTTP/2 multiplexing for free, and
the EventSource API auto-reconnects on transport hiccups.

The two transports converge on the same backend mutation surface:
**every mutation that should fan out re-publishes via both Realtime
and SSE.** The mutation handler updates the row, returns 200, and
fires a small in-memory `EventEmitter` that drives the SSE channel
while Postgres `LISTEN/NOTIFY` (or Realtime's own WAL stream) drives
the mobile one.

---

## 5. Webhook idempotency

Two payment webhooks are mounted before `express.json()` so Stripe and
Lipana signatures can be verified against the raw body:

- `POST /api/payments/stripe/webhook` — verifies via
  `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
- `POST /api/payments/lipana/webhook` — verifies HMAC-SHA256 against
  `X-Lipana-Signature`. Lipana went live in PR #123 (2026-05-07);
  `transaction.timeout` events were added in #124 and tolerant parsing
  for field-name drift in #125.

Both insert into a `*_events_seen` table on receipt and short-circuit
on conflict, so retries / replays land on the same DB row twice but
only run side-effects once:

- `stripe_events_seen (event_id PK, event_type, …)`
- `lipana_events_seen (event_id PK, event_type, …)`

The "money received" side-effect is shared: `utils/markPaymentPaid.js`
is called from both webhooks **and** the admin M-Pesa manual approval
route. Same code path = same downstream behaviour (parcel status flip,
credit ledger debit, receipt email) regardless of payment method.
Never duplicate that logic; if it needs to change, change it in one place.

### Wallet → credits migration

The legacy `wallet` table was retired in migration 028. It has been
replaced by `user_credits` (balance per user) + `credit_ledger` (every
debit/credit, with provenance). The `/api/wallet` route now returns
**HTTP 410 Gone**; replacement is `/api/payments` plus the Credit
Centre UI (web `/credit`, iOS `CreditCenterView`, Android `CreditCenterScreen`).
A series of follow-up migrations (039, 043) finalised the table drop
and cleaned advisor flags.

---

## 6. Body-parsing and rate-limit ordering

The middleware stack in `server.js` (with the why):

1. `helmet` — CSP, HSTS (1y, `includeSubDomains`, `preload`). CSP
   whitelists Stripe (`js.stripe.com`, `m.stripe.network`, `api.stripe.com`),
   GA, FB pixel, Google Fonts.
2. `cors` — explicit allowlist; throws on boot if `CORS_ORIGIN='*'`
   outside `NODE_ENV='development'` (post-audit M-3 / PR #134).
3. **Request-ID middleware** — stamps `req.requestId` from incoming
   `X-Request-Id` (validated regex) or mints UUIDv4. Echoed back on
   the response, threaded into morgan and `error_logs.meta.request_id`
   (PR #135).
4. `compression`
5. `morgan` (custom format that includes the request id)
6. **Webhook routes mounted with `express.raw({ limit: '1mb' })`** —
   must come before the JSON parser would consume the stream.
7. `express.json({ limit: '200kb' })` and `express.urlencoded({ limit: '200kb' })`
   — small global cap (post-audit M-5 / PR #133). Real binary uploads
   (POD photos, agent invoice PDFs, ticket attachments) bypass Express
   entirely: client PUTs straight to Supabase Storage via signed URLs
   that `/api/*/upload-url` mints.
8. `sanitizeBody` / `sanitizeQuery` — XSS scrub via the `xss` lib,
   bounded recursion (16) and key count (256) so a hostile client
   can't pin the event loop. Express 5's lazy `req.query` getter is
   replaced via `Object.defineProperty` because plain assignment is a
   no-op (PR #120 hotfix).
9. **Rate limiters** — tiered per route: 10/15min on auth + payments,
   30/15min on signed-URL mints, 60/15min on public tracking, 200/15min
   global catch-all. Webhooks bypass all limiters (signature is the
   defense; dropping a legitimate retry is worse than the cost surface).
10. Routes themselves.
11. SPA fallback (`app.get(/^\/(?!api).*/, …)`) for non-`/api` paths.
12. JSON 404 + error-logging middleware.

---

## 7. Pricing model

Migration 051 introduced a six-knob pricing model that replaces the
legacy hard-coded breakdown:

- `pricing_settings` — global toggles, base rates, FX margins.
- `customs_tiers` — weight-band lookup.
- `hs_code_tiers` — HS-code-driven multipliers.
- `electronics_fees` — electronics surcharge schedule.

`utils/pricing.js` reads these tables, applies
`VolumetricWeightCalculator` (`L·W·H / 6000`) to determine chargeable
weight, and returns a breakdown with `actual_kg`, `vol_kg`,
`chargeable_kg`, and a per-line itemisation including the
Stripe `card_processing` surcharge (PR #206). The same engine ships in
KMP `shared/.../QuoteEngine.kt` for client-side previews.

**Currency convention:** customer surfaces show KES (server-side FX
conversion for parity); operator surfaces show GBP. The web public
calculator hides the customs estimate (PR #207) — KRA charges on
clearance. iOS and Android calculators match this default; iOS
`QuoteCalculatorView` zeroes declared-value by default for parity
(PRs #58–60).

---

## 8. PWA offline + outbox

The web client carries a Web Outbox (PR #159) — an IndexedDB queue
populated by an axios interceptor whenever a mutation fails with a
network error. Pending requests replay automatically when the
connection returns. A Service Worker (PR #190) hooks Background Sync
so the outbox can drain even when the originating tab is closed —
useful for rider POD captures in patchy coverage.

The mobile apps have their own outbox built on SQLDelight
(`PendingMutation.sq`); both surfaces converge on the same idempotent
endpoints, so a replay never double-applies.

---

## 9. Tests

The backend has a vitest + supertest suite (PRs #137–#142):

- `tests/unit/sanitize.test.js` — XSS scrub middleware.
- `tests/unit/stripeWebhook.test.js` — Stripe handler branches (8 cases).
- `tests/unit/lipanaWebhook.test.js` — Lipana handler branches (13 cases).
- `tests/unit/deprecation.test.js` — RFC 8594 header emission.
- `tests/unit/fxRefresh.test.js`, `tests/unit/logRetention.test.js` —
  daily-cron helpers.
- `tests/unit/outboxShouldQueue.test.js` — web-outbox eligibility.
- `tests/unit/pricing.test.js` — six-knob quote engine.
- `tests/integration/appBoot.test.js` — supertest smoke through the
  middleware chain (404, request-id, body-size guard, sanitize).
- `tests/integration/auth.test.js` — register / login / `/me` refresh /
  logout / revocation. **Gated on `TEST_DATABASE_URL`** so unit-only
  runs stay green without a DB.
- `tests/integration/roleMatrix.test.js` — table-driven 5×5 role gate
  matrix. Same `TEST_DATABASE_URL` gating.

`tests/setup.js` (vitest setupFiles) installs safe placeholders for
env vars that fail-fast at module load (`JWT_SECRET`,
`STRIPE_SECRET_KEY`, etc.) so any route file can be imported under the
suite without throwing. Never weaken the prod-side checks themselves —
only the test-environment placeholders.

`server.js` only calls `start()` when `process.argv[1]` matches
`import.meta.url`. Imported under vitest, the assembled `app` is
returned with no listener, no DB pool, no admin bootstrap. **Don't break
this** — it's what lets supertest work.

### CI

`.github/workflows/test.yml` runs three jobs on every PR / push to
`JS1` and `main`:

1. **unit** — `npm ci`, `npm test`, then a client build to catch lockfile
   drift on the React 19 / Vite 7 boundary.
2. **integration** — Postgres-backed auth + role-matrix. Self-skips on
   Dependabot PRs and when `TEST_DATABASE_URL` is missing (PR #179).
3. **lighthouse** — builds the SPA and runs `lhci collect` against
   `client/dist`; asserts `categories:accessibility >= 0.9` (PR #153).

CodeQL SAST runs weekly + on PR with the `security-extended` query
pack (PR #166). SARIF uploads as a workflow artifact (PR #186) since
this is a private repo without GHAS.

---

## 10. Things that look weird but are intentional

- **`test:db` script is preserved** alongside `npm test` even though
  it's a different runner — it's the legacy DB connectivity smoke and
  still useful for diagnosing prod-DB issues from a developer laptop.
- **`react`, `react-dom`, `recharts`, `react-router-dom` are no longer
  in the root `package.json` `dependencies`** (cleaned in PR #154).
  They live only under `client/`.
- **Insurance backend routes (`/api/insurance/*`) still exist** even
  though the React `/insurance` page was removed (PR #136). The iOS
  `insuranceViewModel()` still references them; until iOS confirms it
  has no consumer, the routes stay.
- **Mobile uses Supabase Realtime, web uses SSE.** Different transports
  for the same fanout intent. Don't try to unify them — each is
  appropriate for its platform's network model.
- **`apple-app-site-association`** is served via an explicit Express
  handler with `Content-Type: application/json` (no extension, no
  redirects) because Apple's Universal Links validator is strict. If
  you touch the SPA fallback wildcard, keep this handler above it.
- **The migration auto-runner is opt-in.** Since 2026-05-11, server
  boot only runs migrations when `RUN_MIGRATIONS_ON_BOOT=true`. This
  prevents concurrent Railway deploys from racing each other on DDL.
  When intentionally provisioning, flip the env and redeploy.
- **Recharts is lazy-loaded.** `client/src/lib/charts.jsx` carries
  the dynamic import so the home page LCP isn't penalised (PR #189).

---

## 11. Product positioning (2026-05-13)

Buy-for-me ("Shop & ship") is the primary customer journey. The
navigation, dashboard hero, FAQ vocabulary, and operator queue all
lead with BFM (PRs #211–#214). Standalone parcel forwarding remains
fully supported but is no longer the default landing surface. China
retailers were removed in 2026-05-11 (PR #202–205); the platform is
UK-origin only and the `orders.market` column was dropped in migration
052.

---

## 12. Influencer referral programme (migrations 0002 + 0003)

A marketing programme distinct from the account-to-account `referral_code`
scheme (which pays wallet credit between customers). Admins mint codes for
influencers who have no account; the influencer shares `/i/<CODE>`.

- **Data model.** `influencer_codes` (the mintable code + `owner_user_id` link
  to a partner login), `influencer_conversions` (one row per attributed
  customer's first order — the payable unit), `influencer_link_events` (one row
  per link open, with coarse geo + a `converted` flag), and
  `users.influencer_code` (attribution stamp). Attribution is recorded
  best-effort from the order/BFM create paths (`utils/influencerConversion.js`)
  so it can never block an order.
- **Link previews.** `/i/:code` is server-rendered so WhatsApp/iMessage/etc.
  crawlers (which don't run JS) get the influencer's name in the `<meta>` tags,
  and `/i/:code/og.png` rasterises a per-influencer card with `@resvg/resvg-js`
  + a bundled font (`utils/influencerLinkPreview.js`, `utils/influencerOgImage.js`).
- **Geolocation, privacy-first.** `utils/ipGeolocation.js` resolves the visitor
  IP to country/region/city via ipwho.is (cached, timed out, out-of-band so the
  landing page never waits). The **raw IP is never stored** — only a salted hash
  (unique-visitor counts) + the coarse location.
- **Partner dashboard.** `role='influencer'` accounts (provisioned + emailed a
  set-password invite by an admin) log in to `/influencer`, served by
  `routes/influencerPortal.js` — a single `/dashboard` call returns KPIs,
  per-link funnels, a daily time-series, and location/device breakdowns, scoped
  to the codes they own. Influencers are confined to this one surface.

---

## 13. Where to look next

- **`SETUP.md`** — local dev setup, Supabase / Stripe / Gmail / Lipana wiring.
- **`README_BACKEND.md`** — server-side feature notes.
- **`API_REFERENCE.md`** — full endpoint list (drifts; `routes/*.js` is
  authoritative).
- **`SECURITY.md`** — disclosure policy + threat model.
- **`tests/README.md`** — how to add tests, the `TEST_DATABASE_URL`
  gating contract.
- **`database/migrations/`** — schema evolution. A consolidated baseline
  (`0000_*`) plus incremental migrations from `0001` up; the influencer
  programme is `0002` (codes + conversions) and `0003` (partner accounts +
  link-event analytics). See `database/MIGRATIONS.md`.
- **`.github/workflows/`** — `test.yml` (unit + integration + lighthouse),
  `codeql.yml` (SAST).
- **Companion mobile repo:** [`thapsus-v1.1`](https://github.com/Bmwarari2/thapsus-v1.1) —
  iOS SwiftUI + Android Compose + KMP shared core.

---

*Last updated 2026-05-15.*
