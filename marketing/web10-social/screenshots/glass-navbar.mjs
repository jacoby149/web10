// Glass chrome receipt (D109): captures the four glass bars — the desktop
// top bar, the mobile header, the mobile bottom nav and the group-detail
// sticky bar — at desktop (1440) and 375px in BOTH palettes, plus the two
// desktop open states (search dropdown, user menu).
//
// It boots its own harness Vite server (the same one capture.mjs uses — no
// docker stack, no login) and drives real Chromium. Beyond pixels it asserts
// the COMPUTED styles of each bar (backdrop-filter blur/saturate, the
// translucent fill, the open-state fill step-up, the desktop group-bar
// flat escape) — the receipt JSON is the signal, not just the PNGs. The
// prefers-reduced-transparency floor is asserted statically against the
// production build's CSS (headless Chromium cannot emulate that media
// feature live — verified, including the reduced-motion control).
// Requires `bun run build` (dist/) for the static control.
//
//   SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/glass-navbar" \
//     node screenshots/glass-navbar.mjs
//
// Data is isolated fixtures; this is UI evidence, not node/deployment proof.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.SCREENSHOT_PORT || 4503);
const URL = `http://localhost:${PORT}/screenshots/harness/index.html`;
const OUT = process.env.SCREENSHOT_OUTPUT_DIR || __dirname;
fs.mkdirSync(OUT, { recursive: true });

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 375, height: 812 };

// Expected computed background-color per palette (index.css glass tokens).
const FILL = {
  dark: { glass: 'rgba(17, 17, 19, 0.65)', open: 'rgba(17, 17, 19, 0.92)', solid: 'rgb(17, 17, 19)' },
  light: { glass: 'rgba(255, 255, 255, 0.65)', open: 'rgba(255, 255, 255, 0.92)', solid: 'rgb(255, 255, 255)' },
};

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

const runner = process.env.VITE_RUNNER || 'bunx';
// The vite config reads SCREENSHOT_PORT too (strictPort: true) — pass ours
// through so the probe URL and the listener can never disagree.
const server = spawn(runner, ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SCREENSHOT_PORT: String(PORT) },
});

const receipt = { startedAt: new Date().toISOString(), cases: [] };
let failed = 0;

async function check(name, sel, page, expect) {
  const actual = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return { missing: true };
    const cs = getComputedStyle(el);
    return {
      missing: false,
      backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
      backgroundColor: cs.backgroundColor,
    };
  }, sel);
  const result = { name, selector: sel, expected: expect, actual };
  receipt.cases.push(result);
  if (actual.missing) {
    result.pass = false;
    result.note = 'element not found';
    failed++;
    return;
  }
  const bad = [];
  if (expect.backdropFilter && !String(actual.backdropFilter).includes(expect.backdropFilter)) bad.push(`backdrop-filter ${actual.backdropFilter} !~ ${expect.backdropFilter}`);
  if (expect.backgroundColor && actual.backgroundColor !== expect.backgroundColor) bad.push(`background-color ${actual.backgroundColor} !== ${expect.backgroundColor}`);
  result.pass = bad.length === 0;
  result.note = bad.join('; ');
  if (bad.length) failed++;
}

// Load ?screen=go, wait for `ready`, settle, run computed-style asserts, shoot.
async function shoot(browser, viewport, colorScheme, go, ready, asserts, shotName) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 });
  const log = [];
  page.on('pageerror', (e) => log.push(`[pageerror] ${e.message}`));
  try {
    await page.goto(`${URL}?screen=${go}`, { waitUntil: 'networkidle' });
    if (ready) await page.waitForSelector(`${ready} >> visible=true`, { timeout: 15000 });
    await page.waitForTimeout(400); // settle fonts/skeletons
    for (const a of asserts ?? []) await check(a.name, a.sel, page, a.expect);
    const out = path.join(OUT, `${shotName}.png`);
    await page.screenshot({ path: out });
    console.log('wrote', out);
  } catch (err) {
    failed++;
    receipt.cases.push({ name: shotName, pass: false, note: `capture failed: ${err.message}` });
    console.error(`=== CAPTURE FAILED: ${shotName} (${colorScheme}) ===`);
    console.error(log.join('\n') || '(page logged nothing — check the Vite server output above)');
    throw err;
  } finally {
    await page.close();
  }
}

// Same as shoot, but with a click before the ready wait (open-state shots).
async function openAndShoot(browser, viewport, colorScheme, go, readyAfterLoad, clickSel, readySel, assert, shotName) {
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor: 2 });
  try {
    await page.goto(`${URL}?screen=${go}`, { waitUntil: 'networkidle' });
    if (readyAfterLoad) await page.waitForSelector(`${readyAfterLoad} >> visible=true`, { timeout: 15000 });
    await page.click(`${clickSel} >> visible=true`);
    await page.waitForSelector(`${readySel} >> visible=true`, { timeout: 15000 });
    await page.waitForTimeout(350); // panel-in settles
    await check(assert.name, assert.sel, page, assert.expect);
    const out = path.join(OUT, `${shotName}.png`);
    await page.screenshot({ path: out });
    console.log('wrote', out);
  } finally {
    await page.close();
  }
}

