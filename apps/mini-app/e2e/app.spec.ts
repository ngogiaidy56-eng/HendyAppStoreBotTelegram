import { test, expect } from '@playwright/test';

test('Mini App serves the Hendy Store shell', async ({ page }) => {
  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:4173');
  await expect(page).toHaveTitle(/Hendy App Store/i);
  await expect(page.locator('#root')).toBeVisible();
});
