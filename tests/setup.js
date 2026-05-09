// Vitest setup file — runs before any test module is imported. Use it to
// install safe defaults for env vars that route handlers or middleware
// validate at module load time. We never want test code to read real
// production secrets, so anything sensitive is forced to a clearly-fake
// value here.
//
// Real secrets come from .env.test if present (see vitest.config.js
// loader), and the values below are last-resort fallbacks so the suite
// can be run in a fresh checkout with no env file at all.

const TEST_DEFAULTS = {
  // Auth: middleware/auth.js throws on import if JWT_SECRET is unset.
  // The value never has to verify a real production token — every test
  // that needs a signed JWT mints its own with this same secret.
  JWT_SECRET: 'test-jwt-secret-do-not-use-in-prod',
  JWT_EXPIRY: '1h',

  // Tests must never default to production CORS allowlist.
  NODE_ENV: 'development',

  // Stripe + Lipana: utility singletons read these at first call. Tests
  // mock the SDK clients themselves, but the secret-presence checks
  // still gate the handler entry points.
  STRIPE_SECRET_KEY: 'sk_test_dummy_for_vitest',
  STRIPE_WEBHOOK_SECRET: 'whsec_test_dummy_for_vitest',
  LIPANA_WEBHOOK_SECRET: 'lipana_test_dummy_for_vitest',

  // Admin bootstrap: ensureAdminUser checks ADMIN_PASSWORD at boot. Not
  // hit by unit tests, but if any helper happens to import server.js
  // we want the import to succeed.
  ADMIN_PASSWORD: 'admin-test-password-do-not-use',

  // database/init.js validates DATABASE_URL at module-load time and
  // calls process.exit(1) if it is missing. The unit tests never call
  // getPool(), so the connection is never opened — but the URL still
  // has to parse as postgres://. This points at a clearly-fake host so
  // anyone reading a stack trace knows we're inside the test harness.
  DATABASE_URL: 'postgres://test:test@127.0.0.1:5432/test_unused_in_unit_suite',
};

for (const [key, value] of Object.entries(TEST_DEFAULTS)) {
  if (process.env[key] === undefined || process.env[key] === '') {
    process.env[key] = value;
  }
}
