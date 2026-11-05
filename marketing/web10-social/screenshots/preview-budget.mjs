// Real hls.js + real HTTP cancellation, with intentionally stalled synthetic
// segments. Tests downloader ownership, NOT video decode or live authorization.
import assert from 'node:assert/strict';
import { createServer as httpServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as viteServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';

const social = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
assert(output, 'Set SCREENSHOT_OUTPUT_DIR to a .context directory');
await mkdir(output, { recursive: true });
const receipts = [];
let active = 0, peak = 0, requested = 0, cancelled = 0;
const origin = httpServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url.startsWith('/manifest')) {
    const tile = new URL(req.url, 'http://fixture').searchParams.get('tile');
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(`#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXT-X-VERSION:3\n#EXTINF:10,\n/segment.ts?tile=${tile}\n#EXT-X-ENDLIST\n`);
    return;
  }
  if (req.url.startsWith('/segment')) {
    requested++; active++; peak = Math.max(peak, active);
    // Deliberately withhold the first segment so cancel is unambiguous.
    const timeout = setTimeout(() => res.end(), 20_000);
    res.on('close', () => { clearTimeout(timeout); active--; if (!res.writableEnded) cancelled++; });
    return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve => origin.listen(0, '127.0.0.1', resolve));
const mediaOrigin = `http://127.0.0.1:${origin.address().port}`;
const browser = await chromium.launch();
const until = async (condition, label) => {
  const deadline = Date.now() + 8000;
  while (!condition()) {
    assert(Date.now() < deadline, label);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
};
try {
  for (const site of ['web10-social', 'marketing-ui']) {
    const root = path.resolve(social, '..', site);
    const server = await viteServer({ root, configFile: path.join(root, site === 'web10-social' ? 'vite.config.ts' : 'vite.config.js'),
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify(mediaOrigin) },
      server: { port: 0, host: '127.0.0.1', open: false },
      plugins: [{ name: 'preview-budget-fixture',
        resolveId(id) { if (id === '/__budget.tsx') return '\0budget.tsx'; },
        async load(id) { if (id !== '\0budget.tsx') return; return transformWithEsbuild(`
          import React from 'react'; import {createRoot} from 'react-dom/client';
          import {HoverVideo} from '@web10/discover'; import '/src/index.css';
          const tokens = getComputedStyle(document.documentElement);
          const color = name => tokens.getPropertyValue('--color-'+name).trim();
          const poster = 'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="'+color('elevated')+'"/><circle cx="600" cy="140" r="190" fill="'+color('brand-muted')+'"/><path d="M0 340 L250 130 L510 450 H0Z" fill="'+color('brand')+'"/><circle cx="600" cy="140" r="70" fill="'+color('brand-300')+'"/></svg>');
          createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-5xl p-6 text-foreground">
            <h1 className="text-2xl font-semibold">Preview loading budget</h1>
            <p className="mt-2 text-muted-foreground">Synthetic stalled-network fixture · ${site}</p>
            <div className="mt-6 grid gap-6 md:grid-cols-2">{[1,2].map(i => <section key={i} className="min-h-screen md:min-h-0">
              <div className="relative aspect-video overflow-hidden rounded-lg bg-elevated">
                <HoverVideo testId={'tile-'+i} poster={poster} media={{url:'',mime_type:'video/mp4',transcoding_settings:{status:'done',manifest_url:'/manifest.m3u8?tile='+i,variants:[]}}} />
              </div><h2 className="mt-3 font-medium">Preview {i}</h2>
              <p className="mt-1 text-sm text-muted-foreground">Poster remains visible while the connection is slow.</p>
            </section>)}</div></main>);`, 'budget.tsx', { loader: 'tsx', jsx: 'automatic' }); },
        configureServer(vite) { vite.middlewares.use('/__budget.html', async (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end(await vite.transformIndexHtml('/__budget.html', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><script src="/hls.min.js"></script></head><body><div id="root"></div><script type="module" src="/__budget.tsx"></script></body></html>'));
        }); },
      }],
    });
    try {
      await server.listen();
      const url = `http://127.0.0.1:${server.httpServer.address().port}/__budget.html`;
      for (const mobile of [false, true]) {
        active = 0; peak = 0; requested = 0; cancelled = 0;
        const context = await browser.newContext({ viewport: { width: mobile ? 375 : 1440, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(url);
          const first = page.getByTestId('tile-1');
          await first.waitFor();
          if (!mobile) { assert.equal(requested, 0, 'No resting video fetch'); await first.hover(); }
          await until(() => active === 1, 'First preview requests segment');
          await page.screenshot({ path: path.join(output, `preview-budget-${site}-${mobile ? '375' : 'desktop'}.png`), fullPage: false });
          if (mobile) await page.getByTestId('tile-2').scrollIntoViewIfNeeded();
          else await page.mouse.move(0, 0);
          await until(() => cancelled >= 1, 'Losing preview aborts its HTTP segment');
          if (!mobile) await page.getByTestId('tile-2').hover();
          await until(() => requested >= 2 && active === 1, 'Next preview acquires downloader');
          await context.setOffline(true);
          await until(() => active === 0, 'Offline releases active downloader');
          assert.equal(peak, 1, 'At most one segment downloader');
          assert.deepEqual(errors, []);
          receipts.push({ site, viewport: mobile ? 375 : 1440, requested, cancelled, peak, offlineActive: active });
        } finally { await context.close(); }
      }
    } finally { await server.close(); }
  }
  await writeFile(path.join(output, 'preview-budget-receipt.json'), JSON.stringify(receipts, null, 2));
  console.log(JSON.stringify(receipts, null, 2));
} finally { await browser.close(); origin.closeAllConnections(); await new Promise(resolve => origin.close(resolve)); }
