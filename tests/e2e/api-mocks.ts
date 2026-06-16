// tests/e2e/api-mocks.ts
import type { Page } from '@playwright/test';

export const MOCK_ADDRESS = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
export const MOCK_KEY = 'sk-test-4b3c2a1d-e5f6-7890-abcd-ef1234567890';
export const MOCK_KEY_ROTATED = 'sk-test-9z8y7x6w-v5u4-3210-fedc-ba0987654321';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;
const THIRTY_ONE_DAYS_MS = 31 * 24 * 60 * 60 * 1000;

function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function isoAgo(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

/** Auth endpoints — shared by all scenarios */
export async function applyAuthMocks(page: Page): Promise<void> {
  await page.route('/api/auth/nonce', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ nonce: 'testnonce12345678' }),
    }),
  );
  await page.route('/api/auth/verify', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'Set-Cookie': 'session_id=e2e-test-session; Path=/; SameSite=Lax' },
      body: JSON.stringify({ ok: true }),
    }),
  );
}

/**
 * Scenario A: Eligible staker, no active key.
 * Tests: Issue key, one-time reveal, copy.
 */
export async function applyEligibleNoKeyMocks(page: Page): Promise<void> {
  await applyAuthMocks(page);
  await page.route('/api/staking/balance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: MOCK_ADDRESS,
        totalStakedTON: '150',
        eligible: true,
        minTon: 100,
        activePurchase: false,
        purchaseExpiresAt: null,
      }),
    }),
  );
  await page.route('/api/keys/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasActiveKey: false }),
    }),
  );
  await page.route('/api/keys/issue', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: MOCK_KEY, expiresAt: isoFromNow(THIRTY_DAYS_MS) }),
    }),
  );
}

/**
 * Scenario A': Eligible staker, has active key (created 31 days ago → renewable).
 * Tests: Rotate key, Extend key.
 */
export async function applyEligibleWithKeyMocks(page: Page): Promise<void> {
  await applyAuthMocks(page);
  await page.route('/api/staking/balance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: MOCK_ADDRESS,
        totalStakedTON: '150',
        eligible: true,
        minTon: 100,
        activePurchase: false,
        purchaseExpiresAt: null,
      }),
    }),
  );
  await page.route('/api/keys/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hasActiveKey: true,
        lastFour: '7890',
        createdAt: isoAgo(THIRTY_ONE_DAYS_MS),
        expiresAt: isoFromNow(THIRTY_DAYS_MS),
      }),
    }),
  );
  await page.route('/api/keys/rotate', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ key: MOCK_KEY_ROTATED, expiresAt: isoFromNow(THIRTY_DAYS_MS) }),
    }),
  );
  await page.route('/api/keys/renew', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expiresAt: isoFromNow(THIRTY_DAYS_MS) }),
    }),
  );
}

/**
 * Scenario B: Not eligible staker, no purchase.
 * Tests: Stake/Buy cards, StakePanel, Purchase flow.
 */
export async function applyIneligibleMocks(page: Page): Promise<void> {
  await applyAuthMocks(page);
  await page.route('/api/staking/balance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: MOCK_ADDRESS,
        totalStakedTON: '0',
        eligible: false,
        minTon: 100,
        activePurchase: false,
        purchaseExpiresAt: null,
      }),
    }),
  );
  await page.route('/api/keys/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ hasActiveKey: false }),
    }),
  );
  await page.route('/api/price/ton', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tonRequired: 42, usdPrice: 5 }),
    }),
  );
  await page.route('/api/keys/purchase', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ verified: true }),
    }),
  );
}

/**
 * Scenario C: Not eligible staker, but has active purchase expiring in 6 days.
 * Tests: Expiry banner, Renew button.
 */
export async function applyPurchaseMocks(page: Page): Promise<void> {
  await applyAuthMocks(page);
  await page.route('/api/staking/balance', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: MOCK_ADDRESS,
        totalStakedTON: '0',
        eligible: false,
        minTon: 100,
        activePurchase: true,
        purchaseExpiresAt: Date.now() + SIX_DAYS_MS,
      }),
    }),
  );
  await page.route('/api/keys/me', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hasActiveKey: true,
        lastFour: 'abcd',
        createdAt: isoAgo(THIRTY_ONE_DAYS_MS),
        expiresAt: isoFromNow(SIX_DAYS_MS),
      }),
    }),
  );
  await page.route('/api/price/ton', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ tonRequired: 42, usdPrice: 5 }),
    }),
  );
  await page.route('/api/keys/purchase/renew', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ expiresAt: isoFromNow(THIRTY_DAYS_MS) }),
    }),
  );
}
