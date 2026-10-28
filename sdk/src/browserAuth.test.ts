// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const sdk = fileURLToPath(new URL('../', import.meta.url))
const runtimes = ['source', 'dist/browser.js', 'dist/wapi.js',
  '../marketing/web10-social/public/wapi.js', '../marketing/marketing-ui/public/docs/wapi.js']
const authOrigin = 'https://auth.invalid'
let canonical: string
beforeAll(() => {
  canonical = execFileSync('bun', ['build', 'src/browser.ts', '--target', 'browser', '--format', 'iife'],
    { cwd: sdk, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
})
const jwt = (name = 'alice', version = 1) => `e30.${Buffer.from(JSON.stringify({ username: name, provider: 'node.invalid', version })).toString('base64url')}.synthetic`

function realm(runtime: string) {
  let cookie = '', blocked = false, throwing = false
  const listeners = new Set<(event: object) => void>()
  const timers = new Map<number, () => void>()
  const opened: Array<{ closed: boolean; postMessage: ReturnType<typeof vi.fn> }> = []
  const host = {
    location: { href: 'https://app.invalid/view', protocol: 'https:' },
    opener: null as { postMessage: ReturnType<typeof vi.fn> } | null,
    open: vi.fn(() => {
      if (throwing) { throwing = false; throw new Error('synthetic open failure') }
      if (blocked) { blocked = false; return null }
      const popup = { closed: false, postMessage: vi.fn() }
      opened.push(popup)
      return popup
    }),
    addEventListener: (_: string, handler: (event: object) => void) => listeners.add(handler),
    removeEventListener: (_: string, handler: (event: object) => void) => listeners.delete(handler),
    web10: undefined as unknown as typeof import('./browser').default,
  }
  const fetch = vi.fn(async () => ({ ok: true, json: async (): Promise<unknown> => [] }))
  runInNewContext(runtime === 'source' ? canonical : readFileSync(new URL(runtime, `file://${sdk}`), 'utf8'), {
    window: host, location: host.location, URL, atob,
    document: { get cookie() { return cookie }, set cookie(value: string) { cookie = value.split(';')[0] } },
    console: { log() {}, warn() {}, error() {} }, fetch,
    setTimeout: (fn: () => void) => { const id = timers.size + 1; timers.set(id, fn); return id },
    clearTimeout: (id: number) => timers.delete(id),
  })
  return {
    api: host.web10, opened, timers, fetch, host,
    emit: (data: object, origin = authOrigin, source: object | null = opened.at(-1) ?? null) => {
      for (const handler of [...listeners]) handler({ data, origin, source })
    },
    blockNext: () => { blocked = true },
    throwNext: () => { throwing = true },
  }
}

it.each(runtimes)('%s denies unbound auth and preserves owned lifecycle', (runtime) => {
  const r = realm(runtime), signed = vi.fn()
  const off = r.api.authListen(signed)
  r.emit({ type: 'auth', token: jwt() }, 'https://attacker.invalid', {})
  expect(r.api.readTokenCookie()).toBeNull()
  expect(signed).not.toHaveBeenCalled()
  r.api.openAuthPortal(`${authOrigin}/signin`)
  const popup = r.opened.at(-1)!
  for (const [origin, source] of [[authOrigin, {}], ['https://attacker.invalid', popup], ['', popup], ['null', popup], [authOrigin, null]] as const) {
    r.emit({ type: 'auth', token: jwt() }, origin, source)
    expect(r.api.readTokenCookie()).toBeNull()
  }
  popup.closed = true // queued postMessage may arrive after the sender closes
  r.emit({ type: 'auth', token: jwt() }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBe(jwt())
  expect(signed).toHaveBeenCalledTimes(1)
  r.emit({ type: 'auth', token: jwt('alice', 2) }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 2))
  expect(signed).toHaveBeenCalledTimes(1)
  r.emit({ type: 'auth', token: jwt('bob') }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 2))
  r.api.openAuthPortal(authOrigin)
  r.emit({ type: 'auth', token: jwt('alice', 3) }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 2))
  r.emit({ type: 'auth', token: jwt('alice', 3) })
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 3))
  const login = r.opened.at(-1)!
  r.api.openAuthPortal(authOrigin, { handoff: 'none' })
  r.emit({ type: 'auth', token: jwt('alice', 4) })
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 3))
  r.emit({ type: 'auth', token: jwt('alice', 4) }, authOrigin, login)
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 4))
  r.throwNext()
  expect(() => r.api.openAuthPortal(authOrigin)).toThrow('synthetic open failure')
  r.emit({ type: 'auth', token: jwt('alice', 5) }, authOrigin, login)
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 4))
  r.blockNext()
  r.api.openAuthPortal(authOrigin)
  r.emit({ type: 'auth', token: jwt('alice', 5) })
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 4))
  off()
  r.api.openAuthPortal(authOrigin)
  r.emit({ type: 'auth', token: jwt('alice', 6) })
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 4))
})

