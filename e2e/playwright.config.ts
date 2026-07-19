import { defineConfig, devices } from '@playwright/test';

const e2ePort = process.env.E2E_HTTP_PORT || '80';
const baseHost = e2ePort === '80' ? '' : `:${e2ePort}`;

export default defineConfig({
  testDir: './tests',
  globalSetup: './tests/global-setup',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
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