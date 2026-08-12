# The WhatsApp-first rebuild

What changed, why, and what it means operationally. This document covers
the rebuild of Thapsus Cargo from a multi-portal logistics platform into
a WhatsApp-first parcel-forwarding service with a small operator
dashboard behind it.

Companion documents: [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the
system works now, [`API_REFERENCE.md`](./API_REFERENCE.md) for the
endpoint surface, [`CUTOVER.md`](./CUTOVER.md) for the deploy runbook.

---

## 1. Why

The platform had grown to roughly 39 routers, 250+ endpoints, 62 tables
and 55 SPA pages spanning a customer portal, an influencer programme, a
referral scheme, a clearing-agent portal, a rider portal, a finance
module, consolidation flows, a buy-for-me concierge product, a ticketing
system and two payment providers. Almost none of it was load-bearing for
the actual business, which is: someone in Kenya sends a link to a product
abroad, we buy it, we ship it, they pay by M-Pesa, we deliver it.

Customers were already doing that over WhatsApp. The rebuild makes
WhatsApp the product surface rather than a side channel, and reduces the
web app to the tool operators use to run the pipeline behind it.

**Net effect:** 348 files changed, +8,620 / −65,020 lines.

---

## 2. The customer journey, end to end

All four phases happen inside one WhatsApp conversation. The customer
never sees a login screen, and there is no customer-facing web account
any more.

### Phase 1 — Onboarding

A first message from an unknown number creates a `wa_contacts` row in
state `new`. The assistant welcomes them, explains the service, and
collects three things in whatever order the conversation produces them:
full name, Kenyan delivery address, and the M-Pesa number they will pay
with. When all three are present the contact is issued a permanent
**Customer Code** (`TC-1042`, `TC-1043`, …) and moves to state `active`.
Operators are notified in the dashboard over SSE and on WhatsApp via the
staff-alert template.

The M-Pesa number is the one hard gate: it is validated by
`normalizeKenyanPhone` regardless of what the assistant extracted, and a
value that doesn't normalise is never stored.

### Phase 2 — Quoting

The customer sends one or more product links. An operator opens the
conversation, creates an order, and enters the item price in USD. The
server does the arithmetic — it never trusts a client-supplied total:

```
quote_kes = round(usd_price × live_USD_KES_rate × (1 + markup_pct / 100))
```

The live rate comes from the `USD_KES` row that `utils/fxRefresh.js`
upserts daily from frankfurter.dev; `markup_pct` comes from
`wa_settings` and defaults to 10. All three inputs plus the result are
snapshotted onto the order row, so a rate move tomorrow can't retroactively
change what a customer was quoted today. The quote is sent to WhatsApp
with the breakdown shown.

### Phase 3 — Payment and procurement

The customer replies `YES` (or `sawa`, `ndio`, `ok`, `poa`, `1`, …). That
flips the order to `confirmed`, **opens an `awaiting_review` payment
row**, and sends Buy Goods till instructions.

M-Pesa STK Push is not available: Lipana withdrew the service for
regulatory reasons, so production runs `MPESA_PROVIDER=manual`. Every
payment is a till transfer that a person verifies against the M-Pesa
statement. The code still contains the working Lipana STK path behind
that flag, so it can be turned back on if a provider becomes available.

When the customer says they've paid, the assistant does not improvise:
it replies that the payment is being verified, stamps the M-Pesa
reference onto their open payment row, and pages staff. An admin then
approves it from `/ops/payments` or the order screen. Approval is what
mints the **Tracking Code** (`TRK-8821`, …), sends it to the customer,
and generates the PDF receipt.

The operator buys the item abroad using `Name — TC-1042` as the shipping
address, so the parcel identifies itself on arrival.

### Phase 4 — Transit and delivery

Operators advance the order through `purchased → in_kenya → dispatched →
delivered`, each step firing its own WhatsApp message. Parcel labels are
printed from the order screen (100 × 150 mm thermal, Code128 barcode) and
can be scanned back with the camera scanner or a USB wedge.

On arrival in Kenya the **promo toggle** decides what happens:
`promo_active` with `promo_type=waive_fee` waives the last-mile fee, tells
the customer, and leaves the order dispatchable. Otherwise the order goes
to `delivery_fee_pending` and the customer is asked for the fee. It can
also be waived per-order from the dashboard.

At any point the customer can text their tracking code and get a live
status reply with no operator involved.

---

## 3. What was removed

Deleted outright — routers, utils, client pages, tests and dependencies:

| Area | What went |
| --- | --- |
| Finance | `routes/finance.js`, `utils/financeSync.js`, the whole finance dashboard |
| Influencer / referral | `influencer.js`, `influencerPortal.js`, `referral.js`, partner portal pages, visitor analytics |
| Clearing agent | `customs.js`, `agentInvoices.js`, `amlFlags.js`, the agent portal |
| Rider | `lastMile.js` and the rider portal |
| Consolidation | `consolidation.js`, `consolidationsV2.js`, `customerConsolidations.js` |
| Buy-for-me | `buyForMe.js` and its customer surfaces |
| Support | `tickets.js` |
| Compliance surfaces | `dsar.js`, `accountDeletion.js`, `nps.js`, `insurance.js` |
| Metrics | `kpi.js` |
| Pricing engine | `pricing.js`, `pricingTiers.js` and the six-knob model |
| Notifications | `push.js`, `notifications.js`, `webpush.js`, the PWA outbox |
| Payments | Stripe entirely — SDK, Elements, webhook, CSP entries |
| Dead trees | `client/src/_legacy/` (18.7k lines), `_legacy/`, archived migrations (4.6k) |

Customer self-registration and legacy order creation are **410-stubbed**
rather than deleted, so an old client gets an explicit "orders are placed
on WhatsApp now" instead of a confusing 404.

**No tables were dropped.** Retired tables are left in place, untouched.
Renaming or dropping them would break the drift tooling for no
operational gain, and in-flight legacy orders still read from them.

### Still mounted, deliberately

`routes/orders.js`, `parcels.js`, `ops.js`, a trimmed `admin.js` and
`adminPayments.js` remain so operators can finish pre-WhatsApp orders.
`/api/tracking/:code` checks `wa_orders.tracking_code` first and falls
back to legacy `orders.tracking_number`. These retire in a final cleanup
pass once the last legacy order is delivered — ask for "stage F cleanup".

---

## 4. What was added

### Schema — migrations `0004` and `0005`

Both are additive only and are already applied to production.

| Table | Purpose |
| --- | --- |
| `wa_contacts` | One row per WhatsApp number: profile, `customer_code`, onboarding `state`, unread counters, conversation head, AI memory |
| `wa_messages` | Full transcript both directions, `provider_message_id` unique for inbound dedupe and delivery-status updates |
| `wa_orders` | The order: product links, quote snapshot (`usd_price`, `fx_rate`, `markup_pct`, `quote_kes`), `tracking_code`, status, delivery fee, receipt path, per-status timestamps |
| `wa_order_events` | Append-only audit trail of every status move and who made it |
| `wa_settings` | Operator-editable key/value: markup, promo, default fee, welcome media, template map, AI toggle + knowledge base, staff alert numbers |

Sequences `wa_customer_code_seq` (from 1042) and `wa_tracking_code_seq`
(from 8821) mint the public codes. `payments` was extended rather than
duplicated: `user_id` is now nullable, `wa_contact_id` was added, the
`target_kind` check accepts `'wa_order'`, and a CHECK enforces that a
payment belongs to either a user or a WhatsApp contact.

Migration `0005` added `human_takeover_at`, `ai_summary` and
`ai_summary_at` to `wa_contacts`.

### WhatsApp transport — `utils/sentdm.js`

sent.dm v3 client: send text, send template, fetch message and delivery
activities, verify inbound webhook signatures, manage the webhook
registration. Every provider assumption in the codebase lives in this one
file.

Two behaviours here were learned the hard way and are worth knowing:

- **Free text rides a system template.** WhatsApp forbids newlines, tabs
  and runs of four or more spaces inside template variables, so any
  multi-line body is rejected with `VALIDATION_008` and retried with the
  line breaks flattened into ` · ` separators. After the first rejection
  the client flattens up front rather than paying a wasted round-trip on
  every subsequent message. **All customer-facing copy is written to read
  correctly once flattened.**
- **Webhook payload semantics.** `inbound_number` is the external sender
  and `outbound_number` is our own line — the opposite of what the names
  suggest at a glance. The sender is resolved authoritatively via
  `GET /v3/messages/{id}`, with `inbound_number` as a fallback.

Signatures are Svix-style: `x-webhook-id`, `x-webhook-timestamp`,
`x-webhook-signature`, HMAC-SHA256 over `${id}.${ts}.${rawBody}`, ±300s
tolerance. The webhook mounts before `express.json()` with the raw body
preserved, and ACKs before running bot replies so a slow reply can't
cause a provider retry.

### The dispatcher — `utils/waStateMachine.js`

Everything that happens on an inbound message, in strict order. Money and
state run **before** the AI is ever consulted and stay fully
deterministic:

1. **Human takeover check** — is the assistant paused on this chat?
2. **Onboarding** — anything not yet `active`
3. **Tracking auto-reply** — a `TRK-####` in the message
4. **Quote confirmation** — a yes-like reply against exactly one quoted order
5. **Payment claim** — "I've paid" or a pasted M-Pesa SMS
6. **AI fall-through** — everything else

Conversation state lives entirely on `wa_contacts.state`. There are no
in-memory sessions, so a deploy or restart never loses a customer
mid-signup.

### The assistant — `utils/waAi.js`

Gemini via Google AI Studio, hard-gated away from money. It answers from
an operator-maintained knowledge base plus a live summary of that
customer's own orders, and it drives onboarding conversationally from the
very first message.

It is never allowed to quote a price, confirm an order or a payment,
promise a delivery date, or claim an action was taken — those paths run
before it. It has durable memory: a rolling summary of the conversation
is regenerated in the background every 20 messages so it still recalls
what was said after the verbatim window scrolls past.

The model is **discovered** from the ListModels API rather than
hardcoded, with a 6-hour cache and 404 self-healing. Google retires model
names on a rolling basis and a stale default takes the assistant down —
this happened in production with `gemini-2.5-flash`.

The assistant declines in two distinct ways, which matters more than it
sounds:

- **`HANDOFF`** — a person is needed. Complaints, refunds, a request for a
  human, or a question about our service it can't answer. Acknowledges the
  customer, hands the thread over, pages staff.
- **`OFF_TOPIC`** — nothing to do with this business. A wrong number, a
  general-knowledge question, a joke. Says what we do handle, at most once
  an hour per contact, and stops. No alert, no takeover, still live for
  their next real message.

Collapsing these into one outcome meant every stray text paged an
operator and muted the bot for two hours. Both entry points return a
tagged `{kind, text}` through a shared `classifyReply()`, so a control
sentinel can never be mistaken for a message and sent to a customer.

### Human takeover

When an operator replies — or the assistant hands off — the assistant
goes quiet on that conversation so the customer isn't answered by two
voices. It resumes by itself after `ai_resume_after_minutes` of silence
(default 120), or the moment an operator flips it back on from the inbox.
Deterministic replies keep working throughout; only the AI chat pauses.
The check runs ahead of everything else, so a handed-over signup silences
the questionnaire too.

### Staff alerts — `utils/waStaffAlert.js`

The approved `Staff_Alert` WhatsApp template, sent to the numbers in
`wa_settings.staff_alert_numbers`, with 5-minute deduplication. Fires on:
new customer onboarded, quote confirmed, payment claimed, and customer
needs a human. Never throws — a failed alert can't break a conversation.

### Payments — `utils/waPayments.js`

One rule: the moment a customer owes money, an `awaiting_review` payment
row exists for it. Get-or-create is shared by the quote-confirmation
path, the operator's "send till instructions" button and the "payment
received" action, so no two of them can create duplicate rows.

Approval runs through the same `markPaymentPaid` state machine the legacy
flow uses, which mints the tracking code inside the same transaction that
flips the order to paid, then sends the code and the receipt post-commit.

### Receipts and labels

`utils/receiptPdf.js` renders an A5 invoice-style receipt with pdfkit —
brand rail, receipt number, PAID stamp, billed-to and order columns, an
itemised table splitting goods from service using the quote snapshot,
totals, and a delivery progress strip. A5 rather than A4 because every
one of these is opened on a phone from a WhatsApp link.

It is stored in the private Supabase Storage bucket `receipts` and
delivered as a **short link**: `https://thapsus.uk/r/TRK-8821.<sig>`.
`utils/receiptLink.js` mints a stateless token — tracking code plus a
truncated HMAC over the order id, keyed on `JWT_SECRET` — and
`GET /r/:token` verifies it and redirects to a freshly signed 10-minute
URL. Because it re-signs on each click the link never expires, which the
old 7-day signed URL did. Nothing is stored, so there was no migration.

`PrintableParcelLabel.jsx` follows the standard shipping-label
convention: ruled outer box, a boxed TO: block sized to be read at arm's
length, a two-column code grid, and a Code128 barcode across the bottom
with its digits printed underneath. Pure black on white — thermal
printers have no greys.

### Operator dashboard

Five screens under `/ops`, all behind the operator role:

| Screen | What it does |
| --- | --- |
| `/ops/inbox` | Unified WhatsApp inbox — conversations, unread badges, live SSE, composer with media upload, per-chat AI toggle, "create order from link" |
| `/ops/pipeline` | Five-column board (Quoting / Paid / Purchased / In Kenya / Delivered), global `TC-`/`TRK-` search, camera scanner |
| `/ops/orders/:id` | Quote entry with live KES preview, payment actions, status advance, fee settle/waive, receipt, printable label |
| `/ops/payments` | Manual M-Pesa approval queue (admin) — the pipeline's real bottleneck, so it gets its own screen and nav item |
| `/ops/settings` | Markup, promo toggle, default fee, welcome media, template map, AI toggle + knowledge base, staff alert numbers, webhook doctor (admin) |

The public site keeps the home page, public tracking, FAQ, articles,
legal pages and operator login. Everything else is gone.

---

## 5. Behaviour decisions worth knowing

These are the calls that aren't obvious from reading the code, recorded
so they don't get "fixed" by accident.

**No emojis anywhere a customer can see.** Removed from the state
machine, the pipeline alerts, the quote and till instructions, the PDF
receipt, all 13 templates and the homepage WhatsApp prefill. The
assistant's guardrails forbid them too, so the model can't reintroduce
what the templates dropped. Operator dashboard chrome keeps its icons.

**A tracking code gets the parcel's current state, in plain words.** Not
a status label plus a progress bar plus a next-step line plus the amount
paid — that restated the same fact three times and buried it, and
flattening turned it into a smear. Each status owns its own wording:

```
TRK-8822 — your item was purchased on 12 August and is on its way to our
facility. We'll message you as soon as it lands in Kenya.
```

**Only unambiguous cases are automated.** A yes-like reply confirms a
quote only when the contact has *exactly one* order awaiting
confirmation. Zero or several, and it goes to a human.

**Last-mile delivery is 24 hours**, not "1–2 business days".

**Payment claims never reach the AI.** "I have paid" used to fall through
to Gemini, which read it as a complaint and replied "let me get a
colleague" — the worst possible answer to someone who has just sent
money. It's now handled deterministically, with the reassurance sent at
most once per 30 minutes so a two-message burst doesn't double-reply.

**The payment-claim matcher is deliberately narrow.** It does not match
bare `sent` or `lipa`, which fired on "I sent the link" and on our own
"Lipa na M-Pesa" instructions quoted back at us. A false positive here
silences the assistant.

---

## 6. Operational notes

### Environment

New variables: `SENTDM_API_KEY`, `SENTDM_WEBHOOK_SECRET`,
`SENTDM_BASE_URL` (optional), `GEMINI_API_KEY`, `GEMINI_MODEL`
(optional — leave unset to let discovery run), `MPESA_PROVIDER=manual`,
`MPESA_TILL_NUMBER`.

`SITE_URL` must be the apex domain the app actually serves — receipt
links are built from it. A leading `www.` is stripped automatically
because that host is not served, which is what broke the original
webhook registration.

Dead variables to remove are listed in [`CUTOVER.md`](./CUTOVER.md) §5.

### Supabase Storage

A **private** bucket named `receipts` must exist. Receipts are written to
`receipts/<orderId>/<paymentId>.pdf` with upsert, so a retry overwrites
rather than duplicating.

### WhatsApp templates

Free-form replies work inside WhatsApp's 24-hour customer-service window,
which covers every reply to a customer message. Business-initiated
messages outside that window need approved templates.
`sentdm-templates.json` holds all 13 ready to upload; once approved, map
them in `/ops/settings` → template map. Unmapped keys keep falling back
to free text.

### Verification

Every change runs `npm test`, `npm run check:drift -- --snapshot` and
`npm run build`. The WhatsApp layer is covered by unit tests for the
state machine (61 cases: onboarding edges, tracking formats, confirmation
ambiguity, payment claims, takeover and resume, both AI sentinels),
the sentinel classifier, order flow transitions, code minting, sent.dm
signature verification, receipt rendering and receipt links, plus an
`appBoot` test pinning the `/r/` route above the SPA fallback.

### Known limitation

sent.dm cannot currently deliver to UK numbers — messages are accepted
and then fail downstream. This is a sender-routing restriction on their
side, not a code bug. Kenyan numbers deliver normally.

---

## 7. Change log

Commits are on `claude/thapsus-cargo-simplify-jl983m`, oldest first.

| Stage | Commits | What |
| --- | --- | --- |
| A | `9827d65` | Delete dead code — legacy trees, archived migrations, stale docs (~27k lines) |
| B | `0ebc921`, `84e7283` | Remove dropped modules; drop unused deps and env surface |
| C | `4f261b4`, `524f34a`, `55fee26`, `831ad4d` | Migration 0004; sent.dm client, webhook, state machine; orders, quoting, payments, receipts, inbox, settings |
| D | `7432dd8` | WhatsApp-first operator dashboard + public site rework |
| E | `db35326`, `ccba36a` | Cutover: retire self-registration, close legacy intake, webhook registrar + runbook |
| Live fixes | `fa92b8c`, `a2a51d7`, `a86cee8`, `32cf058`, `b178efc`, `26f7fc4`, `57cfcc0` | Inbound ingestion, sender resolution, webhook doctor, free-text template rules, template pack |
| AI | `0eeb0d0`, `d337ac1`, `f131e20`, `59ac2ed` | Gemini assistant; AI-first onboarding; model discovery; live order context |
| Ops reality | `b45cf55`, `862dd9b` | Manual payments + staff alerts; handoff acknowledgement, takeover, AI memory |
| Polish | `624cc3a`, `006a590`, `7888a8c`, `a1ef0e3` | Payment verification reply + approval path; no emojis, short receipt links, 24h delivery; structured tracking reply, label and receipt redesign; OFF_TOPIC vs HANDOFF |
