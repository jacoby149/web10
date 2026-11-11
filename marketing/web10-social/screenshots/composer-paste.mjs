// Real-Chromium paste-to-attach evidence (5.15.0): boots the harness server
// (the REAL PostComposer at ?screen=composer — no login, no backend), puts a
// real PNG on the page's clipboard, drives the paste into the caption
// editor, and captures the tray at desktop + 375px.
//
// Two paths, in order of honesty:
//   A. OS-clipboard path: `navigator.clipboard.write` (a Canvas-drawn PNG)
//      + a real keyboard Meta/Ctrl+V. If this headless build delivers the
//      image to the page, that is the operator's exact flow end to end.
//   B. Deterministic fallback: a real `ClipboardEvent('paste')` carrying a
//      real `DataTransfer` + `File` (canvas → blob → File), dispatched on
//      the composer root. The browser's OS-keyboard → clipboard delivery is
//      a platform seam, not app code — the app's seam (paste event with a
//      clipboard image → the tray through the shared processAndAddFiles
//      pipeline, with REAL in-browser downscale/encode) is fully exercised.
//
// The receipt (composer-paste-receipt.json, written even on failure) records
// which path populated the tray per viewport, so "keyboard paste unverified
// in headless" is a stated limit, not a silent one.
//
// Run from marketing/web10-social:
//   SCREENSHOT_OUTPUT_DIR="$PWD/../../.context/composer-paste" node screenshots/composer-paste.mjs
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = Number(process.env.SCREENSHOT_PORT || 4502);
const BASE_URL = `http://localhost:${PORT}/screenshots/harness/index.html`;

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  '375': { width: 375, height: 812 },
};

const OUTPUT_DIR = process.env.SCREENSHOT_OUTPUT_DIR || path.join(__dirname, '..', '..', '..', '.context', 'composer-paste');

