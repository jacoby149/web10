import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import web10 from './browser'
import { createV3Client } from './v3'
import * as http from './http'

const origin = 'https://auth.example.com'
const appPayload = { provider: 'api.web10.app', expires: '2998-01-01T00:00:00Z' }
const jwt = (username = 'alice', kind = 'app') => `header.${btoa(JSON.stringify({ ...appPayload, username, credential_kind: kind, app_origin: window.location.origin }))}.sig`
const contract = { kind: 'app' as const, app_origin: window.location.origin, permissions: { posts: ['readAll'], node: ['moderate'] } }
let popup: Window
let stop: (() => void) | undefined
function message(type: string, source: Window = popup, sender = origin, token?: string) {
  window.dispatchEvent(new MessageEvent('message', { source, origin: sender, data: { type, token, status: 'approved' } }))
}

beforeEach(() => {
  vi.useFakeTimers()
  web10.scrubTokenCookie()
  popup = { closed: false, postMessage: vi.fn() } as unknown as Window
  vi.spyOn(window, 'open').mockReturnValue(popup)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')))
})
afterEach(() => {
  stop?.()
  stop = undefined
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  web10.scrubTokenCookie()
})

describe('popup trust boundary', () => {
  it.each([
    { expires: '2000-01-01T00:00:00Z' },
    { expires: 'not-a-date' },
    { expires: undefined },
    { expires: 9999999999999 },
    { provider: 'evil.example' },
    { provider: undefined },
    { username: '' },
    { username: '   ' },
    { username: undefined },
  ])('rejects unusable incoming session %j without a cookie write', (claims) => {
    web10.openAuthPortal(origin)
    const signedIn = vi.fn()
    stop = web10.authListen(signedIn)
    const write = vi.spyOn(document, 'cookie', 'set')
    const incoming = `header.${btoa(JSON.stringify({ ...appPayload, username: 'alice', credential_kind: 'app', app_origin: window.location.origin, ...claims }))}.sig`
    message('auth', popup, origin, incoming)
    expect(write).not.toHaveBeenCalled()
    expect(signedIn).not.toHaveBeenCalled()
  })

  it('binds the expected provider to a configured API endpoint hostname', () => {
    web10.openAuthPortal(origin)
    const signedIn = vi.fn()
    stop = web10.authListen(signedIn, { apiOrigin: 'https://api.example.com:8443' })
    message('auth', popup, origin, jwt())
    expect(signedIn).not.toHaveBeenCalled()
    const incoming = `header.${btoa(JSON.stringify({ ...appPayload, provider: 'api.example.com', username: 'alice', credential_kind: 'app', app_origin: window.location.origin }))}.sig`
    message('auth', popup, origin, incoming)
    expect(web10.readTokenCookie()).toBe(incoming)
    expect(signedIn).toHaveBeenCalledTimes(1)
  })

  it('rejects spoofed origin, wrong source and self credentials without cookie writes', () => {
    web10.openAuthPortal(origin)
    const signedIn = vi.fn()
    stop = web10.authListen(signedIn)
    const write = vi.spyOn(document, 'cookie', 'set')
    message('auth', popup, 'https://evil.example', jwt())
    message('auth', window, origin, jwt())
    message('auth', popup, origin, jwt('alice', 'self'))
    const wrongApp = `header.${btoa(JSON.stringify({ username: 'alice', credential_kind: 'app', app_origin: 'https://other.example' }))}.sig`
    message('auth', popup, origin, wrongApp)
    expect(write).not.toHaveBeenCalled()
    expect(signedIn).not.toHaveBeenCalled()
    message('auth', popup, origin, jwt())
    expect(write).toHaveBeenCalledTimes(1)
    expect(signedIn).toHaveBeenCalledWith(true)
    message('auth', popup, origin, jwt('bob'))
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('accepts different trusted popup sessions, dedupes identical tokens and targets close exactly', () => {
    web10.openAuthPortal(origin)
    const first = popup
    const signedIn = vi.fn()
    stop = web10.authListen(signedIn)
    popup = { closed: false, postMessage: vi.fn() } as unknown as Window
    vi.mocked(window.open).mockReturnValue(popup)
    web10.openAuthPortal(origin)
    message('auth', first, origin, jwt())
    message('auth', popup, origin, jwt())
    expect(signedIn).toHaveBeenCalledTimes(1)
    web10.closeAuthPopup()
    expect(popup.postMessage).toHaveBeenCalledWith({ type: 'close_popup' }, origin)
  })

  it('notifies state-first consumers when a same-user expired token is refreshed', () => {
    const expired = `header.${btoa(JSON.stringify({ username: 'alice', credential_kind: 'app', app_origin: window.location.origin, expires: '2000-01-01T00:00:00' }))}.sig`
    web10.setTokenCookie(expired)
    web10.openAuthPortal(origin)
    let stateToken = expired
    const signedIn = vi.fn(() => { stateToken = web10.readTokenCookie()! })
    stop = web10.authListen(signedIn)
    message('auth', popup, origin, jwt())
    expect(stateToken).toBe(jwt())
    expect(signedIn).toHaveBeenCalledTimes(1)
    const refreshed = `header.${btoa(JSON.stringify({ ...appPayload, username: 'alice', credential_kind: 'app', app_origin: window.location.origin, expires: '2999-01-01T00:00:00' }))}.sig`
    message('auth', popup, origin, refreshed)
    expect(stateToken).toBe(refreshed)
    expect(signedIn).toHaveBeenCalledTimes(2)
    message('auth', popup, origin, refreshed)
    expect(signedIn).toHaveBeenCalledTimes(2)
  })

  it('migrates a same-user legacy cookie but rejects a different-user handoff', () => {
    const legacy = `header.${btoa(JSON.stringify({ username: 'alice' }))}.sig`
    web10.setTokenCookie(legacy)
    web10.openAuthPortal(origin)
    const signedIn = vi.fn()
    stop = web10.authListen(signedIn)
    message('auth', popup, origin, jwt('bob'))
    expect(web10.readTokenCookie()).toBe(legacy)
    expect(signedIn).not.toHaveBeenCalled()
    message('auth', popup, origin, jwt())
    expect(web10.readTokenCookie()).toBe(jwt())
    expect(signedIn).toHaveBeenCalledTimes(1)
  })

  it.each(['browser', 'esm'])('binds ready and response messages in %s transport', (transport) => {
    const client = transport === 'browser' ? web10.createV3Client() : createV3Client()
    if (transport === 'browser') web10.openAuthPortal(origin)
    const callback = vi.fn()
    client.contractRequest([contract], origin, callback)
    message('auth_ready', popup, 'https://evil.example')
    message('auth_ready', window)
    expect(popup.postMessage).not.toHaveBeenCalled()
    message('auth_ready')
    expect(popup.postMessage).toHaveBeenCalledWith({ type: 'contract', contracts: [contract] }, origin)
    message('contract_response', window)
    message('contract_response', popup, 'https://evil.example')
    expect(callback).not.toHaveBeenCalled()
    message('contract_response')
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }))
  })
})

