// Deterministic color counterpart of canonical artwork, never a new drawing.
// Run from marketing/marketing-ui after bun install. No server or remote assets.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root = path.resolve(import.meta.dirname, '..');
const sources = [
  ['public/brand/logo-lockup.png', 'public/brand/logo-lockup-dark.png'],
  ['../web10-social/public/keys-mark.png', '../web10-social/public/keys-mark-dark.png'],
];
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [source, output] of sources) {
    const bytes = await readFile(path.resolve(root, source));
    const result = await page.evaluate(async data => {
      const image = new Image();
      image.src = data;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
      const original = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let opaque = 0, transparent = 0;
      for (let i = 3; i < original.data.length; i += 4) original.data[i] ? opaque++ : transparent++;
      // Preserve alpha exactly, including antialiased edges and internal gaps.
      const dark = ctx.createImageData(canvas.width, canvas.height);
      for (let i = 0; i < dark.data.length; i += 4) {
        dark.data[i] = 24; dark.data[i + 1] = 24; dark.data[i + 2] = 27;
        dark.data[i + 3] = original.data[i + 3];
      }
      ctx.putImageData(dark, 0, 0);
      return { width: canvas.width, height: canvas.height, opaque, transparent, png: canvas.toDataURL('image/png').split(',')[1] };
    }, `data:image/png;base64,${bytes.toString('base64')}`);
    assert.ok(result.opaque > 0 && result.transparent > 0, 'canonical image has transparent geometry');
    await writeFile(path.resolve(root, output), Buffer.from(result.png, 'base64'));
    console.log('[brand] derived transparent dark artwork', output, result.width, result.height);
  }
} finally { await browser.close(); }
