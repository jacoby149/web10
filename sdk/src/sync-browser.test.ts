// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { spawnSync } from 'node:child_process'

let root: string
let script: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'web10-browser-sync-'))
  mkdirSync(join(root, 'sdk/src'), { recursive: true })
  mkdirSync(join(root, 'sdk/dist'))
  script = join(root, 'sdk/src/sync-browser.mjs')
  copyFileSync(fileURLToPath(new URL('./sync-browser.mjs', import.meta.url)), script)
  writeFileSync(join(root, 'sdk/dist/browser.js'), 'generated bundle')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

it('refreshes the SDK alias without marketing directories in SDK-only builds', () => {
  const result = spawnSync(process.execPath, [script], { cwd: tmpdir() })
  expect(result.status, result.stderr.toString()).toBe(0)
  expect(readFileSync(join(root, 'sdk/dist/wapi.js'), 'utf8')).toBe('generated bundle')
})

it('requires both workspace targets and then refreshes every runtime copy', () => {
  const social = join(root, 'marketing/web10-social/public')
  const marketing = join(root, 'marketing/marketing-ui/public/docs')
  mkdirSync(social, { recursive: true })
  writeFileSync(join(social, 'wapi.js'), 'stale')
  let result = spawnSync(process.execPath, [script, '--workspace'])
  expect(result.status).not.toBe(0)
  expect(result.stderr.toString()).toContain('marketing-ui')
  expect(readFileSync(join(social, 'wapi.js'), 'utf8')).toBe('stale')
  mkdirSync(marketing, { recursive: true })
  result = spawnSync(process.execPath, [script, '--workspace'], { cwd: tmpdir() })
  expect(result.status, result.stderr.toString()).toBe(0)
  for (const path of ['sdk/dist/wapi.js', 'marketing/web10-social/public/wapi.js', 'marketing/marketing-ui/public/docs/wapi.js']) {
    expect(readFileSync(join(root, path), 'utf8')).toBe('generated bundle')
  }
})

it('has byte-identical shipped workspace artifacts', () => {
  const source = readFileSync(new URL('../dist/browser.js', import.meta.url))
  for (const path of ['../dist/wapi.js', '../../marketing/web10-social/public/wapi.js', '../../marketing/marketing-ui/public/docs/wapi.js']) {
    expect(readFileSync(new URL(path, import.meta.url)).equals(source), path).toBe(true)
  }
})
