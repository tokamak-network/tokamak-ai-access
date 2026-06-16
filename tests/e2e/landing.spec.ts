// tests/e2e/landing.spec.ts
import { test, expect } from './fixtures';

test.describe('Landing page', () => {
  test('renders hero, model cards, and footer', async ({ landingPage: page }) => {
    await expect(page.locator('h1')).toContainText('Your stake');
    await expect(page.locator('h1')).toContainText('earns you AI');

    // Model cards
    await expect(page.getByText('qwen-3.6')).toBeVisible();
    await expect(page.getByText('deepseek-v4-flash')).toBeVisible();
    await expect(page.getByText('gemma-4')).toBeVisible();

    // How it works section
    await expect(page.getByText('01')).toBeVisible();
    await expect(page.getByText('Connect wallet')).toBeVisible();

    // Footer
    await expect(page.getByText('Tokamak Network')).toBeVisible();
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
    // MetaMask connector visible
    await expect(page.getByText('MetaMask')).toBeVisible();
  });

  test('closes modal when overlay is clicked', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await expect(page.getByText('MetaMask')).toBeVisible();

    // Click outside the modal (overlay)
    await page.mouse.click(5, 5);
    await expect(page.getByText('MetaMask')).not.toBeVisible();
  });

  test('connects wallet and shows Sign in button', async ({ landingPage: page }) => {
    await page.getByRole('button', { name: /Connect Wallet/i }).click();
    await page.getByText('MetaMask').click();

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
    await page.getByText('MetaMask').click();
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
    await page.getByText('MetaMask').click();
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
