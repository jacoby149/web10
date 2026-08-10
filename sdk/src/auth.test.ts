import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClient, type Web10Client } from './client'
import { createAuthConnector } from './auth'

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

function createMockWapi(token: string | null): Web10Client {
  let currentToken = token
  let tokenPayload = token
    ? { username: 'alice', provider: 'api.example.com', site: 'auth.example.com' }
    : null
  return {
    state: {
      apiOrigin: 'https://api.example.com',
      authUrl: 'https://auth.example.com',
      get token() { return currentToken },
      rtcServer: 'rtc.example.com',
      appStores: [],
    },
    get token() { return currentToken },
    set token(v) { currentToken = v },
    isSignedIn: vi.fn(() => currentToken != null),
    readToken: vi.fn(() => tokenPayload),
    setToken: vi.fn((t: string) => {
      currentToken = t
      tokenPayload = { username: 'alice', provider: 'api.example.com', site: 'auth.example.com' }
    }),
    scrubToken: vi.fn(() => {
      currentToken = null
      tokenPayload = null
    }),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteRecord: vi.fn(),
    aggregate: vi.fn(),
    signOut: vi.fn(),
    openAuthPortal: vi.fn(),
    login: vi.fn(),
    authListen: vi.fn(),
    getTieredToken: vi.fn().mockResolvedValue({ token: 'tiered' }),
    contractOnReady: vi.fn(),
    contractResponseListen: vi.fn(),
    checkout: vi.fn(),
    verifySubscription: vi.fn(),
    cancelSubscription: vi.fn(),
  }
}

// Mock fetch
const mockFetch = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockReset()
  clearCookies()
})

// ── Tests ──────────────────────────────────────────────────────────────────

