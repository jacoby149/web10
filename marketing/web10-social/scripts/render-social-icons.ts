// Run from marketing/web10-social: bun scripts/render-social-icons.ts
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

async function dataUrl(path: string, type: string) {
  return `data:${type};base64,${(await readFile(path)).toString('base64')}`;
}

const keys = await dataUrl('public/keys-mark.png', 'image/png');
const iconBackground = '#000000'; // Social app artwork only; see design.md §3.
const faviconBackground = '#1b2026';
const accent = '#a8ceff'; // Dark --color-brand-300, also the header's blue 10.
const browser = await chromium.launch();

async function render(size: number, variant: 'social' | 'favicon') {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: size / 512 });
  try {
    await page.setContent(`<!doctype html><style>
      body { margin: 0; height: 512px; display: grid; place-items: center; background: ${variant === 'favicon' ? faviconBackground : iconBackground}; }
      .keys { width: 308px; height: 324px; background: ${accent}; mask: url(${keys}) center / contain no-repeat; }
      .favicon { width: 380px; height: 380px; object-fit: contain; }
    </style>${variant === 'favicon' ? `<img class="favicon" src="${keys}" alt="">` : '<div class="keys"></div>'}`);
    await page.evaluate(async (src) => {
      const mark = new Image();
      mark.src = src;
      await mark.decode();
    }, keys);
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
  const social = await render(512, 'social');
  await writeFile('public/logo512.png', social);
  await writeFile('../marketing-ui/public/brand/social-app-icon.png', social);
  await writeFile('public/logo192.png', await render(192, 'social'));
  await writeFile('public/apple-touch-icon.png', await render(180, 'social'));
  // The 308×324 mark's painted pixels fit inside Android's 204.8px safe radius.
  await writeFile('public/logo-maskable-crisp-512.png', social);
  const frames = await Promise.all([16, 32].map(async (size) => ({ size, png: await render(size, 'favicon') })));
  await writeFile('public/favicon.ico', ico(frames));
} finally {
  await browser.close();
}
