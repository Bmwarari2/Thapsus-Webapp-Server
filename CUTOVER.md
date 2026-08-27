# Cutover runbook — WhatsApp-first lean rebuild

**The cutover is done.** Production runs the WhatsApp-first system from
`main`; Railway auto-deploys on merge. This file is kept as the record of
what was flipped and as the checklist for anyone rebuilding the same
setup from scratch (a staging project, a new Railway service).

For how the system works, read [`ARCHITECTURE.md`](./ARCHITECTURE.md);
for what changed and why, [`REBUILD.md`](./REBUILD.md).

## Done in production

- ✅ Migrations `0004`–`0018` applied to the live Supabase project
  (additive only; recorded in `_migrations`; drift snapshot regenerated).
  `RUN_MIGRATIONS_ON_BOOT=true` is set permanently, so each deploy
  applies anything missing before serving.
- ✅ Private storage buckets created: `receipts` (PDF receipts) and
  `wa-media` (inbox attachments, both directions).
- ✅ Legacy customer-facing writes 410: `/api/auth/register`,
  `/api/auth/verify-email`, `/api/auth/resend-verification`,
  `POST /api/orders`.
- ✅ Railway service **Thapsus** (project *Thapsus-UK*) deploys from
  `main`. The warehouse console (`/ops`) and the old admin dashboard
  (`/admin`) were retired in August 2026; both URLs redirect.
- ✅ sent.dm credentials set (`SENTDM_API_KEY`, `SENTDM_WEBHOOK_SECRET`)
  and the inbound webhook registered against the apex host.
- ✅ Eleven WhatsApp templates mapped — every slot the code can send.
  See "Templates" below for which are `tc_`-prefixed and which are not.

## Rebuilding this from scratch

### 1. Deploy

Point the Railway service at `main`. The build command and healthcheck
are unchanged; the deploy is a normal rolling restart. The code runs with
the WhatsApp env vars missing — sends are recorded as `failed` in the
inbox instead of crashing — so deploy order vs. step 2 doesn't matter.

### 2. sent.dm credentials

1. Set on Railway (Thapsus service → Variables):
   - `SENTDM_API_KEY` = the `sk_live_…` key from the sent.dm console.
2. Register the inbound webhook (after the deploy is live):
   ```bash
   SENTDM_API_KEY=sk_live_… node scripts/register-sentdm-webhook.mjs --url https://thapsus.uk/api/wa/webhook
   ```
   The script prints the **signing secret** (`whsec_…`) — shown only
   once. Set it on Railway as `SENTDM_WEBHOOK_SECRET`.
3. Redeploy (Railway redeploys automatically when variables change).

Use the **apex** host. A `www.` endpoint is not served and the
registration sits in `RETRYING` with a null status code. `/ops/settings`
has a webhook doctor that shows the live registration and recent
delivery attempts, and can re-point it.

### 3. Storage buckets

Two **private** Supabase Storage buckets, created in the dashboard:

| Bucket | Holds | Delivered as |
| --- | --- | --- |
| `receipts` | `<orderId>/<paymentId>.pdf` | `GET /r/:token` → freshly signed 10-minute URL |
| `wa-media` | inbox attachments, both directions | `GET /m/:token` → freshly signed URL |

Both links are stateless — the token is a path plus a truncated HMAC
keyed on `JWT_SECRET` — so they re-sign on every click and never expire.
Neither bucket is publicly readable.

### 4. End-to-end smoke test

Send a WhatsApp message from a test phone to the business number:

1. New number → the assistant opens with what we do and what we charge,
   and invites a product link. It does **not** ask for a name yet. The
   contact appears in `/ops/inbox` with a live badge.
2. Send a product link → staff are paged on WhatsApp and a sticky toast
   appears in the inbox. The assistant asks for the full name, then the
   Kenyan delivery address, while the quote is being prepared. Both
   present mints the `TC-####` customer code.
   A SHEIN *product* link (no `shc=`) gets asked for the cart link
   instead — that branch is deterministic and fires before the AI.
3. In `/ops/inbox`, "New order" → open the order screen, set the
   delivery method (delivery or collection) → enter a USD price → the
   quote lands on WhatsApp with the last-mile fee already in the total
   for delivery orders.
4. Reply `YES` → confirmation + Buy Goods till instructions. The order
   opens an `awaiting_review` payment straight away, so it shows up in
   **/ops/payments**. Pay the till, reply "I have paid" (the bot answers
   that it is being verified and pages staff), then approve it — from
   `/ops/payments` or the **Payment received** button on the order
   screen. Tracking code + receipt link arrive; the card moves to
   **Paid**. The receipt link is short (`/r/TRK-8821.<sig>`) and
   re-signs on each click, so it never expires — check it opens. It is
   built from `SITE_URL` (falling back to `APP_URL`/`FRONTEND_URL`), so
   that must be the apex domain the app actually serves.
