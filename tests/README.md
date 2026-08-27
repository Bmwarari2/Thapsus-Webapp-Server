# Tests

This directory holds the backend test suite, run via [vitest](https://vitest.dev).

## Layout

```
tests/
├── README.md                  ← you are here
├── db-test.js                 ← legacy DB-connectivity script (`npm run test:db`)
├── unit/                      ← pure-function tests, no DB / network needed
└── integration/               ← supertest tests that exercise routes end-to-end
```

## Running

```sh
npm test               # one-shot run (CI mode)
npm run test:watch     # watch mode for local development
npm run test:coverage  # run + emit coverage report under coverage/
```

## Why vitest, not Jest?

The remediation plan called for Jest + supertest. We picked **vitest** instead:

- This package is `"type": "module"` (pure ESM). Jest's ESM support requires
  the `--experimental-vm-modules` flag and is fragile around ESM-only deps
  (which we have — `xss`, `googleapis`, etc.).
- Vitest is API-compatible with Jest (`describe` / `it` / `expect`), runs
  natively in ESM, and reuses the Vite toolchain we already ship for the
  React client.
- supertest works identically under both runners.

Test files written here are also valid Jest tests — if we ever migrate, the
suites do not need to be rewritten.

## Conventions

- File suffix must be `*.test.js` (vitest discovery is restricted to those).
- Unit tests should not require a DB or network. Mock or fake everything.
- Integration tests should accept a `TEST_DATABASE_URL` env var and skip
  themselves with a clear message if it is unset, so the unit suite stays
  green on a developer laptop without DB credentials.
- Always assert against a real HTTP boundary in integration tests
  (status code, headers, body) — not internal function returns.

## What's tested

482 unit + smoke tests, plus integration suites that self-skip without
`TEST_DATABASE_URL`. `ARCHITECTURE.md` §13 has the full map; the shape of
it:

- **The conversation** — `waStateMachine` (the dispatcher, 113 cases:
  onboarding edges, tracking formats, confirmation ambiguity, payment
  claims, SHEIN cart requests, takeover and resume, and the facts block
  that tells the assistant whether a link ever arrived), `waAiClassify`
  (the sentinel boundary and the quote-in-flight guard), `waNudges`,
  `waSweeper`, `waText`.
- **The money** — `waQuote` (margin, delivery fee, the FX buffer and its
  2dp rounding), `waDeliveryFeeSettle`, `waPayments`,
  `markPaymentPaidRecovery`, `lipanaWebhook`, `pricing`, `fxRefresh`.
  Several of these exist because `Number(null) === 0` quietly gave money
  away.
- **The pipeline** — `waOrderFlow` (transition edges), `orderStages`
  (which advance buttons the order screen offers), `waCodes`,
  `waMethodSwitch`.
- **The plumbing** — `sentdm` / `sentdmMedia` (signature verification,
  inbound media), `waTemplateVars` (every template body against its
  positional ordering), `receiptPdf` / `receiptLink` / `mediaLink`,
  `sanitize`, `idempotency`, `schemaDrift`, `sseEvents`, `logRetention`,
  `productLinks`, `outboxShouldQueue`.

A test here is usually pinning a specific incident, and the comment above
it says which. Read that before changing what it asserts.
