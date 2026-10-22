// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import type { V3Client } from './v3'

const sdk = fileURLToPath(new URL('../', import.meta.url))
const copies = [
  'dist/browser.js', 'dist/wapi.js',
  '../marketing/web10-social/public/wapi.js',
  '../marketing/marketing-ui/public/docs/wapi.js',
]
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
let directory: string
let canonical: string

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'web10-browser-artifact-'))
  execFileSync('bun', ['build', 'src/browser.ts', '--outdir', directory, '--target', 'browser', '--format', 'iife'], {
    cwd: sdk, stdio: 'pipe',
  })
  canonical = readFileSync(join(directory, 'browser.js'), 'utf8')
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

describe('shipped browser SDK correspondence', () => {
  it.each(copies)('%s matches the real source build', (path) => {
    expect(hash(readFileSync(resolve(sdk, path), 'utf8'))).toBe(hash(canonical))
  })

  it('retains the current API and anonymous reads without live network calls', async () => {
    const host = {} as { web10: { createV3Client(options: object): Record<string, unknown> } }
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => ({
      ok: true, json: async () => ({ docs: [] }),
    }))
    runInNewContext(canonical, { window: host, fetch, console: { log() {}, warn() {}, error() {} } })
    const client = host.web10.createV3Client({ apiOrigin: 'https://node.invalid', token: 'SYNTHETIC' })
    for (const method of ['trackContentEvent', 'contentAnalytics', 'contentViews', 'reconcileGroupContract', 'healGroupOwner', 'getIceServers']) {
      expect(typeof client[method]).toBe('function')
    }
    expect(fetch).not.toHaveBeenCalled()
    const guest = host.web10.createV3Client({ apiOrigin: 'https://node.invalid' }) as unknown as V3Client
    await guest.read('posts', { groups: ['synthetic-public'] })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://node.invalid/v3/read')
    const body = JSON.parse(fetch.mock.calls[0][1].body as string)
    expect(body.groups).toEqual(['synthetic-public'])
    expect(Object.hasOwn(body, 'token')).toBe(false)
  })
})
