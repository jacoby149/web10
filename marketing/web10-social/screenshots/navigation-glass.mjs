// Real shell/CSS and browser interactions; data stays in the isolated harness.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to a workspace .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4578);
const base = `http://localhost:${port}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) },
});
const receipts = [];
let browser;
const capture = (page, name) => page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Navigation glass server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const width of [1440, 375, 768, 1280]) {
    for (const mode of ['dark', 'light']) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: mode });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`${base}?screen=posts-following`, { waitUntil: 'networkidle' });
      const mobile = width < 768;
      const dock = page.getByRole('navigation', { name: 'Primary mobile', exact: true });
      const header = page.getByTestId(mobile ? 'topbar-mobile' : 'topbar-desktop');
      assert.equal(await header.isVisible(), true);
      assert.equal(await header.evaluate(el => getComputedStyle(el).backdropFilter.includes('blur')), true);
      assert.equal(await header.evaluate(el => getComputedStyle(el).backgroundImage), 'none', 'no painted frost gradient');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      const primary = page.getByTestId(mobile ? 'nav-feed-mobile' : 'nav-feed');
      assert.equal(await primary.getAttribute('aria-current'), 'page');
      await primary.focus();
      assert.equal(await primary.evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineStyle !== 'none'), true);
      if (mobile) {
        await page.getByTestId('dock-refraction').waitFor();
        const box = await dock.boundingBox();
        assert.ok(box.x >= 12 && box.x + box.width <= width - 12);
        assert.ok(box.y + box.height <= 900 - 12);
        for (const button of await dock.getByRole('button').all()) {
          const target = await button.boundingBox();
          assert.ok(target.width >= 44 && target.height >= 44, '44px dock targets');
        }
        // Composite the strongest highlight over both extreme backdrops. The
        // neutral labels must stay AA even over pure white/black feed pixels.
        const contrast = await dock.evaluate(el => {
          const css = getComputedStyle(el.querySelector('.chrome-dock-bed'));
          const text = getComputedStyle(el.querySelector('button:not([aria-current])')).color;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d');
          const rgb = () => [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
          const lum = rgb => rgb.map(v => v / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
          ctx.fillStyle = text; ctx.fillRect(0, 0, 1, 1);
          const fg = lum(rgb());
          const probe = document.createElement('span');
          probe.style.color = 'var(--chrome-highlight)'; el.append(probe);
          const highlight = getComputedStyle(probe).color; probe.remove();
          return ['black', 'white'].map(base => {
            ctx.clearRect(0, 0, 1, 1);
            for (const color of [base, css.backgroundColor, highlight]) {
              ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1);
            }
            const bg = lum(rgb());
            return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
          });
        });
        for (const ratio of contrast) assert.ok(ratio >= 4.5, `dock label contrast ${ratio}`);
        const fab = await page.getByTestId('new-post-fab').boundingBox();
        assert.ok(fab.y + fab.height < box.y, 'compose clears dock');
        const scroll = page.getByTestId('shell-content');
        assert.ok(await scroll.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom)) > 80);
        // Safe-area substitution exercises the same positioning variables on
        // desktop Chromium, which has no physical iPhone home-indicator inset.
        await page.addStyleTag({ content: ':root { --chrome-dock-bottom: 34px; }' });
        const safeDock = await dock.boundingBox();
        const safeFab = await page.getByTestId('new-post-fab').boundingBox();
        assert.ok(safeDock.y + safeDock.height <= 900 - 34);
        assert.ok(safeFab.y + safeFab.height < safeDock.y);
        await page.locator('style').last().evaluate(el => el.remove());
      } else {
        assert.equal(await page.getByTestId('dock-refraction').count(), 0, 'hidden desktop dock allocates no lens map');
      }
      await page.mouse.move(0, 0);
      await primary.blur();
      if (width === 1440 || mobile) await capture(page, `glass-${mode}-${width}`);
      // Navigate with the existing buttons, not a replacement mock navbar.
      // Use the static appearance screen so feed URL synchronization isn't
      // concurrent with this shell-only navigation check.
      await page.goto(`${base}?screen=appearance`, { waitUntil: 'networkidle' });
      await page.getByTestId(mobile ? 'nav-video-mobile' : 'nav-video').click();
      await page.locator(`[data-testid="${mobile ? 'nav-video-mobile' : 'nav-video'}"][aria-current="page"]`).waitFor().catch(async error => {
        await capture(page, 'navigation-failure');
        console.error('[navigation-glass] nav failure', await page.locator('main').innerText(), errors);
        throw error;
      });
      assert.equal(await page.getByTestId(mobile ? 'nav-video-mobile' : 'nav-video').getAttribute('aria-current'), 'page');
      await page.goto(`${base}?screen=appearance`, { waitUntil: 'networkidle' });
      if (mobile) {
        await page.getByTestId('nav-more-mobile').click();
        await page.getByTestId('more-sheet').waitFor();
        if (width === 375) await capture(page, `glass-more-${mode}-${width}`);
        await page.getByTestId('nav-appearance-mobile').click();
      } else {
        await page.getByTestId('nav-more-desktop').click();
        if (width === 1440) await capture(page, `glass-more-${mode}-${width}`);
        await page.getByTestId('nav-appearance-desktop').click();
      }
      await page.getByTestId('appearance-settings').waitFor();
      if (!mobile) {
        await page.getByTestId('user-menu-trigger').click();
        await page.getByTestId('user-menu').waitFor();
        if (width === 1440) await capture(page, `glass-account-${mode}-${width}`);
        await page.keyboard.press('Escape');
        assert.equal(await page.getByTestId('user-menu').count(), 0);
      }
      if (mobile) {
        const client = await page.context().newCDPSession(page);
        await client.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
        assert.equal(await dock.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
        assert.equal(await dock.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backgroundColor), mode === 'dark' ? 'rgb(17, 17, 19)' : 'rgb(255, 255, 255)');
        await client.send('Emulation.setEmulatedMedia', { features: [] });
        await page.emulateMedia({ forcedColors: 'active' });
        assert.equal(await dock.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
        assert.equal(await dock.evaluate(el => getComputedStyle(el, '::after').display), 'none', 'forced colors use the native dock border, not a decorative overlay');
        assert.equal(await dock.evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
        await page.emulateMedia({ forcedColors: 'none' });
        // Remove only the enhancement rule to simulate an unsupported browser.
        await page.evaluate(() => {
          // No URL enhancement is mounted on unsupported engines.
          document.querySelector('[data-testid="dock-refraction"]')?.remove();
          for (const sheet of document.styleSheets) for (const rule of sheet.cssRules) {
            if (rule instanceof CSSSupportsRule && rule.conditionText.includes('backdrop-filter')) {
              for (const child of rule.cssRules) if (child instanceof CSSStyleRule) {
                child.style.removeProperty('background-color');
                child.style.removeProperty('backdrop-filter');
                child.style.removeProperty('-webkit-backdrop-filter');
              }
            }
          }
        });
        assert.equal(await dock.locator('.chrome-dock-bed').evaluate(el => getComputedStyle(el).backgroundColor), mode === 'dark' ? 'rgb(17, 17, 19)' : 'rgb(255, 255, 255)');
        assert.equal(await dock.evaluate(el => getComputedStyle(el).backdropFilter), 'none');
        await page.goto(`${base}?screen=music-player`, { waitUntil: 'networkidle' });
        await page.getByTestId('music-player').waitFor();
        const player = await page.getByTestId('music-player').boundingBox();
        const dockBox = await dock.boundingBox();
        assert.ok(player.y + player.height <= dockBox.y, 'music player clears dock');
        await page.goto(`${base}?screen=shorts-lens`, { waitUntil: 'networkidle' });
        await page.getByTestId('short-slide-0').waitFor();
        assert.equal(await dock.isVisible(), false, 'immersive Shorts keeps dock hidden');
        await page.goto(`${base}?screen=appearance&anon=1`, { waitUntil: 'networkidle' });
        assert.equal(await page.getByTestId('nav-more-mobile').count(), 0);
        assert.equal(await page.getByTestId('nav-appearance-anon').isVisible(), true);
      }
      assert.deepEqual(errors, []);
      receipts.push({ width, mode, navigation: true, focus: true, mobileClearanceAndFallbacks: mobile, errors });
      console.log('[navigation-glass]', receipts.at(-1));
      await page.close();
    }
  }
  await writeFile(path.join(output, 'navigation-glass-receipt.json'), JSON.stringify({ evidence: 'Real Chromium shell/CSS, isolated data; simulated safe area, not Safari/physical-phone/production proof', receipts }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
