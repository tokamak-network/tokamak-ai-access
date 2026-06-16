// tests/e2e/fixtures.ts
import { test as base, type Page } from '@playwright/test';
import { buildWalletMockScript } from './wallet-mock';
import {
  MOCK_ADDRESS,
  applyAuthMocks,
  applyEligibleNoKeyMocks,
  applyEligibleWithKeyMocks,
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
  /** Dashboard: not eligible, no purchase */
  ineligiblePage: Page;
  /** Dashboard: active purchase expiring in 6 days */
  purchasePage: Page;
};

export const test = base.extend<Fixtures>({
  landingPage: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
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

  ineligiblePage: async ({ page }, use) => {
    await page.addInitScript({ content: buildWalletMockScript(MOCK_ADDRESS) });
    await applyIneligibleMocks(page);
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
