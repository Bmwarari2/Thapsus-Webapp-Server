# Architecture

This document describes how Thapsus Cargo's backend, web client, and the
iOS app fit together. It is written for a developer joining the project
who has read `README.md` and wants the why-behind-the-what — auth flow,
RLS model, Realtime subscriptions, webhook idempotency, and the few
non-obvious invariants the code depends on.

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
   │  RLS on all  │      │  3 private   │  │  Gmail /    │
   │  public.*    │      │  buckets     │  │  Lipana STK │
   └──────┬───────┘      └──────────────┘  └─────────────┘
          │ PostgREST + Realtime
          ▼
   ┌──────────────────────┐
   │  iOS app (KMP+Swift) │
   │   reads via PostgREST│
   │   subscribes via     │
   │   Realtime channels  │
   └──────────────────────┘
```

Two clients, one server, one database. The Express app is the **only**
write path — the iOS app reads via Supabase PostgREST + Realtime for
low-latency state updates, but every mutation routes through Express
so business logic and auditing stay in one place.

---

## 2. Authentication

### Token model

Two tokens are issued per session:

- **`sc_token`** — HS256-signed JWT, used as `Authorization: Bearer <…>`
  on every Express call. Payload is `{ id, email, role, warehouse_id, iat }`.
  Expiry: `JWT_EXPIRY` env var, default `30d`.
- **`supabase_token`** — Supabase JWT minted on demand by
  `POST /api/auth/supabase-token`. Only the iOS app uses it (for direct
  PostgREST + Realtime calls under RLS).

The web client only carries `sc_token`. It hits Express, which holds the
service-role key for any direct DB work.

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
   invalidate every outstanding token for the affected user.
4. **`is_active`.** Admin can deactivate a user; the live DB lookup
   means JWTs minted before deactivation stop working immediately.

All four checks ride on a single round-trip query against `users` +
`revoked_tokens`. See `checkAuthStatus()` in `middleware/auth.js`.

### Role gates

`requireRole(...allowed)` in the same file. Roles: `customer`,
`operator`, `clearing_agent`, `rider`, `admin`. Admins always pass.
Convenience exports: `isAdmin`, `isOperator`, `isAgent`, `isRider`.

---

## 3. RLS posture

All 48 public tables have RLS enabled. The architecture is
**backend-mediated writes, defense-in-depth reads:**

- The Express tier holds the Supabase service-role key. All writes go
  through it, so RLS is a defense-in-depth layer, not the first gate.
- Read policies are mostly `self_or_staff` — a user can read rows they
  own or staff can read everything. Staff-detection helpers
  (`is_admin`, `is_operator`, `is_thapsus_staff`, …) live as Postgres
  functions with locked-down `search_path` (post-migration 040).
- A handful of tables have explicit deny policies (`pod_otps`,
  `last_mile_run_parcels`, `password_reset_tokens`, `revoked_tokens`)
  with `qual = false` — never readable from any client role, only
  the service-role key.
- `customer_consolidations`'s SELECT policy looks suspicious at first
  (role `{public}`) but the `qual` is `auth.uid()::text = user_id`,
  which evaluates to `false` for anon — effectively authenticated-only.

When in doubt, the answer is to read `pg_policies` directly. See the
Supabase advisor cleanup migrations 040 and 041 for prior remediation
patterns.

---

## 4. Realtime + write fanout

### iOS

The iOS app subscribes to Supabase Realtime channels for:

- `packages` — parcel status timeline updates
- `consolidations` / `customer_consolidations` — invoice state
- `notifications` — inbox

Subscriptions are scoped per-user via the Supabase JWT's `sub` claim;
RLS gates what each connection can observe. The KMP layer
(`shared/.../RealtimeSync.kt`) consolidates these into a single coroutine
flow that the SwiftUI views observe via `StateFlowObserver`.

### Web

The web client uses `GET /api/events` (Server-Sent Events) for the same
fanout signal — different transport, same intent. SSE chosen over
WebSocket because the browser uses HTTP/2 multiplexing for free, and
the EventSource API auto-reconnects on transport hiccups.

The two transports converge on the same backend mutation surface:
**every mutation that should fan out re-publishes via both Realtime
and SSE.** The mutation handler updates the row, returns 200, and
fires a small in-memory `EventEmitter` that drives the SSE channel
while Postgres `LISTEN/NOTIFY` (or Realtime's own WAL stream) drives
the iOS one.

---

## 5. Webhook idempotency

Two payment webhooks are mounted before `express.json()` so Stripe and
Lipana signatures can be verified against the raw body:

- `POST /api/payments/stripe/webhook` — verifies via
  `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
- `POST /api/payments/lipana/webhook` — verifies HMAC-SHA256 against
  `X-Lipana-Signature`.

