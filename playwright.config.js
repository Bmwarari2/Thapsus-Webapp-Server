import { defineConfig } from '@playwright/test';

// Browser e2e over the money paths: register → verify → dashboard, customer
// order creation, admin dashboard + finance. Drives the BUILT client
// (client/dist, served statically by server.js) against a prod-mirror
// Postgres — i.e. the exact bytes production serves.
//
// Prerequisites (mirrors tests/e2e/README in database/MIGRATIONS.md):
//   1. client built:            npm run build   (or cd client && npm ci && npm run build)
//   2. prod-mirror DB running:  shims + npm run migrate + npm run seed:dev
//   3. E2E_DATABASE_URL set     (specs read verification tokens / set flags)
//
// Run: npm run test:e2e
//
// The dev server is started by Playwright itself (webServer below) on :5056
// so it never collides with a dev instance on :5000/:5055.

const DB = process.env.E2E_DATABASE_URL || process.env.DATABASE_URL;
const PORT = process.env.E2E_PORT || 5056;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000, // cold SPA first-paint on a fresh server eats a chunk of budget
  fullyParallel: false, // specs share seeded rows; keep ordering deterministic
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // Managed environments pre-provision Chromium and block downloads —
    // point at it with PW_CHROMIUM. Unset locally/CI where `npx playwright
    // install chromium` has run.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node server.js',
    url: `http://127.0.0.1:${PORT}/api/app-config`,
    reuseExistingServer: false,
    timeout: 60_000, // cold SPA first-paint on a fresh server eats a chunk of budget
    env: {
      ...process.env,
      DATABASE_URL: DB,
      PORT: String(PORT),
      NODE_ENV: 'development',
      JWT_SECRET: process.env.JWT_SECRET || 'e2e-jwt-secret-do-not-use-in-prod',
      ADMIN_EMAIL: 'admin@thapsus.uk',
      ADMIN_PASSWORD: 'AdminPass123!',
      DISABLE_RATE_LIMITS: 'true', // supertest-speed logins from one IP
      // The dev-mode allowlist only covers :5173/:5000; the browser sends an
      // Origin header on same-origin POSTs too, so :5056 must be allowed.
      CORS_ORIGIN: `http://127.0.0.1:${PORT}`,
    },
  },
});
