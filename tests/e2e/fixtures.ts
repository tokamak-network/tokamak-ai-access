// tests/e2e/fixtures.ts
import { test as base, type Page } from '@playwright/test';
import { buildWalletMockScript } from './wallet-mock';
import {
  MOCK_ADDRESS,
  applyAuthMocks,
  applyEligibleNoKeyMocks,
  applyEligibleWithKeyMocks,
  applyEligibleStakingKeyMocks,
  applyIneligibleMocks,
  applyPurchaseMocks,
} from './api-mocks';

type Fixtures = {
  /** Landing page with wallet mock injected and auth endpoints mocked */
  landingPage: Page;
  /** Dashboard: eligible staker, no active key */
  eligibleNoKey: Page;
  /** Dashboard: eligible staker, active key (31 days old, renewable) */
  eligibleWithKey: Page;
  /** Dashboard: eligible staker, active staking key (no expiresAt) */
  eligibleStakingKey: Page;
  /** Dashboard: not eligible, no purchase */
  ineligiblePage: Page;
  /** Dashboard: active purchase expiring in 6 days */
  purchasePage: Page;
};

export const test = base.extend<Fixtures>({
  landingPage: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS, { autoConnect: false }) });
    await applyAuthMocks(page);
    await page.goto('/');
    await use(page);
  },

  eligibleNoKey: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyEligibleNoKeyMocks(page);
    await page.goto('/dashboard');
    await use(page);
  },

  eligibleWithKey: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyEligibleWithKeyMocks(page);
    await page.goto('/dashboard');
    await use(page);
  },

  eligibleStakingKey: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyEligibleStakingKeyMocks(page);
    await page.goto('/dashboard');
    await use(page);
  },

  ineligiblePage: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyIneligibleMocks(page);

    // Intercept Ethereum JSON-RPC eth_call requests so wagmi balance hooks resolve
    await page.route('**', async (route) => {
      const req = route.request();
      if (req.method() === 'POST') {
        const body = req.postData() ?? '';
        if (body.includes('"eth_call"')) {
          // 250 TON as uint256 ABI-encoded (may fail multicall3 parse → isError fallback)
          const uint256_250_ton = '0x000000000000000000000000000000000000000000000d8d726b7177a8000000';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: uint256_250_ton }),
          });
          return;
        }
      }
      await route.fallback();
    });

    await page.goto('/dashboard');
    await use(page);
  },

  purchasePage: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyPurchaseMocks(page);
    await page.goto('/dashboard');
    await use(page);
  },
});

export { expect } from '@playwright/test';
