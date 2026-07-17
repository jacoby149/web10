import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  axiosPatch: vi.fn(),
}))

const { axiosPost, axiosPatch } = mocks

vi.mock('axios', () => ({
  default: {
    post: mocks.axiosPost,
    patch: mocks.axiosPatch,
    delete: vi.fn(),
  },
}))

// ── Helpers ────────────────────────────────────────────────────────────────
function makeJwt(payload) {
  const h = btoa(JSON.stringify(payload))
  return `header.${h}.sig`
}

function createMockWapi(token) {
  let currentToken = token
  let tokenPayload = token
    ? { username: 'alice', provider: 'api.example.com', site: 'auth.example.com' }
    : null
  return {
    get token() { return currentToken },
    set token(v) { currentToken = v },
    defaultAPIProtocol: 'https:',
    isSignedIn: vi.fn(() => currentToken != null),
    readToken: vi.fn(() => tokenPayload),
    setToken: vi.fn((t) => {
      currentToken = t
      tokenPayload = { username: 'alice', provider: 'api.example.com', site: 'auth.example.com' }
    }),
    getTieredToken: vi.fn().mockResolvedValue({ data: { token: 'tiered' } }),
  }
}

// ── Import after mocks ─────────────────────────────────────────────────────
import { wapiAuthInit } from './wapiAuth.js'

