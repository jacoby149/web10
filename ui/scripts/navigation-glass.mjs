// Self-booting real UI/CSS gate. Requires `npm ci --prefix e2e` and Chromium.
// Data is isolated via the existing ?mock preview; this is NOT live auth proof.
import { chromium } from '../../e2e/node_modules/@playwright/test/index.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const mode = process.env.SCREENSHOT_THEME === 'light' ? 'light' : 'dark';
const output = path.resolve(root, '..', '.context', `auth-navigation-glass${mode === 'light' ? '-light' : ''}`);
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4581);
const origin = `http://localhost:${port}`;
const base = `${origin}/?mock=1&mock_mode=contracts`;
const server = spawn('bun', ['run', 'dev', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
const receipts = [];
const settle = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const capture = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
const compare = (page, on, off) => page.evaluate(async ([on, off]) => {
  const pixels = async data => {
    const bitmap = await createImageBitmap(await (await fetch(`data:image/png;base64,${data}`)).blob());
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    return { width: bitmap.width, height: bitmap.height, data: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data };
  };
  const [a, b] = await Promise.all([pixels(on), pixels(off)]);
  let changed = 0, centerChanged = 0;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    const delta = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
    if (delta > 15) {
      changed++;
      if (x > a.height && x < a.width - a.height && y > 12 && y < a.height - 12) centerChanged++;
    }
  }
  return { changed, centerChanged };
}, [on.toString('base64'), off.toString('base64')]);

try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Authenticator screenshot server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  // No requests to real nodes/vendors, even from the real interface's startup.
  const context = await browser.newContext({ colorScheme: mode });
  await context.addInitScript(() => {
    let current;
    Object.defineProperty(window, 'I', {
      configurable: true,
      get: () => current,
      set: value => {
        current = value;
        value.v3Contracts = [
          { allowed_origin: 'https://auth.web10.app', permissions: { profile: ['readOwn'], settings: ['readOwn'] } },
          { allowed_origin: 'https://social.web10.app', permissions: { profile: ['readOwn'], posts: ['readOwn', 'create'], media: ['readOwn', 'create'] } },
          { allowed_origin: 'https://web10.app', permissions: { profile: ['readOwn'] } },
        ];
        value.v3ManagedGroups = [{ group_id: 'web10.app/groups/users/creator/design-team' }, { group_id: 'web10.app/groups/users/creator/film-club' }];
        value.v3Groups = [{ group_id: 'web10.app/groups/users/reader/film-night' }, { group_id: 'web10.app/groups/users/reader/book-club' }];
      },
    });
  });
  await context.route('**/*', route => {
    const url = route.request().url();
    return url.startsWith(origin) || url.startsWith('data:') ? route.continue() :
      route.fulfill({ json: { configured: true, telemetry: { enabled: false } } });
  });
  for (const width of [1440, 375, 768, 1280]) {
    const page = await context.newPage();
    await page.setViewportSize({ width, height: 812 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base, { waitUntil: 'networkidle' });
    const dock = page.getByTestId('mobile-nav');
    const sidebar = page.getByTestId('hub-sidebar');
    const sidebarNav = page.getByTestId('hub-sidebar-nav');
    const nav = width >= 768 ? sidebarNav : dock;
    await nav.waitFor();
    assert.equal(await (width >= 768 ? dock : sidebarNav).isVisible(), false);
    assert.equal(await page.getByRole('navigation', { name: 'Console navigation' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await sidebar.isVisible(), width >= 768);
    if (width >= 768 && mode === 'dark') assert.equal(await sidebar.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(27, 32, 38)');
    assert.equal(await nav.getByRole('link').count(), 0);
    const header = page.getByTestId('hub-header');
    assert.deepEqual(await header.evaluate(el => {
      const css = getComputedStyle(el);
      return [css.backgroundColor, css.borderBottomWidth];
    }), mode === 'light' ? ['rgb(255, 255, 255)', '1px'] : ['rgb(27, 32, 38)', '1px']);
    assert.equal(await header.getByRole('searchbox').count(), 0);
    assert.equal(await nav.getByRole('button').count(), 7);
    const more = nav.getByRole('button', { name: 'More…' });
    await more.focus();
    await page.keyboard.press('Enter');
    const links = nav.getByRole('link');
    assert.deepEqual(await links.evaluateAll(items => items.map(el => el.getAttribute('href'))), ['https://web10.app', 'https://web10.app/app-store', 'https://web10.app/docs']);
    await page.keyboard.press('Tab');
    assert.equal(await links.first().evaluate(el => el === document.activeElement), true);
    if (width === 1440 || width === 375) await capture(page, `auth-more-${width}`);
    await page.keyboard.press('Escape');
    assert.equal(await more.getAttribute('aria-expanded'), 'false');
    assert.equal(await more.evaluate(el => el === document.activeElement), true);
    const search = page.getByTestId('console-content').getByRole('searchbox', { name: 'Search app permissions' });
    await search.fill('not a matching app');
    await page.getByTestId('contracts-no-match').waitFor();
    await search.fill('');
    if (width >= 768) {
      const account = header.getByTestId('topbar-account');
      await account.click();
      await header.getByTestId('account-logout').waitFor();
      await header.click({ position: { x: 4, y: 4 } });
      assert.equal(await account.getAttribute('aria-expanded'), 'false');
      assert.equal(await page.getByTestId('console-content').evaluate(el => getComputedStyle(el).paddingBottom), '0px');
      const groups = sidebarNav.getByRole('button', { name: 'Group permissions' });
      await groups.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      assert.ok(await groups.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle === 'solid'));
      await groups.click();
      assert.equal(await groups.getAttribute('aria-current'), 'page');
      await sidebarNav.getByRole('button', { name: 'App permissions' }).click();
      await page.mouse.move(0, 0);
      if (width === 1440) await capture(page, 'auth-desktop');
    } else {
      await page.getByTestId('auth-dock-refraction').waitFor();
      const box = await dock.boundingBox();
      assert.ok(box.x >= 12 && box.x + box.width <= width - 12);
      assert.ok(box.y + box.height <= 800);
      assert.equal(await dock.getByRole('button').count(), 7);
      for (const button of await dock.getByRole('button').all()) {
        const b = await button.boundingBox();
        assert.ok(b.width >= 44 && b.height >= 44, '44px touch targets');
        assert.ok(await button.evaluate(el => el.scrollWidth <= el.clientWidth), 'no clipped labels');
      }
      // Composite the actual glass tint over extreme backdrops. Labels must
      // stay AA even when a bright card is scrolling behind the dock.
      const contrast = await dock.evaluate(el => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        const rgb = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        const lum = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        ctx.fillStyle = getComputedStyle(el.querySelector('button:not([aria-current])')).color;
        ctx.fillRect(0, 0, 1, 1); const fg = lum(rgb());
        const tint = getComputedStyle(el.querySelector('.auth-dock-bed')).backgroundColor;
        return ['black', 'white'].map(base => {
          ctx.clearRect(0, 0, 1, 1);
          for (const color of [base, tint]) { ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); }
          const bg = lum(rgb());
          return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
        });
      });
      for (const ratio of contrast) assert.ok(ratio >= 4.5, `label contrast: ${ratio}`);
      const apps = dock.getByRole('button', { name: 'App permissions' });
      await apps.focus();
      assert.equal(await apps.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle === 'solid'), true);
      await apps.blur();
      await page.mouse.move(0, 0);
      await capture(page, 'auth-mobile');
      // Exercise a real navigation handler, not a substituted test navbar.
      await dock.getByRole('button', { name: 'Group permissions' }).click();
      assert.equal(await dock.getByRole('button', { name: 'Group permissions' }).getAttribute('aria-current'), 'page');
      await apps.click();
      // Verify last content can scroll ABOVE the floating dock with a 34px inset.
      const safe = await page.addStyleTag({ content: ':root { --auth-dock-bottom: 34px; }' });
      const content = page.getByTestId('console-content');
      await content.evaluate(el => {
        const spacer = document.createElement('div'); spacer.style.height = '1600px';
        spacer.id = 'clearance-fixture';
        const last = document.createElement('button'); last.textContent = 'Last content'; last.id = 'last-content';
        el.append(spacer, last); el.scrollTop = el.scrollHeight;
      });
      const last = await page.locator('#last-content').boundingBox();
      const safeBox = await dock.boundingBox();
      assert.ok(last.y + last.height < safeBox.y, 'last content clears dock');
      assert.ok(safeBox.y + safeBox.height <= 812 - 34);
      await safe.evaluate(el => el.remove());
      await page.locator('#clearance-fixture, #last-content').evaluateAll(els => els.forEach(el => el.remove()));
      await content.evaluate(el => { el.scrollTop = 0; });
      // Synthetic flat/striped backdrop; actual rendered pixels, not filter parsing.
      const flat = await page.addStyleTag({ content: 'body::after { content:"";position:fixed;inset:0;z-index:39;background:var(--color-background);pointer-events:none; }' });
      await settle(page);
      const flatOn = await dock.screenshot();
      await page.locator('feDisplacementMap').evaluate(el => el.setAttribute('scale', '0'));
      await settle(page);
      const flatZero = await dock.screenshot();
      const flatDifference = await compare(page, flatOn, flatZero);
      assert.equal(flatDifference.changed, 0, 'no self-refracted rings');
      await flat.evaluate(el => el.remove());
      const stripes = await page.addStyleTag({ content: 'body::after { content:"";position:fixed;inset:0;z-index:39;background:repeating-linear-gradient(90deg,var(--color-foreground) 0 6px,var(--color-background) 6px 12px,var(--color-brand) 12px 18px);pointer-events:none; }' });
      await settle(page);
      const zero = await dock.screenshot();
      await page.locator('feDisplacementMap').evaluate(el => el.setAttribute('scale', '18'));
      await settle(page);
      const on = await dock.screenshot({ path: path.join(output, 'auth-optics.png') });
      const difference = await compare(page, on, zero);
      assert.ok(difference.changed > 150, 'rim actually displaces backdrop pixels');
      assert.equal(difference.centerChanged, 0, 'reading surface stays undistorted');
      await stripes.evaluate(el => el.remove());
      const oldMap = await page.locator('feImage').getAttribute('href');
      await page.setViewportSize({ width: 430, height: 812 });
      await page.waitForFunction(old => document.querySelector('feImage')?.getAttribute('href') !== old, oldMap);
      await page.setViewportSize({ width, height: 812 });
      const cdp = await context.newCDPSession(page);
      await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
      assert.equal(await dock.locator('.auth-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      assert.equal(await dock.locator('.auth-dock-bed').evaluate(el => getComputedStyle(el).clipPath), 'none');
      assert.equal(await dock.locator('.auth-dock-rim').isVisible(), false);
      await capture(page, 'auth-opaque-mobile');
      await cdp.send('Emulation.setEmulatedMedia', { features: [] });
      await page.emulateMedia({ forcedColors: 'active' });
      assert.equal(await dock.evaluate(el => getComputedStyle(el, '::after').display), 'none');
      assert.equal(await dock.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
      assert.equal(await dock.locator('.auth-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter), 'none');
      await page.emulateMedia({ forcedColors: 'none', reducedMotion: 'reduce' });
      assert.equal(await page.getByTestId('auth-dock-refraction').isVisible(), true);
      receipts.push({ width, contrast, flatDifference, difference, resize: true, safeArea: true, fallbacks: true });
    }
    await nav.getByRole('button', { name: 'Group permissions' }).click();
    const groups = page.getByTestId('groups-page');
    const groupSearch = groups.getByRole('searchbox', { name: 'Search group permissions' });
    const groupCards = groups.getByTestId('group-card-header');
    await groupSearch.fill(' FILM ');
    assert.match(await groupCards.first().innerText(), /film-club/);
    assert.equal(await groupCards.count(), 1);
    if (width === 1440 || width === 375) await capture(page, `auth-group-search-${width}`);
    await groups.getByTestId('groups-tab-belong').click();
    assert.match(await groupCards.first().innerText(), /film-night/);
    assert.equal(await groupCards.count(), 1);
    await groupSearch.fill('no matching group');
    await groups.getByRole('status').filter({ hasText: 'No groups match' }).waitFor();
    assert.equal(await groupCards.count(), 0);
    await groupSearch.clear();
    assert.equal(await groupCards.count(), 2);
    // Existing mock interface state setters exercise non-admin/signed-out gates.
    await page.evaluate(() => window.I.setIsAdmin(false));
    await nav.getByRole('button', { name: 'Config' }).waitFor({ state: 'detached' });
    assert.equal(await nav.getByRole('button').count(), 5);
    if (width === 375) await capture(page, 'auth-personal-mobile');
    await page.evaluate(() => window.I.logout());
    await nav.waitFor({ state: 'detached' });
    assert.deepEqual(errors, []);
    await page.close();
  }
  // Safari UA is a fallback-selection test, NOT a native Safari rendering test.
  const fallback = await browser.newContext({ colorScheme: mode, viewport: { width: 375, height: 812 }, userAgent: 'Mozilla/5.0 Version/19 Safari/605.1.15' });
  await fallback.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.fulfill({ json: { configured: true } }));
  const page = await fallback.newPage();
  await page.goto(base, { waitUntil: 'networkidle' });
  assert.equal(await page.getByTestId('auth-dock-refraction').count(), 0);
  assert.ok(await page.locator('.auth-dock-bed').evaluate(el => getComputedStyle(el).backdropFilter.includes('blur')));
  await capture(page, 'auth-frost-mobile');
  // Remove the enhancement declaration to simulate no backdrop-filter support.
  await page.evaluate(() => {
    for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
      if (rule instanceof CSSSupportsRule && rule.conditionText.includes('backdrop-filter')) {
        for (const child of rule.cssRules) if (child instanceof CSSStyleRule) {
          child.style.removeProperty('background'); child.style.removeProperty('backdrop-filter'); child.style.removeProperty('-webkit-backdrop-filter');
        }
      }
    }
  });
  assert.equal(await page.locator('.auth-dock-bed').evaluate(el => getComputedStyle(el).backgroundColor), mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(51, 54, 59)');
  await writeFile(path.join(output, 'receipt.json'), JSON.stringify({
    evidence: 'Real Chromium UI/CSS, existing mock data, synthetic optical backdrop/safe-area. Not live auth, Safari, physical-phone or production proof.',
    widths: [375, 768, 1280, 1440], receipts, unverifiedEngineFallback: true, noFilterFallback: true,
  }, null, 2));
  console.log('[auth-navigation-glass] passed', receipts);
} finally { await browser?.close(); server.kill('SIGTERM'); }
