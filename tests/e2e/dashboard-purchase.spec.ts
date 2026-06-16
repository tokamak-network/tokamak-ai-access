// tests/e2e/dashboard-purchase.spec.ts
import { test, expect } from './fixtures';

test.describe('Dashboard — Active purchase', () => {
  test('shows Access via purchase and Eligible badge', async ({ purchasePage: page }) => {
    await expect(page.getByText('Access via purchase')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('Eligible').first()).toBeVisible();
  });

  test('shows expiry banner when < 7 days remain (6 days)', async ({ purchasePage: page }) => {
    await expect(page.getByText(/Access expires in 6 day/i)).toBeVisible({ timeout: 10_000 });
  });

  test('Renew button visible in expiry banner', async ({ purchasePage: page }) => {
    await expect(page.getByRole('button', { name: /Renew 30 days/i })).toBeVisible({ timeout: 10_000 });
  });

  test('clicking Renew triggers purchase renew flow', async ({ purchasePage: page }) => {
    const renewBtn = page.getByRole('button', { name: /Renew 30 days/i });
    await expect(renewBtn).toBeVisible({ timeout: 10_000 });
    await renewBtn.click();

    // Button goes into processing state
    await expect(
      page.getByRole('button', { name: /Processing|Confirm in wallet|Confirming on-chain|Verifying/i }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('has CLI setup panel visible (active purchase key)', async ({ purchasePage: page }) => {
    // activePurchase users still have a key — CLI setup panel shows when keyData.hasActiveKey
    await expect(page.getByText('Configure AI tools')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('npx @tokamak-network/ai-access-cli configure')).toBeVisible();
  });
});
