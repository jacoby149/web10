import { defineConfig } from '../../../e2e/node_modules/@playwright/test';
import { configuration, disableProxyEnvironment } from './metrics.mjs';

disableProxyEnvironment();
const config = configuration();
// Allow quota cooldowns at the supported upper repetition bound, not just defaults.
const timeout = 900_000 + Math.ceil((config.repetitions + config.warmups) * 12 / 45) * 61_000;
export default defineConfig({
  testDir: '.', testMatch: 'scenario.spec.ts', workers: 1, retries: 0, repeatEach: 1,
  timeout, globalTimeout: timeout + 60_000, fullyParallel: false,
  reporter: [['./reporter.ts']], outputDir: `${config.results}/playwright-temporary`, preserveOutput: 'never',
  use: { browserName: 'chromium', baseURL: 'http://social.localhost', viewport: { width: 1280, height: 900 },
    actionTimeout: 20_000, navigationTimeout: 30_000, serviceWorkers: 'block',
    screenshot: 'off', trace: 'off', video: 'off',
    launchOptions: { args: ['--no-proxy-server', '--host-resolver-rules=MAP *.localhost 127.0.0.1'] } },
});
