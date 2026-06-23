import { defineConfig, devices } from '@playwright/test';
import * as fs from 'fs';

// Propagate NEXT_PUBLIC_CHAIN from .env.local so test fixtures choose the right wrong-chain ID
try {
  const envLocal = fs.readFileSync('.env.local', 'utf8');
  for (const line of envLocal.split('\n')) {
    const m = line.match(/^NEXT_PUBLIC_CHAIN=(.+)/);
    if (m && !process.env.NEXT_PUBLIC_CHAIN) { process.env.NEXT_PUBLIC_CHAIN = m[1].trim(); break; }
  }
} catch {}

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
