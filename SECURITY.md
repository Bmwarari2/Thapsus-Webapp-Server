# Security

This document captures the security model Thapsus Cargo's backend +
clients commit to today, and the rationale for the choices that look
unusual at first glance. Pair it with `ARCHITECTURE.md` for the
broader system shape.

For run/deploy notes see `SETUP.md` / `CUTOVER.md`. For audit
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
- `helmet` applies CSP with explicit allowlists for Google /
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

Webhook endpoints are mounted *before* `express.json()` so signature
verification reads raw bytes:

- **sent.dm** (`/api/wa/webhook`) — Svix-style HMAC-SHA256 over
  `${id}.${timestamp}.${rawBody}`, compared with
  `crypto.timingSafeEqual`, with a ±300s timestamp tolerance that
  bounds replay. Idempotent via the unique
  `wa_messages.provider_message_id`.
- **Lipana** (`/api/payments/lipana/webhook`) — HMAC-SHA256 over the raw
  body, `timingSafeEqual`, idempotent via `lipana_events_seen`
  (`ON CONFLICT DO NOTHING`). Inert while `MPESA_PROVIDER=manual`.

Both endpoints **bypass rate limiters** by design (the signature is the
gate; dropping a legitimate retry is worse than the cost surface).

### Receipt links

`GET /r/:token` is unauthenticated by design — the token *is* the
credential. It is a truncated HMAC over the order id keyed on
`JWT_SECRET`, verified in constant time, and the redirect it issues
points at a signed URL valid for 10 minutes. Receipts contain a
customer's name and delivery address, so the token is unguessable rather
than derived from the public tracking code alone. Rotating `JWT_SECRET`
revokes every outstanding link. The route sits behind the public
tracking rate limiter and returns an identical 404 for a bad signature,
an unknown code and a missing receipt, so it confirms nothing about
which codes exist.

### Media links

`GET /m/:token` is the same pattern for attachments, and needs more care.
A receipt token names a tracking code and the route resolves which file
that order owns; a **media token carries the storage path itself**, so
the HMAC is the only thing between a well-formed token and any object the
service key can read — receipts included.

Three things follow from that, and none is optional:

- the bucket is pinned inside `utils/mediaLink.js` rather than passed in,
  so a token cannot name its own bucket
- traversal, absolute paths and anything outside a conservative character
  set are rejected **before** the HMAC is consulted
- the comparison is constant-time, like the receipt one

Tests cover a forged token, a signature lifted from a different path, and
`../` escapes. Rotating `JWT_SECRET` revokes every outstanding link.

### AI boundary

The Gemini assistant (`utils/waAi.js`) is treated as untrusted output.
It cannot move money or state: quoting, confirmation, payment and
pipeline transitions all resolve before it is consulted. Its output is
classified into a tagged result before use, so a control sentinel can
never be emitted to a customer, and prompts carry only the requesting
customer's own order rows — never another contact's data.

---

## 7. Secret handling

- Every secret is read from `process.env`. None are committed to
  the repo.
- Boot sequence in `server.js` fail-fasts on missing required
  values: `DATABASE_URL`, `JWT_SECRET`, `ADMIN_PASSWORD`. Missing
  optional values (sent.dm, Gemini, Lipana, email) cause specific endpoints
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
| `/payments` (create intent) | 10 | 15 min | Legacy drain surface |
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
- For webhook failures, the dedup surfaces (`wa_messages.provider_message_id`,
  `lipana_events_seen`) double as a forensic log of every
  signed event we received.

### 10.1 Retired subsystems

The influencer link tracker and its IP-geolocation pipeline were removed
in the WhatsApp-first rebuild (see `REBUILD.md`). No visitor IPs, hashed
or otherwise, are collected any more. The `influencer_link_events` table
still exists but is unreferenced and never written to; it is scheduled
for removal with the rest of the legacy schema.

### 10.2 WhatsApp conversation data

Full message transcripts are stored in `wa_messages`, including anything
a customer volunteers and any attachment they send — a payment screenshot
is the common one. Contact rows hold name and delivery address, plus an
M-Pesa number for the contacts collected before signup stopped asking for
one. Recent transcript excerpts and a rolling AI summary are sent to
Google's Gemini API when the assistant is enabled; the operator
kill-switch in `/ops/settings` stops that immediately, and the
per-conversation toggle stops it for one customer. Nothing else leaves
the system: receipts and media sit in private buckets, reachable only
through a signed, expiring URL.

### 10.3 Erasing a customer

Deleting the `users` row or the `wa_contacts` row is **not** enough, and
the foreign keys will not tell you so:

- `payments.wa_contact_id` is `SET NULL` and `payments.target_id` carries
  no foreign key at all, so a cascade leaves the payment row behind,
  unlinked and pointing at an order that no longer exists.
- `email_logs.user_id` is `SET NULL`, so the rows survive with the
  address still in `email_to` — including any written before the account
  existed.
- `admin_logs.details` stores the email in plaintext on password resets.
  Redact rather than delete: the record that an admin reset a password is
  worth keeping, the address in it is not.
- Receipts and media in Supabase Storage are **not** reachable from SQL.
  Supabase blocks direct deletion from `storage.objects`; use the Storage
  API or the dashboard.
- `notifications.message` and `request_idempotency.path` quote names and
  order ids.

The reliable check is a sweep of every text column against every
identifier — email, phone, name, customer code, tracking code, order id,
user id — rather than trusting the schema. Two erasures have been done
this way; both turned up rows no cascade would have touched.

---

## 11. What's NOT covered

Honesty section. We don't claim:

- **Pen-tested.** This document captures internal posture; no
  third-party audit has been commissioned.
- **Automated GDPR tooling.** The self-service DSAR and account-deletion
  endpoints were removed with the customer portal. Access and erasure
  requests are handled manually against `wa_contacts` / `wa_messages`;
  no DPIA exists.
- **PCI-DSS.** Not applicable — we take no card payments. Stripe was
  removed in the rebuild and no PAN has ever touched our servers.
- **Content review of WhatsApp media.** Customers can send images and
  documents into the inbox. They are stored in a private bucket and
  served through signed URLs, but nothing scans them.
- **Bug bounty.** We're a single-developer product; no formal
  programme exists.

---

*Last updated 2026-07-06 (influencer programme: partner logins + privacy-preserving link analytics).*