// ── Tests ──────────────────────────────────────────────────────────────────
describe('wapiAuthInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns an object with expected keys', () => {
    const wapi = createMockWapi(null)
    const wa = wapiAuthInit(wapi)
    expect(wa).toHaveProperty('logIn')
    expect(wa).toHaveProperty('signUp')
    expect(wa).toHaveProperty('changePass')
    expect(wa).toHaveProperty('changePhone')
    expect(wa).toHaveProperty('sendCode')
    expect(wa).toHaveProperty('verifyCode')
    expect(wa).toHaveProperty('manageSpace')
    expect(wa).toHaveProperty('manageCredits')
    expect(wa).toHaveProperty('manageBusiness')
    expect(wa).toHaveProperty('manageSubscriptions')
    expect(wa).toHaveProperty('businessLogin')
    expect(wa).toHaveProperty('getPlan')
    expect(wa).toHaveProperty('SMRListen')
    expect(wa).toHaveProperty('sendToken')
  })

  describe('logIn', () => {
    it('calls POST /web10token with correct payload', async () => {
      axiosPost.mockResolvedValue({ data: { token: 'new-jwt' } })
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
      const wa = wapiAuthInit(wapi)
      await wa.logIn('api.example.com', 'alice', 'secret')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/web10token',
        { username: 'alice', password: 'secret', token: null, site: 'auth.example.com', target: null }
      )
    })

    it('calls wapi.setToken on success', async () => {
      axiosPost.mockResolvedValue({ data: { token: 'new-jwt' } })
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
      const wa = wapiAuthInit(wapi)
      await wa.logIn('api.example.com', 'alice', 'secret')
      expect(wapi.setToken).toHaveBeenCalledWith('new-jwt')
    })
  })

  describe('signUp', () => {
    it('calls POST /signup with correct payload', async () => {
      axiosPost.mockResolvedValue({ data: { ok: true } })
      const wapi = createMockWapi(null)
      const wa = wapiAuthInit(wapi)
      await wa.signUp('api.example.com', 'bob', 'pass123', 'beta', '+1234567890')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/signup',
        { username: 'bob', password: 'pass123', betacode: 'beta', phone: '+1234567890' }
      )
    })
  })

  describe('changePass', () => {
    it('calls POST /change_pass with correct payload', async () => {
      axiosPost.mockResolvedValue({ data: { ok: true } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.changePass('old', 'new')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/change_pass',
        { username: 'alice', password: 'old', new_pass: 'new' }
      )
    })
  })

  describe('changePhone', () => {
    it('calls POST /change_phone with correct payload', async () => {
      axiosPost.mockResolvedValue({ data: { ok: true } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.changePhone('oldpass', '+9876543210')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/change_phone',
        { username: 'alice', password: 'oldpass', phone: '+9876543210' }
      )
    })
  })

  describe('sendCode / verifyCode', () => {
    it('sendCode calls POST /send_code', async () => {
      axiosPost.mockResolvedValue({ data: { sent: true } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.sendCode()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/send_code',
        { token: jwt }
      )
    })

    it('verifyCode calls POST /verify_code with code', async () => {
      axiosPost.mockResolvedValue({ data: { verified: true } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.verifyCode('123456')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/verify_code',
        { token: jwt, query: { code: '123456' } }
      )
    })
  })

  describe('Stripe management endpoints', () => {
    it('manageSpace calls POST /manage_space', async () => {
      axiosPost.mockResolvedValue({ data: { url: 'stripe-url' } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.manageSpace()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/manage_space',
        { token: jwt }
      )
    })

    it('manageCredits calls POST /manage_credits', async () => {
      axiosPost.mockResolvedValue({ data: { url: 'stripe-url' } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.manageCredits()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/manage_credits',
        { token: jwt }
      )
    })

    it('manageBusiness calls POST /manage_business', async () => {
      axiosPost.mockResolvedValue({ data: { url: 'stripe-url' } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.manageBusiness()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/manage_business',
        { token: jwt }
      )
    })

    it('manageSubscriptions calls POST /manage_subscriptions', async () => {
      axiosPost.mockResolvedValue({ data: { url: 'stripe-url' } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.manageSubscriptions()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/manage_subscriptions',
        { token: jwt }
      )
    })

    it('businessLogin calls POST /business_login', async () => {
      axiosPost.mockResolvedValue({ data: { url: 'stripe-url' } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.businessLogin()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/business_login',
        { token: jwt }
      )
    })

    it('getPlan calls POST /get_plan', async () => {
      axiosPost.mockResolvedValue({ data: { space: 100, credits: 50 } })
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      await wa.getPlan()
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/get_plan',
        { token: jwt }
      )
    })
  })

  describe('SMRListen', () => {
    it('listens for SMR messages and calls setState', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      const cb = vi.fn()

      Object.defineProperty(window, 'opener', {
        value: { postMessage: vi.fn() },
        writable: true,
        configurable: true,
      })

      wa.SMRListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'smr', sirs: [], scrs: [] },
      }))
      expect(cb).toHaveBeenCalledWith({ type: 'smr', sirs: [], scrs: [] })
    })

    it('ignores non-smr messages', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      const cb = vi.fn()

      Object.defineProperty(window, 'opener', {
        value: { postMessage: vi.fn() },
        writable: true,
        configurable: true,
      })

      wa.SMRListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'other', data: 'x' },
      }))
      expect(cb).not.toHaveBeenCalled()
    })

    it('does nothing when no opener', () => {
      const jwt = makeJwt({ username: 'alice', provider: 'api.example.com' })
      const wapi = createMockWapi(jwt)
      const wa = wapiAuthInit(wapi)
      const cb = vi.fn()

      Object.defineProperty(window, 'opener', {
        value: null,
        writable: true,
        configurable: true,
      })

      wa.SMRListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'smr', sirs: [], scrs: [] },
      }))
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('sendToken', () => {
    it('posts auth message to opener and closes window', () => {
      const postMessage = vi.fn()
      const closeWindow = vi.fn()

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
      const wa = wapiAuthInit(wapi)
      wa.oAuthToken = 'oauth-jwt'
      wa.sendToken()

      expect(postMessage).toHaveBeenCalledWith(
        { type: 'auth', token: 'oauth-jwt' },
        '*'
      )
      expect(closeWindow).toHaveBeenCalled()
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
      const wa = wapiAuthInit(wapi)
      // Manually set the token payload since we didn't call setToken
      wapi.readToken.mockReturnValue({ username: 'alice', provider: 'api.example.com' })
      await wa.mintOAuthToken()
      expect(wapi.getTieredToken).toHaveBeenCalledWith('app.example.com', 'api.example.com')
    })
  })
})
