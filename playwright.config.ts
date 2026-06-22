import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.TEST_PORT ?? '3000';
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    screenshot: 'on',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `PORT=${PORT} npm start`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
