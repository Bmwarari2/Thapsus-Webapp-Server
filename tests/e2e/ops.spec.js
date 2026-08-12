import { test, expect } from '@playwright/test';
import { login, closeDb } from './helpers.js';

// Browser e2e over the surfaces staff actually work in. The API side is
// covered by the vitest suites; these prove the BUILT client wires those
// endpoints to the screens — the "API works but the page doesn't" class
// of break no server test can see.
//
// The predecessors of this file drove customer registration, customer
// order creation and the finance dashboard. All three were removed in
// the WhatsApp-first rebuild, so they tested nothing but 404s.

const ADMIN = { email: 'admin@thapsus.uk', password: 'AdminPass123!' };

test.afterAll(async () => { await closeDb(); });

test('admin signs in and lands on a rendering dashboard', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.waitForURL('**/admin**', { timeout: 15_000 });
  await expect(page.getByText(/users|error logs/i).first()).toBeVisible({ timeout: 15_000 });
});

test('the pipeline board renders all five stages', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/ops/pipeline');
  await expect(page.getByText('Order Pipeline')).toBeVisible({ timeout: 15_000 });
  for (const column of ['Quoting', 'Paid', 'Purchased', 'In Kenya', 'Delivered']) {
    await expect(page.getByText(column, { exact: true }).first()).toBeVisible();
  }
});

test('the WhatsApp inbox loads its conversation list', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/ops/inbox');
  // Empty seed DB — the empty state is the correct render, not a crash.
  await expect(page.getByText(/conversation|inbox/i).first()).toBeVisible({ timeout: 15_000 });
});

test('the payment queue renders and reaches the API', async ({ page }) => {
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto('/ops/payments');
  await expect(page.getByText('Payments to approve')).toBeVisible({ timeout: 15_000 });
  // Proves GET /api/admin/payments/pending answered — the error path
  // toasts instead of showing the empty state.
  await expect(page.getByText(/nothing waiting/i)).toBeVisible({ timeout: 15_000 });
});

test('ops routes are walled off from anonymous visitors', async ({ page }) => {
  await page.goto('/ops/pipeline');
  await page.waitForURL('**/login**', { timeout: 15_000 });
});

test('a bad receipt link 404s instead of falling through to the SPA', async ({ page }) => {
  const res = await page.goto('/r/not-a-real-token');
  expect(res.status()).toBe(404);
  await expect(page.getByText(/receipt link is not valid/i)).toBeVisible();
});