5. Advance through Purchased → In Kenya and watch the arrival message.
   A delivery order whose fee was quoted with it arrives as *paid*; a
   collection order gets the office address and opening hours, and its
   only button is **Mark as collected** — no dispatch, no delivery
   notification.
6. Advance a delivery order through Dispatch → Delivered. Assign a
   Pickup Mtaani agent first and the dispatch message names that point
   instead of promising a rider at the door.
7. Text the tracking code from the test phone → automatic status reply,
   worded for collection or delivery as appropriate.
8. Send an image from the test phone → it renders in the inbox thread
   behind a `/m/` link, not as a broken attachment.

### 5. Templates

Free-form replies work inside WhatsApp's 24-hour customer-service window
(true whenever the customer messaged you recently). Anything that fires
**outside** it needs a pre-approved template — and arrival, dispatch and
receipt land two to three weeks after the customer last wrote in, so
their window is always shut.

`sentdm-templates.json` is generated from `utils/waTemplateVars.js` by
`scripts/gen-templates.mjs` and holds all eleven bodies ready to upload
(channel: whatsapp, language: en, category: UTILITY). After approval,
map key → name in `/ops/settings` → "sent.dm template map".

Currently mapped (the defaults in `utils/waSettings.js`, so a fresh
install sends real templates rather than free text):

| Slot | Template name |
| --- | --- |
| `quote` | `Quote_Ready` |
| `payment_prompt` | `Payment_Reminder` |
| `payment_received` | `Payment_Received` |
| `purchased` | `Order_Purchased` |
| `delivered` | `Delivered` |
| `receipt` | `tc_receipt` |
| `dispatched` | `tc_dispatched` |
| `arrived_fee` | `tc_arrived_fee` |
| `arrived_waived` | `tc_arrived_waived` |
| `arrived_paid` | `tc_arrived_paid` |
| `arrived_collect` | `tc_arrived_collect` |

The five non-`tc_` names predate the generated manifest and keep the
names they were approved under. The six `tc_` names were approved from
`sentdm-templates.json`, so their bodies match `TEMPLATE_SLOTS`
character-for-character.

**A stored map is merged OVER these per key, never swapped in for them.**
Production once held a four-key map written before most templates were
approved; a wholesale replace made the other seven resolve to nothing,
and every one of those sends went out as free text and was refused
outside the window. To deliberately disable a slot, map it to an empty
string.

**`tc_arrived_waived` is classified MARKETING by Meta**, so it can be
refused for anyone who has opted out of marketing messages. It only
fires when the promo toggle waives the delivery fee — off at present —
but if that is turned back on, expect some arrivals not to land.

Two rules Meta enforces, both learned the hard way: a body may not end
in a variable, and a variable may not be the whole of a URL. That is why
the receipt body writes the domain itself — "…ready at
thapsus.uk/r/{{2}}" — and takes the bare token. `utils/waTemplateVars.js`
holds the approved copy beside each variable ordering, and the ordering
is the entire contract: the names mean nothing to sent.dm, only the
positions.

## Environment variables

Removed as dead (nothing in the code reads them): `STRIPE_*`, `VAPID_*`,
`WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`,
`WHATSAPP_BUSINESS_PHONE_NUMBER_ID`, all `WHATSAPP_TEMPLATE_*`,
`ENABLE_WHATSAPP_NOTIFICATIONS`, `OPENAI_API_KEY`, `R2_*`, `REDIS_URL`,
`RESEND_API_KEY`, `SMTP_*`, `EMAIL_FROM`, `MPESA_CALLBACK_*`,
`MPESA_ENV`, `NPM_CONFIG_PRODUCTION`, `WEB_BASE_URL`.

In use: `ADMIN_*`, `APP_*`, `CORS_ORIGIN`, `DATABASE_URL`, `GMAIL_*`
(operator password-reset email only — no customer mail is sent, and new
staff accounts are created with a temporary password rather than an
invitation), `JWT_SECRET`, `LIPANA_*`, `MPESA_PROVIDER`,
`MPESA_TILL_NUMBER`, `NODE_ENV`, `SITE_URL` (apex domain — receipt and
media links are built from it), `FRONTEND_URL`/`APP_URL`, `SUPABASE_*`,
`SENTDM_*`, `GEMINI_API_KEY` (leave `GEMINI_MODEL` unset — the model is
discovered).

## Draining the legacy pipeline

In-flight pre-WhatsApp orders keep working: operators finish them from
the admin surfaces, Lipana webhooks and the admin payment queue still
settle their payments, and `/track` still resolves old
`TC-YYYYMMDD-…` numbers. Once the last legacy order is delivered,
`routes/orders.js` / `parcels.js`, the legacy branches of
`markPaymentPaid`, and the old tables can be retired (the final cleanup
stage — ask for "stage F cleanup" when ready).
