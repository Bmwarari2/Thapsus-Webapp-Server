# Thapsus Cargo API Reference

`routes/*.js` is authoritative — this document drifts. It was regenerated
against the routers on 2026-08-12, after the WhatsApp-first rebuild.

## Base URL

```
production   https://thapsus.uk/api
local        http://localhost:5000/api
```

## Authentication

Staff only. There are no customer accounts — customers interact over
WhatsApp and never authenticate.

```
Authorization: Bearer <sc_token>
```

`sc_token` is an HS256 JWT from `POST /auth/login`, default 7-day expiry
with silent refresh on `/auth/me`. Roles in use: `operator` and `admin`;
admins pass every `requireRole` gate.

Errors are `{ success: false, message, error? }` with a conventional
status. Rate limits: 10/15min on auth, 30/15min on signed-URL mints,
60/15min on public tracking and `/r`, 200/15min global.

Mutating endpoints marked **idempotent** accept an `Idempotency-Key`
header and replay the stored response for a repeated key.

---

## WhatsApp — inbound

### `POST /api/wa/webhook`

sent.dm delivery. Mounted before the JSON body parser with the raw body
preserved; verified as Svix-style HMAC over
`${x-webhook-id}.${x-webhook-timestamp}.${rawBody}`, rejected beyond 24h
(`SENTDM_WEBHOOK_TOLERANCE_SECONDS`). Deduped on `provider_message_id`. Returns 200 before running
bot replies. Not called by anything you own.

---

## WhatsApp — inbox (`/api/wa`, operator)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/wa/conversations?q=` | Conversation list, newest first, unread counts. `q` matches name, phone and `TC-` code. |
| GET | `/wa/conversations/:contactId` | Contact record + counters. |
| GET | `/wa/conversations/:contactId/messages?before=` | Paginated transcript, oldest first. |
| POST | `/wa/conversations/:contactId/messages` | Send. `{ text?, media_url?, media_type? }`. Recorded as sent by the operator. |
| POST | `/wa/conversations/:contactId/read` | Clear the unread badge. |
| POST | `/wa/conversations/:contactId/ai` | `{ enabled }` — resume or pause the assistant on this chat (clears/sets `human_takeover_at`). |
| PUT | `/wa/contacts/:contactId` | Edit name, delivery address, M-Pesa number (never asked for — kept for STK on contacts that already have one). |
| POST | `/wa/upload-url` | `{ filename, content_type }` → signed Supabase Storage PUT for outbound media. |

---

## WhatsApp — orders (`/api/wa/orders`, operator)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/wa/orders?status=&q=&limit=&offset=` | Pipeline board and global search. `status` accepts a comma list. `q` matches `TRK-`/`TC-` codes in any formatting, names, phone digits, and `supplier_ref` — an exact (case-insensitive) supplier reference returns the whole batch that went into that purchase. |
| GET | `/wa/orders/scan/:code` | Scanner resolver — tracking code in any formatting → the order. 404 if unknown. |
| POST | `/wa/orders/supplier-ref` | `{ order_ids[], supplier_ref }` — tag one or many orders with the retailer's own order number (SHEIN et al). Empty/null clears it. Writes an order event per order. |
| POST | `/wa/orders` | `{ contact_id, product_links[], product_note?, status?, quote_kes?, delivery_fee_kes?, supplier_ref?, notify? }` → an order at `status` (default `quoting`), with earlier stages' timestamps backfilled. |
| GET | `/wa/orders/:id` | Order + contact + audit trail + payments. |
| POST | `/wa/orders/:id/quote` | **Idempotent.** `{ usd_price, markup_pct? }`. Server computes `usd × live USD_KES × (1 + markup/100)`, snapshots the inputs, sends the quote. `markup_pct` is per-order (0–100), defaulting to the settings value — the 10% is a SHEIN charge, so UK (£9/kg + £3) and Dubai ($9/kg) orders pass `0`. 409 unless status is `quoting`/`quoted`; 503 if the FX rate is stale. |
| POST | `/wa/orders/:id/confirm` | Operator confirms on the customer's behalf. Silent — the payment prompt follows separately. |
| POST | `/wa/orders/:id/request-payment` | **Idempotent.** `{ method: 'stk'\|'manual', purpose: 'order'\|'delivery_fee', phone? }`. `manual` opens/reuses an `awaiting_review` payment and sends till instructions. `stk` returns 409 `stk_unavailable` unless `MPESA_PROVIDER=lipana`. |
| POST | `/wa/orders/:id/mark-paid` | **Admin. Idempotent.** `{ mpesa_reference?, note? }`. Get-or-creates the payment for whatever the order owes, stamps the reference, settles through `markPaymentPaid` — minting the tracking code and sending the receipt. |
| POST | `/wa/orders/:id/advance` | `{ to_status, note? }`. Validated single-step move; each fires its WhatsApp alert. `paid` is not operator-advanceable. Refuses `dispatched` while an unwaived fee is outstanding. |
| POST | `/wa/orders/:id/waive-fee` | Waive the last-mile fee and tell the customer. 409 unless the order is awaiting one. |
| GET | `/wa/orders/:id/receipt` | 7-day signed download URL for the operator. |
| POST | `/wa/orders/:id/receipt/resend` | Regenerate and re-push the short receipt link to the customer. 409 with no settled payment. |