describe('grant health and delegation', () => {
  it.each(['browser', 'esm'].flatMap((transport) => [
    [transport, 'imports', 'create'], [transport, 'imports', 'read'], [transport, 'user', 'blockUsers'],
  ]))('%s requires explicit %s/%s consent despite data wildcard grants', async (transport, service, operation) => {
    const client = transport === 'browser' ? web10.createV3Client({ token: jwt() }) : createV3Client({ token: jwt() })
    web10.setTokenCookie(jwt())
    popup.closed = true
    web10.openAuthPortal(origin)
    vi.mocked(window.open).mockClear()
    vi.spyOn(client, 'listAppContracts').mockResolvedValue([{ allowed_origin: contract.app_origin, permissions: { '*': ['create', 'read', 'blockUsers'] } }])
    popup = { closed: false, postMessage: vi.fn() } as unknown as Window
    vi.mocked(window.open).mockReturnValue(popup)
    const request = { ...contract, permissions: { [service]: [operation] } }
    const callback = vi.fn()
    client.contractRequest([request], origin, callback)
    await vi.waitFor(() => expect(window.open).toHaveBeenCalledTimes(1))
    expect(callback).not.toHaveBeenCalled()
    message('auth_ready')
    message('contract_response')
    vi.mocked(client.listAppContracts).mockResolvedValue([{ allowed_origin: contract.app_origin, permissions: request.permissions }])
    popup.closed = true
    vi.mocked(window.open).mockClear()
    callback.mockClear()
    client.contractRequest([request], origin, callback)
    await vi.waitFor(() => expect(callback).toHaveBeenCalledWith({ status: 'approved' }))
    expect(window.open).not.toHaveBeenCalled()
  })
  it.each(['browser', 'esm'])('skips active grants but requests upgrades in %s transport', async (transport) => {
    const client = transport === 'browser' ? web10.createV3Client({ token: jwt() }) : createV3Client({ token: jwt() })
    web10.setTokenCookie(jwt())
    // Leave no reusable popup from earlier browser tests.
    popup.closed = true
    web10.openAuthPortal(origin)
    vi.mocked(window.open).mockClear()
    vi.spyOn(client, 'listAppContracts').mockResolvedValue([{ allowed_origin: contract.app_origin, permissions: contract.permissions }])
    const approved = vi.fn()
    client.contractRequest([contract], origin, approved)
    await vi.waitFor(() => expect(approved).toHaveBeenCalledWith({ status: 'approved' }))
    expect(window.open).not.toHaveBeenCalled()
    vi.mocked(client.listAppContracts).mockResolvedValue([{ allowed_origin: contract.app_origin, permissions: { '*': ['readAll', 'moderate'] } }])
    popup = { closed: false, postMessage: vi.fn() } as unknown as Window
    vi.mocked(window.open).mockReturnValue(popup)
    client.contractRequest([contract], origin)
    await vi.waitFor(() => expect(window.open).toHaveBeenCalledTimes(1))
  })

  it('posts the exact delegation body and leaves the self token untouched', async () => {
    const self = jwt('alice', 'self')
    const client = createV3Client({ token: self })
    const post = vi.spyOn(http, 'authPost').mockResolvedValue({ token: jwt() })
    const write = vi.spyOn(document, 'cookie', 'set')
    expect(await client.delegateApp(contract.app_origin)).toEqual({ token: jwt() })
    expect(post).toHaveBeenCalledWith('https://api.web10.app/v3/delegate', { token: self, app_origin: contract.app_origin })
    expect(write).not.toHaveBeenCalled()
    expect(client.state.token).toBe(self)
  })

  it('surfaces delegation failure without writing a fallback credential', async () => {
    const client = createV3Client({ token: jwt('alice', 'self') })
    vi.spyOn(http, 'authPost').mockRejectedValue(new Error('delegation denied'))
    const write = vi.spyOn(document, 'cookie', 'set')
    await expect(client.delegateApp(contract.app_origin)).rejects.toThrow('delegation denied')
    expect(write).not.toHaveBeenCalled()
  })
})
