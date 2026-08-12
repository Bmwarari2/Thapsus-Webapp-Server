# Cutover runbook — WhatsApp-first lean rebuild

Everything in this branch is live-ready; the steps below flip production
onto it. Each step is safe on its own; do them in order.

## Already done (no action needed)

- ✅ Migration `0004_wa_core.sql` applied to the live Supabase project
  (additive only; recorded in `_migrations`; drift snapshot regenerated).
- ✅ Private storage buckets created: `receipts` (PDF receipts) and
  `wa-media` (operator inbox attachments).
- ✅ Legacy customer-facing writes now 410: `/api/auth/register`,
  `/api/auth/verify-email`, `/api/auth/resend-verification`,
  `POST /api/orders`. Operator surfaces for draining in-flight orders
  stay live (`/ops` legacy console, admin orders/payments).

## 1. Deploy this branch

Railway service **Thapsus** (project *Thapsus-UK*) currently deploys from
branch `feature/ai-shopping-assistant`. To cut over, change the service's
source branch to this branch (or merge to `main` and point at `main`):
Railway dashboard → Thapsus service → Settings → Source → Branch.

The build command and healthcheck are unchanged; the deploy is a normal
rolling restart. The new code runs fine with the WhatsApp env vars still
missing — sends are recorded as `failed` in the inbox instead of crashing
— so deploy order vs. step 2/3 doesn't matter.

## 2. sent.dm credentials (needs your API key)

1. Set on Railway (Thapsus service → Variables):
   - `SENTDM_API_KEY` = your `sk_live_…` key from the sent.dm console.
2. Register the inbound webhook (after the deploy is live):
   ```bash
   SENTDM_API_KEY=sk_live_… node scripts/register-sentdm-webhook.mjs https://www.thapsus.uk
   ```
   The script prints the webhook **signing secret** (`whsec_…`) — shown
   only once. Set it on Railway as:
   - `SENTDM_WEBHOOK_SECRET` = the printed `whsec_…` value.
3. Redeploy (Railway redeploys automatically when variables change).

## 3. End-to-end smoke test

Send a WhatsApp message from a test phone to the business number:

1. New number → welcome message + name/address/M-Pesa prompts arrive,
   finishing with a `TC-####` customer code. The contact appears in
   `/ops/inbox` with a live badge.
2. Send a product link → in `/ops/inbox`, "New order" → enter a USD
   price → quote lands on WhatsApp.
3. Reply `YES` → confirmation + payment prompt; run an STK push from the
   order screen (small KES amount) → on payment: tracking code + PDF
   receipt arrive; order card moves to **Paid**.
4. Advance through Purchased → In Kenya → Dispatch → Delivered and watch
   each WhatsApp alert.
5. Text the tracking code from the test phone → automatic status reply.

## 4. WhatsApp message templates (recommended, not blocking)

Free-form replies work inside WhatsApp's 24-hour customer-service window
(true whenever the customer messaged you recently). Status alerts that
fire **outside** that window (e.g. "arrived in Kenya" days later) need
pre-approved templates:

1. Create templates in the sent.dm console for: welcome, quote,
   payment_prompt, payment_received, receipt (with a *document* header),
   purchased, arrived_fee, arrived_waived, dispatched, delivered.
2. Once approved, map them in `/ops/settings` → "sent.dm template map",
   e.g. `{ "purchased": "tc_purchased_v1", … }`. Unmapped keys keep
   falling back to free-form text.

## 5. Post-deploy cleanup (after the deploy is verified)

Remove now-dead Railway variables (nothing in the new code reads them):
`STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`,
`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
`WHATSAPP_BUSINESS_PHONE_NUMBER_ID`, all `WHATSAPP_TEMPLATE_*`,
`ENABLE_WHATSAPP_NOTIFICATIONS`, `OPENAI_API_KEY`, `R2_*`, `REDIS_URL`,
`RESEND_API_KEY`, `SMTP_*`, `EMAIL_FROM`, `MPESA_CALLBACK_*`,
`MPESA_ENV`, `NPM_CONFIG_PRODUCTION`, `WEB_BASE_URL`.

Keep: `ADMIN_*`, `APP_*`, `CORS_ORIGIN`, `DATABASE_URL`, `GMAIL_*`
(password-reset email), `JWT_SECRET`, `LIPANA_*`, `MPESA_PROVIDER`,
`MPESA_TILL_NUMBER`, `NODE_ENV`, `SITE_URL`/`FRONTEND_URL`/`APP_URL`,
`SUPABASE_*`, plus the new `SENTDM_*`.

## 6. Draining the legacy pipeline

In-flight pre-WhatsApp orders keep working: operators finish them via the
legacy console (`/ops`) and the admin dashboard; Lipana webhooks and the
admin payment queue still settle their payments; `/track` still resolves
old `TC-YYYYMMDD-…` numbers. Once the last legacy order is delivered,
routes `orders.js` / `parcels.js` / `ops.js`, the legacy branches of
`markPaymentPaid`, and the old tables can be retired (tracked as the
final cleanup stage — ask for "stage F cleanup" when ready).
