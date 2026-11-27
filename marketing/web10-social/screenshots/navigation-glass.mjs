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
async function checkHeaderBrand(brand, mode, fontSize, markSize) {
  const wordmark = brand.getByTestId('social-header-wordmark');
  const keys = brand.getByTestId('theme-key-mark');
  const shown = keys.locator(`img[data-brand-variant="${mode === 'dark' ? 'white' : 'dark'}"]`);
  assert.equal(await wordmark.innerText(), 'web10 social');
  assert.equal(await wordmark.evaluate(el => getComputedStyle(el).fontSize), `${fontSize}px`);
  assert.equal(await brand.getByTestId('social-header-mark').count(), 0);
  assert.equal(await keys.locator('img:visible').count(), 1);
  assert.ok(await shown.evaluate(img => img.complete && img.naturalWidth > 0), 'the theme-correct keys PNG loads');
  const [mark, text, container] = await Promise.all([shown.boundingBox(), wordmark.boundingBox(), brand.boundingBox()]);
  assert.deepEqual([mark.width, mark.height], [markSize, markSize]);
  assert.ok(mark.x >= container.x && mark.x + mark.width < text.x && text.x + text.width <= container.x + container.width,
    'the keys sit to the left of the full wordmark inside the header');
  return text.x + text.width;
}
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
      if (width === 1440 && mode === 'dark') {
        const icon = await page.evaluate(async () => {
          const manifest = await (await fetch('/manifest.json')).json();
          const entry = manifest.icons.find(icon => icon.purpose === 'maskable');
          const bitmap = await createImageBitmap(await (await fetch(`/${entry.src}`)).blob());
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(bitmap, 0, 0);
          const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
          let transparent = 0, upperOutsideMask = 0, lowerOutsideMask = 0;
          const bottom = [0, 0];
          const highlights = [0, 0];
          for (let y = 0; y < bitmap.height; y++) for (let x = 0; x < bitmap.width; x++) {
            const i = (y * bitmap.width + x) * 4;
            const r = data[i], g = data[i + 1], b = data[i + 2];
            if (data[i + 3] !== 255) transparent++;
            if (r === 4 && g === 103 && b === 242) continue;
            if (r > 220 && g < 40) highlights[0]++;
            if (r < 40 && g > 175 && b > 200) highlights[1]++;
            if (y === bitmap.height - 1) bottom[x < bitmap.width / 2 ? 0 : 1]++;
            if (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) > 512 * 0.4) {
              // Only the lower silhouettes may extend past the safe circle.
              if (y < 360) upperOutsideMask++;
              else lowerOutsideMask++;
            }
          }
          return { sizes: entry.sizes, width: bitmap.width, height: bitmap.height, transparent, upperOutsideMask, lowerOutsideMask, bottom, highlights };
        });
        // The enlarged chrome crop lost both sets of saturated line highlights.
        assert.ok(icon.highlights.every(pixels => pixels > 1000), 'the launch artwork retains its pink and cyan line detail');
        assert.ok(icon.lowerOutsideMask > 0 && icon.bottom.every(pixels => pixels > 0), 'both lower silhouettes bleed through the bottom edge');
        assert.deepEqual([icon.sizes, icon.width, icon.height, icon.transparent, icon.upperOutsideMask], ['512x512', 512, 512, 0, 0],
          'maskable PNG fills the launcher shape and protects the upper artwork from clipping');
      }
      const mobile = width < 768;
      const darkDesktop = mode === 'dark' && !mobile;
      const headerFill = mode === 'dark' ? 'rgb(27, 32, 38)' : 'rgb(255, 255, 255)';
      const headerInk = mode === 'dark' ? 'rgb(250, 250, 250)' : 'rgb(24, 24, 27)';
      const dividerWidth = mode === 'light' || darkDesktop ? '1px' : '0px';
      const dock = page.locator('nav[aria-label="Primary mobile"]');
      const expectedDock = ['nav-feed-mobile', 'nav-video-mobile', 'nav-shorts-mobile', 'nav-music-mobile', 'nav-more-mobile'];
      const dockItems = () => dock.locator('button').evaluateAll(buttons => buttons.map(button => button.dataset.testid));
      assert.deepEqual(await dockItems(), expectedDock);
      const header = page.getByTestId(mobile ? 'topbar-mobile' : 'topbar-desktop');
      assert.equal(await header.isVisible(), true);
      assert.equal((await header.boundingBox()).height, mobile ? 60 : 64);
      const brand = mobile ? header : page.getByTestId('sidebar-brand-strip');
      const brandRight = await checkHeaderBrand(brand, mode, mobile ? 20 : 24, mobile ? 24 : 28);
      assert.deepEqual(await header.evaluate(el => {
        const css = getComputedStyle(el);
        return [css.backgroundColor, css.backdropFilter, css.borderTopWidth, css.borderBottomWidth];
      }), [headerFill, 'none', '0px', dividerWidth], 'Light uses a white header with a divider; Dark retains its desktop-only divider');
      const search = header.getByRole(mobile ? 'button' : 'textbox', { name: 'Search', exact: true });
      assert.equal(await search.evaluate(el => getComputedStyle(el).color), headerInk, 'search uses ink for the header palette');
      assert.ok(brandRight < (await search.boundingBox()).x, 'the lockup clears search');
      const bell = header.getByRole('button', { name: /^Notifications\b/ });
      if (!mobile) {
        const bellBounds = await bell.boundingBox();
        const accountBounds = await header.getByTestId('user-menu-trigger').boundingBox();
        assert.equal(accountBounds.x - (bellBounds.x + bellBounds.width), 12, 'desktop bell and account have 12px between their controls');
        const strip = page.getByTestId('sidebar-brand-strip');
        assert.deepEqual(await strip.evaluate(el => {
          const css = getComputedStyle(el);
          return [css.backgroundColor, css.borderBottomWidth];
        }), [headerFill, dividerWidth]);
        if (darkDesktop) {
          for (const segment of [strip, header]) {
            assert.equal(await segment.evaluate(el => getComputedStyle(el).borderBottomColor), 'rgb(54, 65, 77)');
          }
        }
        const brand = await strip.boundingBox(), bar = await header.boundingBox();
        assert.equal(brand.height, bar.height);
        assert.equal(brand.y + brand.height, bar.y + bar.height, 'the bottom edges line up across the app');
        assert.equal(brand.x + brand.width, bar.x, 'brand strip and toolbar meet with no seam');
        const firstRow = await page.getByRole('navigation', { name: 'Primary', exact: true }).getByRole('button').first().boundingBox();
        assert.equal(firstRow.y - (brand.y + brand.height), 12, 'the desktop sidebar starts 12px below the header');
        assert.equal(await strip.locator('..').evaluate(el => getComputedStyle(el).backgroundColor),
          mode === 'dark' ? 'rgb(27, 32, 38)' : 'color(srgb 1 1 1 / 0.88)', 'sidebar charcoal is dark-only');
      }
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
      await bell.click();
      const panel = page.getByTestId('notifications-panel');
      await panel.waitFor();
      const barBounds = await header.boundingBox();
      assert.equal((await panel.boundingBox()).y, barBounds.y + barBounds.height, 'notifications start below the taller bar');
      await page.keyboard.press('Escape');
      await panel.waitFor({ state: 'hidden' });
      if (width === 1440 || mobile) {
        await page.goto(`${base}?screen=posts-discover`, { waitUntil: 'networkidle' });
        const topics = await page.getByTestId('discover-topic-column').boundingBox();
        const posts = await page.getByTestId('discover-grid').boundingBox();
        assert.equal(topics.x - posts.x, mobile ? 16 : 0, 'topics align to the desktop post column and keep the phone gutter');
        await capture(page, `discover-topics-${mode}-${width}`);
      }
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
      }
      await page.goto(`${base}?screen=appearance&anon=1`, { waitUntil: 'networkidle' });
      assert.deepEqual(await dockItems(), expectedDock, 'signed-out dock matches signed-in order');
      if (mobile) {
        const appearance = page.getByTestId('nav-appearance-anon');
        assert.ok(await checkHeaderBrand(header, mode, 20, 24) < (await appearance.boundingBox()).x,
          'the full-size signed-out lockup clears Appearance');
        await page.setViewportSize({ width: 360, height: 900 });
        assert.ok(await checkHeaderBrand(header, mode, 20, 24) < (await appearance.boundingBox()).x,
          'the full-size signed-out lockup fits at the 360px breakpoint');
        await page.setViewportSize({ width: 320, height: 900 });
        const compactBrandRight = await checkHeaderBrand(header, mode, 16, 20);
        const appearanceBounds = await appearance.boundingBox();
        const signInBounds = await page.getByTestId('sign-in-button-mobile').boundingBox();
        assert.ok(compactBrandRight < appearanceBounds.x && signInBounds.x + signInBounds.width <= 320 &&
          signInBounds.height >= 44, `signed-out 320px fit: ${JSON.stringify({ compactBrandRight, appearanceBounds, signInBounds })}`);
        await page.setViewportSize({ width, height: 900 });
        for (const id of ['nav-feed-mobile', 'nav-video-mobile', 'nav-shorts-mobile', 'nav-music-mobile']) {
          const button = page.getByTestId(id);
          await button.click();
          await page.locator(`[data-testid="${id}"][aria-current="page"]`).waitFor();
          assert.equal(await button.getAttribute('aria-current'), 'page', `${id} navigates anonymously`);
          const target = await button.boundingBox();
          assert.ok(target.width >= 44 && target.height >= 44);
        }
        await capture(page, `glass-anon-music-${mode}-${width}`);
        await page.getByTestId('nav-more-mobile').click();
        const sheet = page.getByTestId('more-sheet');
        assert.deepEqual(await sheet.locator('button[data-testid]').allTextContents(), ['People', 'Appearance']);
        assert.equal(await page.getByTestId('nav-more-messages-badge').count(), 0);
        await capture(page, `glass-anon-more-${mode}-${width}`);
        await page.getByTestId('nav-people-mobile').click();
        await page.locator('[data-testid="nav-more-mobile"][aria-current="page"]').waitFor();
        assert.equal(await sheet.count(), 0);
        assert.equal(await page.getByTestId('nav-more-mobile').getAttribute('aria-current'), 'page');
        await page.getByTestId('nav-more-mobile').click();
        await page.getByTestId('nav-appearance-mobile').focus();
        await page.keyboard.press('Enter');
        await page.getByTestId('appearance-settings').waitFor();
      } else if (width === 1440) {
        await capture(page, `glass-anon-${mode}-${width}`);
      }
      assert.deepEqual(errors, []);
      receipts.push({ width, mode, navigation: true, focus: true, mobileClearanceAndFallbacks: mobile, errors });
      console.log('[navigation-glass]', receipts.at(-1));
      await page.close();
    }
  }
  await writeFile(path.join(output, 'navigation-glass-receipt.json'), JSON.stringify({ evidence: 'Real Chromium shell/CSS, isolated data; simulated safe area, not Safari/physical-phone/production proof', receipts }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
