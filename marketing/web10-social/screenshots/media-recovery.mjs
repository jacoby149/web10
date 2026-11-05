// Both app configurations, real shared renderers and actual expiring HTTP
// image URLs. Synthetic read authorization; never production credentials/data.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as viteServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';

const social = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
assert(output, 'Set SCREENSHOT_OUTPUT_DIR to .context');
await mkdir(output, { recursive: true });
const reads = new Map();
let origin;
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'content-type'); res.end(); return; }
  if (req.url === '/v3/read') {
    let text = ''; for await (const chunk of req) text += chunk;
    const { fixture } = JSON.parse(text);
    const count = (reads.get(fixture) || 0) + 1; reads.set(fixture, count);
    const token = 'x.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + (count === 1 ? 1 : 60) })).toString('base64url') + '.x';
    const url = key => `${origin}/image/${fixture}-${key}.svg?cap=${token}`;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ avatar_url: url('avatar'), banner_url: url('banner'), thumbnail_url: url('cover') }));
    return;
  }
  if (req.url.startsWith('/image/')) {
    const url = new URL(req.url, origin);
    const failure = /failure-(403|404|503)/.exec(url.pathname);
    if (failure) { res.writeHead(Number(failure[1])).end(); return; }
    const claim = JSON.parse(Buffer.from(url.searchParams.get('cap').split('.')[1], 'base64url'));
    if (claim.exp * 1000 <= Date.now()) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', 'image/svg+xml'); res.setHeader('Cache-Control', 'private, no-store');
    // Neutral synthetic geometry, not actual creator content or brand marks.
    res.end('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><path d="M0 0H640V360H0Z" fill="currentColor"/><path d="M80 260L250 80L460 300Z" fill="Canvas"/></svg>');
    return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const receipt = [];
try {
  for (const site of ['web10-social', 'marketing-ui']) {
    const root = path.resolve(social, '..', site);
    const vite = await viteServer({ root, configFile: path.join(root, site === 'web10-social' ? 'vite.config.ts' : 'vite.config.js'), server: { port: 0, host: '127.0.0.1' },
      plugins: [{ name: 'media-recovery-fixture',
        resolveId(id) { if (id === '/__recovery.tsx') return '\0recovery.tsx'; },
        async load(id) { if (id !== '\0recovery.tsx') return; return transformWithEsbuild(`
          import React,{useState} from 'react'; import {createRoot} from 'react-dom/client';
          import {HomeCard,PersonCard,GroupCard,DiscoverCard} from '@web10/discover';
          import {ReliableImage} from '@web10/discover/image';
          import {mediaReadFetch} from '@web10/discover/media-recovery'; import '/src/index.css';
          function Fixture(){const [data,setData]=useState(null),[tab,setTab]=useState(''),[show,setShow]=useState(false);
            window.loadFixture=async(label,key)=>{setShow(false);setTab(label);history.replaceState(null,'','?tab='+label);const r=await mediaReadFetch('${origin}/v3/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fixture:key})});setData(await r.json());};
            window.showFixture=()=>setShow(true);
            const post={id:'synthetic',author:'fixture',author_username:'fixture',text:'Synthetic expiring-media check',title:tab+' — reliable media',created_at:new Date().toISOString(),media:data?[{url:data.thumbnail_url,mime_type:'image/svg+xml'}]:[]};
            return <main className="mx-auto max-w-3xl p-6 text-foreground"><h1 className="text-2xl font-semibold">Media recovery · {tab}</h1><p className="my-4 text-muted-foreground">${site} · synthetic expired URLs · throttled connection</p>
              <div data-testid="fixture" data-tab={tab}>{show&&data&&<>
                {tab==='people'?<PersonCard person={{username:'fixture',display_name:'Fixture creator',followers_count:12,avatar_url:data.avatar_url,banner_url:data.banner_url}}/>:
                 tab==='groups'?<GroupCard entry={{group_id:'fixture',name:'Fixture group',owner:'fixture',member_count:12,join_policy:'open'}} face={data}/>:
                 tab==='video'||tab==='shorts'?<HomeCard post={post} authorAvatar={data.avatar_url} frame={tab==='shorts'?'portrait':'landscape'}/>:
                 tab==='posts'?<DiscoverCard post={post} authorAvatar={data.avatar_url} remote/>:
                 <div className="relative aspect-video overflow-hidden rounded-lg bg-elevated"><ReliableImage src={data.thumbnail_url} alt={tab+' artwork'} className="h-full w-full object-cover"/></div>}
              </>}</div></main>;
          }createRoot(document.getElementById('root')).render(<Fixture/>);`, 'recovery.tsx', { loader: 'tsx', jsx: 'automatic' }); },
        configureServer(v) { v.middlewares.use('/__recovery.html', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await v.transformIndexHtml('/__recovery.html', '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__recovery.tsx"></script></body></html>')); }); },
      }],
    });
    try {
      await vite.listen();
      for (const mobile of [false, true]) {
        const context = await browser.newContext({ viewport: { width: mobile ? 375 : 1440, height: mobile ? 812 : 900 }, isMobile: mobile, hasTouch: mobile });
        const page = await context.newPage();
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try {
          await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__recovery.html`);
          await page.waitForFunction(() => typeof window.loadFixture === 'function');
          const cdp = await context.newCDPSession(page);
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 100 * 1024, uploadThroughput: 50 * 1024 });
          for (const tab of ['posts', 'people', 'video', 'music', 'shorts', 'saved', 'groups', 'search', 'ads', 'profiles']) {
            const key = `${site}-${mobile ? 375 : 1440}-${tab}`;
            console.log('[media-matrix] start', key);
            await page.evaluate(([label, id]) => window.loadFixture(label, id), [tab, key]);
            await page.waitForTimeout(1200); // actual expiry before these renderers mount
            await page.evaluate(() => window.showFixture());
            const images = page.locator('[data-testid="fixture"] img');
            await images.first().waitFor();
            for (let i = 0; i < await images.count(); i++) {
              await images.nth(i).scrollIntoViewIfNeeded();
              await page.waitForFunction(index => {
                const image = document.querySelectorAll('[data-testid="fixture"] img')[index];
                return image && image.complete && image.naturalWidth > 0;
              }, i);
            }
            assert.equal(reads.get(key), 2, `${key}: one initial read + one shared recovery`);
            assert.equal(await page.locator('[data-media-state="unavailable"]').count(), 0);
            receipt.push({ site, viewport: mobile ? 375 : 1440, tab, reads: reads.get(key), decodedImages: await page.locator('[data-testid="fixture"] img').count() });
            if (['posts', 'people', 'video', 'music', 'shorts'].includes(tab)) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: path.join(output, `media-recovery-${site}-${mobile ? '375' : 'desktop'}-${tab}.png`) }); }
          }
          for (const status of [403, 404, 503]) {
            const tab = `failure-${status}`, key = `${site}-${mobile ? 375 : 1440}-${tab}`;
            await page.evaluate(([label, id]) => window.loadFixture(label, id), [tab, key]);
            await page.waitForTimeout(1200);
            await page.evaluate(() => { scrollTo(0, 0); window.showFixture(); });
            const retry = page.getByRole('button', { name: `Retry image: ${tab} artwork` });
            await retry.waitFor();
            assert.equal(reads.get(key), 2, `${key}: failure recovery is bounded`);
            await page.waitForTimeout(350);
            assert.equal(reads.get(key), 2, `${key}: no failed-read loop`);
            await retry.click();
            await retry.waitFor();
            assert.equal(reads.get(key), 2, `${key}: manual retry can reuse its still-current capability`);
            receipt.push({ site, viewport: mobile ? 375 : 1440, tab, reads: reads.get(key), unavailable: true, manualRetry: true });
            if (status === 403) await page.screenshot({ path: path.join(output, `media-unavailable-${site}-${mobile ? '375' : 'desktop'}.png`) });
          }
          const offlineKey = `${site}-${mobile ? 375 : 1440}-offline`;
          await page.evaluate(id => window.loadFixture('offline', id), offlineKey);
          await page.waitForTimeout(1200);
          await context.setOffline(true);
          await page.evaluate(() => window.showFixture());
          await page.getByRole('button', { name: 'Retry image: offline artwork' }).waitFor();
          assert.equal(reads.get(offlineKey), 1, 'Offline does not spend a read/retry budget');
          await context.setOffline(false);
          await page.waitForFunction(() => { const image = document.querySelector('[alt="offline artwork"]'); return image && image.complete && image.naturalWidth > 0; });
          assert.equal(reads.get(offlineKey), 2);
          receipt.push({ site, viewport: mobile ? 375 : 1440, tab: 'offline-reconnect', reads: reads.get(offlineKey), recovered: true });
          assert.deepEqual(errors, []);
        } finally { await context.close(); }
      }
    } finally { await vite.close(); }
  }
  await writeFile(path.join(output, 'media-recovery-matrix.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
