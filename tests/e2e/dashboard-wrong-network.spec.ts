// tests/e2e/dashboard-wrong-network.spec.ts
import { test, expect } from './fixtures';

const isSepolia = process.env.NEXT_PUBLIC_CHAIN === 'sepolia';
const expectedNetworkName = isSepolia ? 'Sepolia' : 'Ethereum';

test.describe('Dashboard — Wrong network', () => {
  test('shows WRONG NETWORK badge', async ({ wrongNetworkDashboard: page }) => {
    await expect(page.getByText(/Wrong Network/i)).toBeVisible({ timeout: 10_000 });
  });

  test('shows Switch to correct network button (not the wrong one)', async ({ wrongNetworkDashboard: page }) => {
    const switchBtn = page.getByRole('button', { name: /Switch to/i });
    await expect(switchBtn).toBeVisible({ timeout: 10_000 });
    await expect(switchBtn).toContainText(expectedNetworkName);
  });

  test('network section in sidebar shows correct target network', async ({ wrongNetworkDashboard: page }) => {
    await expect(page.getByText('Network', { exact: true })).toBeVisible({ timeout: 10_000 });
    // The n-val next to "Network" label should display the target chain name
    const networkVal = page.locator('.n-val').last();
    await expect(networkVal).toContainText(expectedNetworkName);
  });
});
