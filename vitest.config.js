import { defineConfig } from 'vitest/config';

// Vitest configuration for the backend test suite. The React client has its
// own build pipeline under client/ and is not in scope for this runner —
// the suite only covers Express middleware, route handlers, utilities, and
// (eventually) integration smoke tests against a throwaway test database.
export default defineConfig({
  test: {
    // setupFiles runs once per worker before any test file is imported.
    // We install safe env-var defaults there (JWT_SECRET, etc.) so route
    // modules that validate at import-time don't throw under vitest.
    setupFiles: ['./tests/setup.js'],
    // Limit discovery to the tests/ tree at repo root; the legacy
    // tests/db-test.js script is not a vitest file and is opted out by
    // the `*.test.js` suffix requirement.
    include: ['tests/**/*.test.js'],
    exclude: ['client/**', 'node_modules/**', 'tests/db-test.js'],
    // Use the node environment (no jsdom). Most things under test are
    // Express middlewares or pure utilities.
    environment: 'node',
    // Keep tests deterministic and quiet by default.
    reporters: ['default'],
    // Coverage settings: fail-loud thresholds will be tightened once the
    // suite is fleshed out (W3.2-3.5). For now, just emit a report.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['middleware/**', 'routes/**', 'utils/**'],
      exclude: ['client/**', 'tests/**', '**/*.config.js'],
    },
    // 10s default — most middleware tests finish in milliseconds; integration
    // tests can opt up via test.setTimeout() per file.
    testTimeout: 10_000,
  },
});