Both insert into a `*_events_seen` table on receipt and short-circuit
on conflict, so retries / replays land on the same DB row twice but
only run side-effects once:

- `stripe_events_seen (event_id PK, event_type, …)`
- `lipana_events_seen (event_id PK, event_type, …)`

The "money received" side-effect is shared: `utils/markPaymentPaid.js`
is called from both webhooks **and** the admin M-Pesa approval route.
Same code path = same downstream behaviour (parcel status flip, credit
ledger debit, receipt email) regardless of payment method. Never
duplicate that logic; if it needs to change, change it in one place.

---

## 6. Body-parsing and rate-limit ordering

The middleware stack in `server.js` (with the why):

1. `helmet` — CSP, HSTS, etc.
2. `cors` — explicit allowlist; throws on boot if `CORS_ORIGIN='*'`
   outside `NODE_ENV='development'` (post-audit M-3).
3. **Request-ID middleware** — stamps `req.requestId` from incoming
   `X-Request-Id` (validated regex) or mints UUIDv4. Echoed back on
   the response, threaded into morgan and `error_logs.meta.request_id`.
4. `compression`
5. `morgan` (custom format that includes the request id)
6. **Webhook routes mounted with `express.raw({ limit: '1mb' })`** —
   must come before the JSON parser would consume the stream.
7. `express.json({ limit: '200kb' })` and `express.urlencoded({ limit: '200kb' })`
   — small global cap (post-audit M-5). Real binary uploads (POD photos,
   agent invoice PDFs, ticket attachments) bypass Express entirely:
   client PUTs straight to Supabase Storage via signed URLs that
   `/api/*/upload-url` mints.
8. `sanitizeBody` / `sanitizeQuery` — XSS scrub via the `xss` lib,
   bounded recursion (16) and key count (256) so a hostile client
   can't pin the event loop. Express 5's lazy `req.query` getter is
   replaced via `Object.defineProperty` because plain assignment is a
   no-op (memorialised in `feedback_dep_major_gotchas.md`).
9. **Rate limiters** — tiered per route: 10/15min on auth + payments,
   30/15min on signed-URL mints, 60/15min on public tracking, 200/15min
   global catch-all. Webhooks bypass all limiters (signature is the
   defense; dropping a legitimate retry is worse than the cost surface).
10. Routes themselves.
11. SPA fallback for non-`/api` paths.
12. JSON 404 + error-logging middleware.

---

## 7. Tests

The backend has a vitest + supertest suite:

- `tests/unit/sanitize.test.js` — XSS scrub middleware.
- `tests/unit/stripeWebhook.test.js` — Stripe handler branches, mocked SDK.
- `tests/unit/lipanaWebhook.test.js` — Lipana handler branches, mocked verifier.
- `tests/integration/appBoot.test.js` — supertest smoke through the
  middleware chain (404, request-id, body-size guard, sanitize).
- `tests/integration/auth.test.js` — register / login / me / logout /
  revocation. **Gated on `TEST_DATABASE_URL`** so unit-only runs stay
  green without a DB.
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

---

## 8. Things that look weird but are intentional

- **`test:db` script is preserved** alongside `npm test` even though
  it's a different runner — it's the legacy DB connectivity smoke and
  still useful for diagnosing prod-DB issues from a developer laptop.
- **`react`, `react-dom`, `recharts`, `react-router-dom` are in the
  root `package.json` `dependencies`** even though they're client-only.
  Cleanup hasn't been done; consider moving them to `devDependencies`
  at root, or leaving them — they're not loaded server-side.
- **Insurance backend routes (`/api/insurance/*`) still exist** even
  though the React `/insurance` page was removed. iOS `insuranceViewModel()`
  still references them; until iOS confirms it has no consumer, the
  routes stay.
- **iOS uses Supabase Realtime, web uses SSE.** Different transports for
  the same fanout intent. Don't try to unify them — each is appropriate
  for its platform's network model.
- **`apple-app-site-association`** is served via an explicit Express
  handler with `Content-Type: application/json` (no extension, no
  redirects) because Apple's Universal Links validator is strict. If
  you touch the SPA fallback wildcard, keep this handler above it.

---

## 9. Where to look next

- **`SETUP.md`** — local dev setup.
- **`README_BACKEND.md`** — server-side feature notes.
- **`API_REFERENCE.md`** — full endpoint list (drifts; `routes/*.js` is
  authoritative).
- **`tests/README.md`** — how to add tests, the `TEST_DATABASE_URL`
  gating contract.
- **`database/migrations/`** — schema evolution. Numbered, applied in
  order; advisor cleanups live at 040/041.
- **`.github/workflows/test.yml`** — CI.

---

*Last updated 2026-05-09 (audit remediation cycle).*
