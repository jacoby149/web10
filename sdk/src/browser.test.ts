// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readTokenCookie, scrubTokenCookie } from './token'

const origin = 'https://auth.example.com'
const portal = `${origin}/consent`
const jwt = (username: unknown, extra = {}) =>
  `header.${btoa(JSON.stringify({ username, ...extra }))}.sig`

function popup() {
  return { closed: false, postMessage: vi.fn() } as unknown as Window
}

function message(data: unknown, source: Window | null, from = origin) {
  window.dispatchEvent(new MessageEvent('message', { data, source, origin: from }))
}

let web10: typeof import('./browser').default
let listeners: EventListenerOrEventListenerObject[]

beforeEach(async () => {
  vi.resetModules()
  vi.useFakeTimers()
  scrubTokenCookie()
  listeners = []
  const add = window.addEventListener.bind(window)
  vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'message') listeners.push(listener)
    add(type, listener, options)
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }))
  web10 = (await import('./browser')).default
})

afterEach(() => {
  for (const listener of listeners) window.removeEventListener('message', listener)
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  scrubTokenCookie()
})

describe('popup auth trust', () => {
  it('fails closed without a popup, after a blocked open, and after closure', () => {
    const signedIn = vi.fn()
    web10.authListen(signedIn)
    const win = popup()
    message({ type: 'auth', token: jwt('alice') }, win)
    vi.spyOn(window, 'open').mockReturnValueOnce(null).mockReturnValueOnce(win)
    web10.openAuthPortal(portal)
    message({ type: 'auth', token: jwt('alice') }, null)
    web10.openAuthPortal(portal)
    Object.assign(win, { closed: true })
    message({ type: 'auth', token: jwt('alice') }, win)
    expect(readTokenCookie()).toBeNull()
    expect(signedIn).not.toHaveBeenCalled()
  })

  it('rejects wrong origins, same-origin other windows, and null sources', () => {
    const win = popup()
    vi.spyOn(window, 'open').mockReturnValue(win)
    web10.openAuthPortal(portal)
    const signedIn = vi.fn()
    web10.authListen(signedIn)
    message({ type: 'auth', token: jwt('alice') }, win, 'https://evil.example.com')
    message({ type: 'auth', token: jwt('alice') }, popup())
    message({ type: 'auth', token: jwt('alice') }, null)
    expect(readTokenCookie()).toBeNull()
    expect(signedIn).not.toHaveBeenCalled()
  })

  it.each([null, {}, 42, '', 'invalid', jwt(null), jwt(42), jwt(''), jwt('   ')])(
    'rejects malformed token or username: %j', (token) => {
      const win = popup()
      vi.spyOn(window, 'open').mockReturnValue(win)
      web10.openAuthPortal(portal)
      const signedIn = vi.fn()
      web10.authListen(signedIn)
      message({ type: 'auth', token }, win)
      expect(readTokenCookie()).toBeNull()
      expect(signedIn).not.toHaveBeenCalled()
    },
  )

  it('accepts a trusted login, refreshes same-user tokens without duplicate callbacks, and rejects user switches', () => {
    const win = popup()
    vi.spyOn(window, 'open').mockReturnValue(win)
    const signedIn = vi.fn()
    const stop = web10.authListen(signedIn)
    web10.openAuthPortal(portal)
    message({ type: 'auth', token: jwt('alice') }, win)
    const refreshed = jwt('alice', { expires: '2999-01-01' })
    message({ type: 'auth', token: refreshed }, win)
    message({ type: 'auth', token: jwt('bob') }, win)
    expect(readTokenCookie()).toBe(refreshed)
    expect(signedIn).toHaveBeenCalledExactlyOnceWith(true)
    stop()
    scrubTokenCookie()
    message({ type: 'auth', token: jwt('alice') }, win)
    expect(readTokenCookie()).toBeNull()
  })

  it('revokes trust in a replaced popup and uses an exact close target', () => {
    const old = popup()
    const current = popup()
    vi.spyOn(window, 'open').mockReturnValueOnce(old).mockReturnValueOnce(current)
    web10.authListen(vi.fn())
    web10.openAuthPortal(portal)
    web10.openAuthPortal(portal)
    message({ type: 'auth', token: jwt('alice') }, old)
    expect(readTokenCookie()).toBeNull()
    web10.closeAuthPopup()
    expect(current.postMessage).toHaveBeenCalledWith({ type: 'close_popup' }, origin)
  })
})

