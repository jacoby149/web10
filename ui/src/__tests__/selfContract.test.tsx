import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'

// The first-party self-grant: the authenticator is the node's console AND a
// CRUD client (the Studio ad cards read/write `posts`/`ads`). Its CRUD calls
// carry `Origin: <auth origin>`, and the documents endpoint enforces an app
// contract per origin — so without a contract for its OWN origin every Studio
// ad read 403s with "No app contract for https://auth.web10.app to readAll on
// posts". On sign-in the authenticator grants itself that contract (it is the
// only origin allowed to call app-contracts/add). This pins the grant: it fires
// for the auth origin with the ad services, is idempotent (skips when already
// granted), and never throws (a failure must not break sign-in).

const mockV3 = {
  signup: vi.fn(() => Promise.resolve({})),
  login: vi.fn(() => Promise.resolve({})),
  getProfile: vi.fn(() => Promise.resolve({})),
  signOut: vi.fn(),
  // A live token — so I.auth is true and v3Post has a token to send.
  readToken: () => ({
    username: 'alice',
    provider: 'api.localhost',
    site: 'auth.localhost',
    expires: new Date(Date.now() + 3600_000).toISOString(),
  }),
  scrubToken: vi.fn(),
  isSignedIn: () => true,
  state: { token: 'tok123', apiOrigin: 'http://api.localhost' },
}

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('web10-npm', () => ({
  wapiInit: () => ({ readToken: () => null, scrubToken: vi.fn(), signOut: vi.fn(), isSignedIn: () => false }),
  wapiAuthInit: () => ({ contractListen: vi.fn() }),
  createV3Client: () => mockV3,
}))

// jsdom's origin is http://localhost:3000 — a stable, non-empty origin the
// self-grant keys off (the API matches the request Origin header exactly).
const SELF_ORIGIN = 'http://localhost:3000'

function mockFetchOk() {
  return vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve({}),
      text: () => Promise.resolve(''),
    }),
  )
}

function findAddCall(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.find(([url]) => String(url).includes('/v3/app-contracts/add'))
}

// v3Post reads the token off window.I (App.tsx assigns it) — mirror that so the
// grant carries the signed-in user's token.
async function renderWithWindowI() {
  const { default: useInterface } = await import('../interfaces/Interface')
  const hook = renderHook(() => useInterface())
  act(() => {
    ;(window as any).I = hook.result.current
  })
  return hook
}

describe('I.ensureSelfContract — the first-party self app-contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    delete (window as any).I
  })

  it('grants a contract for the auth origin covering the ad services', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = await renderWithWindowI()

    await act(async () => {
      await result.current.ensureSelfContract()
    })

    const addCall = findAddCall(fetchMock)
    expect(addCall, 'app-contracts/add should be called').toBeTruthy()
    const body = JSON.parse(addCall[1].body)
    expect(body.allowed_origin).toBe(SELF_ORIGIN)
    // The ad surfaces need posts (AdsCard + AdInventoryCard) and ads
    // (DirectDeals), each with the four document operations.
    expect(body.permissions.posts).toEqual(['create', 'readAll', 'updateOwn', 'deleteOwn'])
    expect(body.permissions.ads).toEqual(['create', 'readAll', 'updateOwn', 'deleteOwn'])
    // It carries the signed-in user's token (the grant is per-user).
    expect(body.token).toBe('tok123')
  })

  it('is idempotent — skips the write when the origin already has a contract', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    const { result } = await renderWithWindowI()

    // Simulate the contract list already covering the auth origin (a prior
    // grant that v3ContractsLoad has since loaded).
    act(() => {
      result.current.setV3Contracts([{ allowed_origin: SELF_ORIGIN, permissions: { posts: ['readAll'] } }])
    })

    await act(async () => {
      await result.current.ensureSelfContract()
    })

    // No app-contracts/add — the existing contract is enough.
    expect(findAddCall(fetchMock)).toBeUndefined()
  })

  it('never throws — a grant failure is swallowed (sign-in must not break)', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () => Promise.resolve({}),
        text: () => Promise.resolve('{"detail":"forbidden"}'),
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const { result } = await renderWithWindowI()

    // Resolves (does not reject) even though the grant 403'd.
    await expect(
      act(async () => {
        await result.current.ensureSelfContract()
      }),
    ).resolves.toBeUndefined()
  })
})

describe('servicesLoad — triggers the self-grant on sign-in', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  afterEach(() => {
    delete (window as any).I
  })

  it('calls ensureSelfContract when loading services for a signed-in user', async () => {
    const fetchMock = mockFetchOk()
    vi.stubGlobal('fetch', fetchMock)
    await renderWithWindowI()

    // A signed-in session (restoreAuth found a live token) → servicesLoad runs
    // via the authTick effect on mount (debounced 50ms). The self-grant is one
    // of its calls.
    await waitFor(
      () => {
        expect(findAddCall(fetchMock), 'servicesLoad should trigger the self app-contract grant').toBeTruthy()
      },
      { timeout: 2000 },
    )
  })
})
