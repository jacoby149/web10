import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoisted mocks (must run before any import that uses fetch) ─────────────
const mocks = vi.hoisted(() => ({
  mockFetch: vi.fn(),
}))

vi.stubGlobal('fetch', mocks.mockFetch)

import { decodeJwt, readTokenCookie, setTokenCookie, scrubTokenCookie, isTokenExpired } from './token'
import { createClient, type Web10Client } from './client'
import { Web10Error } from './http'

const { mockFetch } = mocks

// ── Helpers ────────────────────────────────────────────────────────────────

function makeJwt(payload: Record<string, unknown>): string {
  const h = btoa(JSON.stringify(payload))
  return `header.${h}.sig`
}

function setCookie(name: string, value: unknown): void {
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};path=/;`
}

function clearCookies(): void {
  document.cookie.split(';').forEach((c) => {
    document.cookie = c
      .replace(/^ +/, '')
      .replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/;')
  })
}

function setupLocation(): void {
  Object.defineProperty(window, 'location', {
    value: { href: 'http://localhost:3000/', protocol: 'http:', hostname: 'localhost' },
    writable: true,
    configurable: true,
  })
}

beforeEach(() => {
  mockFetch.mockReset()
  clearCookies()
  setupLocation()
})

// ── Token utilities (no fetch needed) ──────────────────────────────────────

describe('token utilities', () => {
  describe('decodeJwt', () => {
    it('decodes a valid JWT payload', () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      expect(decodeJwt(makeJwt(payload))).toEqual(payload)
    })

    it('returns null for null token', () => {
      expect(decodeJwt(null)).toBeNull()
    })

    it('returns null for malformed token', () => {
      expect(decodeJwt('not-a-jwt')).toBeNull()
    })

    it('returns null for token with missing parts', () => {
      expect(decodeJwt('only-one-part')).toBeNull()
    })
  })

  describe('readTokenCookie', () => {
    it('reads token from cookie', () => {
      const jwt = makeJwt({ username: 'alice' })
      setCookie('token', jwt)
      expect(readTokenCookie()).toBe(jwt)
    })

    it('returns null when no token cookie', () => {
      expect(readTokenCookie()).toBeNull()
    })
  })

  describe('setTokenCookie / scrubTokenCookie', () => {
    it('setTokenCookie writes to document.cookie', () => {
      setTokenCookie('test-token')
      expect(document.cookie).toContain('token=test-token')
    })

    it('scrubTokenCookie sets max-age=-1', () => {
      setTokenCookie('test-token')
      expect(() => scrubTokenCookie()).not.toThrow()
    })
  })

  describe('isTokenExpired', () => {
    it('is true for a token whose ISO `expires` is in the past', () => {
      const jwt = makeJwt({ username: 'alice', expires: '2000-01-01T00:00:00' })
      expect(isTokenExpired(jwt)).toBe(true)
    })

    it('is false for a token whose ISO `expires` is in the future', () => {
      const jwt = makeJwt({ username: 'alice', expires: '2999-01-01T00:00:00' })
      expect(isTokenExpired(jwt)).toBe(false)
    })

    it('is false when there is no expiry or no token', () => {
      expect(isTokenExpired(makeJwt({ username: 'alice' }))).toBe(false)
      expect(isTokenExpired(null)).toBe(false)
    })
  })
})

// ── Client creation ────────────────────────────────────────────────────────

describe('createClient', () => {

  it('returns a client with expected methods', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(w).toHaveProperty('setToken')
    expect(w).toHaveProperty('scrubToken')
    expect(w).toHaveProperty('readToken')
    expect(w).toHaveProperty('isSignedIn')
    expect(w).toHaveProperty('signOut')
    expect(w).toHaveProperty('read')
    expect(w).toHaveProperty('create')
    expect(w).toHaveProperty('update')
    expect(w).toHaveProperty('deleteRecord')
    expect(w).toHaveProperty('aggregate')
    expect(w).toHaveProperty('login')
    expect(w).toHaveProperty('authListen')
    expect(w).toHaveProperty('getTieredToken')
    expect(w).toHaveProperty('checkout')
    expect(w).toHaveProperty('verifySubscription')
    expect(w).toHaveProperty('cancelSubscription')
  })

  it('sets apiOrigin from authUrl protocol', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(w.state.apiOrigin).toBe('https://api.web10.app')
  })

  it('allows custom apiOrigin', () => {
    const w = createClient({
      authUrl: 'https://auth.example.com',
      apiOrigin: 'https://api.custom.com',
    })
    expect(w.state.apiOrigin).toBe('https://api.custom.com')
  })

  it('reads token from cookie on init', () => {
    const jwt = makeJwt({ username: 'alice' })
    setCookie('token', jwt)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(w.state.token).toBe(jwt)
  })

  it('has null token when no cookie', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(w.state.token).toBeNull()
  })
})

describe('client token management', () => {
  let w: Web10Client
  beforeEach(() => {
    mockFetch.mockReset()
    clearCookies()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
    w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
  })

  it('setToken stores token in memory', () => {
    w.setToken('new-jwt')
    expect(w.state.token).toBe('new-jwt')
  })

  it('scrubToken clears token', () => {
    w.setToken('old-jwt')
    w.scrubToken()
    expect(w.state.token).toBeNull()
  })

  it('readToken returns decoded payload', () => {
    const payload = { username: 'bob', provider: 'api.example.com', site: 'app.com' }
    w.setToken(makeJwt(payload))
    expect(w.readToken()).toEqual(payload)
  })

  it('readToken returns null when no token', () => {
    w.scrubToken()
    expect(w.readToken()).toBeNull()
  })

  it('isSignedIn returns true when token set', () => {
    w.setToken('jwt')
    expect(w.isSignedIn()).toBe(true)
  })

  it('isSignedIn returns false when no token', () => {
    w.scrubToken()
    expect(w.isSignedIn()).toBe(false)
  })

  it('signOut clears token', () => {
    w.setToken('jwt')
    w.signOut()
    expect(w.isSignedIn()).toBe(false)
  })
})

describe('CRUD guard clauses', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCookies()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('read throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.read('posts')).toThrow()
  })

  it('create throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.create('posts')).toThrow()
  })

  it('update throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.update('posts', {}, {})).toThrow()
  })

  it('deleteRecord throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.deleteRecord('posts')).toThrow()
  })

  it('aggregate throws without auth', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    expect(() => w.aggregate('posts')).toThrow()
  })
})

describe('CRUD HTTP calls', () => {
  const payload = { username: 'alice', provider: 'api.example.com' }
  const jwt = makeJwt(payload)

  beforeEach(() => {
    mockFetch.mockReset()
    setCookie('token', jwt)
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('read calls fetch with PATCH', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ service: 'posts', body: { text: 'hi' } }],
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    const result = await w.read('posts', { $sort: { created_at: -1 } })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/posts',
      expect.objectContaining({
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    expect(result).toHaveLength(1)
  })

  it('routes to the given provider node when addressing another user', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ service: 'posts', body: { text: 'hi' } }],
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    // Read bob@api.othernode.com — the request must hit othernode, not the
    // caller's own apiOrigin.
    await w.read('posts', null, 'bob', 'api.othernode.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.othernode.com/bob/posts',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('create calls fetch with POST', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ _id: 'abc123' }),
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    const result = await w.create('posts', { text: 'hello' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/posts',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual({ _id: 'abc123' })
  })

  it('update calls fetch with PUT', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ matchedCount: 1, modifiedCount: 1 }),
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.update('posts', { _id: '1' }, { $set: { text: 'new' } })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/posts',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('deleteRecord calls fetch with DELETE', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ deletedCount: 1 }),
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.deleteRecord('posts', { _id: '1' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/posts',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('aggregate calls fetch with POST on /aggregate route', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ _id: 'tag1', count: 5 }],
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    const pipeline = [
      { $group: { _id: '$tag', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]
    const result = await w.aggregate('posts', pipeline)
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/alice/posts/aggregate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual([{ _id: 'tag1', count: 5 }])
  })

  it('aggregate defaults to empty pipeline', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.aggregate('posts')
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body.pipeline).toEqual([])
  })

  it('read throws Web10Error on non-OK response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: 'Forbidden',
      text: async () => '{"detail":"forbidden"}',
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await expect(w.read('posts')).rejects.toThrow(Web10Error)
  })
})

describe('getTieredToken', () => {
  const payload = { username: 'alice', provider: 'api.example.com' }
  const jwt = makeJwt(payload)

  it('calls fetch to /web10token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: 'tiered-jwt' }),
    })
    setCookie('token', jwt)
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    const result = await w.getTieredToken('myapp.com', 'api.example.com')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.web10.app/web10token',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result).toEqual({ token: 'tiered-jwt' })
  })
})

describe('dev pay', () => {
  const payload = { username: 'alice', provider: 'api.example.com' }
  const jwt = makeJwt(payload)

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('checkout calls POST /dev_pay', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ url: 'https://checkout.stripe.com/test' }),
    })
    setCookie('token', jwt)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.checkout({
      seller: 'seller1',
      title: 'Pro',
      price: 100,
      success_url: 'https://ok',
      cancel_url: 'https://no',
    })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({
      token: jwt,
      seller: 'seller1',
      title: 'Pro',
      price: 100,
      success_url: 'https://ok',
      cancel_url: 'https://no',
    })
  })

  it('verifySubscription calls POST /dev_pay', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ active: true }),
    })
    setCookie('token', jwt)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.verifySubscription({ seller: 'seller1', title: 'Pro' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({
      token: jwt,
      seller: 'seller1',
      title: 'Pro',
      price: null,
    })
  })

  it('cancelSubscription calls POST /dev_pay', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ cancelled: true }),
    })
    setCookie('token', jwt)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.setToken(jwt)
    await w.cancelSubscription({ seller: 'seller1', title: 'Pro' })
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
    expect(body).toEqual({
      token: jwt,
      seller: 'seller1',
      title: 'Pro',
    })
  })
})

describe('auth flow', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCookies()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('authListen calls callback on auth message', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.authListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'auth', token: 'received-jwt' } }),
    )
    expect(cb).toHaveBeenCalledWith(true)
  })

  it('authListen ignores non-auth messages', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.authListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'other', data: 'x' } }),
    )
    expect(cb).not.toHaveBeenCalled()
  })

  it('authListen ignores auth messages from a foreign origin', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.authListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://evil.example.com', data: { type: 'auth', token: 'attacker-jwt' } }),
    )
    expect(cb).not.toHaveBeenCalled()
    expect(w.state.token).toBeNull()
  })

  it('openAuthPortal opens auth URL', () => {
    vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    w.openAuthPortal()
    expect(window.open).toHaveBeenCalledWith('https://auth.example.com', '_blank')
  })

  it('login resolves on auth message', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const loginPromise = w.login()
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'auth', token: 'new-jwt' } }),
    )
    await loginPromise
    expect(w.state.token).toBe('new-jwt')
  })

  it('login ignores auth messages from a foreign origin', async () => {
    vi.spyOn(window, 'open').mockReturnValue({} as unknown as Window)
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const loginPromise = w.login()
    // A malicious opener tries to fixate a token — must be ignored.
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://evil.example.com', data: { type: 'auth', token: 'attacker-jwt' } }),
    )
    // The real authenticator then completes the flow.
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'auth', token: 'real-jwt' } }),
    )
    await loginPromise
    expect(w.state.token).toBe('real-jwt')
  })
})

describe('Contract helpers', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCookies()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('contractResponseListen calls callback on status message', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.contractResponseListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'status', status: 'approved' } }),
    )
    expect(cb).toHaveBeenCalledWith('approved')
  })

  it('contractResponseListen ignores status messages from a foreign origin', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.contractResponseListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://evil.example.com', data: { type: 'status', status: 'approved' } }),
    )
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('ACR helpers', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    clearCookies()
    Object.defineProperty(window, 'location', {
      value: { href: 'http://localhost:3000/' },
      writable: true,
      configurable: true,
    })
  })

  it('acrResponseListen calls callback on acr-status message', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.acrResponseListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://auth.example.com', data: { type: 'acr-status', status: 'approved' } }),
    )
    expect(cb).toHaveBeenCalledWith('approved')
  })

  it('acrResponseListen ignores acr-status messages from a foreign origin', () => {
    const w = createClient({ authUrl: 'https://auth.example.com', appStores: [] })
    const cb = vi.fn()
    w.acrResponseListen(cb)
    window.dispatchEvent(
      new MessageEvent('message', { origin: 'https://evil.example.com', data: { type: 'acr-status', status: 'approved' } }),
    )
    expect(cb).not.toHaveBeenCalled()
  })
})
