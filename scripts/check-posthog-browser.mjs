#!/usr/bin/env node
// Real SDK + real browser, synthetic config and intercepted vendor transport.
// No backend/vendor project/credentials or production writes. Self-booting;
// always closes Vite/browser. Screenshots and sanitized receipt in .context/.
import assert from 'node:assert/strict';
import net from 'node:net';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createServer } = await import(path.join(root, 'ui/node_modules/vite/dist/node/index.js'));
const { chromium } = await import(path.join(root, 'marketing/web10-social/node_modules/playwright/index.mjs'));
const out = path.join(root, '.context/posthog');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
const receipts = [];
// Vite treats port 0 as falsy and falls back to 5173; other workspaces' dev
// servers own that port. Bind once to an OS-assigned free port per app.
const freePort = () => new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const port = probe.address().port;
    probe.close(() => resolve(port));
  });
});
const replay = process.argv.includes('--replay');
const capturedEvents = (vendor) => vendor.flatMap(({ data }) =>
  Array.isArray(data) ? data : Array.isArray(data?.batch) ? data.batch : data?.event ? [data] : []);

function payload(request) {
  const raw = request.postDataBuffer();
  if (!raw) return null;
  const compression = new URL(request.url()).searchParams.get('compression');
  if (compression === 'gzip-js') return JSON.parse(gunzipSync(raw).toString());
  try { return JSON.parse(raw.toString()); } catch {
    const data = new URLSearchParams(raw.toString()).get('data');
    if (data) return JSON.parse(Buffer.from(data, 'base64').toString());
    throw new Error(`Unsupported SDK payload encoding: ${compression}`);
  }
}