**Statuses:** `quoting`, `quoted`, `confirmed`, `paid`, `purchased`,
`in_kenya`, `delivery_fee_pending`, `dispatched`, `delivered`,
`cancelled`. Legal edges are declared in `utils/waOrderFlow.js`.

---

## WhatsApp — settings (`/api/wa/settings`, admin)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/wa/settings` | Current settings + `capabilities` (e.g. `stk_available`). |
| PUT | `/wa/settings` | `markup_pct`, `promo_active`, `promo_type`, `promo_message`, `default_delivery_fee_kes`, `welcome_media_urls[]`, `template_map{}`, `ai_enabled`, `ai_knowledge_base`, `ai_resume_after_minutes`, `staff_alert_numbers[]`, `staff_alert_template`. |
| GET | `/wa/settings/webhook-status` | Webhook doctor — the live sent.dm registration, recent delivery events, AI self-test. |
| POST | `/wa/settings/webhook-repair` | Re-point and re-activate the registration at this deployment. |

---

## Payments

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/admin/payments/pending` | admin | Every M-Pesa payment awaiting review, joined to the user *or* WhatsApp contact and its order. |
| POST | `/admin/payments/:id/approve` | admin | Settles via `markPaymentPaid`. Blocks a short payment unless `override_reason` (≥10 chars) is supplied; `wa_order` payments skip the SMS-paste requirement. |
| POST | `/admin/payments/:id/reject` | admin | `{ reason }` — customer can pay again. |
| GET | `/payments/methods` | public | Enabled methods and the till number. |
| POST | `/payments/lipana/webhook` | signature | Raw-body Lipana webhook. Inert while `MPESA_PROVIDER=manual`. |
| GET | `/payments`, `/payments/:id`, `/payments/me/credit`, `/payments/me/credit/ledger` | mixed | Legacy surface, kept for draining. |
| POST | `/payments`, `/payments/:id/mpesa-confirmation` | legacy | Legacy customer payment path. |

---

## Public

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/tracking/:trackingNumber` | Status-only lookup, rate-limited. Checks `wa_orders.tracking_code` first, falls back to legacy `orders.tracking_number`. |
| GET | `/r/:token` | Short receipt link. Verifies the HMAC and 302s to a freshly signed 10-minute PDF URL. 404 (HTML) on anything malformed, unknown or unsigned. |
| GET | `/api/exchange/rates` · `/convert` · `/health` | FX rates. |
| GET | `/api/app-config` | Runtime client config. |
| GET | `/sitemap.xml` · `/robots.txt` | SEO. |
| GET | `/health` | Liveness probe with DB status. |

---

## Auth (`/api/auth`)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/auth/login` | `{ email, password }` → `{ token, supabase_token, user }`. |
| GET | `/auth/me` | Current user; attaches `refreshed_token` near expiry. |
| POST | `/auth/logout` | Revokes the presented token (SHA-256 hash stored). |
| PUT | `/auth/profile` · `/auth/password` | Self-service. |
| POST | `/auth/forgot-password` · `/auth/reset-password` | Emailed one-shot token; bumps `password_changed_at`, invalidating every outstanding JWT for that user. |
| GET | `/auth/reset-context` | Metadata for the reset screen. |
| POST | `/auth/supabase-token` | Short-lived Supabase JWT for direct PostgREST access. |
| POST | `/auth/register` | **410 Gone** — no customer accounts. |
| POST | `/auth/verify-email` · `/auth/resend-verification` | Vestigial; registration is closed. |

---

## Realtime

### `GET /api/events`

SSE stream for the dashboard. Events: `wa_inbox_update`,
`wa_pipeline_update`, `wa_new_customer`.

Every event is **named**, and EventSource has no wildcard — a name with
no `addEventListener` is received and dropped in silence. The client's
list lives in `SSE_EVENTS` (`client/src/hooks/useRealtimeUpdates.js`) and
`tests/unit/sseEvents.test.js` fails if the server learns an event the
client does not listen for. All three names above were missing from that
list until 2026-08-20, which is why the inbox needed a manual refresh.

```bash
curl -N -H "Authorization: Bearer <sc_token>" https://thapsus.uk/api/events
```

---

## Admin

`/api/admin/*` keeps user management, error logs, exchange rates and the
legacy order/transaction surfaces. `/ops/team` uses the users and
error-log endpoints; the rest exists to finish pre-WhatsApp work and has
no screen behind it.

---

## Legacy drain — operator only

`/api/orders` (GET/PUT only — **`POST` is 410 Gone**) and `/api/parcels`.
`/api/ops/*` was removed with the warehouse console it served. These
retire once the last pre-WhatsApp order is delivered.

---

## Smoke checks

```bash
curl -s https://thapsus.uk/health | jq

curl -s -X POST https://thapsus.uk/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | jq '{token}'

curl -s -H "Authorization: Bearer $T" https://thapsus.uk/api/wa/settings/webhook-status | jq

curl -s https://thapsus.uk/api/tracking/TRK-8821 | jq

curl -i https://thapsus.uk/r/not-a-real-token       # expect 404 HTML, not the SPA
```
