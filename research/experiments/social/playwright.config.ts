import { defineConfig } from '../../../e2e/node_modules/@playwright/test';
import { configuration, disableProxyEnvironment } from './metrics.mjs';

disableProxyEnvironment();
const config = configuration();
export default defineConfig({
  testDir: '.', testMatch: 'scenario.spec.ts', workers: 1, retries: 0, repeatEach: 1,
  timeout: 900_000, globalTimeout: 960_000, fullyParallel: false,
  reporter: [['./reporter.ts']], outputDir: `${config.results}/playwright-temporary`, preserveOutput: 'never',
  use: { browserName: 'chromium', baseURL: 'http://social.localhost', viewport: { width: 1280, height: 900 },
    actionTimeout: 20_000, navigationTimeout: 30_000, serviceWorkers: 'block',
    screenshot: 'off', trace: 'off', video: 'off',
    launchOptions: { args: ['--no-proxy-server', '--host-resolver-rules=MAP *.localhost 127.0.0.1'] } },
});
