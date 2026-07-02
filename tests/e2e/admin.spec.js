import { test, expect } from '@playwright/test';
import { login, grantFinance, closeDb } from './helpers.js';

// Money path 3: staff surfaces render on real data — the admin dashboard
// (stats + orders + users queries behind it) and the finance dashboard
// (can_manage_finances gate + overview/P&L queries).

test.beforeAll(async () => { await grantFinance('admin@thapsus.uk'); });
test.afterAll(async () => { await closeDb(); });

test('admin login lands on a rendering dashboard', async ({ page }) => {
  await login(page, 'admin@thapsus.uk', 'AdminPass123!');
  await page.waitForURL('**/admin**');
  // A stats surface must actually render (not a blank error state).
  await expect(page.getByText(/orders|users|revenue/i).first()).toBeVisible({ timeout: 15_000 });
});

test('finance dashboard renders for a finance-enabled admin', async ({ page }) => {
  await login(page, 'admin@thapsus.uk', 'AdminPass123!');
  await page.waitForURL('**/admin**');
  await page.goto('/admin/finance');
  // Overview cards come from GET /api/finance/overview.
  await expect(page.getByText(/money available|profit|income|expense/i).first()).toBeVisible({ timeout: 15_000 });
});

test('customer route is walled off from anonymous visitors', async ({ page }) => {
  await page.goto('/orders');
  await page.waitForURL(/\/(login|$)/, { timeout: 10_000 });
});
