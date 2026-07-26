// Captures the three messages views (Chat / Mail / CRM) at desktop + 375px.
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
      await page.goto(URL, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="messages-view-toggle"]', { timeout: 15000 });
      if (view.toggle) await page.click(view.toggle);
      await page.waitForSelector(view.ready, { timeout: 15000 });
      await page.waitForTimeout(400); // settle skeletons/fonts
      const out = path.join(__dirname, `${view.name}-${label}.png`);
      await page.screenshot({ path: out });
      console.log('wrote', out);
      await page.close();
    }
  }
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