try {
  await waitForServer(URL);
  const browser = await chromium.launch();

  for (const scheme of ['dark', 'light']) {
    // 1. Resting desktop top bar over the feed — the glass must read.
    await shoot(browser, DESKTOP, scheme, 'feed', '[data-testid="post-author-link"]', [
      { name: `topbar-${scheme}-blur`, sel: '[data-testid="topbar-desktop"]', expect: { backdropFilter: 'blur(20px)' } },
      { name: `topbar-${scheme}-saturate`, sel: '[data-testid="topbar-desktop"]', expect: { backdropFilter: 'saturate(1.6)' } },
      { name: `topbar-${scheme}-fill`, sel: '[data-testid="topbar-desktop"]', expect: { backgroundColor: FILL[scheme].glass } },
    ], `glass-feed-${scheme}`);

    // 2. Open state: the search dropdown hangs off the bar -> the fill steps
    //    up to --color-glass-open (caught by the .glass-bar:has() rule).
    await openAndShoot(browser, DESKTOP, scheme, 'feed', '[data-testid="post-author-link"]',
      '[data-testid="global-search-field"]', '[data-testid="global-search-results"]',
      { name: `topbar-${scheme}-search-open`, sel: '[data-testid="topbar-desktop"]', expect: { backgroundColor: FILL[scheme].open } },
      `glass-search-open-${scheme}`);

    // 3. Open state: the user menu (bg-glass-open via Layout's cn()).
    await openAndShoot(browser, DESKTOP, scheme, 'feed', '[data-testid="post-author-link"]',
      '[data-testid="user-menu-trigger"]', '[data-testid="user-menu"]',
      { name: `topbar-${scheme}-user-menu-open`, sel: '[data-testid="topbar-desktop"]', expect: { backgroundColor: FILL[scheme].open } },
      `glass-user-menu-${scheme}`);

    // 4. Mobile: header + bottom nav both glass, over the feed.
    await shoot(browser, MOBILE, scheme, 'feed', '[data-testid="post-author-link"]', [
      { name: `mobile-header-${scheme}-fill`, sel: '[data-testid="topbar-mobile"]', expect: { backdropFilter: 'blur(20px)', backgroundColor: FILL[scheme].glass } },
      { name: `bottom-nav-${scheme}-fill`, sel: 'nav[aria-label="Primary mobile"]', expect: { backdropFilter: 'blur(20px)', backgroundColor: FILL[scheme].glass } },
    ], `glass-mobile-${scheme}`);

    // 5. Group-detail sticky bar (mobile) — glass while sticky over the
    //    scrollable group content.
    await shoot(browser, MOBILE, scheme, 'groups-detail', '[data-testid="group-detail-hero"]', [
      { name: `group-bar-${scheme}-fill`, sel: '[data-testid="group-detail-topbar"]', expect: { backdropFilter: 'blur(20px)', backgroundColor: FILL[scheme].glass } },
    ], `glass-group-${scheme}`);
  }

  // 6. The desktop group bar is the one glass surface that flattens at md
  //    (md:static + md:bg-transparent): the CSS escape must kill the blur.
  await shoot(browser, DESKTOP, 'dark', 'groups-detail', '[data-testid="group-detail-hero"]', [
    { name: 'group-bar-desktop-flat', sel: '[data-testid="group-detail-topbar"]', expect: { backdropFilter: 'none', backgroundColor: 'rgba(0, 0, 0, 0)' } },
  ], 'glass-group-desktop');

  // 7. Reduced-transparency floor. Headless Chromium cannot emulate the
  //    `prefers-reduced-transparency` media feature live (verified: CDP
  //    Emulation.setEmulatedMedia and --force-* flags are inert for it in
  //    this build, even for the long-standing reduced-motion control), so
  //    the floor is asserted statically against the PRODUCTION build: the
  //    media block must survive the pipeline and must kill the
  //    .glass-bar backdrop-filter. Requires `bun run build` first (dist/).
  {
    const distDir = path.join(root, 'dist', 'assets');
    const cssFiles = fs.readdirSync(distDir).filter((f) => f.endsWith('.css'));
    const css = cssFiles.map((f) => fs.readFileSync(path.join(distDir, f), 'utf8')).join('\n');
    const result = { name: 'build-css-reduced-transparency', selector: 'dist/assets/*.css', expected: 'media block present, .glass-bar backdrop-filter killed', actual: { cssFiles } };
    const idx = css.indexOf('prefers-reduced-transparency');
    if (idx === -1) {
      result.pass = false;
      result.note = 'prefers-reduced-transparency block missing from built CSS';
    } else {
      // Minified CSS: the block is @media (prefers-reduced-transparency:reduce){...}
      const block = css.slice(idx, idx + 600);
      const killsBlur = /\.glass-bar\{[^}]*backdrop-filter:none/.test(block);
      result.actual.block = block.slice(0, 300);
      result.pass = killsBlur;
      result.note = killsBlur ? '' : 'media block present but does not kill .glass-bar backdrop-filter';
    }
    receipt.cases.push(result);
    if (!result.pass) failed++;
  }
} catch (err) {
  console.error(err.message);
}

receipt.finishedAt = new Date().toISOString();
receipt.failed = failed;
receipt.ok = failed === 0;
const receiptPath = path.join(OUT, 'glass-navbar-receipt.json');
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
console.log(`receipt: ${receiptPath} (${failed} failed case(s))`);
process.exit(failed === 0 ? 0 : 1);
