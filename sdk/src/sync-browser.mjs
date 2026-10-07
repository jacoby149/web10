import { copyFile, stat } from 'node:fs/promises'

// Kept under src so existing SDK-only Docker COPY steps include this build tool.
const source = new URL('../dist/browser.js', import.meta.url)
const targets = [new URL('../dist/wapi.js', import.meta.url)]
const args = process.argv.slice(2)
if (args.some((arg) => arg !== '--workspace')) {
  throw new Error('Usage: sync-browser.mjs [--workspace]')
}
if (args.includes('--workspace')) {
  // Workspace mode requires both deployed copies; never silently skip one.
  targets.push(
    new URL('../../marketing/web10-social/public/wapi.js', import.meta.url),
    new URL('../../marketing/marketing-ui/public/docs/wapi.js', import.meta.url),
  )
}

if (!(await stat(source)).isFile()) throw new Error(`Missing browser bundle: ${source.pathname}`)
for (const target of targets) {
  if (!(await stat(new URL('.', target))).isDirectory()) {
    throw new Error(`Missing artifact directory: ${target.pathname}`)
  }
}
for (const target of targets) {
  await copyFile(source, target)
  console.log(`[wapi] synced browser bundle: ${target.pathname}`)
}
