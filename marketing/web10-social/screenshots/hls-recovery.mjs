// Actual Chromium/hls.js decoding and mid-playback renewal. Synthetic HTTP
// grants/files, not real-node authorization or a production movie receipt.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as viteServer, transformWithEsbuild } from 'vite';
import { chromium } from 'playwright';
const social = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.env.SCREENSHOT_OUTPUT_DIR;
assert(output, 'Set SCREENSHOT_OUTPUT_DIR to .context');
const fixtures = path.join(output, 'hls-synthetic'); await mkdir(fixtures, { recursive: true });
const generated = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=12', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '12', '-c:v', 'libx264', '-preset', 'ultrafast', '-g', '24', '-sc_threshold', '0', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-hls_time', '2', '-hls_playlist_type', 'vod', '-hls_segment_filename', path.join(fixtures, 'seg-%d.ts'), path.join(fixtures, 'vod.m3u8')], { stdio: 'pipe' });
assert.equal(generated.status, 0, generated.stderr?.toString());
const playlist = await readFile(path.join(fixtures, 'vod.m3u8'), 'utf8');
const reads = new Map(), denied = new Set(), refusals = new Map();
let origin;
const server = createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Headers', 'content-type'); res.end(); return; }
  const url = new URL(req.url, origin);
  if (url.pathname === '/v3/read') {
    let body = ''; for await (const chunk of req) body += chunk;
    const { doc_id: id } = JSON.parse(body); const count = (reads.get(id) || 0) + 1; reads.set(id, count);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ transcoding_settings: { manifest_url: `/v3/media/hls/manifest?doc_id=${id}&sig=${count === 1 ? 'old' : 'fresh'}` } })); return;
  }
  const id = url.searchParams.get('doc_id'), sig = url.searchParams.get('sig');
  if (sig === 'old' && denied.has(id)) { refusals.set(id, (refusals.get(id) || 0) + 1); res.writeHead(403).end(); return; }
  if (url.pathname === '/v3/media/hls/manifest') {
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.end(playlist.split('\n').map(line => line && !line.startsWith('#') ? `/segments/${line}?doc_id=${id}&sig=${sig}` : line).join('\n')); return;
  }
  if (/^\/segments\/seg-\d+\.ts$/.test(url.pathname)) {
    res.setHeader('Content-Type', 'video/mp2t'); res.end(await readFile(path.join(fixtures, path.basename(url.pathname)))); return;
  }
  res.writeHead(404).end();
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch(); const receipt = [];
try {
  for (const site of ['web10-social', 'marketing-ui']) {
    const root = path.resolve(social, '..', site);
    const vite = await viteServer({ root, configFile: path.join(root, site === 'web10-social' ? 'vite.config.ts' : 'vite.config.js'), define: { 'import.meta.env.VITE_API_URL': JSON.stringify(origin) }, server: { port: 0, host: '127.0.0.1' },
      plugins: [{ name: 'hls-renewal-fixture', resolveId(id) { if (id === '/__hls.tsx') return '\0hls-fixture.tsx'; },
        async load(id) { if (id !== '\0hls-fixture.tsx') return; return transformWithEsbuild(`
          import React,{useEffect,useState} from 'react';import {createRoot} from 'react-dom/client';import {HlsVideoPlayer,ImmersiveHls} from '@web10/discover';import {mediaReadFetch} from '@web10/discover/media-recovery';import '/src/index.css';
          const params=new URLSearchParams(location.search),key=params.get('key'),mode=params.get('mode');
          const RealHls=window.Hls;window.Hls=class extends RealHls{constructor(){super({maxBufferLength:1,maxMaxBufferLength:2});}};
          function Fixture(){const [manifest,setManifest]=useState('');useEffect(()=>{mediaReadFetch('${origin}/v3/read',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({doc_id:key})}).then(r=>r.json()).then(data=>setManifest(data.transcoding_settings.manifest_url));},[]);
          return <main className="mx-auto max-w-3xl p-6 text-foreground"><h1 className="mb-4 text-2xl font-semibold">Synthetic HLS · ${site} · {mode}</h1><div className="relative aspect-video">{manifest&&(mode==='full'?<HlsVideoPlayer manifestUrl={manifest}/>:<ImmersiveHls manifestUrl={manifest} active/>)}</div></main>;}createRoot(document.getElementById('root')).render(<Fixture/>);`, 'hls-fixture.tsx', { loader: 'tsx', jsx: 'automatic' }); },
        configureServer(v) { v.middlewares.use('/__hls.html', async (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end(await v.transformIndexHtml('/__hls.html', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><script src="/hls.min.js"></script></head><body><div id="root"></div><script type="module" src="/__hls.tsx"></script></body></html>')); }); },
      }],
    });
    try {
      await vite.listen();
      for (const width of [1440, 375]) for (const mode of ['full', 'immersive']) {
        const key = `${site}-${width}-${mode}`, page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = []; page.on('pageerror', error => errors.push(error.message));
        try {
          await page.addInitScript(() => {
            window.__hlsTrace = []; let metadata = 0;
            for (const name of ['loadedmetadata', 'playing', 'pause']) document.addEventListener(name, event => {
              if (!(event.target instanceof HTMLVideoElement)) return;
              if (name === 'loadedmetadata') metadata++;
              window.__hlsTrace.push({ event: name, metadata, time: event.target.currentTime });
            }, true);
          });
          await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/__hls.html?key=${key}&mode=${mode}`);
          await page.waitForFunction(() => { const video = document.querySelector('video'); return video && video.currentTime > 2 && !video.paused; });
          const before = await page.locator('video').evaluate(video => video.currentTime);
          denied.add(key);
          const deadline = Date.now() + 20_000;
          while ((reads.get(key) || 0) < 2) { assert(Date.now() < deadline, `${key}: recovery was not requested`); await new Promise(resolve => setTimeout(resolve, 50)); }
          await page.waitForFunction(position => { const video = document.querySelector('video'); return video && video.currentTime > position + 1 && !video.paused && video.readyState >= 2; }, before);
          assert.equal(reads.get(key), 2, `${key}: one authorized renewal`);
          assert((refusals.get(key) || 0) >= 1, `${key}: real HTTP 403 observed`);
          assert.deepEqual(errors, []);
          const after = await page.locator('video').evaluate(video => ({ time: video.currentTime, width: video.videoWidth, height: video.videoHeight }));
          assert(after.width > 0 && after.height > 0);
          const trace = await page.evaluate(() => window.__hlsTrace);
          const resumed = trace.filter(event => event.event === 'playing' && event.metadata >= 2);
          assert(resumed.length > 0 && resumed.every(event => event.time >= before - 0.5), `${key}: renewed playback must not restart at zero`);
          receipt.push({ site, viewport: width, mode, reads: reads.get(key), deniedRequests: refusals.get(key), before, after, trace });
          await page.screenshot({ path: path.join(output, `hls-renewal-${site}-${width}-${mode}.png`) });
          console.log('[hls-renewal]', key, 'decoded and continued', before, after.time);
        } catch (error) {
          console.error('[hls-renewal] failed', key, { reads: reads.get(key), refusals: refusals.get(key), errors, trace: await page.evaluate(() => window.__hlsTrace) });
          throw error;
        } finally { await page.close(); }
      }
    } finally { await vite.close(); }
  }
  await writeFile(path.join(output, 'hls-renewal-receipt.json'), JSON.stringify(receipt, null, 2));
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
