# Security

This document captures the security model Thapsus Cargo's backend +
clients commit to today, and the rationale for the choices that look
unusual at first glance. Pair it with `ARCHITECTURE.md` for the
broader system shape.

For run/deploy notes see `SETUP.md` / `README_BACKEND.md`. For audit
history see `docs/system_audit_2026_05_09.md` (in the iOS repo).

---

## 1. Reporting a vulnerability

**Don't open a public issue.** Email **brynfreelance@gmail.com** with
a description of the vulnerability, reproduction steps, and impact.
We'll acknowledge within 72 hours and aim to ship a fix within 7 days
for high-severity issues, 30 days for medium.

---

## 2. Authentication

### 2.1 Token model

Two tokens are issued per session:

| Token | Algorithm | Lifetime | Where it goes |
|---|---|---|---|
| `sc_token` | HS256 JWT | 7 days, sliding via silent refresh | `Authorization: Bearer …` to Express |
| `supabase_token` | RS256 JWT (Supabase mints) | minted on demand | Supabase PostgREST + Realtime under RLS |

The web client only uses `sc_token`. The iOS app uses both — `sc_token`
for Express calls, `supabase_token` for direct Realtime/PostgREST so
RLS sees `auth.uid()`.

### 2.2 Defense-in-depth chain (`middleware/auth.js`)

Every authenticated request runs four independent checks in a single
DB round-trip:

1. **JWT signature**, with algorithms pinned to `['HS256']` to block
   algorithm-confusion attacks.
2. **Revocation list** — `revoked_tokens` table holds SHA-256 hashes
   of any token sent through `POST /api/auth/logout`. Plaintext
   tokens are never stored.
3. **`password_changed_at` invariant** — if a JWT's `iat` predates
   the user's last password reset, it is rejected. Password reset
   thus invalidates every outstanding token for that user without
   needing to enumerate them.
4. **`is_active`** check — admin-disabled users stop authenticating
   immediately, regardless of unexpired tokens in the wild.

### 2.3 Sliding 7-day session

Default `JWT_EXPIRY` is 7 days. Active users get a sliding window via
`GET /auth/me`: when the presented token's `iat` is older than
`JWT_REFRESH_AFTER_SECONDS` (default 24h), the response includes a
freshly-signed `refreshed_token` that the client swaps into storage.
The old token stays valid until natural `exp` so concurrent tabs /
in-flight requests don't 401.

Web fires `/me` on AuthContext mount + `visibilitychange`. iOS fires
on app launch + `UIApplication.willEnterForegroundNotification`.
Both clients throttle to one rotation per 5 minutes.

---

## 3. CSRF posture

**SPA, header-only auth, no cookies.** This is the load-bearing design
choice.

The CSRF risk model is: a malicious origin tricks a browser into
making an authenticated request *the user didn't intend*. The classic
defense is a CSRF token tied to a session cookie. We don't have that
problem because we don't have the cookie:

- The `sc_token` lives in `localStorage` (or `sessionStorage` /
  in-memory fallback). Browsers do not auto-send it on cross-origin
  requests — only first-party JavaScript reading our `localStorage`
  can attach it.