async function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Harness server did not come up at ${url}`);
}

const runner = process.env.VITE_RUNNER || 'bunx';
// The harness vite config reads SCREENSHOT_PORT (default 4500); forward ours
// so the two can never disagree.
const server = spawn(runner, ['vite', '--config', 'screenshots/vite.config.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, SCREENSHOT_PORT: String(PORT) },
});

// Draw the synthetic screenshot in-page (canvas → PNG data URL): a 320x240
// violet gradient with a label — real pixels, real dimensions, no network.
function drawPng() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 320, 240);
  grad.addColorStop(0, '#7c5cff');
  grad.addColorStop(1, '#2b1e5e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 320, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '600 24px sans-serif';
  ctx.fillText('on the clipboard', 32, 128);
  return canvas.toDataURL('image/png');
}

// Write the PNG to the page's clipboard (the OS-clipboard path's input).
// Returns true on success, false when the headless build refuses.
async function writeClipboard(dataUrl) {
  try {
    const byteString = atob(dataUrl.split(',')[1]);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/png' });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch (e) {
    return `denied: ${String(e.message || e).slice(0, 120)}`;
  }
}

// Path B: a real ClipboardEvent with a real DataTransfer + File, dispatched
// on the composer root. Returns whether the event was preventDefault-ed by
// the app (it should be — the app claimed the paste).
function dispatchPasteEvent(dataUrl) {
  const root = document.querySelector('[data-testid="post-composer"]');
  if (!root) return { dispatched: false };
  const byteString = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
  const file = new File([bytes], 'image.png', { type: 'image/png' });
  const dt = new DataTransfer();
  dt.items.add(file);
  const event = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
  root.dispatchEvent(event);
  return { dispatched: true, preventDefaulted: event.defaultPrevented };
}

function traySettled() {
  const tray = document.querySelector('[data-testid="media-tray"]');
  return !!tray && !tray.querySelector('.animate-spin');
}

function readTrayState() {
  const tray = document.querySelector('[data-testid="media-tray"]');
  const img = tray ? tray.querySelector('img') : null;
  const submit = document.querySelector('[data-testid="post-submit"]');
  return {
    items: tray ? tray.children.length : 0,
    imgComplete: img ? img.complete && img.naturalWidth > 0 : false,
    imgWidth: img ? img.naturalWidth : 0,
    postEnabled: submit ? !submit.disabled : false,
  };
}

const receipt = {
  started: new Date().toISOString(),
  app: 'web10-social (harness, real PostComposer at ?screen=composer)',
  claim:
    'Pasting an image onto the post composer attaches it to the media tray through the same pipeline as picker/drag-drop (5.15.0).',
  viewports: {},
};

let browser;
try {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  await waitForServer(BASE_URL);
  browser = await chromium.launch();

  for (const [label, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
      origin: `http://localhost:${PORT}`,
    });
    const page = await context.newPage();
    const pageLog = [];
    page.on('pageerror', (err) => {
      const line = `[pageerror] ${err.message}`;
      pageLog.push(line);
      console.error(line);
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const line = `[page:console] ${msg.text()}`;
        pageLog.push(line);
        console.error(line);
      }
    });

    const entry = { pages: [] };
    receipt.viewports[label] = entry;

    await page.goto(`${BASE_URL}?screen=composer`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="post-composer"] >> visible=true', { timeout: 15000 });
    const dataUrl = await page.evaluate(drawPng);

    // Focus the caption editor (the operator's flow: typing, then paste).
    await page.click('[data-testid="composer-textarea"]');

    // PATH A — the OS-clipboard path: write the PNG, then a real keyboard
    // paste (Meta on macOS, Control elsewhere).
    let keyboard = { attempted: false };
    try {
      const wrote = await page.evaluate(writeClipboard, dataUrl);
      keyboard = { attempted: true, clipboardWrite: wrote };
      if (wrote === true) {
        const key = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';
        await page.keyboard.press(key, { delay: 50 });
        try {
          await page.waitForSelector('[data-testid="media-tray"] >> visible=true', { timeout: 4000 });
          keyboard.trayAppeared = true;
        } catch {
          keyboard.trayAppeared = false;
        }
      }
    } catch (e) {
      keyboard.error = String(e.message || e).slice(0, 200);
    }
    entry.keyboardPath = keyboard;

    // PATH B — if the keyboard path did not populate the tray, dispatch a
    // real ClipboardEvent + DataTransfer + File on the composer root.
    if (!keyboard.trayAppeared) {
      const dispatch = await page.evaluate(dispatchPasteEvent, dataUrl);
      entry.dispatchPath = dispatch;
      try {
        await page.waitForSelector('[data-testid="media-tray"] >> visible=true', { timeout: 10000 });
        entry.trayAppeared = true;
      } catch {
        entry.trayAppeared = false;
      }
    } else {
      entry.trayAppeared = true;
    }

    if (!entry.trayAppeared) {
      entry.pageErrors = pageLog.length ? pageLog : 'none';
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'composer-paste-receipt.json'),
        JSON.stringify(receipt, null, 2),
      );
      throw new Error(
        `paste-to-attach failed on ${label}: no media tray. keyboard=${JSON.stringify(keyboard)} log=${pageLog.slice(-5).join(' | ') || '(nothing)'}`,
      );
    }

    // Wait for the real in-browser processing (createImageBitmap + canvas
    // encode) to settle — the spinner overlay clears when it does.
    await page.waitForFunction(traySettled, null, { timeout: 15000 });
    await page.waitForTimeout(500); // let the preview image decode + settle

    // The tray shows the pasted photo (a decoded <img>, not a broken one) and
    // the Post button is enabled (media is a postable content).
    const trayState = await page.evaluate(readTrayState);
    entry.tray = trayState;
    if (trayState.items < 1 || !trayState.imgComplete || !trayState.postEnabled) {
      entry.pageErrors = pageLog.length ? pageLog : 'none';
      fs.writeFileSync(
        path.join(OUTPUT_DIR, 'composer-paste-receipt.json'),
        JSON.stringify(receipt, null, 2),
      );
      throw new Error(`tray state wrong on ${label}: ${JSON.stringify(trayState)}`);
    }

    const out = path.join(OUTPUT_DIR, `composer-paste-${label}.png`);
    await page.screenshot({ path: out });
    console.log('wrote', out);
    entry.pageErrors = pageLog.length ? pageLog : 'none';
    await context.close();
  }

  receipt.finished = new Date().toISOString();
  const receiptOut = path.join(OUTPUT_DIR, 'composer-paste-receipt.json');
  fs.writeFileSync(receiptOut, JSON.stringify(receipt, null, 2));
  console.log('wrote', receiptOut);
  console.log(JSON.stringify(receipt, null, 2));
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  server.kill('SIGTERM');
}
