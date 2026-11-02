import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import useInterface from '../interfaces/Interface'
import { vaultToken } from '../lib/tokenVault'

const session = vi.hoisted(() => ({ username: 'alice', token: 'alice-token' as string | null, profile: vi.fn() }))
vi.mock('../interfaces/authAdapter', () => ({ default: () => {
  const token = session.token, username = session.username
  return { v3: {
    state: { token },
    readToken: () => token ? { username, provider: 'api.localhost', expires: '2099-01-01' } : null,
    signOut: () => { session.token = null },
    setToken: (value: string) => { session.token = value; session.username = 'bob' },
    getProfile: () => session.profile(),
  } }
} }))

const ok = (value: unknown) => ({ ok: true, json: async () => value })
function deferred() {
  let resolve!: (value: any) => void, reject!: (error: Error) => void
  const promise = new Promise<any>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
beforeEach(() => {
  vi.useFakeTimers()
  session.username = 'alice'; session.token = 'alice-token'
  session.profile.mockReset().mockResolvedValue({})
  vi.stubGlobal('fetch', vi.fn(async () => ok([])))
})
afterEach(() => { cleanup(); vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear() })
function mount() {
  return renderHook(() => { const I = useInterface(); window.I = I; return I }).result
}

const reads = [
  ['profile', '', 'phone', 'setPhone', { phone: 'old-phone', phone_verified: true }, 'new-phone'],
  ['checkAdmin', '/am_admin', 'isAdmin', 'setIsAdmin', { admin: true }, false],
  ['v3ContractsLoad', '/app-contracts/list', 'v3Contracts', 'setV3Contracts', [{ allowed_origin: 'old-origin' }], [{ allowed_origin: 'new-origin' }]],
  ['v3GroupsLoad', '/groups/list', 'v3Groups', 'setV3Groups', [{ group_id: 'old' }], [{ group_id: 'new' }]],
  ['v3GroupsManagesLoad', '/groups/manages', 'v3ManagedGroups', 'setV3ManagedGroups', [{ group_id: 'old' }], [{ group_id: 'new' }]],
] as const

it.each(reads)('%s keeps a current response usable', async (method, path, field, _setter, value) => {
  const I = mount()
  session.profile.mockResolvedValue(value)
  vi.mocked(fetch).mockImplementation(async url => ok(String(url).endsWith(path) ? value : [] as any) as Response)
  await act(async () => {
    if (method === 'profile') I.current.servicesLoad(); else I.current[method]()
    vi.advanceTimersByTime(50)
  })
  expect(I.current[field]).toEqual(method === 'profile' ? 'old-phone' : method === 'checkAdmin' ? true : value)
})

for (const transition of ['logout', 'account-switch', 'same-token-relogin']) {
  for (const failed of [false, true]) {
    it.each(reads)(`%s ignores stale ${failed ? 'failure' : 'success'} after ${transition}`, async (method, path, field, setter, value, next) => {
      const I = mount(), pending = deferred()
      if (method === 'profile') session.profile.mockReturnValue(pending.promise)
      else vi.mocked(fetch).mockImplementation(url => String(url).endsWith(path) ? pending.promise : Promise.resolve(ok([]) as Response))
      await act(async () => {
        if (method === 'profile') I.current.servicesLoad(); else I.current[method]()
        vi.advanceTimersByTime(50)
      })
      act(() => I.current.logout())
      if (transition !== 'logout') {
        session.username = transition === 'account-switch' ? 'bob' : 'alice'
        session.token = transition === 'account-switch' ? 'bob-token' : 'alice-token'
        act(() => I.current.finishLogin())
      }
      // Model a newer read finishing before the old response/failure.
      const expected = method === 'checkAdmin' && failed ? true : next
      act(() => I.current[setter](expected))
      await act(async () => {
        if (failed) pending.reject(new Error('synthetic stale failure'))
        else pending.resolve(method === 'profile' ? value : ok(value))
      })
      expect(I.current[field]).toEqual(expected)
    })
  }
}

it('logout clears account display state and cancels debounced old requests', async () => {
  const I = mount()
  act(() => { I.current.setIsAdmin(true); I.current.setPhone('old-phone'); I.current.setVerified(true) })
  act(() => { I.current.servicesLoad(); I.current.checkAdmin(); I.current.logout() })
  await act(async () => { vi.advanceTimersByTime(50) })
  expect(fetch).not.toHaveBeenCalled()
  expect(session.profile).not.toHaveBeenCalled()
  expect(I.current.isAdmin).toBe(false)
  expect(I.current.phone).toBe('')
  expect(I.current.verified).toBe(false)
})

for (const failed of [false, true]) {
  it.each(reads)(`%s cannot replace a newer same-session result with an older ${failed ? 'failure' : 'success'}`, async (method, path, field, _setter, value, next) => {
    const I = mount(), old = deferred(), newer = deferred()
    if (method === 'profile') session.profile.mockReturnValueOnce(old.promise).mockReturnValueOnce(newer.promise)
    else {
      let calls = 0
      vi.mocked(fetch).mockImplementation(url => String(url).endsWith(path)
        ? (++calls === 1 ? old.promise : newer.promise) : Promise.resolve(ok([]) as Response))
    }
    for (let i = 0; i < 2; i++) await act(async () => {
      if (method === 'profile') I.current.servicesLoad(); else I.current[method]()
      vi.advanceTimersByTime(50)
    })
    const nextValue = method === 'profile' ? { phone: next, phone_verified: false }
      : method === 'checkAdmin' ? { admin: failed } : next
    await act(async () => { newer.resolve(method === 'profile' ? nextValue : ok(nextValue)) })
    const expected = method === 'checkAdmin' ? failed : next
    expect(I.current[field]).toEqual(expected)
    await act(async () => {
      if (failed) old.reject(new Error('old read failed'))
      else old.resolve(method === 'profile' ? value : ok(value))
    })
    expect(I.current[field]).toEqual(expected)
  })
}

it('a retained admin callback sends the current credential, not its render snapshot', async () => {
  const I = mount(), oldCheck = I.current.checkAdmin
  session.username = 'bob'; session.token = 'bob-token'
  act(() => I.current.finishLogin())
  vi.mocked(fetch).mockResolvedValue(ok({ admin: false }) as Response)
  await act(async () => { oldCheck(); vi.advanceTimersByTime(50) })
  const calls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/am_admin'))
  expect(calls).toHaveLength(1)
  expect(JSON.parse(calls[0][1]!.body as string).token).toBe('bob-token')
  expect(I.current.isAdmin).toBe(false)
})

it.each(reads.slice(2))('%s retained from a signed-out render does not clear the new account', async (method, path, field, setter, _old, next) => {
  session.token = null
  const I = mount(), oldRead = I.current[method], pending = deferred()
  session.username = 'bob'; session.token = 'bob-token'
  act(() => I.current.finishLogin())
  act(() => I.current[setter](next))
  vi.mocked(fetch).mockImplementation(url => String(url).endsWith(path) ? pending.promise : Promise.resolve(ok([]) as Response))
  act(() => { oldRead() })
  expect(I.current[field]).toEqual(next)
  await act(async () => { pending.resolve(ok(next)) })
  expect(I.current[field]).toEqual(next)
})

it('admin ownership is rechecked after delayed response JSON', async () => {
  const I = mount(), json = deferred()
  vi.mocked(fetch).mockResolvedValue({ ok: true, json: () => json.promise } as Response)
  await act(async () => { I.current.checkAdmin(); vi.advanceTimersByTime(50) })
  act(() => I.current.logout())
  await act(async () => { json.resolve({ admin: true }) })
  expect(I.current.isAdmin).toBe(false)
})

it('picker selection invalidates old reads while the new account can load its profile', async () => {
  const I = mount(), oldProfile = deferred()
  session.profile.mockReturnValueOnce(oldProfile.promise)
  await act(async () => { I.current.servicesLoad(); vi.advanceTimersByTime(50) })
  vaultToken({ username: 'bob', provider: 'api.localhost', token: 'bob-token' })
  act(() => I.current.switchAccount('bob', 'api.localhost'))
  session.profile.mockResolvedValue({ phone: 'bob-phone', phone_verified: false })
  await act(async () => { I.current.servicesLoad(); vi.advanceTimersByTime(50) })
  expect(I.current.phone).toBe('bob-phone')
  expect(I.current.verified).toBe(false)
  await act(async () => { oldProfile.resolve({ phone: 'alice-phone', phone_verified: true }) })
  expect(I.current.phone).toBe('bob-phone')
  expect(I.current.verified).toBe(false)
})
