import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Hoisted mocks ──────────────────────────────────────────────────────────
const mocks = vi.hoisted(() => ({
  axiosPost: vi.fn(),
  axiosPatch: vi.fn(),
  axiosDelete: vi.fn(),
  axiosPut: vi.fn(),
  MockPeer: vi.fn(function (id, opts) {
    this.id = id
    this.opts = opts
    this._handlers = {}
    this.on = function (event, handler) { this._handlers[event] = handler }
    this.connect = vi.fn(() => ({ peer: id, open: true, send: vi.fn(), on: vi.fn() }))
  }),
}))

const { axiosPost, axiosPatch, axiosDelete, axiosPut, MockPeer } = mocks

vi.mock('axios', () => ({
  default: {
    post: mocks.axiosPost,
    patch: mocks.axiosPatch,
    delete: mocks.axiosDelete,
    put: mocks.axiosPut,
  },
}))

vi.mock('peerjs', () => ({ Peer: mocks.MockPeer }))

// ── Helpers ────────────────────────────────────────────────────────────────
function makeJwt(payload) {
  const h = btoa(JSON.stringify(payload))
  return `header.${h}.sig`
}

function setCookie(name, value) {
  document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};path=/;`
}

function clearCookies() {
  document.cookie.split(';').forEach(c => {
    document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date(0).toUTCString() + ';path=/;')
  })
}

// ── Import after mocks ─────────────────────────────────────────────────────
import { wapiInit } from './wapi.js'

// ── Tests ──────────────────────────────────────────────────────────────────
describe('wapiInit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearCookies()
    MockPeer.mockClear()
    // real axios methods always return a promise (init's register_app
    // ping chains .catch on it); tests override per-call as needed
    axiosPost.mockResolvedValue({ data: {} })
    axiosPatch.mockResolvedValue({ data: {} })
    axiosDelete.mockResolvedValue({ data: {} })
    axiosPut.mockResolvedValue({ data: {} })
  })

  it('returns an object with expected keys', () => {
    setCookie('token', { dummy: true })
    const w = wapiInit('https://auth.example.com')
    expect(w).toHaveProperty('setToken')
    expect(w).toHaveProperty('scrubToken')
    expect(w).toHaveProperty('readToken')
    expect(w).toHaveProperty('isSignedIn')
    expect(w).toHaveProperty('signOut')
    expect(w).toHaveProperty('read')
    expect(w).toHaveProperty('create')
    expect(w).toHaveProperty('update')
    expect(w).toHaveProperty('delete')
    expect(w).toHaveProperty('aggregate')
    expect(w).toHaveProperty('peerID')
    expect(w).toHaveProperty('checkout')
    expect(w).toHaveProperty('verifySubscription')
    expect(w).toHaveProperty('cancelSubscription')
  })

  it('sets APIProtocol from authUrl', () => {
    const w = wapiInit('https://auth.example.com')
    expect(w.APIProtocol).toBe('https:')
    const w2 = wapiInit('http://auth.localhost')
    expect(w2.APIProtocol).toBe('http:')
  })

  it('reads token from cookie on init', () => {
    const jwt = makeJwt({ username: 'alice' })
    setCookie('token', jwt)
    const w = wapiInit('https://auth.example.com')
    expect(w.token).toBe(jwt)
  })

  it('has undefined token when no cookie', () => {
    const w = wapiInit('https://auth.example.com')
    expect(w.token).toBeUndefined()
  })

  describe('setToken / scrubToken', () => {
    it('setToken stores token in memory', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      w.setToken('new-jwt')
      expect(w.token).toBe('new-jwt')
    })

    it('scrubToken clears token and cookie', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      w.setToken('old-jwt')
      w.scrubToken()
      expect(w.token).toBeNull()
    })
  })

  describe('isSignedIn / signOut', () => {
    it('isSignedIn returns true when token set', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      w.setToken('jwt')
      expect(w.isSignedIn()).toBe(true)
    })

    it('isSignedIn returns false when no token', () => {
      const w = wapiInit('https://auth.example.com')
      expect(w.isSignedIn()).toBe(false)
    })

    it('signOut clears token', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      w.setToken('jwt')
      w.signOut()
      expect(w.isSignedIn()).toBe(false)
    })
  })

  describe('readToken', () => {
    it('returns decoded payload when token set', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const payload = { username: 'bob', provider: 'api.example.com', site: 'app.com' }
      w.setToken(makeJwt(payload))
      expect(w.readToken()).toEqual(payload)
    })

    it('returns null when no token', () => {
      const w = wapiInit('https://auth.example.com')
      expect(w.readToken()).toBeNull()
    })
  })

  describe('peerID', () => {
    it('replaces dots with underscores in peer id', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const id = w.peerID('api.example.com', 'alice', 'app.example.com', 'chat')
      expect(id).toBe('api_example_com alice app_example_com chat')
    })

    it('handles empty label', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const id = w.peerID('api.com', 'bob', 'app.com', '')
      expect(id).toBe('api_com bob app_com ')
    })
  })

  describe('CRUD guard clauses', () => {
    let errSpy
    beforeEach(() => {
      errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    })
    afterEach(() => {
      errSpy.mockRestore()
    })

    it('read rejects anon username', () => {
      const w = wapiInit('https://auth.example.com')
      w.read('posts', {}, 'anon')
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })

    it('create rejects missing token and username', () => {
      const w = wapiInit('https://auth.example.com')
      w.create('posts')
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })

    it('update rejects missing provider and token', () => {
      const w = wapiInit('https://auth.example.com')
      w.update('posts', {}, {})
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })

    it('delete rejects missing token and username', () => {
      const w = wapiInit('https://auth.example.com')
      w.delete('posts')
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })

    it('aggregate rejects anon username', () => {
      const w = wapiInit('https://auth.example.com')
      w.aggregate('posts', [], 'anon')
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })

    it('aggregate rejects missing token and username', () => {
      const w = wapiInit('https://auth.example.com')
      w.aggregate('posts')
      expect(errSpy).toHaveBeenCalledWith('cant CRUD anon accounts')
    })
  })

  describe('CRUD HTTP calls', () => {
    it('read calls axios.patch with correct URL', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPatch.mockResolvedValue({ data: [] })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.read('posts', { title: 'hi' })
      expect(axiosPatch).toHaveBeenCalledWith(
        'https://api.example.com/alice/posts',
        { token: jwt, query: { title: 'hi' }, update: null }
      )
    })

    it('create calls axios.post with correct URL', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPost.mockResolvedValue({ data: { _id: '1' } })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.create('posts', { body: 'hello' })
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/alice/posts',
        { token: jwt, query: { body: 'hello' }, update: null }
      )
    })

    it('aggregate calls axios.post on the /aggregate route with the pipeline', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPost.mockResolvedValue({ data: [] })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      const pipeline = [{ $group: { _id: '$tag', n: { $sum: 1 } } }, { $sort: { n: -1 } }]
      await w.aggregate('posts', pipeline)
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/alice/posts/aggregate',
        { token: jwt, pipeline }
      )
    })

    it('aggregate defaults to an empty pipeline', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPost.mockResolvedValue({ data: [] })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.aggregate('posts')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/alice/posts/aggregate',
        { token: jwt, pipeline: [] }
      )
    })

    it('update calls axios.put with query and update', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPut.mockResolvedValue({ data: {} })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.update('posts', { _id: '1' }, { $set: { title: 'new' } })
      expect(axiosPut).toHaveBeenCalled()
    })
  })

  describe('getTieredToken', () => {
    it('calls axios.post to /web10token', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPost.mockResolvedValue({ data: { token: 'tiered-jwt' } })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.getTieredToken('myapp.com', 'api.example.com')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/web10token',
        { username: 'alice', password: null, token: jwt, site: 'myapp.com', target: 'api.example.com' }
      )
    })
  })

  describe('dev pay', () => {
    it('checkout calls POST /dev_pay', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPost.mockResolvedValue({ data: 'https://checkout.stripe.com/test' })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      Object.defineProperty(window, 'location', {
        value: { href: '' },
        writable: true,
        configurable: true,
      })
      await w.checkout('seller1', 'Pro', 100, 'https://ok', 'https://no')
      expect(axiosPost).toHaveBeenCalledWith(
        'https://api.example.com/dev_pay',
        { token: jwt, seller: 'seller1', title: 'Pro', price: 100, success_url: 'https://ok', cancel_url: 'https://no' }
      )
    })

    it('verifySubscription calls PATCH /dev_pay', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosPatch.mockResolvedValue({ data: { active: true } })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.verifySubscription('seller1', 'Pro')
      expect(axiosPatch).toHaveBeenCalledWith(
        'https://api.example.com/dev_pay',
        { token: jwt, seller: 'seller1', title: 'Pro', price: null }
      )
    })

    it('cancelSubscription calls DELETE /dev_pay', async () => {
      const payload = { username: 'alice', provider: 'api.example.com' }
      const jwt = makeJwt(payload)
      axiosDelete.mockResolvedValue({ data: { cancelled: true } })
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com')
      w.setToken(jwt)
      await w.cancelSubscription('seller1', 'Pro')
      expect(axiosDelete).toHaveBeenCalledWith(
        'https://api.example.com/dev_pay',
        { data: { token: jwt, seller: 'seller1', title: 'Pro' } }
      )
    })
  })

  describe('authListen', () => {
    it('calls setAuth callback when auth message received', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const cb = vi.fn()
      w.authListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'auth', token: 'received-jwt' },
      }))
      expect(cb).toHaveBeenCalledWith(true)
    })

    it('ignores non-auth messages', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const cb = vi.fn()
      w.authListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'other', data: 'x' },
      }))
      expect(cb).not.toHaveBeenCalled()
    })
  })

  describe('SMR helpers', () => {
    it('SMRResponseListen calls callback on status message', () => {
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      const cb = vi.fn()
      w.SMRResponseListen(cb)
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'status', status: 'approved' },
      }))
      expect(cb).toHaveBeenCalledWith('approved')
    })
  })

  describe('initP2P', () => {
    it('creates a Peer with correct id', () => {
      const payload = { username: 'alice', provider: 'api.example.com', site: 'app.com' }
      const jwt = makeJwt(payload)
      setCookie('token', jwt)
      const w = wapiInit('https://auth.example.com', [], 'rtc.example.com')
      w.setToken(jwt)
      w.initP2P(null, 'chat', true)
      expect(MockPeer).toHaveBeenCalledWith(
        'api_example_com alice app_com chat',
        expect.objectContaining({ host: 'rtc.example.com', secure: true, port: 443 })
      )
    })
  })

  describe('openAuthPortal', () => {
    it('opens auth URL in new window', () => {
      vi.spyOn(window, 'open').mockReturnValue({})
      setCookie('token', { dummy: true })
      const w = wapiInit('https://auth.example.com')
      w.openAuthPortal()
      expect(window.open).toHaveBeenCalledWith('https://auth.example.com', '_blank')
    })
  })
})
