import { defineConfig } from '@playwright/test';

const port = process.env.DEMO_TEST_PORT || '3900';

export default defineConfig({
  testDir: './tests/demos',
  globalSetup: './tests/demos/global-setup',
  globalTeardown: './tests/demos/global-teardown',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 15_000,
  reporter: process.env.CI ? [['list'], ['html']] : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { channel: 'chromium' },
    },
  ],
});