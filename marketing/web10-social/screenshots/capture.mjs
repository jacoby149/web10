// Captures screens (Chat / Mail / CRM / Settings) at desktop + 375px.
//
// ONE command, no backend, no login:  node screenshots/capture.mjs
// It boots the harness Vite server (screenshots/vite.config.ts) itself, waits
// for it, screenshots each view, then shuts the server down. See README.md.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = 4500;
const URL = `http://localhost:${PORT}/screenshots/harness/index.html`;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  '375': { width: 375, height: 812 },
};

const VIEWS = [
  { name: 'chat', toggle: null, ready: '[data-testid="messages-view-toggle"]' },
  { name: 'mail', toggle: '[data-testid="view-toggle-mail"]', ready: '[data-testid="mail-thread-row"]' },
  { name: 'crm', toggle: '[data-testid="view-toggle-crm"]', ready: '[data-testid="crm-contact-row"]' },
  { name: 'settings', route: '/settings', ready: 'h1' },
];

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Harness server did not come up at ${url}`);
}

// Boot the harness dev server (bunx if available, else npx).
const runner = process.env.VITE_RUNNER || 'bunx';
const server = spawn(runner, ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root,
  stdio: 'inherit',
});

let browser;
try {
  await waitForServer(URL);
  browser = await chromium.launch();
  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    for (const view of VIEWS) {
      const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
      // Buffer the page's console + uncaught errors so a capture failure is
      // self-explaining. Without this, a crash in the harness page (e.g. a
      // missing mock stub) surfaces only as a bare selector timeout and the
      // agent cannot see WHY — this buffer IS "the logs".
      const pageLog = [];
      page.on('console', (msg) => {
        const line = `[page:${msg.type()}] ${msg.text()}`;
        pageLog.push(line);
        if (msg.type() === 'error' || msg.type() === 'warning') console.error(line);
      });
      page.on('pageerror', (err) => {
        const line = `[pageerror] ${err.message}`;
        pageLog.push(line);
        console.error(line);
      });

      const gotoUrl = view.route ? `${URL}?screen=${view.route.replace('/', '')}` : URL;
      try {
        await page.goto(gotoUrl, { waitUntil: 'networkidle' });

        if (view.route) {
          await page.waitForSelector(view.ready, { timeout: 15000 });
        } else {
          await page.waitForSelector('[data-testid="messages-view-toggle"]', { timeout: 15000 });
          if (view.toggle) await page.click(view.toggle);
          await page.waitForSelector(view.ready, { timeout: 15000 });
        }
      } catch (err) {
        console.error(`\n=== CAPTURE FAILED: ${view.name}-${label} ===`);
        console.error(`waiting for: ${view.ready}`);
        console.error(err.message);
        console.error('--- page console + errors (this is why it failed) ---');
        console.error(pageLog.length ? pageLog.join('\n') : '(page logged nothing — check the Vite server output above)');
        console.error('--- hints ---');
        console.error('* "X is not a function" / "No matching export" → a harness mock is missing a stub:');
        console.error('    @/data/wapi  → screenshots/harness/mock-wapi.ts (full WapiWrapper; tsc -b flags drift)');
        console.error('    @/data barrel → screenshots/harness/mock-data.ts');
        console.error('* New view / renamed data-testid → update VIEWS in screenshots/capture.mjs');
        throw new Error(`capture failed on ${view.name}-${label} (diagnostics above)`);
      }
      await page.waitForTimeout(400); // settle skeletons/fonts
      const out = path.join(__dirname, `${view.name}-${label}.png`);
      await page.screenshot({ path: out });
      console.log('wrote', out);
      await page.close();
    }
  }
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
