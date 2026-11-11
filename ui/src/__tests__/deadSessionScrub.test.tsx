import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import useInterface from '../interfaces/Interface'
import { getVaultedToken, vaultToken } from '../lib/tokenVault'

// ── The consent popup's dead-session scrub (the death-loop breaker) ─────────
// A restored cookie can be dead SERVER-SIDE while it looks live locally
// (revoked, a re-minted signing key, a deleted account): the popup's
// "Signed in as …" footer is local state, and every consent approve under a
// dead token 401s ("Some requests failed. Start a new request from the
// app.") with the only escape being the manual log-out link. The on-mount
// profile read is the popup's one decisive liveness signal: a 401 there must
// scrub the session and route to the login screen, while a transient failure
// (network, 5xx) must NOT (a flaky connection is not a dead session).

const session = vi.hoisted(() => ({
  username: 'alice',
  token: 'alice-token' as string | null,
  profile: vi.fn(),
}))
vi.mock('../interfaces/authAdapter', () => ({
  default: () => {
    const token = session.token, username = session.username
    return { v3: {
      state: { token },
      readToken: () => token ? { username, provider: 'api.localhost', expires: '2099-01-01' } : null,
      signOut: () => { session.token = null },
      setToken: (value: string) => { session.token = value; session.username = 'bob' },
      getProfile: () => session.profile(),
    } }
  },
}))

const ok = (value: unknown) => ({ ok: true, json: async () => value })

beforeEach(() => {
  vi.useFakeTimers()
  session.username = 'alice'
  session.token = 'alice-token'
  session.profile.mockReset().mockResolvedValue({})
  vi.stubGlobal('fetch', vi.fn(async () => ok([])))
})
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
})
function mount() {
  return renderHook(() => { const I = useInterface(); window.I = I; return I }).result
}

// The SDK's Web10Error shape: a non-2xx rejection carries `.status` + the
// API's `detail` as the message.
const web10Error = (status: number, detail: string) =>
  Object.assign(new Error(detail), { status, name: 'Web10Error' })

it('a restored session the node rejects (profile read 401) scrubs to the login screen', async () => {
  vaultToken({ username: 'alice', provider: 'api.localhost', token: 'alice-token' })
  const I = mount()
  session.profile.mockRejectedValue(web10Error(401, 'incorrect token'))
  await act(async () => {
    I.current.servicesLoad()
    vi.advanceTimersByTime(50)
  })
  expect(session.token).toBeNull()                    // the cookie is scrubbed
  expect(I.current.auth).toBe(false)                  // the login screen shows
  expect(I.current.mode).toBe('login')
  expect(I.current._userConfirmed).toBe(false)        // no stale confirmation
  expect(getVaultedToken('alice', 'api.localhost')).toBeNull() // the dead token is off the one-tap picker
})

it('a transient profile failure (network) keeps the session', async () => {
  const I = mount()
  session.profile.mockRejectedValue(new Error('Failed to fetch'))
  await act(async () => {
    I.current.servicesLoad()
    vi.advanceTimersByTime(50)
  })
  expect(I.current.auth).toBe(true)
  expect(session.token).toBe('alice-token')
})

it('a server-side 500 keeps the session (the store is down, not the token)', async () => {
  const I = mount()
  session.profile.mockRejectedValue(web10Error(500, 'internal error'))
  await act(async () => {
    I.current.servicesLoad()
    vi.advanceTimersByTime(50)
  })
  expect(I.current.auth).toBe(true)
  expect(session.token).toBe('alice-token')
})

it('a healthy profile read keeps the session', async () => {
  const I = mount()
  session.profile.mockResolvedValue({ phone: '', phone_verified: false })
  await act(async () => {
    I.current.servicesLoad()
    vi.advanceTimersByTime(50)
  })
  expect(I.current.auth).toBe(true)
  expect(session.token).toBe('alice-token')
})

it('a 401 read finishing after an account transition does not scrub the new session', async () => {
  // Generation guard: a stale 401 belongs to the OLD account's read — it must
  // not fire under the new session (owns() is false once the account
  // generation has advanced).
  function deferred() {
    let resolve!: (value: any) => void, reject!: (error: Error) => void
    const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no })
    return { promise, resolve, reject }
  }
  const I = mount()
  const aliceRead = deferred()
  // alice's read is the pending one; bob's read (driven by finishLogin's
  // servicesLoad) is a clean success.
  session.profile.mockReturnValueOnce(aliceRead.promise)
  await act(async () => { I.current.servicesLoad(); vi.advanceTimersByTime(50) })
  // Transition to bob while alice's profile read is still in flight.
  session.username = 'bob'; session.token = 'bob-token'
  act(() => I.current.finishLogin())
  await act(async () => { vi.advanceTimersByTime(50) }) // bob's clean read settles
  await act(async () => { aliceRead.reject(web10Error(401, 'incorrect token')) })
  // The stale 401 did NOT scrub bob's fresh session.
  expect(I.current.auth).toBe(true)
  expect(session.token).toBe('bob-token')
})
