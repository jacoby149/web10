// Offline figure checks; Playwright is supplied by a scratch NODE_PATH.
// These verify the print layout and matched use case, not platform behavior.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch();
try {
  for (const [name, height] of [['fig-mastodon', 900], ['fig-atproto', 1200]]) {
    const page = await browser.newPage({ viewport: { width: 1440, height } });
    try {
      await page.goto(pathToFileURL(path.join(here, `${name}.html`)).href);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const rect = el => el.getBoundingClientRect();
        const resolvedColor = value => {
          const el = document.createElement('span');
          el.style.color = value;
          document.body.append(el);
          const color = getComputedStyle(el).color;
          el.remove();
          return color;
        };
        const containers = [...document.querySelectorAll('.app, .box, .verdict')];
        const overflow = containers.filter(el =>
          el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
        ).map(el => el.textContent.trim());
        const escaped = [];
        for (const el of containers) {
          const parent = rect(el);
          for (const child of el.children) {
            const r = rect(child);
            if (r.left < parent.left - 1 || r.right > parent.right + 1 ||
                r.top < parent.top - 1 || r.bottom > parent.bottom + 1) {
              escaped.push(child.textContent.trim());
            }
          }
        }
        const panels = [...document.querySelectorAll('.panel')];
        return {
          width: document.body.scrollWidth,
          height: document.body.scrollHeight,
          apps: panels.map(p => [...p.querySelectorAll('.app strong')].map(x => x.textContent)),
          results: panels.map(p => p.querySelector('.result').textContent.trim()),
          responsibilities: [...document.querySelectorAll('[data-responsibility]')]
            .map(el => el.dataset.responsibility),
          appViewPaths: [...document.querySelectorAll('[data-appview-path]')]
            .map(el => el.dataset.appviewPath),
          storageModel: document.querySelector('[data-storage-model]')?.dataset.storageModel,
          ownership: document.body.classList.contains('atproto-detail') ? {
            appColors: [...document.querySelectorAll('.app strong')]
              .map(el => getComputedStyle(el).color),
            backendColors: [...document.querySelectorAll('.step h3')]
              .map(el => getComputedStyle(el).color),
            queryColors: [...document.querySelectorAll('.app-design h3, .query code')]
              .map(el => getComputedStyle(el).color),
            expectedApp: resolvedColor('var(--developer-app-color)'),
            expectedBackend: resolvedColor('var(--developer-backend-color)'),
            expectedQuery: resolvedColor('var(--developer-query-color)'),
            providedColor: getComputedStyle(document.querySelector('.node')).borderTopColor,
            legend: !!document.querySelector('.ownership-legend'),
          } : null,
          overflow, escaped,
        };
      });
      assert.equal(layout.width, 1440, `${name}: canvas width`);
      assert.equal(layout.height, height, `${name}: canvas height`);
      assert.equal(layout.apps.length, 2, `${name}: two comparison panels`);
      assert.equal(layout.apps[0].length, 3, `${name}: three apps per side`);
      assert.deepEqual(layout.apps[0], layout.apps[1], `${name}: matched applications`);
      assert.equal(layout.results[0], layout.results[1], `${name}: matched outcome`);
      assert.deepEqual(layout.overflow, [], `${name}: text overflow`);
      assert.deepEqual(layout.escaped, [], `${name}: text escaping cards`);
      if (name === 'fig-atproto') {
        assert.deepEqual(layout.appViewPaths, ['reuse', 'build'],
          `${name}: reuse versus custom-design choice must be explicit`);
        assert.equal(layout.storageModel, 'shared-documents',
          `${name}: web10 content storage must be explicit`);
        assert.ok(layout.ownership.legend, `${name}: ownership legend`);
        assert.ok(layout.ownership.appColors.every(color => color === layout.ownership.expectedApp),
          `${name}: apps must use their warning-family ownership color`);
        assert.ok(layout.ownership.backendColors.every(color => color === layout.ownership.expectedBackend),
          `${name}: custom backend must use its warning-family ownership color`);
        assert.ok(layout.ownership.queryColors.every(color => color === layout.ownership.expectedQuery),
          `${name}: app JSON/query design must use its warning-family ownership color`);
        assert.equal(layout.ownership.providedColor, 'rgb(34, 197, 94)',
          `${name}: supplied node frame must remain green`);
        assert.deepEqual(layout.responsibilities, ['ingestion', 'database', 'serving'],
          `${name}: AppView responsibilities must remain explicit`);
      }
      console.log(`[comparison-check] ${name}: matched apps/outcomes, 1440x${height}, no card overflow`);
    } finally {
      await page.close();
    }
  }
} finally {
  await browser.close();
}
