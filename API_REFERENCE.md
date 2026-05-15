# Thapsus Cargo API Reference

For the why-behind-the-what — auth model, RLS posture, webhook idempotency — read [`ARCHITECTURE.md`](./ARCHITECTURE.md) first. The authoritative source for endpoint shapes is `routes/*.js`; this document is best-effort.

## Base URL

```
http://localhost:5000/api       # dev
https://thapsus.uk/api          # production (proxied to Railway)
```

## Authentication

Protected endpoints require a Bearer token:

```
Authorization: Bearer <sc_token>
```

The `sc_token` is an HS256-signed JWT (`{ id, email, role, warehouse_id, iat }`), default lifetime **7 days** (`JWT_EXPIRY`, see #149). Web and mobile clients silently refresh on `/auth/me` — the server attaches a fresh `refreshed_token` to that response whenever it's close to expiry.

For direct Supabase PostgREST / Realtime calls the iOS app exchanges its `sc_token` for a short-lived `supabase_token` via `POST /auth/supabase-token`.

Roles: `customer`, `operator`, `clearing_agent`, `rider`, `admin`. Admin always satisfies any role gate.

---

## Auth

### Register
```
POST /auth/register
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "<≥8 chars, ≥1 letter, ≥1 number — NIST SP 800-63B>",
  "phone": "+254712345678",
  "country": "KE",
  "accepted_terms": true,
  "referral_code": "REF_OPTIONAL"
}

Response 201: { success, token, supabase_token, user }
```

### Login
```
POST /auth/login
{ "email": "...", "password": "..." }

Response 200: { success, token, supabase_token, user }
```

### Current user (silent refresh)
```
GET /auth/me   (Bearer)

Response 200: { success, user, refreshed_token? }
```

`refreshed_token` is included only when the current token is close to expiry. Web and iOS replace their cached token whenever the field is present.

### Logout (revoke)
```
POST /auth/logout   (Bearer)

The SHA-256 hash of the presented token is inserted into `revoked_tokens`. The plaintext is never stored. Subsequent calls with that token are rejected.
```

### Forgot / reset password
```
POST /auth/forgot-password   { "email": "..." }
POST /auth/reset-password    { "token": "<hex>", "new_password": "..." }
```

Resetting the password bumps `users.password_changed_at`. Any JWT whose `iat` predates that timestamp is rejected by the auth middleware — every outstanding token for the user is invalidated.

### Supabase token exchange
```
POST /auth/supabase-token   (Bearer)

Response 200: { supabase_token, expires_at }
```

Used by the iOS app for direct PostgREST + Realtime access under RLS.

---

## Orders (parcel forwarding)

UK-only since 2026-05-11. The `market` parameter was removed in migration 052; clients should omit it.

### Create
```
POST /orders   (Bearer)
{
  "retailer": "Amazon UK",
  "description": "Electronics",
  "weight_kg": 2.5,
  "dimensions": { "length": 30, "width": 20, "height": 15 },
  "declared_value_gbp": 150,
  "insurance": true,
  "shipping_speed": "economy"
}

Response 201: { success, order: { ..., tracking_number, status } }
```

### List / detail
```
GET  /orders?page=1&limit=10&status=pending
GET  /orders/:id
PUT  /orders/:id          (admin)
```

### Public tracking
```
GET /tracking/:trackingNumber           # no auth — limited fields
GET /tracking/user/packages             # Bearer — user's parcels
PUT /tracking/:packageId/status         # admin/operator
```

---

## Buy-for-me (primary product)

Concierge "Shop & ship" flow. As of 2026-05-13 this is the default surface across customer + operator + admin consoles.

```
POST /buy-for-me                # create request (retailer + URL + items + notes)
GET  /buy-for-me                # customer list
GET  /buy-for-me/:id            # customer detail
POST /buy-for-me/:id/cancel
GET  /buy-for-me/operator/queue # operator queue
POST /buy-for-me/:id/quote      # operator → set quote breakdown
POST /buy-for-me/:id/accept     # customer accepts → invoice issued
POST /buy-for-me/:id/pay        # routes through /api/payments
```

The quote is calculated server-side from the six-knob pricing model (`pricing_settings`, `customs_tiers`, `hs_code_tiers`, `electronics_fees`). Customer surfaces show KES; operator surfaces show GBP. The web `/calculator` shows the same breakdown but hides the customs estimate (KRA charges separately on clearance).

---

## Payments

Unified surface for Stripe + M-Pesa Lipana. Replaces the retired wallet (`/api/wallet` → HTTP 410 Gone since migration 028).

```
POST /payments/stripe/intent       # creates a PaymentIntent
POST /payments/lipana/initiate     # initiates an STK Push prompt to user's phone
POST /payments/stripe/webhook      # raw body — Stripe-Signature verified
POST /payments/lipana/webhook      # raw body — X-Lipana-Signature verified (HMAC-SHA256)
GET  /payments/public/:id          # public payment lookup (used by /public-pay)
GET  /payments                     # customer payment history
```

Both webhooks:
- Are mounted with `express.raw({ limit: '1mb' })` **before** `express.json()`.
- Insert into a per-provider `*_events_seen` table (PK on `event_id`) before any side-effect, so retries / replays land twice on the row but only run side-effects once.
- Converge on `utils/markPaymentPaid.js` — the same code path that the admin M-Pesa manual approval route uses. Parcel status flip, credit ledger debit, receipt email all happen exactly once regardless of provider.

### Credit Centre (replaces wallet)
```
GET  /payments/credits             # current balance + ledger
POST /payments/credits/use         # apply credits to a Buy-for-me invoice or order
```

---

## Consolidations

Framework v2 is the supported surface.

```
GET  /consolidations                       # operator queue + customer-facing per-id
POST /consolidations                       # operator create
GET  /consolidations/:id
POST /consolidations/:id/dispatch
POST /consolidations/:id/printable-manifest # A4 manifest
GET  /customer-consolidations              # customer's consolidations
```

The v1 surface (`/api/consolidation/*`) is deprecated. Calls receive RFC 8594 `Deprecation: true`, `Sunset: 2026-05-23`, `Link: rel="successor-version"` headers.

---

## Customs · Last-mile · Insurance · DSAR · Notifications · NPS

```
GET /customs                  # customs entries / declarations
…   /last-mile/runs           # rider run lifecycle: assign, start, complete, POD
POST /last-mile/pod           # POD photo + signature + OTP
GET /insurance/quote          # declared-value insurance quote
POST /insurance/claim
POST /dsar                    # GDPR DSAR request (export emailed to user)
GET /admin/dsar               # admin DSAR queue (PR #144)
GET /notifications            # customer inbox (PR #143)
POST /nps/respond             # NPS survey
```

---

## Tickets

```
POST /tickets                       # multipart/form-data — subject, description, priority, photo
GET  /tickets?page=1&status=open
GET  /tickets/:id
POST /tickets/:id/message
PUT  /tickets/:id/status            # admin/operator
GET  /tickets/admin/all             # staff queue
```

---

## Pricing (six-knob model)

Live quote engine. The web public calculator and the iOS/Android quote screens all call this.

```
POST /pricing/calculate
{
  "weight_kg": 2.5,
  "dimensions": { "length": 30, "width": 20, "height": 15 },
  "declared_value_gbp": 0,            # zeroed in public calculator (web parity)
  "hs_code": "",                       # optional — drives hs_code_tiers
  "is_electronics": false,             # drives electronics_fees
  "insurance": false
}

Response 200:
{
  "summary": {
    "total_gbp": …,                    # operator-facing
    "total_kes": …,                    # customer-facing (server-side FX, parity with iOS)
    "actual_kg": 2.5,
    "vol_kg": 1.8,                     # L·W·H/6000
    "chargeable_kg": 2.5
  },
  "breakdown": {
    "base_shipping": …,
    "weight_tier":  …,                 # via pricing_settings + customs_tiers
    "electronics":  …,                 # if applicable
    "insurance":    …,
    "handling":     …,
    "card_processing": …               # Stripe processing line (PR #206)
  }
}
```

The public calculator omits the customs estimate (PR #207) — KRA charges on clearance.

### Pricing tiers (public + admin)
```
GET  /pricing-tiers/tiers     # public read
GET  /pricing-tiers/fees      # public read
POST /pricing-tiers           # admin create/update promotion
```

---

## FX

```
GET  /exchange/rates           # cached daily refresh from frankfurter.dev (PR #199)
POST /exchange/convert
POST /admin/exchange/refresh   # admin manual trigger
```

Rates land in DB with the `_KES` suffix convention.

---

## Prohibited items (UK → KE)

```
GET /prohibited/check?item=fireworks
GET /prohibited/categories
GET /prohibited/categories/:category
POST /prohibited                    # admin CRUD
```

Catalogue seeded by migration 030 — 18 categories covering UK-export and KE-import restrictions.

---

## Operator console & parcels

```
POST /parcels                     # operator intake (camera barcode → zxing)
POST /parcels/:id/label           # browser-print thermal label
GET  /ops/today                   # operator today queue (BFM-first)
POST /ops/consolidations          # build manifest
GET  /ops/scanner                 # SKU scanner config
```

---

## Clearing-agent invoices · AML

```
GET  /agent-invoices              # agent's queue
POST /agent-invoices              # upload (signed URL → Supabase Storage)
GET  /agent-invoices/admin        # admin queue
GET  /admin/aml-flags             # AML review queue
POST /admin/aml-flags/:id/resolve
```

Uploads never traverse Express. Clients request a signed URL from `/agent-invoices/upload-url`, then PUT directly to Supabase Storage (`agent-invoices` private bucket).

---

## Admin

```
GET  /admin/users?search=&role=&page=1
GET  /admin/users/:userId
PUT  /admin/users/:userId
GET  /admin/orders
PUT  /admin/orders/bulk-update
GET  /admin/stats                 # includes payments table since PR #209
GET  /admin/revenue               # daily rows include Stripe + M-Pesa (PR #210)
GET  /admin/revenue/export        # CSV
GET  /admin/logs                  # admin actions audit log
GET  /admin/error-logs            # threaded with X-Request-Id (PR #135)
GET  /admin/email-diagnostics     # surfaces whether Gmail OAuth env is visible to the process
```

---

## KPIs · App config · Warehouse · Retailers

```
GET /kpi/dashboard                # KPI dashboard data
GET /app-config                   # runtime client config
GET /warehouse/addresses          # UK warehouse details
GET /retailers                    # UK retailers catalogue (filters BFM picker, PR #203)
```

---

## Realtime

### Server-Sent Events (web)
```
GET /events   (Bearer; long-lived stream)
```

The web client opens a single `EventSource` and receives JSON-encoded events from the in-memory emitter `server.js` fires whenever a mutation should fan out. EventSource auto-reconnects on transport hiccups (handled by the browser).

### Supabase Realtime (iOS / Android)

Mobile clients subscribe directly to Supabase Realtime channels for `packages`, `consolidations`, `customer_consolidations`, `notifications`. Subscriptions are gated by `supabase_token` claims and RLS. The KMP layer in `thapsus-v1.1` (`shared/.../RealtimeSync.kt`) consolidates these into a single coroutine flow.

---

## Universal Links

```
GET /.well-known/apple-app-site-association
```

Served as `Content-Type: application/json` with no redirects (Apple is strict). If you touch the SPA fallback wildcard, keep this handler above it.

---

## Error responses

```json
{ "success": false, "message": "<human-readable>", "code": "<optional>" }
```

| Status | Meaning |
| --- | --- |
| 400 | Bad request / validation failure |
| 401 | Missing / invalid / revoked JWT; password changed; user deactivated |
| 403 | Role gate refused; CORS origin not allowlisted |
| 404 | Resource not found |
| 409 | Conflict (e.g. email already registered) |
| 410 | Resource permanently gone (`/api/wallet` since mig 028) |
| 413 | Body too large (200 KB global cap; sanitizer recursion / key count exceeded) |
| 429 | Rate-limited |
| 500 | Server error — `error_logs` row written, threaded with `X-Request-Id` |

Every response includes the `X-Request-Id` header for correlation against `error_logs.meta.request_id` and the morgan access log.

---

## Rate limits

| Scope | Limit |
| --- | --- |
| Auth (`/auth/*` mutations) | 10 / 15 min |
| Forgot-password | 5 / hour |
| Reset-password | 10 / hour |
| Payments | 10 / 15 min |
| Signed-URL mints | 30 / 15 min |
| Public tracking | 60 / 15 min |
| Global `/api/*` | 200 / 15 min |

Webhooks bypass all limiters — signature verification is the defence; dropping a legitimate retry is worse than absorbing the cost.

---

## Best practices

1. Always honour the `refreshed_token` in `/auth/me` responses — replace your cached token in place.
2. Check `success` before processing data; pre-flight on `code` for typed branches.
3. Use pagination on list endpoints (`?page`, `?limit`).
4. Implement exponential backoff for retries.
5. Cache `/exchange/rates` for ~5 minutes — the server refreshes once daily.
6. Store JWTs in Keychain (iOS) / EncryptedSharedPreferences (Android) / `localStorage` is acceptable for the SPA pending CSRF mitigations on the API.
7. Send Stripe / M-Pesa webhooks only at the documented `/webhook` paths — they're the only routes mounted with raw-body parsing.
8. For very-public endpoints (`/tracking/:n`, `/pricing-tiers/tiers`, `/prohibited/categories`, `/exchange/rates`) prefer GETs without auth — the rate limit is more permissive.
