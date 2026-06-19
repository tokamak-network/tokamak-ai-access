// tests/e2e/dashboard-eligible.spec.ts
import { test, expect } from './fixtures';
import { MOCK_KEY, MOCK_KEY_ROTATED } from './api-mocks';

test.describe('Dashboard — Eligible staker', () => {
  test.describe('No active key', () => {
    test('shows staked amount and Eligible badge', async ({ eligibleNoKey: page }) => {
      await expect(page.getByText('150', { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText('TON staked')).toBeVisible();
      await expect(page.getByText('Eligible').first()).toBeVisible();
    });

    test('shows Issue API key button', async ({ eligibleNoKey: page }) => {
      await expect(page.getByRole('button', { name: /Issue API key/i })).toBeVisible({ timeout: 10_000 });
    });

    test('issues key and shows one-time reveal panel', async ({ eligibleNoKey: page }) => {
      await page.getByRole('button', { name: /Issue API key/i }).click();

      // One-time reveal panel
      await expect(page.getByText("Save this key — it won't be shown again.")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /Copy API key/i })).toBeVisible();

      // Endpoint info visible
      await expect(page.getByText('api2.ai.tokamak.network')).toBeVisible();
    });

    test('copies API key to clipboard on Copy click', async ({ eligibleNoKey: page }) => {
      await page.getByRole('button', { name: /Issue API key/i }).click();
      await expect(page.getByRole('button', { name: /Copy API key/i })).toBeVisible({ timeout: 5_000 });

      // Grant clipboard permission
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);

      await page.getByRole('button', { name: /Copy API key/i }).click();

      // Button text changes to confirm copy
      await expect(page.getByRole('button', { name: /Copied/i })).toBeVisible({ timeout: 3_000 });

      // Clipboard content matches mock key
      const clipText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipText).toBe(MOCK_KEY);
    });

    test('shows CLI setup panel after key is issued', async ({ eligibleNoKey: page }) => {
      await page.getByRole('button', { name: /Issue API key/i }).click();
      await expect(page.getByRole('button', { name: /Copy API key/i })).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /Copy API key/i }).click();

      // CLI setup panel
      await expect(page.getByText('Configure AI tools')).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText('npx @tokamak-network/ai-access-cli configure')).toBeVisible();
      await expect(page.getByText('npx @tokamak-network/ai-access-cli revert')).toBeVisible();
    });
  });

  test.describe('Has active key', () => {
    test('shows active key metadata', async ({ eligibleWithKey: page }) => {
      await expect(page.getByText('Active key')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Ends in …7890/)).toBeVisible();
      await expect(page.getByText('Active').first()).toBeVisible();
    });

    test('shows Extend key and New key buttons', async ({ eligibleWithKey: page }) => {
      await expect(page.getByRole('button', { name: /Extend key/i })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('button', { name: /New key/i })).toBeVisible();
    });

    test('extend key button is enabled (key is 31 days old)', async ({ eligibleWithKey: page }) => {
      const extendBtn = page.getByRole('button', { name: /Extend key/i });
      await expect(extendBtn).toBeVisible({ timeout: 10_000 });
      await expect(extendBtn).toBeEnabled();
      await expect(page.getByText('Same key · no reconfiguration needed')).toBeVisible();
    });

    test('rotates key and shows new one-time reveal', async ({ eligibleWithKey: page }) => {
      await page.getByRole('button', { name: /New key/i }).click();

      // One-time reveal appears with new key
      await expect(page.getByText("Save this key — it won't be shown again.")).toBeVisible({ timeout: 5_000 });

      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
      await page.getByRole('button', { name: /Copy API key/i }).click();
      const clipText = await page.evaluate(() => navigator.clipboard.readText());
      expect(clipText).toBe(MOCK_KEY_ROTATED);
    });

    test('extends key (renew) and stays on same page', async ({ eligibleWithKey: page }) => {
      const extendBtn = page.getByRole('button', { name: /Extend key/i });
      await expect(extendBtn).toBeEnabled({ timeout: 10_000 });
      await extendBtn.click();

      // Button shows loading state then returns to idle
      await expect(page.getByRole('button', { name: /Extend key/i })).toBeVisible({ timeout: 5_000 });
      // No error shown
      await expect(page.locator('[style*="color: #dc2626"]')).not.toBeVisible();
    });
  });

  test.describe('Staking key (no expiresAt)', () => {
    test('Extend key button is disabled', async ({ eligibleStakingKey: page }) => {
      const btn = page.getByTestId('renew-btn');
      await expect(btn).toBeVisible({ timeout: 10_000 });
      await expect(btn).toBeDisabled();
    });

    test('shows no-expiry hint for staking keys', async ({ eligibleStakingKey: page }) => {
      await expect(page.getByText('No expiry while staked')).toBeVisible({ timeout: 10_000 });
    });

    test('New key button remains enabled', async ({ eligibleStakingKey: page }) => {
      await expect(page.getByRole('button', { name: /New key/i })).toBeEnabled({ timeout: 10_000 });
    });
  });

  test('sign out redirects to /', async ({ eligibleNoKey: page }) => {
    await expect(page.getByRole('button', { name: /Sign out/i })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /Sign out/i }).click();
    await expect(page).toHaveURL('/', { timeout: 5_000 });
  });

  test('Refresh button reloads data', async ({ eligibleNoKey: page }) => {
    const refreshBtn = page.getByRole('button', { name: /Refresh/i });
    await expect(refreshBtn).toBeVisible({ timeout: 10_000 });
    await refreshBtn.click();
    // Dashboard stays on /dashboard after refresh
    await expect(page).toHaveURL('/dashboard');
    await expect(page.getByText('150', { exact: true })).toBeVisible({ timeout: 5_000 });
  });
});
