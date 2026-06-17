// tests/e2e/dashboard-ineligible.spec.ts
import { test, expect } from './fixtures';

test.describe('Dashboard — Not eligible staker', () => {
  test('shows 0 TON staked and Not eligible badge', async ({ ineligiblePage: page }) => {
    await expect(page.getByText('Not eligible').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('0', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('TON staked')).toBeVisible();
  });

  test('shows Stake TON and Buy Access option cards', async ({ ineligiblePage: page }) => {
    await expect(page.getByText('Stake TON')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Buy Access')).toBeVisible();
  });

  test('Issue API key button is NOT visible', async ({ ineligiblePage: page }) => {
    await expect(page.getByRole('button', { name: /Issue API key/i })).not.toBeVisible();
  });

  test.describe('Stake TON card', () => {
    test('expands StakePanel on click', async ({ ineligiblePage: page }) => {
      await page.getByText('Stake TON').click();

      // StakePanel should appear with Stake/Unstake tabs
      await expect(page.getByRole('button', { name: /^Stake$/i })).toBeVisible({ timeout: 5_000 });
      await expect(page.getByRole('button', { name: /^Unstake$/i })).toBeVisible();
    });

    test('stake tab shows TON balance and amount input', async ({ ineligiblePage: page }) => {
      await page.getByText('Stake TON').click();
      await expect(page.getByRole('button', { name: /^Stake$/i })).toBeVisible({ timeout: 5_000 });

      // Wallet balance label visible
      await expect(page.getByText('Wallet TON balance')).toBeVisible();

      // Amount input visible
      await expect(page.locator('input[placeholder*="min"]')).toBeVisible();

      // Preset buttons (100, 200, 500)
      await expect(page.getByRole('button', { name: '100' })).toBeVisible();
      await expect(page.getByRole('button', { name: '200' })).toBeVisible();

      // Operator select visible
      await expect(page.getByRole('combobox')).toBeVisible();
    });

    test('preset button fills amount input', async ({ ineligiblePage: page }) => {
      await page.getByText('Stake TON').click();
      await expect(page.getByRole('button', { name: '100' })).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: '100' }).click();

      await expect(page.locator('input[placeholder*="min"]')).toHaveValue('100');
    });

    test('unstake tab shows staked balance and withdrawal input', async ({ ineligiblePage: page }) => {
      await page.getByText('Stake TON').click();
      await expect(page.getByRole('button', { name: /^Unstake$/i })).toBeVisible({ timeout: 5_000 });
      await page.getByRole('button', { name: /^Unstake$/i }).click();

      await expect(page.getByText('Staked TON (this operator)')).toBeVisible();
      await expect(page.getByText('Operator (Layer2)')).toBeVisible();
      await expect(page.getByText('Amount to unstake (TON)')).toBeVisible();
      await expect(page.getByRole('button', { name: /Request Withdrawal/i })).toBeVisible();
    });

    test('stake card deselects when Buy Access is clicked', async ({ ineligiblePage: page }) => {
      await page.getByText('Stake TON').click();
      await expect(page.getByRole('button', { name: /^Stake$/i })).toBeVisible({ timeout: 5_000 });

      await page.getByText('Buy Access').click();

      // StakePanel should collapse
      await expect(page.getByRole('button', { name: /^Stake$/i })).not.toBeVisible({ timeout: 3_000 });
    });
  });

  test.describe('Buy Access card', () => {
    test('expands purchase panel with price on click', async ({ ineligiblePage: page }) => {
      await page.getByText('Buy Access').click();

      await expect(page.getByText('Buy 30-day access')).toBeVisible({ timeout: 5_000 });
      // Price from mock: 42 TON
      await expect(page.getByText(/42 TON/).first()).toBeVisible({ timeout: 5_000 });
      // USD price from mock: $5
      await expect(page.getByText(/\$5/).first()).toBeVisible();
    });

    test('shows Pay TON button when price loaded', async ({ ineligiblePage: page }) => {
      await page.getByText('Buy Access').click();
      await expect(page.getByRole('button', { name: /Pay 42 TON/i })).toBeVisible({ timeout: 8_000 });
    });

    test('Pay button is disabled while price is loading', async ({ ineligiblePage: page }) => {
      // Delay the price route response to catch loading state
      await page.route('/api/price/ton', async (route) => {
        await new Promise((r) => setTimeout(r, 2000));
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ tonRequired: 42, usdPrice: 5 }),
        });
      });

      await page.getByText('Buy Access').click();
      const payBtn = page.getByRole('button', { name: /Loading price|Price unavailable|Pay/i });
      await expect(payBtn).toBeVisible({ timeout: 5_000 });
      // During loading, button should be disabled
      await expect(page.getByRole('button', { name: /Loading price/i })).toBeDisabled();
    });
  });
});
