// Run from marketing/web10-social: bun scripts/render-social-icons.ts
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { SOCIAL_SIGNATURE_PATH, SOCIAL_SIGNATURE_VIEW_BOX } from '../src/lib/socialSignature';

async function dataUrl(path: string, type: string) {
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const keys = await dataUrl('public/keys-mark.png', 'image/png');
const displayFont = await dataUrl('node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2', 'font/woff2');
const charcoal = '#1b2026';
const browser = await chromium.launch();

async function render(size: number, variant: 'stacked' | 'maskable' | 'keys') {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  try {
    // A 448×192 lockup at 0.76 scale fits wholly within the 409.6px maskable safe circle.
    const scale = variant === 'maskable' ? 0.76 : 1;
    await page.setContent(`<!doctype html><style>
      @font-face { font-family: Space; src: url(${displayFont}); font-weight: 300 700; }
      body { margin: 0; height: 512px; display: grid; place-items: center; background: ${charcoal}; color: #fafafa; }
      .lockup { display: flex; width: 448px; height: 192px; align-items: center; justify-content: center; gap: 16px; transform: scale(${scale}); }
      .keys { width: 168px; height: 176px; object-fit: contain; }
      .favicon { width: 380px; height: 380px; object-fit: contain; }
      .words { display: grid; justify-items: start; gap: 14px; font: 700 88px/.85 Space, sans-serif; letter-spacing: -.05em; }
      b { color: #a8ceff; font-weight: inherit; }
      svg { width: 254px; height: auto; fill: currentColor; }
    </style>${variant === 'keys' ? `<img class="favicon" src="${keys}" alt="">` : `
      <div class="lockup"><img class="keys" src="${keys}" alt=""><div class="words">
        <span>web<b>10</b></span><svg width="216.31" height="64.5" viewBox="${SOCIAL_SIGNATURE_VIEW_BOX}"><path d="${SOCIAL_SIGNATURE_PATH}"/></svg>
      </div></div>`}`);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images, (image) => image.decode()));
    });
    return await page.screenshot();
  } finally {
    await page.close();
  }
}

function ico(frames: { size: number; png: Buffer }[]) {
  const directory = Buffer.alloc(6 + frames.length * 16);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(frames.length, 4);
  let offset = directory.length;
  frames.forEach(({ size, png }, i) => {
    const entry = 6 + i * 16;
    directory[entry] = directory[entry + 1] = size;
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([directory, ...frames.map(({ png }) => png)]);
}

try {
  const stacked = await render(512, 'stacked');
  await writeFile('public/logo512.png', stacked);
  await writeFile('../marketing-ui/public/brand/social-app-icon.png', stacked);
  await writeFile('public/logo192.png', await render(192, 'stacked'));
  await writeFile('public/apple-touch-icon.png', await render(180, 'stacked'));
  await writeFile('public/logo-maskable-crisp-512.png', await render(512, 'maskable'));
  const frames = await Promise.all([16, 32].map(async (size) => ({ size, png: await render(size, 'keys') })));
  await writeFile('public/favicon.ico', ico(frames));
} finally {
  await browser.close();
}
