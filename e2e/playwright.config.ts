import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.E2E_HTTP_PORT || '80';
const baseHost = e2ePort === '80' ? '' : `:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // CI runs on the self-hosted box (8 cores) — parallelize. E2E_WORKERS lets a
  // smaller runner (e.g. the 2-core GitHub VM, if ever used) dial it down.
  workers: process.env.CI ? Number(process.env.E2E_WORKERS || 4) : undefined,
  timeout: 30_000,
  reporter: process.env.CI ? [['list'], ['html']] : 'list',
  use: {
    baseURL: `http://localhost${baseHost}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});