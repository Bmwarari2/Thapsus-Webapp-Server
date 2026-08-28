# CLAUDE.md

Working notes for anyone — human or agent — making changes here. For how
the system works read [`ARCHITECTURE.md`](./ARCHITECTURE.md); for what
changed and why, [`REBUILD.md`](./REBUILD.md); for the endpoint surface,
[`API_REFERENCE.md`](./API_REFERENCE.md).

## What this is

Thapsus Cargo: a Kenyan parcel-forwarding service run almost entirely
through one WhatsApp conversation. A customer sends a product link, an
operator quotes it in KES, the customer pays an M-Pesa Buy Goods till,
and we buy the item abroad and get it to them. This repo is the Express 5
API behind that conversation plus the React dashboard operators work the
pipeline in.

The customer never sees a web app. Almost every change here is felt as a
WhatsApp message.

## Stack

- **Node 22**, Express 5, ES modules throughout (`"type": "module"` — no
  `require`).
- **Postgres on Supabase** via a raw `pg` pool. No ORM. Migrations under
  `database/migrations/`, applied on boot in production.
- **React 19 + Vite + Tailwind 3** in `client/`, served as a SPA.
- **sent.dm** for WhatsApp, **Gemini** (Google AI Studio) for the
  assistant, **M-Pesa** manual Buy Goods till (`MPESA_PROVIDER=manual`;
  Lipana STK is coded but off).
- **Vitest** for tests, Playwright for the browser money paths.

## Commands

```sh
npm test                     # unit + smoke; integration self-skips without TEST_DATABASE_URL
npm run test:watch           # local loop
npm run check:drift:snapshot # code SQL vs database/schema-snapshot.json — CI fails on drift
npm run migrate              # apply pending migrations
cd client && npm run build   # the SPA must build before you claim done
```

CI runs five checks on every PR: unit + smoke, e2e (browser money
paths), integration (prod-mirror Postgres), lighthouse a11y, CodeQL.

## The rules that actually bite

**Money and state resolve before the AI is consulted.** Quoting,
confirmation, payment, tracking and status moves are deterministic code
paths. The assistant only ever gets what is left. Never move one of
those decisions into a prompt.

**`Number(null)` is `0`, and it has cost real money three times here** —
on `markup_pct`, `default_delivery_fee_kes` and `delivery_fee_kes`.
Anywhere a number can be absent, check absence explicitly, never by
falsiness. `utils/waQuote.js` exists largely because of this.

**A rule cheap enough to enforce in code does not belong only in a
prompt.** `looksLikeName()` rejects greetings and sentences because the
model once turned "Hi" into a customer's name. `claimsQuoteInFlight()`
stops a reply promising a quote nobody is preparing. The prompt says
both too — the code is what makes it true on a bad day.

**Tell the model what is true, don't let it infer.**
`conversationFacts()` looks up whether a link arrived and whether
anything has been quoted since, because a transcript shows what was
*said* and only the system knows what *is*. A customer was once told
"your quote is being worked out" having sent nothing.

**Measure the interval the customer can see.** The first version of that
fact keyed on an order sitting at `quoting` — a status 13 of 24 orders
never occupied, because the operator creates the order already priced.
The customer's wait starts when they send the link. Getting this wrong
would have suppressed a true, converting reply.

**Check the output, not just the prompt.** `falseClaimIn()` rejects a
promised quote nobody is preparing and any money figure the turn's own
context cannot account for. "Never price a specific item" was in the
prompt three times and in code zero times, and the assistant sent a real
customer a payment instruction with an amount and the till number.

**A rule that forbids the right answer is worse than no rule.** A
guardrail written to stop the assistant inventing payment instructions
also stopped it giving real ones, and told it to say the details were
coming instead — so a customer with KSh 17,746 confirmed asked how to pay
four times and waited for a message nothing was going to send. If the
customer is owed an answer we hold, answer it in code and hand the model
the fact, rather than forbidding the subject.

**Never let a reply promise a message behind it.** There is no second
message. "Our team will send it", "the details will arrive shortly" —
each is a customer left waiting. HANDOFF is the one exception, because
saying it actually fetches a person.

**A guard that fires wrongly is worse than no guard.** `claimsQuoteInFlight()`
once matched "your quote is ready" — a true statement about a quote that
already exists — and escalated the customers closest to paying. Separate
what is happening now from what is promised later, and test both
directions: the must-catch list and the must-not-catch list.

**Free text beats templates inside the 24-hour window, and only inside
it.** WhatsApp refuses free text outside the window, so every logical
message key must map to an approved template — a test enforces that every
slot is mapped. Getting this backwards silently stripped the till number
out of payment prompts.

**A recurring job asks the database, not the clock.** The FX refresh ran
on a 24-hour `setInterval` that never fired once — every deploy replaces
the container and resets the timer. It now ticks every 30 minutes and
refreshes only when the stored rates are actually stale. Any timer longer
than the gap between deploys is a timer that does not exist.

**Staff reminders fire once per condition, with a mute.** Repeating
alerts got ignored, which is worse than none. Claim before you page.

**Never advance an order or send a customer message to test something.**
Status moves fire real WhatsApp messages to real people.

## Schema changes

1. Write `database/migrations/NNNN_name.sql`, additive and idempotent
   (`ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`). Head comment
   states the deploy order.
2. Update `database/schema-snapshot.json` in the same commit, or
   `check:drift:snapshot` fails CI.
3. Never rewrite an applied migration. Add another.

## Quoting, in one place

```
quoting_rate = round2(mid_USD_KES × (1 + fx_buffer_pct / 100))
quote_kes    = round(usd_price × quoting_rate × (1 + markup_pct / 100)) + delivery_fee
```

`markup_pct` is the **service margin** — a price, promoted and waived,
0 on every UK, Dubai and promotional SHEIN order. `fx_buffer_pct` is
**cost recovery** for the KES→GBP spread and must survive a promotion
that zeroes the margin. They are separate settings for that reason; do
not merge them.

## Style

Match the surrounding code. This codebase comments *why*, usually by
naming the incident that made the line necessary — a customer's order, a
message that went out wrong. Keep that: a comment that says what the code
already says is noise, and a comment naming the failure is what stops
someone undoing the fix. Tests are written the same way; read the comment
above one before changing what it asserts.

Reach for the existing helper before writing a new one — the money and
message rules are deliberately concentrated in `utils/`.