describe.each(['browser', 'v3'] as const)('%s contract messaging', (path) => {
  it('requires both origin and source for readiness and responses, then completes once', async () => {
    const win = popup()
    vi.spyOn(window, 'open').mockReturnValue(win)
    const client = path === 'browser' ? web10.createV3Client() : (await import('./v3')).createV3Client()
    const callback = vi.fn()
    client.contractRequest([], portal, callback)
    message({ type: 'auth_ready' }, win, 'https://evil.example.com')
    message({ type: 'auth_ready' }, popup())
    message({ type: 'auth_ready' }, null)
    expect(win.postMessage).not.toHaveBeenCalled()
    message({ type: 'auth_ready' }, win)
    message({ type: 'auth_ready' }, win)
    expect(win.postMessage).toHaveBeenCalledExactlyOnceWith({ type: 'contract', contracts: [] }, origin)
    const response = { type: 'contract_response', status: 'approved' }
    message(response, win, 'https://evil.example.com')
    message(response, popup())
    message(response, null)
    expect(callback).not.toHaveBeenCalled()
    message(response, win)
    message(response, win)
    expect(callback).toHaveBeenCalledExactlyOnceWith(response)
  })

  it('reports blocked popups without trusting messages', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const client = path === 'browser' ? web10.createV3Client() : (await import('./v3')).createV3Client()
    const callback = vi.fn()
    client.contractRequest([], portal, callback)
    message({ type: 'contract_response', status: 'approved' }, null)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0].status).toBe('error')
  })
})

it('browser contractRequest alone registers the popup for one-argument authListen', () => {
  const win = popup()
  vi.spyOn(window, 'open').mockReturnValue(win)
  const signedIn = vi.fn()
  web10.authListen(signedIn)
  web10.createV3Client().contractRequest([], portal)
  message({ type: 'auth', token: jwt('alice') }, win)
  expect(readTokenCookie()).toBe(jwt('alice'))
  expect(signedIn).toHaveBeenCalledExactlyOnceWith(true)
})

it('ignores forged cached readiness and reuses only a popup for the requested origin', () => {
  const first = popup()
  const second = popup()
  vi.spyOn(window, 'open').mockReturnValueOnce(first).mockReturnValueOnce(second)
  web10.openAuthPortal(portal)
  message({ type: 'auth_ready' }, popup())
  const client = web10.createV3Client()
  client.contractRequest([], portal)
  expect(first.postMessage).not.toHaveBeenCalled()
  message({ type: 'auth_ready' }, first)
  client.contractRequest([], portal)
  expect(first.postMessage).toHaveBeenCalledTimes(2)
  client.contractRequest([], 'https://other.example.com/consent')
  expect(window.open).toHaveBeenCalledTimes(2)
  message({ type: 'auth_ready' }, first)
  expect(second.postMessage).not.toHaveBeenCalled()
  message({ type: 'auth_ready' }, second, 'https://other.example.com')
  expect(second.postMessage).toHaveBeenCalledWith({ type: 'contract', contracts: [] }, 'https://other.example.com')
})

it('legacy opener delivery fails closed without a browser referrer', () => {
  const opener = popup()
  vi.stubGlobal('opener', opener)
  const callback = vi.fn()
  web10.createV3Client().contractOnReady([], callback)
  expect(opener.postMessage).not.toHaveBeenCalled()
  expect(callback).toHaveBeenCalledWith({ status: 'error', errors: ['No trusted opener origin'] })
})

it('registration cannot replay its token through redirects or send ambient cookies', () => {
  web10.createV3Client({ token: jwt('alice') })
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/v3/apps/register'), expect.objectContaining({
    redirect: 'error', credentials: 'omit',
  }))
})

it('legacy opener delivery targets the referrer and authenticates replies', () => {
  const opener = popup()
  vi.stubGlobal('opener', opener)
  vi.spyOn(document, 'referrer', 'get').mockReturnValue(`${origin}/portal`)
  const callback = vi.fn()
  web10.createV3Client().contractOnReady([], callback)
  expect(opener.postMessage).toHaveBeenCalledWith({ type: 'contract', contracts: [] }, origin)
  const response = { type: 'contract_response', status: 'approved' }
  message(response, opener, 'https://evil.example.com')
  message(response, popup())
  expect(callback).not.toHaveBeenCalled()
  message(response, opener)
  expect(callback).toHaveBeenCalledExactlyOnceWith(response)
})
