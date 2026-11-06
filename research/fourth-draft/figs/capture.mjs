// Renders figs/<name>.html to <name>.png — headless Chromium @2x, at the
// figure's natural body size (fig-feed: 1440x900 -> 2880x1800, matching the
// committed rasters' dimensions). See ./README.md.
//
// Usage (playwright is not a repo dependency — scratch install; browsers
// are cached in ~/Library/Caches/ms-playwright, so no Chromium download):
//   SCRATCH="$(mktemp -d)"
//   cd "$SCRATCH" && bun add playwright@1.62.0
//   NODE_PATH="$SCRATCH/node_modules" node capture.mjs <name> [out.png]
//
// <name> is the figure stem (fig-feed -> fig-feed.html / fig-feed.png).
// out.png defaults to ./<name>.png in this directory.
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const name = process.argv[2] || 'fig-feed';
const src = path.join(here, `${name}.html`);
if (!fs.existsSync(src)) {
  console.error(`no such figure source: ${src}`);
  process.exit(1);
}
const out = process.argv[3] ? path.resolve(process.argv[3]) : path.join(here, `${name}.png`);

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
  viewport: { width: 1440, height: 900 },
});
await page.goto('file://' + src);
await page.waitForTimeout(300);
const size = await page.evaluate(() => ({
  w: document.body.scrollWidth,
  h: document.body.scrollHeight,
}));
await page.setViewportSize({ width: size.w, height: size.h });
await page.screenshot({ path: out });
await browser.close();
console.log('captured', out, `(${size.w}x${size.h} @2x)`);
