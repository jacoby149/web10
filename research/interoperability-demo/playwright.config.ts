import { defineConfig } from '../../e2e/playwright';

export default defineConfig({
  testDir: '.',
  testMatch: 'interop.spec.ts',
  globalSetup: '../../e2e/tests/global-setup.ts',
  outputDir: '../../.context/interoperability-demo/test-results',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  reporter: [['list'], ['html', {
    outputFolder: '../../.context/interoperability-demo/report',
    open: 'never',
  }]],
  use: {
    browserName: 'chromium',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true } },
  ],
});
