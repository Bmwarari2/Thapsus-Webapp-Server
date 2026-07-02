import { test, expect } from '@playwright/test';
import { verificationTokenFor, deleteUser, login, closeDb } from './helpers.js';

// Money path 1: a new customer can actually get INTO the product —
// register → "check your inbox" → click the emailed link → land signed-in.
// The API side is covered by tests/integration/auth.test.js; this proves
// the built client wires those endpoints to the screens correctly.

const EMAIL = `e2e-auth-${Date.now()}@test.thapsus.uk`;
const PASSWORD = 'E2ePass!2345';

test.afterAll(async () => {
  await deleteUser(EMAIL);
  await closeDb();
});

test('register → check-inbox → verify link → signed-in dashboard', async ({ page }) => {
  await page.goto('/register');
  await page.fill('input[name="name"]', 'E2E Auth User');
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="phone"]', '+254700000900');
  await page.fill('input[name="password"]', PASSWORD);
  await page.fill('input[name="confirmPassword"]', PASSWORD);
  await page.click('button[type="submit"]');

  // Sign-up must NOT auto-login — it routes to the check-inbox screen.
  await page.waitForURL('**/check-inbox**');

  // "Click" the emailed link (token read from the DB, like a mailbox would).
  const token = await verificationTokenFor(EMAIL);
  expect(token).toBeTruthy();
  await page.goto(`/verify-email?token=${token}`);

  // The client deliberately routes to a fresh sign-in with a success flag
  // (it does not consume the auto-login bundle the API returns).
  await page.waitForURL('**/login?verified=1**', { timeout: 15_000 });

  // …and the now-verified credentials work.
  await login(page, EMAIL, PASSWORD);
  await page.waitForURL('**/dashboard**', { timeout: 15_000 });
});

test('unverified-style login error, then real login works', async ({ page }) => {
  await login(page, EMAIL, 'wrong-password-entirely');
  // stays on /login with an error surface — no redirect
  await expect(page).toHaveURL(/\/login/);

  await login(page, EMAIL, PASSWORD);
  await page.waitForURL('**/dashboard**');
});
