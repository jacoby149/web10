// Renders each demo's icon.svg to the icon-192.png / icon-512.png its
// manifest declares (PWA install wants raster 192+512; the store shows
// the SVG). Run after editing an icon.svg:
//
//   bun run render:icons
//
// Uses the playwright chromium (bun run test:demos:setup installs it).

import { chromium } from 'playwright'
import { readdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const docsDir = path.resolve(here, '../public/docs')

const demos = readdirSync(docsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(path.join(docsDir, d.name, 'icon.svg')))
  .map((d) => d.name)

if (demos.length === 0) {
  console.error('no icon.svg found under public/docs/')
  process.exit(1)
}

const browser = await chromium.launch()
const page = await browser.newPage()

for (const demo of demos) {
  const svg = path.join(docsDir, demo, 'icon.svg')
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size })
    await page.goto(`file://${svg}`)
    await page.waitForTimeout(100)
    await page.screenshot({
      path: path.join(docsDir, demo, `icon-${size}.png`),
      omitBackground: true,
    })
    console.log(`${demo}/icon-${size}.png`)
  }
}

await browser.close()
console.log(`rendered ${demos.length} demo icons`)