try {
  for (const [app, directory] of [['marketing-ui', 'marketing/marketing-ui'], ['web10-social', 'marketing/web10-social'], ['auth-ui', 'ui']]) {
    let server;
    // Exercise a synthetic ordinary-browser environment without changing SDK
    // bot filtering: default Playwright UA/UA-CH/webdriver are deliberately
    // dropped. This normalization is fixture-only, never app configuration.
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36' });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      Object.defineProperty(navigator, 'userAgentData', { get: () => undefined });
    });
    const page = await context.newPage();
    const vendor = [];
    const legacy = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.text().startsWith('[telemetry]')) console.log(app, message.text());
    });
    const html = `<!doctype html><html><head><meta name="referrer" content="no-referrer"><title>PostHog verification</title></head><body><div data-private="PRIVATE_SENTINEL"><p>PRIVATE_SENTINEL</p><input value="PRIVATE_SENTINEL"><video poster="https://private.invalid/PRIVATE_SENTINEL"></video></div><div id="root"></div><script type="module">
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import '/src/index.css';
      import * as analytics from '/src/lib/analytics.ts';
      analytics.trackPageview('/join');
      analytics.trackPageview('/join');
      await analytics.installTelemetry();
      analytics.trackPageview('/messages/private-conversation?token=PRIVATE_SENTINEL');
      analytics.trackEvent?.('post_saved', {screen: 'saved'});
      analytics.trackFunnel?.('join_click', {text: 'PRIVATE_SENTINEL'});
      if (analytics.identifyAnalytics) {
        await analytics.identifyAnalytics(() => 'AUTH_CREDENTIAL_SENTINEL');
        analytics.trackProductSession?.();
      }
      window.probe = analytics;
      window.probeReady = true;
      ${app === 'auth-ui' ? `
        const axios = (await import('axios')).default;
        axios.post = async (url, body) => ({ data: url.endsWith('/config') ? {
          admins: ['synthetic-admin'], posthog_enabled: false, posthog_project_key: '', posthog_host: 'https://us.i.posthog.com'
        } : url.endsWith('/apps/admin') ? {apps: []} : {} });
        const ConfigPage = (await import('/src/components/Config/ConfigPage.tsx')).default;
        createRoot(document.getElementById('root')).render(React.createElement(ConfigPage, { I: {
          isAdmin: true, mode: 'config', setMode() {}, v3: {state: {token: 'synthetic-fixture'}, readToken: () => ({provider: 'api.localhost', username: 'synthetic-admin'})}
        }}));
      ` : ''}
    </script></body></html>`;
    try {
      const fixedPort = await freePort();
      server = await createServer({
        root: path.join(root, directory),
        configFile: path.join(root, directory, app === 'web10-social' ? 'vite.config.ts' : 'vite.config.js'),
        server: { host: '127.0.0.1', port: fixedPort, strictPort: true, fs: { allow: [root] } },
        optimizeDeps: { include: ['posthog-js/dist/module.full.no-external'] },
        plugins: [{ name: 'posthog-verification-fixture', configureServer(vite) {
          vite.middlewares.use(async (req, res, next) => {
            if (!req.url?.startsWith('/__posthog_probe.html')) return next();
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml('/__posthog_probe.html', html));
          });
        } }],
      });
      await server.listen();
      const port = server.httpServer.address().port;
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.pathname === '/telemetry') return route.fulfill({ json: {
          posthog_enabled: true, posthog_project_key: 'phc_synthetic_browser_project', posthog_host: 'https://us.i.posthog.com',
          posthog_replay_enabled: replay,
          ga4_measurement_id: 'G-SYNTHETIC', hotjar_site_id: '123',
        }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (url.pathname === '/analytics/identity') return route.fulfill({ json: { enabled: true, distinct_id: 'w10_' + 'a'.repeat(64), acquisition: { utm_campaign: 'pilot' } }, headers: { 'Access-Control-Allow-Origin': '*' } });
        if (/googletagmanager|hotjar/.test(url.hostname)) {
          legacy.push(url.hostname);
          return route.abort();
        }
        if (url.hostname.endsWith('posthog.com')) {
          vendor.push({ url: request.url(), method: request.method(), data: payload(request) });
          return route.fulfill({ json: url.pathname.endsWith('/config') ? { sessionRecording: replay ? { endpoint: '/s/', sampleRate: 1, minimumDurationMilliseconds: 0 } : false } : {}, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
        }
        if (url.hostname === '127.0.0.1' && url.port === String(port)) return route.continue();
        return route.fulfill({ json: {}, headers: { 'Access-Control-Allow-Origin': '*' } });
      });
      await page.goto(`http://127.0.0.1:${port}/__posthog_probe.html?utm_source=instagram&utm_campaign=pilot&utm_content=creator_a&token=PRIVATE_SENTINEL`);
      await page.waitForFunction(() => window.probeReady === true);
      await page.mouse.click(12, 12);
      // SDK batch transport is real; wait for its actual two pageviews.
      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 15000;
        const check = () => {
          const events = capturedEvents(vendor);
          if (events.filter((entry) => entry.event === '$pageview').length >= 2 && (!replay || (events.some((entry) => entry.event === '$snapshot') && events.some((entry) => entry.event === '$$heatmap')))) return resolve();
          if (Date.now() >= deadline) return reject(new Error(`SDK transport did not capture two pageviews for ${app}; requests=${JSON.stringify(vendor.map((r) => ({method: r.method, path: new URL(r.url).pathname, keys: Object.keys(r.data ?? {})})))}, events=${events.map((e) => e.event).join(',')}, pageErrors=${errors.join(',')}`));
          setTimeout(check, 100);
        };
        check();
      });
      const events = capturedEvents(vendor);
      assert.equal(events.filter((entry) => entry.event === '$pageview').length, 2);
      assert.equal(legacy.length, 0);
      assert.equal(errors.length, 0, errors.join('\n'));
      const serialized = JSON.stringify(vendor);
      assert.ok(!serialized.includes('PRIVATE_SENTINEL'), 'private URL/content reached vendor transport');
      assert.ok(!serialized.includes('AUTH_CREDENTIAL_SENTINEL'), 'auth credential reached vendor transport');
      assert.ok(!serialized.includes('private-conversation'), 'conversation identifier reached vendor');
      assert.ok(!events.some((entry) => ['$autocapture', '$exception'].includes(entry.event)));
      if (replay) {
        assert.ok(events.some((entry) => entry.event === '$snapshot'), 'real recorder emitted no snapshots');
        assert.ok(events.some((entry) => entry.event === '$$heatmap'), 'real heatmap emitted no coordinates');
      }
      else assert.ok(!events.some((entry) => entry.event === '$snapshot'));
      for (const event of events) {
        if (event.event !== '$snapshot') assert.equal(event.properties.app, app);
        assert.equal(event.properties.$process_person_profile, String(event.properties.distinct_id).startsWith('w10_'));
        assert.equal(event.$set, undefined);
        assert.equal(event.$set_once, undefined);
      }
      const pageviews = events.filter((entry) => entry.event === '$pageview');
      assert.equal(pageviews[0].properties.utm_campaign, 'pilot');
      assert.equal(pageviews[1].properties.$pathname, '/messages');
      if (app === 'auth-ui') {
        await page.getByTestId('config-posthog-key').waitFor();
        await page.getByTestId('config-telemetry-card').scrollIntoViewIfNeeded();
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.getByTestId('config-telemetry-card').screenshot({ path: path.join(out, 'config-desktop.png') });
        await page.setViewportSize({ width: 375, height: 1000 });
        await page.getByTestId('config-telemetry-card').screenshot({ path: path.join(out, 'config-mobile.png') });
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'mobile overflow');
      }
      if (app === 'marketing-ui' && !replay) {
        // Actual public legal routes, with all API/vendor traffic intercepted.
        // This checks the changed disclosure without production beacon writes.
        for (const legal of ['privacy', 'terms']) {
          await page.goto(`http://127.0.0.1:${port}/docs/${legal}`);
          await page.getByRole('heading', { level: 1, name: legal === 'privacy' ? 'Privacy Policy' : 'Terms of Service' }).waitFor();
          for (const [label, width] of [['desktop', 1440], ['mobile', 375]]) {
            await page.setViewportSize({ width, height: 1000 });
            await page.screenshot({ path: path.join(out, `${legal}-${label}.png`), fullPage: true });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${legal} overflow`);
          }
        }
      }
      receipts.push({ app, sdk: 'posthog-js@1.447.3', events: events.map((entry) => ({ event: entry.event, path: entry.properties.$pathname ?? null })), legacyRequests: legacy.length, privateSentinelAbsent: true, realVendorPersistence: false });
    } finally {
      await context.close();
      await server?.close();
    }
  }
  await writeFile(path.join(out, replay ? 'browser-replay-receipt.json' : 'browser-receipt.json'), JSON.stringify({ scope: 'Real Chromium/SDK, synthetic config/identity and intercepted transport. Not live vendor or connected auth proof.', results: receipts }, null, 2));
  console.log(JSON.stringify(receipts, null, 2));
} finally {
  await browser.close();
}
