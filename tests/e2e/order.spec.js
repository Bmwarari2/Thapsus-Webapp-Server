import { test, expect } from '@playwright/test';
import { login, closeDb, db } from './helpers.js';

// Money path 2: the seeded customer registers a parcel through the real
// NewOrder form and sees it confirmed + listed. This is the flow that was
// hard-down in production (orders.hs_tier) before the 2026-07 audit round.

test.afterAll(async () => { await closeDb(); });

test('customer creates an order through the UI and sees it in Orders', async ({ page }) => {
  await login(page, 'jane@example.com', 'Passw0rd!');
  await page.waitForURL('**/dashboard**');

  await page.goto('/orders/new');
  const retailer = page.locator('select[name="retailer"]');
  await retailer.waitFor();
  // pick the first real retailer option (index 0 is the placeholder)
  await retailer.selectOption({ index: 1 });
  await page.fill('textarea[name="description"]', 'E2E parcel — blue hoodie size M');
  await page.click('button[type="submit"]');

  // confirmation screen carries the freshly minted tracking number
  await page.waitForURL('**/orders/confirmation**', { timeout: 15_000 });

  // The Orders list renders tracking numbers, not descriptions — resolve
  // the new order's tracking number and assert THAT row appears.
  const { rows } = await db().query(
    `SELECT tracking_number FROM orders WHERE description = $1 ORDER BY created_at DESC LIMIT 1`,
    ['E2E parcel — blue hoodie size M']
  );
  expect(rows[0]?.tracking_number).toBeTruthy();

  await page.goto('/orders');
  await expect(page.getByText(rows[0].tracking_number).first()).toBeVisible({ timeout: 10_000 });
});