- The Express CORS allowlist (`server.js`'s `CORS_ORIGIN`) is
  enforced strictly; cross-origin XHR/fetch from a malicious page
  is blocked at the preflight.

**Therefore:** there is no `csurf`-style middleware in the codebase.
Adding one would be cargo-cult. The SPA architecture is the CSRF
defense.

**The line we don't cross:** if anyone proposes adding a
cookie-authenticated route — even just for a download endpoint or a
file viewer iframe — the CSRF model collapses and we have to add
proper tokens before that ships. Document and resist.

XSS is mitigated upstream of the cookie problem:
- `helmet` applies CSP with explicit allowlists for Stripe / Google /
  Meta script origins. No `unsafe-eval`. `unsafe-inline` is allowed
  for Tailwind-generated styles only — the standard tradeoff for
  utility-first CSS without nonces.
- `middleware/sanitize.js` runs `xss` on every request body and
  query. Bounded recursion (16) and key count (256) prevent
  event-loop pinning.

---

## 4. Transport

- **HSTS:** 1 year, `includeSubDomains`, `preload` directive set.
- **TLS:** terminated at Railway's front door; backend never speaks
  HTTP in production.
- **CORS:** `server.js:122-143`. In development the default falls
  back to a localhost allowlist; `*` is rejected outside
  `NODE_ENV='development'`. The check fails closed if `NODE_ENV` is
  unset (audit M-3).
- **Body size:** global `200kb` limit on `express.json` and
  `express.urlencoded`. Real binary uploads (POD photos, agent
  invoices, ticket attachments) bypass Express entirely — clients
  PUT directly to Supabase Storage via signed URLs minted at
  `/api/*/upload-url` (post-audit M-5).

---

## 5. Database security

- **RLS** is enabled on all 48 public tables. Most have a
  `self_or_staff` SELECT policy; staff detection is via Postgres
  functions (`is_admin`, `is_operator`, `is_thapsus_staff`) that
  carry an explicit, locked-down `search_path`.
- **Deny policies** with `qual = false` are applied to
  `password_reset_tokens`, `revoked_tokens`, `pod_otps`, and
  `last_mile_run_parcels` — those tables are never readable from
  any client role; only the service-role key can access them.
- **Writes go through Express.** RLS is a defense-in-depth layer
  for reads, not the first gate. The service-role key never leaves
  Railway.
- **Storage buckets** (`agent-invoices`, `pods`, `ticket-attachments`)
  are private, MIME-restricted, and capped at 10 MB. Reads use
  short-lived signed URLs minted by Express.
- **Connection** uses TLS to Supabase; `DATABASE_URL` is read from
  env, fail-fast at boot if missing.

---

## 6. Webhooks

Stripe and Lipana webhook endpoints are mounted *before*
`express.json()` so signature verification reads raw bytes:

- **Stripe** — `stripe.webhooks.constructEvent(rawBody, sig, secret)`.
- **Lipana** — HMAC-SHA256 over the raw body, compared with
  `crypto.timingSafeEqual`.

Both endpoints **bypass rate limiters** by design (signature is the
gate; dropping a legitimate retry is worse than the cost surface).
Replays are short-circuited by `stripe_events_seen` /
`lipana_events_seen` tables (insert with `ON CONFLICT DO NOTHING`).

---

## 7. Secret handling

- Every secret is read from `process.env`. None are committed to
  the repo.
- Boot sequence in `server.js` fail-fasts on missing required
  values: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`. Missing
  optional values (Stripe, Lipana, email) cause specific endpoints
  to return 503 instead of crashing the whole boot.
- `tests/setup.js` installs throwaway placeholder values for the
  same set of vars so the vitest suite can import route modules
  without their fail-fast checks throwing. **Never weaken the
  prod-side checks** — only the test placeholders.
- The iOS app stores `sc_token` and `supabase_token` in Keychain
  with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly`. Excluded
  from iCloud backup. Never written to logs or error reports.

---

## 8. Rate limiting

Tiered per route in `server.js:390-427`:

| Route | Limit | Window | Reason |
|---|---|---|---|
| `/auth/login`, `/auth/register`, `/auth/password` | 10 | 15 min | Credential-stuffing, brute-force |
| `/auth/forgot-password` | 5 | 60 min | Email enumeration |
| `/auth/reset-password` | 10 | 60 min | Token guessing |
| `/payments` (create intent) | 10 | 15 min | Card testing, Stripe cost |
| `/*/upload-url` mints | 30 | 15 min | Supabase quota |
| `/tracking/*` (public) | 60 | 15 min | Public tracking enumeration |
| `/api/*` catch-all | 200 | 15 min | Generic fallback |

Webhooks bypass all limiters. Rate-limit store is in-memory; if we
ever scale beyond a single Railway dyno, switch to
`rate-limit-redis`.

---

## 9. Dependencies

- Backend on current majors of every security-relevant package:
  `express` 5.x, `helmet` 8.x, `jsonwebtoken` 9.x, `pg` 8.x,
  `bcryptjs` 3.x, `ws` 8.x, `xss` 1.x.
- Client `axios` is at `^1.7.9` (post-audit M-1) — predates SSRF
  and credential-leak CVEs that hit `<1.7.9`.
- `npm audit` and Dependabot alerts are reviewed regularly; no
  open advisories at time of writing.
- Renovate / Dependabot can be added later; until then, manual
  review is the workflow.

---

## 10. Logging and incident response

- `morgan` logs every request in the prod combined format,
  appended with `req=<request-id>`. Request IDs are minted by
  `server.js`'s request-ID middleware and threaded through
  `error_logs.meta.request_id`.
- `error_logs` retains 30 days; `admin_logs` 365; `email_logs`
  180 — all configurable via env, pruned daily by
  `utils/logRetention.js` (audit W6.5).
- `error_logs` table has its own admin viewer at
  `/admin/error-logs` and a clear-all endpoint.
- For webhook failures, the dedup tables (`stripe_events_seen`,
  `lipana_events_seen`) double as a forensic log of every
  signed event we received.

---

## 11. What's NOT covered

Honesty section. We don't claim:

- **Pen-tested.** This document captures internal posture; no
  third-party audit has been commissioned.
- **GDPR-compliant beyond DSAR.** We honour data-subject access
  + erasure requests via `/api/dsar` + the admin queue at
  `/admin/dsar`. Marketing-consent logging exists; full DPIA does
  not.
- **PCI-DSS.** Card data never touches our servers; Stripe handles
  PAN. We are SAQ-A scope only.
- **iOS attestation / DeviceCheck / App Attest.** Not implemented;
  fraud risk is mitigated by KYC at signup + payment-side limits.
- **Bug bounty.** We're a single-developer product; no formal
  programme exists.

---

*Last updated 2026-05-09 (audit remediation cycle).*
