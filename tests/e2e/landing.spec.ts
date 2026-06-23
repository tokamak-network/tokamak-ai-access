// tests/e2e/landing.spec.ts
import { test, expect } from './fixtures';

test.describe('Wrong network', () => {
  test('shows amber warning when connected to Sepolia', async ({ sepoliaLandingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByRole('button').filter({ hasText: 'MetaMask' }).click();

    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/Wrong network/i)).toBeVisible();
  });

  test('Sign in button is disabled on wrong network', async ({ sepoliaLandingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByRole('button').filter({ hasText: 'MetaMask' }).click();

    const signInBtn = page.getByRole('button', { name: /Sign in/i });
    await expect(signInBtn).toBeVisible({ timeout: 8_000 });
    await expect(signInBtn).toBeDisabled();
  });
});

test.describe('Landing page', () => {
  test('renders hero, model cards, and footer', async ({ landingPage: page }) => {
    await expect(page.locator('h1')).toContainText('Your wallet');
    await expect(page.locator('h1')).toContainText('Your AI access');

    // Model cards
    await expect(page.getByText('qwen-3.6', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('gemma-4', { exact: true }).first()).toBeVisible();

    // How it works section
    await expect(page.getByText('01')).toBeVisible();
    await expect(page.getByText('Connect wallet', { exact: true })).toBeVisible();

    // Footer
    await expect(page.getByText('Tokamak Network', { exact: true })).toBeVisible();
  });

  test('shows Connect Wallet button when disconnected', async ({ landingPage: page }) => {
    await expect(page.getByRole('button', { name: /Connect Wallet/i })).toBeVisible();
    // Sign in button NOT visible yet
    await expect(page.getByRole('button', { name: /Sign in/i })).not.toBeVisible();
  });

  test('opens wallet modal on Connect Wallet click', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();

    // Modal should appear
    await expect(page.getByText('Connect Wallet', { exact: true })).toBeVisible();
    // MetaMask connector button visible in modal
    await expect(page.getByRole('button').filter({ hasText: 'MetaMask' })).toBeVisible();
  });

  test('closes modal when overlay is clicked', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await expect(page.getByRole('button').filter({ hasText: 'MetaMask' })).toBeVisible();

    // Click outside the modal (overlay) — must be below the sticky topbar (56px)
    // and outside the centered modal content (360px wide → left edge at ~460px)
    await page.mouse.click(50, 400);
    await expect(page.getByRole('button').filter({ hasText: 'MetaMask' })).not.toBeVisible({ timeout: 3_000 });
  });

  test('connects wallet and shows Sign in button', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByRole('button').filter({ hasText: 'MetaMask' }).click();

    // After connecting, Sign in button should appear
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible({ timeout: 8_000 });

    // Connect Wallet button should be gone
    await expect(page.getByRole('button', { name: /Connect Wallet →/i })).not.toBeVisible();

    // Address shown in top bar (0xf39F...2266)
    await expect(page.locator('.topbar-meta')).toContainText('0xf39F');
  });

  test('SIWE sign-in redirects to /dashboard', async ({ landingPage: page }) => {
    // Connect wallet
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByRole('button').filter({ hasText: 'MetaMask' }).click();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible({ timeout: 8_000 });

    // Apply dashboard mocks before redirect
    await page.route('/api/staking/balance', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          address: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
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

    // Sign in
    await page.getByRole('button', { name: /Sign in/i }).click();

    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard', { timeout: 15_000 });
  });

  test('shows disconnect button when connected', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByRole('button').filter({ hasText: 'MetaMask' }).click();
    await expect(page.getByRole('button', { name: /Sign in/i })).toBeVisible({ timeout: 8_000 });

    // Disconnect button in top bar
    await expect(page.getByRole('button', { name: /Disconnect/i })).toBeVisible();
    await page.getByRole('button', { name: /Disconnect/i }).click();

    // Should show Connect Wallet again
    await expect(page.getByRole('button', { name: /Connect Wallet →/i })).toBeVisible({ timeout: 5_000 });
  });

  test('displays min TON requirement (100 TON)', async ({ landingPage: page }) => {
    await expect(page.getByText('100 TON', { exact: false }).first()).toBeVisible();
  });
});