describe('createAuthConnector', () => {
  it('returns an object with expected methods', () => {
    const wapi = createMockWapi(null)
    const wa = createAuthConnector(wapi)
    expect(wa).toHaveProperty('logIn')
    expect(wa).toHaveProperty('signUp')
    expect(wa).toHaveProperty('changePassword')
    expect(wa).toHaveProperty('changePhone')
    expect(wa).toHaveProperty('sendCode')
    expect(wa).toHaveProperty('verifyCode')
    expect(wa).toHaveProperty('manageSpace')
    expect(wa).toHaveProperty('manageCredits')
    expect(wa).toHaveProperty('manageBusiness')
    expect(wa).toHaveProperty('manageSubscriptions')
    expect(wa).toHaveProperty('businessLogin')
    expect(wa).toHaveProperty('getPlan')
    expect(wa).toHaveProperty('contractListen')
    expect(wa).toHaveProperty('sendToken')
    expect(wa).toHaveProperty('mintOAuthToken')
  })

  describe('logIn', () => {
    it('calls fetch to /web10token with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'new-jwt' }),
      })
      const wapi = createMockWapi(null)
      Object.defineProperty(window, 'location', {
        value: { hostname: 'auth.example.com' },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(document, 'referrer', {
        value: 'https://app.example.com/page',
        writable: true,
        configurable: true,
      })
      const wa = createAuthConnector(wapi)
      await wa.logIn({ provider: 'api.example.com', username: 'alice', password: 'secret' })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({
        username: 'alice',
        password: 'secret',
        token: null,
        site: 'auth.example.com',
        target: null,
      })
    })

    it('calls wapi.setToken on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'new-jwt' }),
      })
      const wapi = createMockWapi(null)
      Object.defineProperty(window, 'location', {
        value: { hostname: 'auth.example.com' },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(document, 'referrer', {
        value: 'https://app.example.com/page',
        writable: true,
        configurable: true,
      })
      const wa = createAuthConnector(wapi)
      await wa.logIn({ provider: 'api.example.com', username: 'alice', password: 'secret' })
      expect(wapi.setToken).toHaveBeenCalledWith('new-jwt')
    })
  })

  describe('signUp', () => {
    it('calls fetch to /signup with correct payload', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })
      const wapi = createMockWapi(null)
      const wa = createAuthConnector(wapi)
      await wa.signUp({
        provider: 'api.example.com',
        username: 'bob',
        password: 'pass123',
        betacode: 'beta',
        phone: '+1234567890',
      })
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({
        username: 'bob',
        password: 'pass123',
        betacode: 'beta',
        phone: '+1234567890',
      })
    })
  })

  describe('changePassword', () => {
    it('calls fetch to /change_pass', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.changePassword('old', 'new')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({
        username: 'alice',
        password: 'old',
        new_pass: 'new',
      })
    })
  })

  describe('changePhone', () => {
    it('calls fetch to /change_phone', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.changePhone('oldpass', '+9876543210')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({
        username: 'alice',
        password: 'oldpass',
        phone: '+9876543210',
      })
    })
  })

  describe('sendCode / verifyCode', () => {
    it('sendCode calls fetch to /send_code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sent: true }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.sendCode()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({ token: jwt })
    })

    it('verifyCode calls fetch to /verify_code', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ verified: true }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.verifyCode('123456')
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({ token: jwt, query: { code: '123456' } })
    })
  })

  describe('Stripe management endpoints', () => {
    it('manageSpace calls fetch to /manage_space', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ url: 'stripe-url' }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.manageSpace()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({ token: jwt })
    })

    it('getPlan calls fetch to /get_plan', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ space: 100, credits: 50 }),
      })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      await wa.getPlan()
      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string)
      expect(body).toEqual({ token: jwt })
    })
  })

  describe('contractListen', () => {
    const OPENER = 'https://app.example.com'

    beforeEach(() => {
      Object.defineProperty(document, 'referrer', {
        value: `${OPENER}/page`,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'opener', {
        value: { postMessage: vi.fn() },
        writable: true,
        configurable: true,
      })
    })

    it('listens for contract messages from the opener and calls setState', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.contractListen(cb)
      // The connector must announce itself to the opener's exact origin.
      expect((window.opener as { postMessage: ReturnType<typeof vi.fn> }).postMessage)
        .toHaveBeenCalledWith({ type: 'ContractListen' }, OPENER)

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: OPENER,
          data: { type: 'contract', contracts: [] },
        }),
      )
      expect(cb).toHaveBeenCalledWith({ type: 'contract', contracts: [] })
    })

    it('ignores non-contract messages', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.contractListen(cb)
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: OPENER,
          data: { type: 'other', data: 'x' },
        }),
      )
      expect(cb).not.toHaveBeenCalled()
    })

    it('ignores contract messages from a foreign origin', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.contractListen(cb)
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example.com',
          data: { type: 'contract', contracts: [] },
        }),
      )
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('acrListen', () => {
    const OPENER = 'https://app.example.com'
    beforeEach(() => {
      Object.defineProperty(document, 'referrer', {
        value: `${OPENER}/page`,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'opener', {
        value: { postMessage: vi.fn() },
        writable: true,
        configurable: true,
      })
    })

    it('listens for ACR messages from the opener and calls setState', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.acrListen(cb)
      expect((window.opener as { postMessage: ReturnType<typeof vi.fn> }).postMessage)
        .toHaveBeenCalledWith({ type: 'ACRListen' }, OPENER)

      window.dispatchEvent(
        new MessageEvent('message', {
          origin: OPENER,
          data: { type: 'acr', acrs: [{ allowed_origin: 'app.example.com', permissions: { posts: ['readAll'] } }] },
        }),
      )
      expect(cb).toHaveBeenCalledWith({ type: 'acr', acrs: [{ allowed_origin: 'app.example.com', permissions: { posts: ['readAll'] } }] })
    })

    it('ignores non-acr messages', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.acrListen(cb)
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: OPENER,
          data: { type: 'other', data: 'x' },
        }),
      )
      expect(cb).not.toHaveBeenCalled()
    })

    it('ignores acr messages from a foreign origin', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      const cb = vi.fn()

      wa.acrListen(cb)
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example.com',
          data: { type: 'acr', acrs: [] },
        }),
      )
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('sendToken', () => {
    it('posts auth message to the opener origin and closes window', () => {
      const postMessage = vi.fn()
      const closeWindow = vi.fn()
      const OPENER = 'https://app.example.com'

      Object.defineProperty(document, 'referrer', {
        value: `${OPENER}/page`,
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'opener', {
        value: { postMessage },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'close', {
        value: closeWindow,
        writable: true,
        configurable: true,
      })

      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      wa.sendToken()

      // Posted to the opener's exact origin — never '*'.
      expect(postMessage).toHaveBeenCalledWith(
        { type: 'auth', token: null },
        OPENER,
      )
      expect(closeWindow).toHaveBeenCalled()
    })

    it('refuses to post when the opener origin is unknown', () => {
      const postMessage = vi.fn()
      const closeWindow = vi.fn()

      Object.defineProperty(document, 'referrer', {
        value: '',
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'opener', {
        value: { postMessage },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(window, 'close', {
        value: closeWindow,
        writable: true,
        configurable: true,
      })

      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = createAuthConnector(wapi)
      wa.sendToken()

      expect(postMessage).not.toHaveBeenCalled()
      expect(closeWindow).not.toHaveBeenCalled()
    })
  })

  describe('mintOAuthToken', () => {
    it('calls getTieredToken with referrer hostname', async () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      Object.defineProperty(window, 'location', {
        value: { hostname: 'app.example.com' },
        writable: true,
        configurable: true,
      })
      Object.defineProperty(document, 'referrer', {
        value: 'https://app.example.com/page',
        writable: true,
        configurable: true,
      })
      const wa = createAuthConnector(wapi)
      wapi.readToken.mockReturnValue({ username: 'alice', provider: 'api.example.com' })
      await wa.mintOAuthToken()
      expect(wapi.getTieredToken).toHaveBeenCalledWith('app.example.com', 'api.example.com')
    })
  })
})
