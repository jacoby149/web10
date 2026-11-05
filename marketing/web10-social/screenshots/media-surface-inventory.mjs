// Static guard: a new tab cannot silently introduce an unowned raw renderer.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const marketing = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const exceptions = new Map([
  ['shared/discover/src/ReliableImage.tsx', 'shared image primitive'],
  ['shared/discover/src/ReliableVideo.tsx', 'shared native/file primitive'],
  ['shared/discover/src/AudioPlayer.tsx', 'shared inline audio transport'],
  ['shared/discover/src/HoverVideo.tsx', 'shared lease-owned preview transport'],
  ['shared/discover/src/HlsVideoPlayer.tsx', 'shared full HLS transport'],
  ['shared/discover/src/VideoPlayer.tsx', 'shared immersive HLS transport'],
  ['web10-social/src/components/Feed/VideoEditorSheet.tsx', 'local editor decoder with its own unsupported-file state'],
  ['web10-social/src/context/MusicContext.tsx', 'persistent Music transport and authorized track renewal'],
  ['web10-social/src/lib/mediaProcessing.ts', 'local upload metadata decoder'],
  ['web10-social/src/lib/videoEditing.ts', 'local upload editor decoder'],
  ['web10-social/src/components/shared/ReportBug.tsx', 'local screenshot attachment'],
  ['web10-social/src/components/shared/InstallPrompt.tsx', 'bundled PWA branding'],
  ['web10-social/src/components/Social/Layout.tsx', 'bundled navigation brand'],
  ['marketing-ui/src/components/ReportBug.tsx', 'local screenshot attachment'],
  ['marketing-ui/src/components/Navbar.tsx', 'bundled navigation brand'],
  ['marketing-ui/src/pages/Home.tsx', 'bundled brand lockup'],
  ['marketing-ui/src/pages/Join.tsx', 'bundled brand lockup'],
]);
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : /\.tsx?$/.test(entry.name) ? [name] : [];
  });
}
const unexpected = [];
for (const root of ['shared/discover/src', 'web10-social/src', 'marketing-ui/src']) {
  for (const file of files(path.join(marketing, root))) {
    if (/(__tests__|\.test\.|\.spec\.)/.test(file)) continue;
    const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    if (/<(?:img|video|audio)\s|\bnew Audio\s*\(|createElement\(['"](?:img|video|audio)['"]/.test(source) && !exceptions.has(path.relative(marketing, file))) unexpected.push(path.relative(marketing, file));
  }
}
assert.deepEqual(unexpected, [], 'Unowned raw media renderers must use shared reliability primitives or document a local-only exception');
console.log('[media-surface-inventory] shared, social and marketing renderer ownership passed');
