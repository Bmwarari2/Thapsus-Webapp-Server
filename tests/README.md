# Tests

This directory holds the backend test suite, run via [vitest](https://vitest.dev).

## Layout

```
tests/
├── README.md                  ← you are here
├── db-test.js                 ← legacy DB-connectivity script (`npm run test:db`)
├── unit/                      ← pure-function tests, no DB / network needed
│   └── sanitize.test.js
└── integration/               ← supertest tests that exercise routes end-to-end
    └── (suites added in W3.2 onwards)
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

## What's tested as of this scaffold

- `middleware/sanitize.js` — body / query XSS scrubbing + payload-too-large
  guards. See `tests/unit/sanitize.test.js`.

The auth, role, and webhook integration suites land in follow-up PRs
(plan items W3.2, W3.3, W3.4, W3.5).