it.each(runtimes)('%s tracks standalone contract popups without changing their handshake', (runtime) => {
  const r = realm(runtime), signed = vi.fn(), response = vi.fn()
  r.api.authListen(signed)
  const client = r.api.createV3Client({ apiOrigin: 'https://node.invalid' })
  const contracts = [{ kind: 'app' as const, app_origin: 'https://app.invalid', permissions: { notes: ['readAll'] } }]
  client.contractRequest(contracts, authOrigin, response)
  expect(r.opened).toHaveLength(1)
  const popup = r.opened[0]
  r.emit({ type: 'auth_ready' })
  expect(popup.postMessage).toHaveBeenCalledWith({ type: 'contract', contracts }, authOrigin)
  expect(r.timers.size).toBe(1) // original fallback timeout remains until response
  r.emit({ type: 'auth', token: jwt() })
  expect(r.api.readTokenCookie()).toBe(jwt())
  expect(signed).toHaveBeenCalledTimes(1)
  r.emit({ type: 'contract_response', status: 'approved' })
  expect(response).toHaveBeenCalledTimes(1)
  expect(r.timers.size).toBe(0)
  r.blockNext()
  client.scrubToken()
  client.contractRequest(contracts, authOrigin, response)
  expect(response).toHaveBeenCalledTimes(2)
  expect(response.mock.calls[1][0].status).toBe('error')
  r.emit({ type: 'auth', token: jwt('alice', 2) }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBeNull()
  r.throwNext()
  expect(() => client.contractRequest(contracts, authOrigin, response)).toThrow('synthetic open failure')
  r.emit({ type: 'auth', token: jwt('alice', 2) }, authOrigin, popup)
  expect(r.api.readTokenCookie()).toBeNull()
})

it.each(runtimes)('%s preserves existing-contract fast path and failed-lookup fallback', async (runtime) => {
  const r = realm(runtime), response = vi.fn()
  r.api.setTokenCookie(jwt())
  r.api.authListen(vi.fn())
  const client = r.api.createV3Client({ apiOrigin: 'https://node.invalid' })
  const contracts = [{ kind: 'app' as const, app_origin: 'https://app.invalid', permissions: { notes: ['readAll'] } }]
  r.fetch.mockResolvedValueOnce({ ok: true, json: async () => [{ allowed_origin: 'https://app.invalid' }] })
  client.contractRequest(contracts, authOrigin, response)
  await new Promise(setImmediate)
  expect(response).toHaveBeenCalledWith({ status: 'approved' })
  expect(r.opened).toHaveLength(0)
  r.fetch.mockRejectedValueOnce(new Error('synthetic lookup failure'))
  client.contractRequest(contracts, authOrigin, response)
  await new Promise(setImmediate)
  expect(r.opened).toHaveLength(1)
  r.emit({ type: 'auth', token: jwt('alice', 2) })
  expect(r.api.readTokenCookie()).toBe(jwt('alice', 2))
})

it.each(runtimes)('%s retains opener handoff only with configured trust', (runtime) => {
  const r = realm(runtime), signed = vi.fn(), opener = { postMessage: vi.fn() }
  r.host.opener = opener
  r.api.authListen(signed)
  const client = r.api.createV3Client({ apiOrigin: 'https://node.invalid' })
  const response = vi.fn()
  client.contractOnReady([], response)
  expect(opener.postMessage).toHaveBeenCalledWith({ type: 'contract', contracts: [] }, '*')
  r.emit({ type: 'contract_response', status: 'approved' }, authOrigin, opener)
  expect(response).toHaveBeenCalledTimes(1)
  r.emit({ type: 'auth', token: jwt() }, authOrigin, opener)
  expect(r.api.readTokenCookie()).toBeNull()
  client.contractOnReady([], undefined, `${authOrigin}/signin`)
  r.emit({ type: 'auth', token: jwt() }, 'https://attacker.invalid', opener)
  expect(r.api.readTokenCookie()).toBeNull()
  r.emit({ type: 'auth', token: jwt() }, authOrigin, {})
  expect(r.api.readTokenCookie()).toBeNull()
  r.emit({ type: 'auth', token: jwt() }, authOrigin, opener)
  expect(r.api.readTokenCookie()).toBe(jwt())
  expect(signed).toHaveBeenCalledTimes(1)
})
