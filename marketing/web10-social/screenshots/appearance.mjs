// Actual Chromium and real UI/CSS; only app data uses the isolated harness.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to a workspace .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.SCREENSHOT_PORT || 4567);
const base = `http://localhost:${port}/screenshots/harness/index.html`;
const server = spawn('bunx', ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SCREENSHOT_PORT: String(port) },
});
let browser;
const receipts = [];
const key = 'web10-social:theme';
const theme = (page, expected) => page.waitForFunction(value => document.documentElement.dataset.theme === value, expected);
async function capture(page, name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true, animations: 'disabled' });
}
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(base)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Appearance server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();

  // Hold the React entry entirely: the head script must resolve theme first.
  for (const [colorScheme, saved, expected] of [['light', null, 'light'], ['dark', null, 'dark'], ['light', 'dark', 'dark'], ['dark', 'light', 'light']]) {
    const page = await browser.newPage({ colorScheme });
    if (saved) await page.addInitScript(([key, saved]) => localStorage.setItem(key, saved), [key, saved]);
    await page.route('**/entry.tsx', route => route.abort());
    await page.goto(`${base}?screen=appearance`);
    await theme(page, expected);
    assert.equal(await page.locator('#root').innerHTML(), '');
    assert.equal(await page.locator('html').evaluate(el => el.style.colorScheme), expected);
    await page.close();
    receipts.push({ startupWithoutReact: { colorScheme, saved, expected } });
  }

  for (const [label, width] of [['desktop', 1440], ['375', 375]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('[appearance] page error:', error.message); });
    await page.goto(`${base}?screen=settings`, { waitUntil: 'networkidle' });
    await page.getByTestId('appearance-settings').waitFor();
    await theme(page, 'light');
    await page.emulateMedia({ colorScheme: 'dark' });
    await theme(page, 'dark');
    // Native radio keyboard behavior, not a programmatic preference write.
    await page.getByRole('radio', { name: 'System', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await theme(page, 'light');
    assert.equal(await page.getByRole('radio', { name: 'Light', exact: true }).isChecked(), true);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), 'light');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await theme(page, 'light');
    await page.reload({ waitUntil: 'networkidle' });
    await theme(page, 'light');
    await capture(page, `settings-light-${label}`);

    const tab = await context.newPage();
    await tab.goto(`${base}?screen=appearance`, { waitUntil: 'networkidle' });
    await tab.getByRole('radio', { name: 'Dark', exact: true }).check();
    await theme(page, 'dark');
    await capture(page, `settings-dark-${label}`);
    await tab.evaluate(key => localStorage.removeItem(key), key);
    await page.getByRole('radio', { name: 'System', exact: true }).waitFor();
    await theme(page, 'dark');
    assert.equal(await page.getByRole('radio', { name: 'System', exact: true }).isChecked(), true);
    await tab.close();

    // Drive shell navigation, including signed-out mobile, not just direct render.
    await page.goto(`${base}?screen=appearance&anon=1`, { waitUntil: 'networkidle' });
    if (width < 768) await page.getByTestId('nav-appearance-anon').click();
    else {
      await page.getByTestId('nav-more-desktop').click();
      await page.getByTestId('nav-appearance-desktop').click();
    }
    for (const mode of ['light', 'dark']) {
      await page.getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark', exact: true }).check();
      await theme(page, mode);
      const colors = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        return { background: css.getPropertyValue('--color-background').trim(),
          native: css.colorScheme, chrome: document.querySelector('meta[name="theme-color"]').content,
          overflow: document.documentElement.scrollWidth > innerWidth };
      });
      assert.equal(colors.background, mode === 'light' ? '#fafafa' : '#09090b');
      assert.equal(colors.native, mode);
      assert.equal(colors.chrome, colors.background);
      assert.equal(colors.overflow, false);
      const mark = page.locator('[data-testid="theme-key-mark"]:visible').first();
      const activeMark = mark.locator(`[data-brand-variant="${mode === 'light' ? 'dark' : 'white'}"]`);
      assert.equal(await activeMark.isVisible(), true);
      assert.equal(await mark.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      assert.equal(await activeMark.evaluate(el => el.complete && el.naturalWidth > 0 && getComputedStyle(el).filter === 'none'), true);
      if (mode === 'light') {
        const ratios = await page.evaluate(() => {
          const css = getComputedStyle(document.documentElement);
          const value = name => css.getPropertyValue(`--color-${name}`).trim();
          const luminance = name => {
            let hex = value(name);
            if (hex.length === 4) hex = '#' + [...hex.slice(1)].map(char => char + char).join('');
            const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
              .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
            return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
          };
          const pairs = ['foreground', 'muted-foreground', 'brand-300', 'brand-400', 'success', 'warning', 'danger']
            .flatMap(fg => ['background', 'surface', 'elevated'].map(bg => [fg, bg]));
          pairs.push(['brand-300', 'brand-muted'], ['danger', 'danger-muted']);
          return pairs.map(([fg, bg]) => {
            const [a, b] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
            return { fg, bg, ratio: (a + 0.05) / (b + 0.05) };
          });
        });
        for (const result of ratios) assert.ok(result.ratio >= 4.5, `${result.fg} on ${result.bg}: ${result.ratio}`);
      }
      await capture(page, `appearance-${mode}-${label}`);
    }

    await page.getByRole('radio', { name: 'Light', exact: true }).check();
    for (const screen of ['posts-following', 'music', 'profile', 'watch-hls', 'shorts']) {
      await page.goto(`${base}?screen=${screen}`, { waitUntil: 'networkidle' });
      // Screen-level hooks vary; require real layout and a populated main instead.
      await page.locator('main').waitFor();
      assert.ok((await page.locator('main').innerText()).length > 20, `${screen} rendered`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, screen);
      await theme(page, 'light');
      if (screen === 'watch-hls') {
        await page.getByTestId('hls-video-player').waitFor();
        assert.equal(await page.getByTestId('hls-video-player').evaluate(el => getComputedStyle(el).getPropertyValue('--color-foreground').trim()), '#fafafa');
      }
      await capture(page, `${screen}-light-${label}`);
      if (screen === 'shorts') {
        // Direct-link the immersive renderer; this is a theme check, not a
        // preview-control/navigation acceptance test.
        await page.goto(`${base}?screen=shorts-lens`, { waitUntil: 'networkidle' });
        const slide = page.getByTestId('short-slide-0');
        await slide.waitFor().catch(async error => {
          console.error('[appearance] Shorts failure:', await page.locator('main').innerText());
          await capture(page, `shorts-failure-${label}`);
          throw error;
        });
        assert.equal(await slide.evaluate(el => getComputedStyle(el).getPropertyValue('--color-foreground').trim()), '#fafafa');
        await capture(page, `shorts-lens-light-${label}`);
      }
    }
    assert.deepEqual(errors, []);
    receipts.push({ width, keyboardRadios: true, liveDevice: true, overrideReload: true, crossTab: true, signedOut: true, paletteAndChrome: true, lightTextAA: true, errors });
    await context.close();
  }

  for (const width of [768, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' });
    await page.goto(`${base}?screen=appearance`, { waitUntil: 'networkidle' });
    await page.getByTestId('appearance-settings').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.close();
    receipts.push({ width, responsive: true });
  }
  await writeFile(path.join(output, 'appearance-receipt.json'), JSON.stringify({ evidence: 'Real Chromium/UI/CSS with isolated data, not deployed/physical-phone evidence', receipts }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
