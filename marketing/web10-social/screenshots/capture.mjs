// Captures screens (Chat / Settings) at desktop + 375px.
//
// ONE command, no backend, no login:  node screenshots/capture.mjs
// It boots the harness Vite server (screenshots/vite.config.ts) itself, waits
// for it, screenshots each view, then shuts the server down. See README.md.
//
// NEVER start `bun run dev` for screenshots — it blocks your shell and the
// logged-out app renders the login page anyway. This script IS the dev server.
//
// One-off view without editing VIEWS (e.g. a new screen you're PRing):
//   node screenshots/capture.mjs --name nav --ready '[data-testid="bottom-nav"]'
//   node screenshots/capture.mjs --name settings --route /settings --ready h1
//   (--toggle '<selector>' clicks a view toggle before waiting for --ready)
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

const DEFAULT_VIEWS = [
  { name: 'chat', toggle: null, ready: '[data-testid="dm-new-message-btn"]' },
  { name: 'settings', route: '/settings', ready: 'h1' },
];

// CLI: --name X --ready SEL [--route /settings] [--toggle SEL] [--click SEL]
// captures just that one view (no VIEWS edit needed for a one-off PR
// screenshot). --click may be repeated — the clicks fire in order BEFORE the
// ready wait (a two-step sub-view, e.g. open the face lightbox then tap a
// pick tile, is two --click flags). --fill SEL VALUE (repeatable) types into
// an input before the ready wait (e.g. a DM compose username → the debounced
// profile preview resolves and --ready can target the preview card).
function parseCliViews(argv) {
  const get = (flag) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : argv[i + 1];
  };
  const getMany = (flag) => {
    const out = [];
    for (let i = 0; i < argv.length - 1; i++) {
      if (argv[i] === flag) out.push(argv[i + 1]);
    }
    return out;
  };
  const getPairs = (flag) => {
    const out = [];
    for (let i = 0; i < argv.length - 2; i++) {
      if (argv[i] === flag) out.push([argv[i + 1], argv[i + 2]]);
    }
    return out;
  };
  const name = get('--name');
  const ready = get('--ready');
  if (!name && !ready) return null;
  if (!name || !ready) {
    console.error('--name and --ready must be given together');
    process.exit(1);
  }
  return [{ name, ready, route: get('--route'), toggle: get('--toggle'), clicks: getMany('--click'), fills: getPairs('--fill'), hover: get('--hover') }];
}
const VIEWS = parseCliViews(process.argv.slice(2)) ?? DEFAULT_VIEWS;

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

        // `>> visible=true`: responsive views render BOTH a desktop and a
        // mobile list (one hidden by a breakpoint class); a bare selector
        // matches the hidden copy first and times out even though the view
        // rendered fine.
        if (view.route) {
          // `--click` (repeatable) opens a sub-view (e.g. the create-group
          // sheet from the "New group" CTA, or the face lightbox → a pick
          // tile → the crop step) BEFORE we wait for its ready selector.
          for (const click of view.clicks ?? []) await page.click(click);
          await page.waitForSelector(`${view.ready} >> visible=true`, { timeout: 15000 });
          // Route views are already loaded — a toggle here expands a sub-panel
          // (e.g. the knob rack's "Advanced" panel) after the view is ready.
          if (view.toggle) await page.click(view.toggle);
        } else {
          await page.waitForSelector('[data-testid="dms-screen"] >> visible=true', { timeout: 15000 });
          for (const click of view.clicks ?? []) await page.click(click);
          if (view.toggle) await page.click(view.toggle);
          for (const [sel, val] of view.fills ?? []) await page.fill(sel, val);
          await page.waitForSelector(`${view.ready} >> visible=true`, { timeout: 15000 });
        }
        // `--hover` reveals a hover-only surface (e.g. the video control rack)
        // before the shot: move the pointer over the selector so the
        // mouseenter/mousemove handlers fire and the overlay becomes visible.
        if (view.hover) {
          await page.hover(view.hover);
          await page.waitForTimeout(300);
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
