import { spawn } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { createVerifier } from './core.mjs';
import { writeRunReceipt } from './acceptance.mjs';

process.umask(0o077);
const tooling = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(tooling, '..');
const dir = path.resolve(process.argv[2] || path.join(root, '.context/cdn-live'));
const run = randomBytes(8).toString('hex');
const container = 'web10-cdn-acceptance-' + run;
const label = 'web10.cdn.acceptance';
let image;
const controller = randomBytes(24).toString('hex');
const password = randomBytes(24).toString('hex');
const hash = value => createHash('sha256').update(value).digest('hex');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const receipt = { stage: 'node-acceptance', started: new Date().toISOString(), checks: [],
  scope: 'Local isolated ClickHouse and live HLS router; synthetic stream-token issuer; real restricted MinIO/Cloudflare',
  gaps: ['No document CRUD/login/app-contract issuance proof', 'No production-node rollout',
    'No full social-player seamless renewal or Safari/physical-phone proof', 'No provider logging/cost or independent security closure'] };
let phase = 'load', owned = false, server, browser, base, calls = 0;
const check = (condition, name) => { if (!condition) throw Error(name); };
async function exec(command, args, input = '', env = process.env) {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { env, cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', bytes = 0;
    const timer = setTimeout(() => p.kill(), 60000);
    p.stdout.on('data', data => { bytes += data.length; if (bytes < 1024 * 1024) out += data; else p.kill(); });
    p.stderr.on('data', () => {});
    p.on('error', () => { clearTimeout(timer); reject(Error('child launch')); });
    p.on('close', code => { clearTimeout(timer); resolve({ code, out }); });
    p.stdin.on('error', () => {}); p.stdin.end(input);
  });
}
async function control(data) {
  const response = await fetch(base + '/fixture/control', { method: 'POST',
    headers: { 'content-type': 'application/json', 'x-fixture-key': controller },
    body: JSON.stringify(data), signal: AbortSignal.timeout(15000) });
  check(response.status === 200, 'fixture control');
  await sleep(25); // Preserve strict ordering across millisecond-versioned writes.
  return response.json();
}
async function request(name, url, expected) {
  check(++calls <= 60, 'request budget');
  const response = await fetch(url.startsWith('/') ? base + url : url, { redirect: 'manual',
    credentials: 'omit', signal: AbortSignal.timeout(20000) });
  const bytes = Buffer.from(await response.arrayBuffer());
  receipt.checks.push({ name, status: response.status, sha256: hash(bytes) });
  console.log(name + ': ' + response.status);
  check(response.status === expected, 'probe status');
  return { text: bytes.toString('utf8'), response, bytes };
}
async function playlist(name, token) {
  await request(name + '-master', token.manifest, 200);
  const response = await request(name + '-variant', token.variant, 200);
  const urls = response.text.split('\n').filter(line => line && !line.startsWith('#'));
  check(urls.length === 2, 'segment count');
  return urls;
}
async function cleanup() {
  await browser?.close(); browser = null;
  if (server && server.exitCode === null && server.signalCode === null) {
    try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    await Promise.race([new Promise(resolve => server.once('close', resolve)), sleep(3000)]);
    if (server.exitCode === null && server.signalCode === null) {
      try { process.kill(-server.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      await Promise.race([new Promise(resolve => server.once('close', resolve)), sleep(1000)]);
    }
  }
  receipt.apiStopped = !server || server.exitCode !== null || server.signalCode !== null;
  check(receipt.apiStopped, 'API process cleanup');
  if (owned) {
    const inspection = await exec('docker', ['inspect', '--format', '{{json .Config.Labels}}', container]);
    check(inspection.code === 0 && JSON.parse(inspection.out)[label] === run, 'cleanup ownership');
    const removal = await exec('docker', ['rm', '-f', container]);
    check(removal.code === 0, 'container cleanup');
    const remaining = await exec('docker', ['ps', '-a', '--filter', 'name=^/' + container + '$', '--format', '{{.ID}}']);
    check(remaining.code === 0 && !remaining.out.trim(), 'cleanup absence');
    receipt.containerRemoved = true;
  }
}
try {
  const state = JSON.parse(await readFile(path.join(dir, 'state.json'), 'utf8'));
  const secrets = JSON.parse(await readFile(path.join(dir, 'secrets.json'), 'utf8'));
  check(state.credentialVerified && !state.quarantined && state.deployed && !state.cleaned, 'verified isolated environment required');
  check(/^web10-cdn-smoke-\d{8}-[a-f0-9]{16}$/.test(state.bucket), 'bucket scope');
  receipt.sourceHashes = Object.fromEntries(await Promise.all([
    'media-delivery/connected-node.mjs', 'media-delivery/connected-node.py',
    'api/app/services/hls.py', 'api/app/v3/endpoints/media.py', 'api/app/v3/services/clickhouse.py',
  ].map(async file => [file, hash(await readFile(path.join(root, file)))])));
  const imageResult = await exec('docker', ['image', 'inspect', process.env.CLICKHOUSE_ACCEPTANCE_IMAGE ||
    'clickhouse/clickhouse-server:24.8', '--format', '{{.Id}}']);
  check(imageResult.code === 0 && /^sha256:[a-f0-9]{64}\s*$/.test(imageResult.out), 'preinstalled ClickHouse image required');
  image = imageResult.out.trim();
  phase = 'database-start';
  await writeFile(path.join(dir, 'local-node-run.json'), JSON.stringify({ container, label, run, image }), { mode: 0o600 });
  const result = await exec('docker', ['run', '-d', '--name', container, '--label', label + '=' + run,
    '--cpus', '1', '--memory', '2g', '--memory-swap', '2g',
    '--tmpfs', '/var/lib/clickhouse:rw,size=256m', '--tmpfs', '/var/log/clickhouse-server:rw,size=64m',
    '-p', '127.0.0.1::8123', '-e', 'CLICKHOUSE_USER=cdn_acceptance', '-e', 'CLICKHOUSE_DB=cdn_acceptance',
    '-e', 'CLICKHOUSE_PASSWORD', '-e', 'CLICKHOUSE_DEFAULT_ACCESS_MANAGEMENT=1', image], '',
    { ...process.env, CLICKHOUSE_PASSWORD: password });
  owned = result.code === 0 || /^[a-f0-9]{64}\s*$/.test(result.out);
  check(owned, 'database creation');
  const portResult = await exec('docker', ['port', container, '8123/tcp']);
  check(portResult.code === 0, 'database port');
  const dbport = Number(/^127\.0\.0\.1:(\d+)\s*$/.exec(portResult.out)?.[1]);
  check(dbport > 0, 'loopback port');
  let ready = false;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${dbport}/ping`, { headers: {
        authorization: 'Basic ' + Buffer.from('cdn_acceptance:' + password).toString('base64') },
        signal: AbortSignal.timeout(1000) });
      if (response.status === 200) { await response.arrayBuffer(); ready = true; break; }
    } catch {}
    await sleep(1000);
  }
  check(ready, 'database readiness');
  phase = 'node-start';
  const q = { ...state, dbhost: '127.0.0.1', dbport, database: 'cdn_acceptance', dbpassword: password, controller,
    pem: await readFile(path.join(dir, 'private.pem'), 'utf8'),
    accessKey: secrets.S3_ACCESS_KEY_ID, secretKey: secrets.S3_SECRET_ACCESS_KEY };
  server = spawn('uv', ['run', '--project', path.join(root, 'api'), 'python', path.join(tooling, 'connected-node.py')],
    { cwd: path.join(root, 'api'), detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const node = await new Promise((resolve, reject) => {
    let out = '';
    const timer = setTimeout(() => reject(Error('node readiness')), 60000);
    server.stdout.on('data', data => {
      out += data;
      if (out.includes('\n')) {
        clearTimeout(timer);
        try { resolve(JSON.parse(out.split('\n')[0])); } catch { reject(Error('node response')); }
      }
    });
    server.stderr.on('data', data => {
      const safe = /node-stage-failed:[a-z-]+:[A-Za-z]+/.exec(String(data))?.[0];
      if (safe) console.error(safe);
    });
    server.on('error', () => { clearTimeout(timer); reject(Error('node launch')); });
    server.on('close', () => { clearTimeout(timer); reject(Error('node exit')); });
    server.stdin.end(JSON.stringify(q));
  });
  check(node.authorityStubbed === false && Number.isInteger(node.port), 'real authority required');
  receipt.engine = node.engine; receipt.image = image;
  base = 'http://127.0.0.1:' + node.port;
  await request('live-router-health', '/fixture/health', 200);
  phase = 'permissions';
  const owner = await control({ action: 'mint', reader: 'cdn-smoke', ttl: 60 });
  await playlist('owner', owner);
  const member = await control({ action: 'mint', reader: 'reader', ttl: 60, authenticated: true });
  const memberSegments = await playlist('member', member);
  const outsider = await control({ action: 'mint', reader: 'outsider', ttl: 60 });
  await request('outsider-denied', outsider.manifest, 403);
  await request('missing-stream-token', '/v3/media/hls/manifest?doc_id=isolated-playback', 403);
  await control({ action: 'revoke', group: 'private', member: 'reader' });
  await request('revoked-member-master', member.manifest, 403);
  await request('revoked-member-variant', member.variant, 403);
  await request('preminted-segment-retains-bounded-access', memberSegments[0], 200);
  await control({ action: 'grant', group: 'private', member: 'reader' });
  await playlist('regranted-member', await control({ action: 'mint', reader: 'reader', ttl: 60, authenticated: true }));
  await control({ action: 'grant', group: 'carrier', member: 'anyone' });
  const anon = await control({ action: 'mint', reader: 'anon', ttl: 60 });
  await playlist('public-carrier-anon', anon);
  await control({ action: 'revoke', group: 'carrier', member: 'anyone' });
  await request('revoked-public-carrier', anon.variant, 403);
  await control({ action: 'grant', group: 'carrier', member: 'authenticated' });
  await request('unauthenticated-carrier-denied', outsider.variant, 403);
  const authenticated = await control({ action: 'mint', reader: 'outsider', ttl: 60, authenticated: true });
  await playlist('authenticated-carrier', authenticated);
  await control({ action: 'revoke', group: 'carrier', member: 'authenticated' });
  await request('revoked-authenticated-carrier', authenticated.variant, 403);
  phase = 'expiry-renewal';
  const expiring = await control({ action: 'mint', reader: 'reader', ttl: 8, authenticated: true });
  const segments = await playlist('short-parent', expiring);
  const verify = await createVerifier({ issuer: state.bucket, audience: state.worker, bucket: state.bucket, jwks: state.jwks });
  for (const [index, url] of segments.entries()) {
    const scope = await verify(new Request(url));
    check(scope.key === `cdn-smoke/video/hls/180p/seg${String(index).padStart(3, '0')}.ts`, 'segment exact key');
    const cap = new URL(url).searchParams.get('cap');
    const claims = JSON.parse(Buffer.from(cap.split('.')[1], 'base64url').toString());
    check(claims.exp <= expiring.expires, 'parent expiry bound');
  }
  await request('segment-before-expiry', segments[0], 200);
  await sleep(Math.max(0, expiring.expires * 1000 - Date.now()) + 1000);
  await request('expired-parent-master', expiring.manifest, 403);
  await request('expired-parent-variant', expiring.variant, 403);
  await request('expired-edge-capability', segments[0], 403);
  const renewed = await control({ action: 'mint', reader: 'reader', ttl: 15, authenticated: true });
  const renewedSegments = await playlist('explicit-renewal', renewed);
  await request('renewed-edge-capability', renewedSegments[0], 200);
  await control({ action: 'revoke', group: 'private', member: 'reader' });
  const deniedRenewal = await control({ action: 'mint', reader: 'reader', ttl: 15, authenticated: true });
  await request('revoked-renewal-denied', deniedRenewal.manifest, 403);
  await control({ action: 'grant', group: 'private', member: 'reader' });
  receipt.realMembershipChecks = true; receipt.expiryAndExplicitRenewal = true;
  phase = 'browser';
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
  browser = await chromium.launch({ headless: true });
  receipt.browser = [];
  for (const viewport of [{ width: 1280, height: 800 }, { width: 375, height: 812 }]) {
    const token = await control({ action: 'mint', reader: 'reader', ttl: 60, authenticated: true });
    const context = await browser.newContext({ viewport, serviceWorkers: 'block' });
    const page = await context.newPage();
    const network = { manifests: [], segments: [] };
    page.on('response', response => {
      const url = new URL(response.url());
      if (url.origin === base && url.pathname.startsWith('/v3/media/hls/')) network.manifests.push(response.status());
      if (url.origin === state.delivery && url.pathname.startsWith('/media/')) network.segments.push(response.status());
    });
    await page.goto(base, { timeout: 15000 });
    await page.addScriptTag({ url: base + '/hls.min.js' });
    const playback = await page.evaluate(async manifest => {
      const video = document.createElement('video'); video.muted = true; video.width = 320; video.height = 180;
      document.body.append(video);
      const hls = new Hls({ enableWorker: false }); let fatal = false;
      hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fatal = true; });
      const ended = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('playback timeout')), 20000);
        video.onended = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); reject(Error('video error')); };
      });
      hls.loadSource(manifest); hls.attachMedia(video); await video.play(); await ended;
      return { ended: video.ended, seconds: video.currentTime, frames: video.getVideoPlaybackQuality().totalVideoFrames, fatal };
    }, token.manifest);
    check(playback.ended && playback.seconds > 3.5 && playback.frames >= 80 && !playback.fatal &&
      network.manifests.length >= 2 && network.manifests.every(status => status === 200) &&
      network.segments.length >= 2 && network.segments.every(status => status === 200), 'live browser playback');
    await page.locator('#result').evaluate(element => { element.textContent =
      'PASS: real ClickHouse membership checks, live API HLS manifests and Cloudflare segments. Four-second playback completed.'; });
    await page.screenshot({ path: path.join(dir, 'node-browser-' + viewport.width + '.png'), fullPage: true });
    receipt.browser.push({ viewport, ...playback, ...network });
    await context.close();
  }
  receipt.ok = true;
  console.log('real-database-node-acceptance: PASS');
} catch {
  receipt.ok = false; receipt.failedPhase = phase;
  console.error('real-database-node-acceptance: FAIL at ' + phase + ' (private details suppressed)');
  process.exitCode = 1;
} finally {
  try { await cleanup(); } catch {
    receipt.cleanupFailed = true; receipt.ok = false; process.exitCode = 1;
    console.error('owned-resource cleanup failed; use private local-node-run.json for recovery');
  }
  receipt.finished = new Date().toISOString();
  receipt.requests = calls;
  await writeRunReceipt(path.join(dir, 'receipts'), 'node-acceptance', receipt);
}
