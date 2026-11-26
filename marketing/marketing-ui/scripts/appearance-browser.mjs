// Actual marketing app, CSS, fonts and brand assets. Network data is isolated.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve(import.meta.dirname, '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
if (!output) throw new Error('Set SCREENSHOT_OUTPUT_DIR to the workspace .context directory');
await mkdir(output, { recursive: true });
const port = Number(process.env.APPEARANCE_PORT || 4571);
const origin = `http://127.0.0.1:${port}`;
const server = spawn('bunx', ['vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: root, stdio: 'inherit' });
let browser;
const key = 'web10-marketing:theme';
const appUrl = 'https://social.web10.app';
const activeUsers = { users_1d: 0, users_30d: 0, users_90d: 0, users_1y: 0 };
const receipts = [];
const waitTheme = (page, value) => page.waitForFunction(theme => document.documentElement.dataset.theme === theme, value);
const waitAppearanceCanvas = (page, color) => page.waitForFunction(expected => {
  const screen = document.querySelector('[data-testid="appearance-screen"]');
  return screen && getComputedStyle(screen.parentElement).backgroundColor === expected;
}, color);
async function isolate(context) {
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    let body = {};
    if (url.pathname === '/v3/stats') body = { users: 598, app_count: 9, app_visits: 2345, storage: 54 * 1024 ** 3, active_users: activeUsers };
    else if (url.pathname === '/v3/apps/list') body = { total: 5, apps: ['sharing', 'feed', 'groups', 'hello', 'media'].map(slug => ({
      url: `https://www.web10.app/docs/${slug}/`, name: slug[0].toUpperCase() + slug.slice(1),
      icon_url: `/docs/${slug}/icon-192.png`, users_30d: 0, visits: 0,
    })) };
    else if (url.pathname === '/v3/apps/detail') body = {
      url: appUrl, name: 'web10 social', description: 'The web10 social app.', screenshots: [],
      review_state: 'approved', registered_at: '2026-11-25T00:00:00Z',
      metrics: { visits: 0, ...activeUsers }, rating: { average: null, count: 0 }, ratings: [],
      node: { users: 0, app_count: 0, storage: 0, active_users: activeUsers },
    };
    else if (url.hostname === 'api.github.com') body = { stargazers_count: 0 };
    else if (url.pathname === '/telemetry') body = { posthog_enabled: false };
    else body = { documents: [], rows: [], data: [] };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body), headers: { 'access-control-allow-origin': '*' } });
  });
}
async function capture(page, name) {
  await page.mouse.move(0, 0);
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
}
async function verifyStableBackdropHeight(page) {
  const session = await page.context().newCDPSession(page);
  const read = () => page.evaluate(() => {
    const heightOf = unit => {
      const probe = document.createElement('div');
      probe.style.cssText = `position:absolute;visibility:hidden;block-size:100${unit}`;
      document.body.append(probe);
      const height = probe.offsetHeight;
      probe.remove();
      return height;
    };
    return {
      large: heightOf('lvh'), small: heightOf('svh'), visual: visualViewport.height,
      art: ['.classic-hero', '.classic-stats'].map(selector => {
        const css = getComputedStyle(document.querySelector(selector), '::before');
        return { unit: css.getPropertyValue('--classic-backdrop-height').trim(), height: parseFloat(css.blockSize), size: css.backgroundSize };
      }),
    };
  });
  try {
    // Headless Chromium has no URL bar. Separate its viewport units and
    // change only the visual viewport as a control, not as device proof.
    await session.send('Emulation.setSmallViewportHeightDifferenceOverride', { difference: 96 });
    const expanded = await read();
    assert.equal(expanded.large - expanded.small, 96);
    for (const art of expanded.art) assert.deepEqual(art, { unit: '100lvh', height: expanded.large, size: 'cover' });
    await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1.25 });
    const smallerVisualViewport = await read();
    assert.ok(smallerVisualViewport.visual < expanded.visual);
    assert.deepEqual(smallerVisualViewport.art, expanded.art, 'visual viewport changes do not resize the artwork layer');
    return { large: expanded.large, small: expanded.small, visual: [expanded.visual, smallerVisualViewport.visual] };
  } finally {
    await session.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await session.send('Emulation.setSmallViewportHeightDifferenceOverride', { difference: 0 });
    await session.detach();
  }
}
async function verifyNavbarOptics(page) {
  await page.getByTestId('marketing-nav-refraction').waitFor();
  const nav = page.getByRole('navigation', { name: 'main navigation', exact: true });
  const lens = nav.locator('feDisplacementMap');
  assert.equal(await lens.getAttribute('scale'), '18');
  const box = await nav.boundingBox();
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const measure = async background => {
    const fixture = await page.addStyleTag({ content: `body::after { content:""; position:fixed; inset:0; z-index:39; pointer-events:none; background:${background}; }` });
    try {
      await settle();
      const on = await page.screenshot({ clip: box });
      await lens.evaluate(el => el.setAttribute('scale', '0'));
      await settle();
      const off = await page.screenshot({ clip: box });
      return await page.evaluate(async frames => {
        const extract = async frame => {
          const image = new Image(); image.src = `data:image/png;base64,${frame}`; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
          return ctx.getImageData(0, 0, canvas.width, canvas.height);
        };
        const [a, b] = await Promise.all(frames.map(extract));
        let rim = 0, center = 0;
        for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
          const i = (y * a.width + x) * 4;
          const delta = Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]);
          if (delta <= 15) continue;
          if (x > 40 && x < a.width - 40 && y > 12 && y < a.height - 12) center++;
          else rim++;
        }
        return { rim, center };
      }, [on, off].map(frame => frame.toString('base64')));
    } finally {
      await lens.evaluate(el => el.setAttribute('scale', '18'));
      await fixture.evaluate(el => el.remove());
    }
  };
  const flat = await measure('#1b2026');
  assert.deepEqual(flat, { rim: 0, center: 0 }, 'uniform backdrop must not refract the bar itself');
  const patterned = await measure('repeating-linear-gradient(28deg,#f8fafc 0 6px,#23334e 6px 12px,#5188b0 12px 18px)');
  assert.ok(patterned.rim > 150, `the lens must visibly displace backdrop pixels: ${JSON.stringify(patterned)}`);
  assert.equal(patterned.center, 0, 'the bar center and controls must not displace');
  return { flat, patterned };
}
async function verifyPinnedArt(page, name, selector) {
  const section = page.locator(selector);
  await section.waitFor();
  const top = await section.evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(top => window.scrollTo(0, Math.max(0, top - 96)), top);
  const y = (await section.boundingBox()).y;
  assert.equal(await section.evaluate(el => getComputedStyle(el, '::before').position), 'fixed', name);

  // Hide content and the scrolling scrim without changing section geometry,
  // so the pixel comparison sees only the artwork.
  const style = await page.addStyleTag({ content: `${selector} { --classic-scrim: transparent; } ${selector} > * { visibility: hidden; }` });
  await section.evaluate(el => {
    if (getComputedStyle(el).getPropertyValue('--classic-scrim').trim() !== 'transparent') {
      throw new Error('Pinned art probe requires a transparent scrim');
    }
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const before = await page.screenshot();
  await page.evaluate(() => {
    window.scrollBy(0, 20);
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal((await section.boundingBox()).y, y - 20, `${name} section scrolls`);
  const after = await page.screenshot();
  await style.evaluate(el => el.remove());
  const [first, second] = await page.evaluate(async ({ frames, y }) => {
    const canvas = document.createElement('canvas');
    // Exclude the right edge, where the browser may paint a scroll indicator.
    canvas.width = innerWidth - 24;
    canvas.height = 24;
    const context = canvas.getContext('2d');
    return Promise.all(frames.map(async frame => {
      const image = new Image();
      image.src = `data:image/png;base64,${frame}`;
      await image.decode();
      context.drawImage(image, 0, y, canvas.width, 24, 0, 0, canvas.width, 24);
      return [...context.getImageData(0, 0, canvas.width, 24).data];
    }));
  }, { frames: [before, after].map(image => image.toString('base64')), y: Math.round(y + 32) });
  assert.ok(new Set(first.filter((_, index) => index % 4 === 0)).size > 4, `${name} sampled real artwork`);
  const changedChannels = second.filter((value, index) => value !== first[index]).length;
  if (changedChannels) {
    await writeFile(path.join(output, 'pinned-probe-before.png'), before);
    await writeFile(path.join(output, 'pinned-probe-after.png'), after);
  }
  assert.equal(changedChannels, 0, `${name} artwork stays at the same viewport pixels`);
}
async function verifyLogo(page, variant = 'white') {
  const logo = page.getByTestId('brand-logo').first();
  const active = logo.locator(`[data-brand-variant="${variant}"]`);
  assert.equal(await active.isVisible(), true);
  assert.equal(await logo.locator(`[data-brand-variant]:not([data-brand-variant="${variant}"])`).isVisible(), false);
  assert.equal(await active.evaluate(el => getComputedStyle(el).filter), 'none');
  assert.equal(await logo.evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
  assert.equal(await active.evaluate(el => el.complete && el.naturalWidth > 0), true);
}
async function verifyCatalogIcon(locator, expectedCorner) {
  const corner = await locator.evaluate(async el => {
    const image = new Image();
    image.src = el.getAttribute('src');
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  });
  assert.deepEqual(corner, expectedCorner);
}
async function readInteriorPalette(page) {
  return page.getByRole('heading', { level: 1 }).first().evaluate(heading => {
    const css = getComputedStyle(heading);
    let canvas = heading;
    while (getComputedStyle(canvas).backgroundColor === 'rgba(0, 0, 0, 0)') canvas = canvas.parentElement;
    return {
      canvas: getComputedStyle(canvas).backgroundColor,
      native: css.colorScheme,
      tokens: Object.fromEntries([
        'background', 'card', 'surface', 'elevated', 'foreground', 'muted-foreground',
        'brand-300', 'brand-muted', 'border', 'ring',
      ].map(name => [name, css.getPropertyValue(`--color-${name}`).trim()])),
    };
  });
}
async function readInteriorIntro(page) {
  return page.getByRole('heading', { level: 1 }).first().evaluate(heading => {
    const intro = heading.closest('.interior-intro');
    const art = intro.querySelector('svg');
    const artBox = art.getBoundingClientRect();
    const copy = heading.parentElement.getBoundingClientRect();
    return {
      kind: art.dataset.artwork,
      decorative: art.getAttribute('aria-hidden') === 'true' && art.getAttribute('focusable') === 'false',
      stroke: getComputedStyle(art).stroke,
      font: getComputedStyle(heading).fontFamily,
      rightOfCopy: artBox.left >= copy.right,
      belowCopy: artBox.top >= copy.bottom,
      visible: artBox.width > 0 && artBox.height > 0,
    };
  });
}
async function verifyInteriorContrast(page) {
  const results = await page.getByTestId('appearance-screen').evaluate(el => {
    const css = getComputedStyle(el);
    const luminance = name => {
      let hex = css.getPropertyValue(`--color-${name}`).trim();
      if (hex.length === 4) hex = '#' + [...hex.slice(1)].map(char => char + char).join('');
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const pairs = ['foreground', 'muted-foreground', 'brand-300', 'brand-400', 'success', 'warning', 'danger']
      .flatMap(fg => ['background', 'surface', 'elevated'].map(bg => [fg, bg]));
    pairs.push(['brand-300', 'brand-muted'], ['danger', 'danger-muted'], ['brand-foreground', 'brand']);
    return pairs.map(([fg, bg]) => {
      const [a, b] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
      return { fg, bg, ratio: (a + 0.05) / (b + 0.05) };
    });
  });
  for (const result of results) assert.ok(result.ratio >= 4.5, `${result.fg} on ${result.bg}: ${result.ratio}`);
}
try {
  const deadline = Date.now() + 30000;
  for (;;) {
    try { if ((await fetch(origin)).ok) break; } catch {}
    if (Date.now() > deadline) throw new Error('Marketing appearance server startup timeout');
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  browser = await chromium.launch();
  for (const [colorScheme, saved, expected] of [['light', null, 'light'], ['dark', null, 'dark'], ['light', 'dark', 'dark'], ['dark', 'light', 'light']]) {
    const page = await browser.newPage({ colorScheme });
    if (saved) await page.addInitScript(([key, saved]) => localStorage.setItem(key, saved), [key, saved]);
    await page.route('**/src/main.tsx', route => route.abort());
    await page.goto(`${origin}/appearance`);
    await waitTheme(page, expected);
    assert.equal(await page.locator('#root').innerHTML(), '');
    assert.equal(await page.locator('html').evaluate(el => el.style.colorScheme), expected);
    await page.close();
    receipts.push({ startupWithoutReact: { colorScheme, saved, expected } });
  }
  for (const [label, width] of [['desktop', 1440], ['375', 375]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await isolate(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => { errors.push(error.message); console.error('[appearance] page error:', error.message); });
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.getByTestId('classic-enter-cta').waitFor();
    await waitTheme(page, 'light');
    await verifyLogo(page, 'dark');
    await capture(page, `home-light-${label}`);
    if (width < 1024) await page.getByRole('button', { name: 'Open menu', exact: true }).click();
    const socialEntry = page.getByRole('button', { name: 'Open web10 social', exact: true }).filter({ visible: true });
    assert.equal(await socialEntry.count(), 1);
    await capture(page, `navigation-light-${label}`);
    await page.getByRole('link', { name: 'Appearance', exact: true }).click();
    await page.getByTestId('appearance-screen').waitFor();
    assert.equal(new URL(page.url()).pathname, '/appearance');
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitTheme(page, 'dark');
    await waitAppearanceCanvas(page, 'rgb(27, 32, 38)');
    await page.getByRole('radio', { name: 'System', exact: true }).focus();
    await page.keyboard.press('ArrowRight');
    await waitTheme(page, 'light');
    await waitAppearanceCanvas(page, 'rgb(250, 250, 250)');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await waitTheme(page, 'light');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('radio', { name: 'Light', exact: true }).isChecked(), true);
    await capture(page, `appearance-light-${label}`);
    const tab = await context.newPage();
    await tab.goto(`${origin}/appearance`, { waitUntil: 'networkidle' });
    await tab.getByRole('radio', { name: 'Dark', exact: true }).check();
    await waitTheme(page, 'dark');
    await capture(page, `appearance-dark-${label}`);
    await tab.evaluate(key => localStorage.removeItem(key), key);
    await page.waitForFunction(() => document.querySelector('[data-testid="theme-system"]').checked);
    await tab.close();
    for (const mode of ['light', 'dark']) {
      await page.getByRole('radio', { name: mode === 'light' ? 'Light' : 'Dark', exact: true }).check();
      let interiorPalette;
      for (const [route, name] of [
        ['/', 'home'], ['/app-store', 'app-store'], ['/freedom', 'freedom'], [`/app-store/app/${encodeURIComponent(appUrl)}`, 'app-detail'],
        ['/docs', 'docs'], ['/docs/terms', 'docs-article'], ['/appearance', 'appearance'],
      ]) {
        await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
        await page.getByRole('heading', { level: 1 }).first().waitFor();
        await waitTheme(page, mode);
        await verifyLogo(page, 'dark');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${name} at ${width}`);
        const chrome = await page.evaluate(() => ({ background: getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim(), native: getComputedStyle(document.documentElement).colorScheme, chrome: document.querySelector('meta[name="theme-color"]').content }));
        assert.equal(chrome.background, mode === 'light' ? '#fafafa' : '#2b2f32');
        assert.equal(chrome.native, mode);
        assert.equal(chrome.chrome, chrome.background);
        if (name === 'appearance') assert.equal(
          await page.locator('input[name="appearance"]:checked + span').evaluate(el => getComputedStyle(el).borderColor),
          mode === 'light' ? 'rgb(23, 74, 118)' : 'rgb(136, 174, 224)',
          'selected radio keeps the brand border rather than the global default',
        );
        if (name === 'appearance') await verifyInteriorContrast(page);
        const nav = await page.getByRole('navigation', { name: 'main navigation', exact: true }).evaluate(el => {
          const css = getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          const bed = getComputedStyle(el.querySelector('.marketing-nav-bed'));
          return { color: css.backgroundColor, token: css.getPropertyValue('--color-background').trim(),
            ink: css.color, radius: parseFloat(css.borderTopLeftRadius), frost: bed.backdropFilter, bedColor: bed.backgroundColor, bedDisplay: bed.display,
            inset: rect.left > 0 && rect.right < innerWidth && rect.top >= 12,
            supportsFrost: CSS.supports('backdrop-filter', 'blur(1px)') && matchMedia('(prefers-reduced-transparency: no-preference)').matches };
        });
        assert.equal(nav.ink, 'rgb(24, 35, 44)');
        if (width < 1024) {
          assert.equal(nav.token, '#b5d4dc');
          assert.ok(nav.inset && nav.radius >= 32, 'the closed navbar floats as a capsule');
          assert.equal(nav.color, 'rgba(0, 0, 0, 0)', 'the outer bar must not become its own backdrop');
          assert.equal(nav.frost, nav.supportsFrost ? 'blur(12px) saturate(1.4)' : 'none');
          if (!nav.supportsFrost) assert.equal(nav.bedColor, 'rgb(181, 212, 220)');
        } else {
          assert.equal(nav.color, 'rgb(181, 212, 220)');
          assert.equal(nav.radius, 0);
          assert.equal(nav.inset, false);
          assert.equal(nav.bedDisplay, 'none');
          assert.equal(await page.getByTestId('marketing-nav-refraction').count(), 0);
        }
        if (name === 'app-store') {
          await page.getByTestId('browse-card-0').waitFor();
          await page.getByTestId('plug-slot-1').waitFor();
          await verifyCatalogIcon(page.getByTestId('plug-slot-0').locator('img[src="/brand/social-conversation.png"]'), [0, 0, 0, 0]);
          await verifyCatalogIcon(page.getByTestId('plug-slot-1').locator('img[src="/brand/icon-192.png"]'), [9, 9, 11, 255]);
          const calmCard = await page.getByTestId('plug-slot-0').locator(':scope > div').evaluate(el => {
            const css = getComputedStyle(el);
            return [css.backgroundColor, css.backgroundImage, css.boxShadow];
          });
          assert.deepEqual(calmCard, [mode === 'light' ? 'rgb(255, 255, 255)' : 'rgb(34, 41, 48)', 'none', 'none']);
          interiorPalette = await readInteriorPalette(page);
          assert.equal(interiorPalette.canvas, mode === 'light' ? 'rgb(250, 250, 250)' : 'rgb(27, 32, 38)');
          assert.equal(interiorPalette.native, mode);
        } else if (name !== 'home') {
          assert.deepEqual(await readInteriorPalette(page), interiorPalette, `${name} must match the shared interior in ${mode}`);
        }
        if (name === 'app-detail') await verifyCatalogIcon(page.locator('img[src="/brand/social-conversation.png"]'), [0, 0, 0, 0]);
        if (['app-store', 'freedom', 'docs', 'appearance'].includes(name)) {
          const art = await readInteriorIntro(page);
          assert.equal(art.kind, name === 'app-store' ? 'store' : name);
          assert.ok(art.decorative && art.visible, `${name} has visible decorative artwork`);
          assert.equal(art.stroke, mode === 'dark' ? 'rgb(131, 184, 216)' : 'rgb(49, 94, 124)');
          assert.match(art.font, /^Georgia\b/);
          assert.ok(width >= 768 ? art.rightOfCopy : art.belowCopy, `${name} artwork must not overlap text`);
        }
        if (name === 'freedom') {
          await page.getByRole('heading', { name: 'How the internet works now' }).waitFor();
          const firstSection = await page.getByRole('heading', { name: 'How the internet works now' }).boundingBox();
          assert.ok(firstSection.y < 600, 'Freedom should start the next section in the first viewport');
        }
        if (name === 'home' || name === 'freedom') {
          const cta = name === 'home' ? page.getByTestId('classic-enter-cta') : page.getByRole('link', { name: 'Explore web10', exact: true });
          await cta.waitFor();
          assert.equal(await cta.getAttribute('href'), process.env.VITE_SOCIAL_URL || 'https://social.web10.app');
        }
        if (name === 'home') {
          assert.equal((await readInteriorPalette(page)).canvas, 'rgb(16, 22, 72)', 'Home keeps its fixed navy hero canvas');
        }
        if (name === 'docs') {
          await page.getByRole('article', { name: 'Overview' }).getByRole('heading', { name: 'web10', exact: true }).waitFor();
          assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
        }
        await capture(page, `${name}-${mode}-${label}`);
        if (name === 'freedom' || name === 'home') {
          if (width < 1024) {
            receipts.push({ width, mode, page: name, closedNavbarOptics: await verifyNavbarOptics(page) });
            const closedMap = await page.locator('.marketing-navbar feImage').getAttribute('href');
            await page.evaluate(() => window.scrollTo(0, 120));
            await capture(page, `${name}-glass-scroll-${mode}-${label}`);
            await page.getByRole('button', { name: 'Open menu', exact: true }).click();
            await page.waitForFunction(original => {
              const nav = document.querySelector('.marketing-navbar[data-menu-open="true"]');
              const map = nav?.querySelector('feImage')?.getAttribute('href');
              return nav && getComputedStyle(nav).borderTopLeftRadius === '16px' && map && map !== original;
            }, closedMap);
            receipts.push({ width, mode, page: name, expandedNavbarOptics: await verifyNavbarOptics(page) });
          }
          const current = page.getByRole('link', { name: name === 'home' ? 'Home' : 'Freedom', exact: true }).filter({ visible: true }).first();
          assert.equal(await current.evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(225, 242, 246)');
          const social = page.getByRole('button', { name: 'Open web10 social', exact: true }).filter({ visible: true });
          assert.equal(await social.evaluate(el => getComputedStyle(el).backgroundColor), name === 'home' ? 'rgba(0, 0, 0, 0)' : 'rgb(194, 223, 237)');
          if (width < 1024) {
            await capture(page, `${name}-navigation-${mode}-${label}`);
            await page.getByRole('button', { name: 'Close menu', exact: true }).click();
          }
        }
        if (width < 768 && name === 'docs' && mode === 'dark') {
          await page.getByRole('link', { name: 'Browse documentation' }).click();
          assert.equal(new URL(page.url()).hash, '#docs-navigation');
          const sidebar = page.getByRole('complementary', { name: 'Documentation navigation' });
          assert.ok((await sidebar.boundingBox()).y < 120, 'documentation navigation jumps into view');
          await sidebar.getByRole('link', { name: 'Terms of Service', exact: true }).click();
          await page.getByRole('heading', { name: 'Terms of Service', exact: true, level: 1 }).waitFor();
          await page.waitForFunction(() => window.scrollY === 0);
          assert.equal(new URL(page.url()).pathname, '/docs/terms');
        }
      }
    }
    assert.deepEqual(errors, []);
    receipts.push({ width, realNavigation: true, keyboardRadios: true, liveDevice: true, overrideReload: true, crossTab: true, paletteAndChrome: true, interiorTextAA: true, transparentThemeLogo: true, errors });
    await context.close();

    const scrollPage = await browser.newPage({
      viewport: { width, height: 900 }, hasTouch: width === 375, isMobile: width === 375, reducedMotion: 'no-preference',
    });
    await isolate(scrollPage.context());
    await scrollPage.goto(origin, { waitUntil: 'networkidle' });
    if (width === 375) receipts.push({ width, stableBackdropHeight: await verifyStableBackdropHeight(scrollPage) });
    await verifyPinnedArt(scrollPage, 'Mandelbrot', '.classic-hero');
    await verifyPinnedArt(scrollPage, 'stats', '.classic-stats');
    const stats = scrollPage.getByRole('region', { name: 'Network statistics' });
    const statsPadding = await stats.evaluate(el => {
      const css = getComputedStyle(el);
      return [css.paddingTop, css.paddingBottom];
    });
    assert.deepEqual(statsPadding, width === 375 ? ['56px', '56px'] : ['96px', '96px']);
    const statNumerals = await stats.locator('.tabular-nums').evaluateAll(elements => elements.map(el => {
      const css = getComputedStyle(el);
      const value = el.getBoundingClientRect();
      const icon = el.previousElementSibling.getBoundingClientRect();
      const label = el.parentElement.nextElementSibling.getBoundingClientRect();
      return { family: css.fontFamily, weight: css.fontWeight,
        iconBesideValue: icon.right <= value.left && Math.abs((icon.top + icon.bottom) - (value.top + value.bottom)) < 2,
        labelBelowBoth: label.top >= Math.max(icon.bottom, value.bottom) };
    }));
    assert.equal(statNumerals.length, 4);
    for (const numeral of statNumerals) {
      assert.match(numeral.family, /^"?Jost\b/);
      assert.equal(numeral.weight, '300');
      assert.equal(numeral.iconBesideValue, true);
      assert.equal(numeral.labelBelowBoth, true);
    }
    await capture(scrollPage, `home-pinned-stats-${label}`);
    await scrollPage.evaluate(() => window.scrollTo(0, 0));
    await capture(scrollPage, `home-pinned-hero-${label}`);
    await scrollPage.close();
    // Verify the same effect when the device prefers reduced motion.
    const reducedPage = await browser.newPage({
      viewport: { width, height: 900 }, hasTouch: width === 375, reducedMotion: 'reduce',
    });
    await isolate(reducedPage.context());
    await reducedPage.goto(origin, { waitUntil: 'networkidle' });
    const visitStat = reducedPage.getByRole('region', { name: 'Network statistics' }).getByText('total app visits', { exact: true });
    await visitStat.waitFor();
    assert.equal(await visitStat.evaluate(el => el.previousElementSibling.textContent), '2.3K');
    assert.equal(await visitStat.evaluate(el => getComputedStyle(el.closest('.grid')).gridTemplateColumns.split(' ').length), width === 375 ? 2 : 4);
    await verifyPinnedArt(reducedPage, 'Mandelbrot with device Reduced Motion', '.classic-hero');
    await verifyPinnedArt(reducedPage, 'stats with device Reduced Motion', '.classic-stats');
    receipts.push({ width, fixedArtPixels: ['hero', 'stats'], independentOfDeviceMotionPreference: true });
    await reducedPage.close();
  }
  for (const width of [768, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await isolate(context);
    const page = await context.newPage();
    for (const route of ['/', '/appearance', '/docs/terms']) {
      await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' });
      await page.getByRole('heading', { level: 1 }).first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `${route} at ${width}`);
      if (route === '/' && width === 768) {
        await page.getByRole('button', { name: 'Open menu', exact: true }).click();
        assert.equal(await page.getByRole('button', { name: 'Open web10 social', exact: true }).filter({ visible: true }).count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'open tablet menu fits');
        await capture(page, 'navigation-light-768');
        await page.getByRole('button', { name: 'Close menu', exact: true }).click();
      }
    }
    receipts.push({ width, responsive: true });
    await context.close();
  }
  // Engine hint gates only the rim. The frosted capsule is still present.
  const fallback = await browser.newPage({ viewport: { width: 375, height: 900 }, colorScheme: 'dark', userAgent: 'Mozilla/5.0 Version/19.0 Safari/605.1.15' });
  await isolate(fallback.context());
  await fallback.goto(`${origin}/freedom`, { waitUntil: 'networkidle' });
  assert.equal(await fallback.locator('.marketing-nav-bed').isVisible(), true);
  assert.equal(await fallback.getByTestId('marketing-nav-refraction').count(), 0);
  await fallback.emulateMedia({ forcedColors: 'active' });
  await fallback.waitForFunction(() => matchMedia('(forced-colors: active)').matches &&
    getComputedStyle(document.querySelector('.marketing-nav-bed')).backdropFilter === 'none');
  await fallback.close();
  // Verify both output PNGs after encoding: exact original alpha/size, no tile.
  const pixelPage = await browser.newPage();
  for (const [whitePath, darkPath] of [
    ['public/brand/logo-lockup.png', 'public/brand/logo-lockup-dark.png'],
    ['../web10-social/public/keys-mark.png', '../web10-social/public/keys-mark-dark.png'],
  ]) {
    const urls = await Promise.all([whitePath, darkPath].map(async file => `data:image/png;base64,${(await readFile(path.resolve(root, file))).toString('base64')}`));
    const result = await pixelPage.evaluate(async urls => {
      const pixels = await Promise.all(urls.map(async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
        return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
      }));
      let mismatches = 0, transparent = 0;
      for (let i = 3; i < pixels[0].data.length; i += 4) { if (pixels[0].data[i] !== pixels[1].data[i]) mismatches++; if (!pixels[1].data[i]) transparent++; }
      return { sameSize: pixels[0].width === pixels[1].width && pixels[0].height === pixels[1].height, mismatches, transparent };
    }, urls);
    assert.equal(result.sameSize, true); assert.equal(result.mismatches, 0); assert.ok(result.transparent > 0);
    receipts.push({ artwork: darkPath, ...result });
  }
  await pixelPage.close();
  await writeFile(path.join(output, 'marketing-appearance-receipt.json'), JSON.stringify({ evidence: 'Actual app/Chromium with intercepted synthetic network data; no live-node/deployment/phone proof', receipts }, null, 2));
} finally { await browser?.close(); server.kill('SIGTERM'); }
