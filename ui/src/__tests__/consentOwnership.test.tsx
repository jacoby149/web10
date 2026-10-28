import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook, render, fireEvent, screen } from '@testing-library/react'
import useInterface from '../interfaces/Interface'
import ConsentView from '../components/Consent/ConsentView'
import { vaultToken } from '../lib/tokenVault'

const session = vi.hoisted(() => ({ username: 'alice', token: 'synthetic-token' as string | null }))

vi.mock('../interfaces/authAdapter', () => ({ default: () => ({ v3: {
  state: { get token() { return session.token } },
  readToken: () => ({ username: session.username, provider: 'api.localhost', expires: '2099-01-01' }),
  signOut: () => {},
  setToken: (token: string) => { session.token = token; session.username = 'bob' },
  getProfile: async () => ({}),
} }) }))

const ok = (value: unknown = []) => ({ ok: true, json: async () => value })
let apply = vi.fn()
let subscriptions: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  session.username = 'alice'; session.token = 'synthetic-token'
  vi.useFakeTimers()
  apply = vi.fn(async () => ok({}))
  vi.stubGlobal('fetch', vi.fn((url: string) => url.endsWith('/app-contracts/add') ? apply() : Promise.resolve(ok())))
  subscriptions = vi.spyOn(window, 'addEventListener')
})
afterEach(() => {
  cleanup()
  for (const [type, handler] of subscriptions.mock.calls) if (type === 'message') window.removeEventListener(type, handler as EventListener)
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals()
  window.opener = null
  localStorage.clear()
})

function mount() {
  const hook = renderHook(() => { const I = useInterface(); window.I = I; return I })
  act(() => hook.result.current.initAuthenticator())
  return hook.result
}
const appContract = () => ({ kind: 'app', app_origin: 'https://grant.invalid', permissions: { notes: ['readAll'] } })
function receive(source: object, contracts: object[], requestId?: unknown) {
  act(() => window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'contract', contracts, ...(requestId === undefined ? {} : { requestId }) },
    source: source as Window, origin: 'https://caller.invalid',
  })))
}
function deferred() {
  let resolve!: (value: ReturnType<typeof ok>) => void
  const promise = new Promise<ReturnType<typeof ok>>(done => { resolve = done })
  return { promise, resolve }
}

it('echoes original indices to the actual requester on approve and deny', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  receive(source, [appContract(), { kind: 'group', action: 'create_group', name: 'group' }], 'batch-A')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  act(() => I.current.denyContract(I.current.pendingContracts[0]))
  expect(source.postMessage.mock.calls.map(([payload]) => [payload.requestId, payload.contractIndex, payload.status]))
    .toEqual([['batch-A', 0, 'approved'], ['batch-A', 1, 'denied']])
  expect(source.postMessage.mock.calls.every(([, target]) => target === 'https://caller.invalid')).toBe(true)
  const write = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/app-contracts/add'))
  expect(Object.keys(JSON.parse(write![1]!.body as string)).sort()).toEqual(['allowed_origin', 'permissions', 'token'])
})

it('old approve-all completion cannot erase or close a newer batch', async () => {
  const opener = { postMessage: vi.fn() }
  window.opener = opener
  const I = mount(), a = { postMessage: vi.fn() }, b = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  receive(a, [appContract()], 'batch-A')
  await act(async () => { I.current.approveAll() })
  receive(b, [appContract()], 'batch-B')
  const current = I.current.pendingContracts[0]
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  await act(async () => { pending.resolve(ok({})) })
  expect(I.current.pendingContracts).toEqual([current])
  expect(a.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'batch-A', contractIndex: 0 })
  expect(b.postMessage).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  expect(opener.postMessage).not.toHaveBeenCalled()
  expect(I.current._userConfirmed).toBe(false)
})

it('duplicate delivery/click cannot apply or reply twice', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  const contract = appContract()
  receive(source, [contract], 'same-batch')
  const row = I.current.pendingContracts[0]
  await act(async () => {
    I.current.approveACR(row)
    expect(apply).toHaveBeenCalledTimes(1) // API invocation must not move behind an account-switch microtask.
    I.current.approveACR(row)
  })
  receive(source, [contract], 'same-batch')
  expect(I.current.pendingContracts[0]).toBe(row)
  expect(apply).toHaveBeenCalledTimes(1)
  await act(async () => { pending.resolve(ok({})) })
  expect(source.postMessage).toHaveBeenCalledTimes(1)
  receive(source, [contract], 'same-batch')
  expect(I.current.pendingContracts).toEqual([])
})

it('identical-looking aliased rows remain independently owned', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, shared = appContract()
  receive(source, [shared, shared], 'batch-A')
  await act(async () => { I.current.approveACR(I.current.pendingContracts[0]) })
  expect(I.current.pendingContracts).toHaveLength(1)
  act(() => I.current.denyACR(I.current.pendingContracts[0]))
  expect(source.postMessage.mock.calls.map(([payload]) => payload.contractIndex)).toEqual([0, 1])
})

it.each(['sync', 'async'])('a %s apply failure gets one owned error', async kind => {
  const I = mount(), source = { postMessage: vi.fn() }
  if (kind === 'async') apply.mockRejectedValueOnce(new Error('synthetic failure'))
  receive(source, [kind === 'sync' ? { kind: 'group', action: 'update_group' } : appContract()], 'batch-A')
  const row = I.current.pendingContracts[0]
  await act(async () => { I.current.approveContract(row) })
  expect(source.postMessage).toHaveBeenCalledTimes(1)
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'batch-A', contractIndex: 0, status: 'error' })
  await act(async () => { I.current.approveContract(row) })
  expect(source.postMessage).toHaveBeenCalledTimes(1)
})

it('keeps legacy response shape and refuses malformed indexed downgrade', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  receive(source, [appContract()])
  const row = I.current.pendingContracts[0]
  for (const bad of ['', 42, 'x'.repeat(129)]) receive(source, [appContract()], bad)
  for (const contracts of [[null], [undefined], new Array(1)]) receive(source, contracts as object[], 'invalid-shape')
  expect(I.current.pendingContracts[0]).toBe(row)
  await act(async () => { I.current.approveContract(row) })
  expect(source.postMessage).toHaveBeenCalledWith({ type: 'contract_response', status: 'approved', errors: undefined }, '*')
})

it('does not confuse the same ID on another window with a replay', async () => {
  const I = mount(), a = { postMessage: vi.fn() }, b = { postMessage: vi.fn() }
  receive(a, [appContract()], 'shared-id')
  const old = I.current.pendingContracts[0]
  receive(b, [appContract()], 'shared-id')
  expect(I.current.pendingContracts[0]).not.toBe(old)
  await act(async () => { I.current.approveContract(old) })
  expect(apply).not.toHaveBeenCalled()
  act(() => I.current.denyContract(I.current.pendingContracts[0]))
  expect(a.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'shared-id', status: 'error' })
  expect(b.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'shared-id', status: 'denied' })
})

it('preserves explicit legacy retry after an apply error', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  apply.mockRejectedValueOnce(new Error('synthetic retryable failure'))
  receive(source, [appContract()])
  const row = I.current.pendingContracts[0]
  await act(async () => { I.current.approveContract(row) })
  expect(I.current.pendingContracts[0]).toBe(row)
  await act(async () => { I.current.approveContract(row) })
  expect(apply).toHaveBeenCalledTimes(2)
  expect(source.postMessage.mock.calls.map(([payload]) => payload.status)).toEqual(['error', 'approved'])
})

it('an older batch status timer cannot clear a newer denial', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  receive(source, [appContract()], 'batch-A')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  receive(source, [appContract()], 'batch-B')
  act(() => I.current.denyContract(I.current.pendingContracts[0]))
  await act(async () => { vi.advanceTimersByTime(2000) })
  expect(I.current.status).toBe('Request denied.')
})

it('mixed single/all approval cannot duplicate work or finish while a row is in flight', async () => {
  const opener = { postMessage: vi.fn() }; window.opener = opener
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  receive(source, [appContract(), appContract()], 'mixed')
  const first = I.current.pendingContracts[0]
  await act(async () => { I.current.approveContract(first); I.current.approveAll(); I.current.approveAll() })
  act(() => I.current.denyContract(first))
  expect(apply).toHaveBeenCalledTimes(2)
  expect(opener.postMessage).not.toHaveBeenCalled()
  expect(I.current.pendingContracts).toEqual([first])
  await act(async () => { pending.resolve(ok({})) })
  expect(source.postMessage.mock.calls.map(([payload]) => [payload.contractIndex, payload.status]))
    .toEqual([[1, 'approved'], [0, 'approved']])
})

it('legacy expanded origins keep independent local rows and unversioned replies', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  act(() => window.dispatchEvent(new MessageEvent('message', {
    data: { type: 'acr', sirs: [{ service: 'notes', cross_origins: ['https://a.invalid', 'https://b.invalid'], whitelist: [{ read: true }] }] },
    source: source as unknown as Window, origin: 'https://caller.invalid',
  })))
  await act(async () => { I.current.approveACR(I.current.pendingContracts[0]) })
  expect(I.current.pendingContracts).toHaveLength(1)
  act(() => I.current.denyACR(I.current.pendingContracts[0]))
  expect(source.postMessage.mock.calls.map(([payload]) => payload.status)).toEqual(['approved', 'denied'])
  expect(source.postMessage.mock.calls.every(([payload, target]) => !('requestId' in payload) && target === '*')).toBe(true)
})

it('group writes exclude reply ownership metadata', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  receive(source, [{ kind: 'group', action: 'create_group', name: 'synthetic' }], 'group-batch')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  const write = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/groups/create'))
  expect(Object.keys(JSON.parse(write![1]!.body as string)).sort()).toEqual(['join_policy', 'members', 'name', 'roles', 'token'])
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'group-batch', contractIndex: 0, status: 'approved' })
})

it('replacement terminates the old request, including in-flight rows, exactly once', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  receive(source, [appContract(), appContract()], 'old')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  receive(source, [appContract()], 'new')
  expect(source.postMessage.mock.calls.map(([p]) => [p.requestId, p.contractIndex, p.status]))
    .toEqual([['old', 0, 'error'], ['old', 1, 'error']])
  await act(async () => { pending.resolve(ok()) })
  expect(source.postMessage).toHaveBeenCalledTimes(2)
  expect(I.current._userConfirmed).toBe(false)
})

it('logout cancels in-flight work and blocks late confirmation and token handoff', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  receive(source, [appContract()], 'logout')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  act(() => I.current.logout())
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'logout', status: 'error' })
  await act(async () => { pending.resolve(ok()) })
  expect(source.postMessage).toHaveBeenCalledTimes(1)
  expect(I.current._userConfirmed).toBe(false)
  expect(I.current._contractReceived).toBe(true) // Login can still hand off credentials, not cancelled consent.
})

it('account change cannot report an earlier account operation as approved', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  apply.mockReturnValueOnce(pending.promise)
  receive(source, [appContract()], 'account')
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  session.username = 'bob'
  await act(async () => { pending.resolve(ok()) })
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'account', status: 'error' })
  expect(I.current._userConfirmed).toBe(false)
})

function mountView() {
  render(<Harness />)
  function Harness() {
    const I = useInterface(); window.I = I
    return <ConsentView I={I} />
  }
  act(() => window.I.initAuthenticator())
}

it('real consent view acknowledges already-granted rows only after identity confirmation', async () => {
  mountView()
  const source = { postMessage: vi.fn() }
  act(() => window.I.setV3Contracts([{ allowed_origin: 'https://grant.invalid', permissions: { notes: ['readAll'] } }]))
  receive(source, [appContract()], 'no-op')
  expect(source.postMessage).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByTestId('consent-continue-as')) })
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'no-op', contractIndex: 0, status: 'approved' })
  expect(apply).not.toHaveBeenCalled()
})

it('real consent view settles an empty indexed batch without granting anything', async () => {
  mountView()
  const source = { postMessage: vi.fn() }
  receive(source, [], 'empty')
  expect(source.postMessage).not.toHaveBeenCalled()
  await act(async () => { fireEvent.click(screen.getByTestId('consent-continue-as')) })
  expect(source.postMessage).toHaveBeenCalledWith({ type: 'contract_response', requestId: 'empty', status: 'approved', contractCount: 0 }, 'https://caller.invalid')
  expect(apply).not.toHaveBeenCalled()
})

it('real consent skip denies outstanding rows rather than leaving the caller waiting', async () => {
  mountView()
  const source = { postMessage: vi.fn() }
  receive(source, [appContract(), appContract()], 'skip')
  await act(async () => { fireEvent.click(screen.getByTestId('consent-skip')) })
  expect(source.postMessage.mock.calls.map(([p]) => [p.contractIndex, p.status])).toEqual([[0, 'denied'], [1, 'denied']])
  expect(apply).not.toHaveBeenCalled()
})

it('vaulted account selection preserves unstarted requests for the selected account', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  vaultToken({ username: 'bob', provider: 'api.localhost', token: 'synthetic-bob' })
  receive(source, [appContract()], 'switch')
  act(() => I.current.switchAccount('bob', 'api.localhost'))
  expect(I.current.pendingContracts).toHaveLength(1)
  expect(I.current._contractReceived).toBe(true)
  expect(source.postMessage).not.toHaveBeenCalled()
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'switch', status: 'approved' })
})

it('login does not adopt the previous account grants or its late grant response', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, pending = deferred()
  act(() => I.current.setV3Contracts([{ allowed_origin: 'https://grant.invalid', permissions: { notes: ['readAll'] } }]))
  vi.mocked(fetch).mockImplementationOnce(() => pending.promise as Promise<Response>)
  act(() => I.current.v3ContractsLoad())
  receive(source, [appContract()], 'login')
  session.username = 'bob'; session.token = 'synthetic-bob'
  act(() => I.current.finishLogin())
  await act(async () => { pending.resolve(ok([{ allowed_origin: 'https://grant.invalid', permissions: { notes: ['readAll'] } }])) })
  expect(I.current.v3Contracts).toEqual([])
  expect(I.current.isContractGranted(I.current.pendingContracts[0])).toBe(false)
  expect(source.postMessage).not.toHaveBeenCalled()
})

it('mixed approve-all acknowledges a hidden subset grant without overwriting its superset', async () => {
  mountView()
  const source = { postMessage: vi.fn() }, pending = deferred()
  act(() => window.I.setV3Contracts([{ allowed_origin: 'https://grant.invalid', permissions: { notes: ['readAll', 'create'] } }]))
  receive(source, [appContract(), { kind: 'group', name: 'synthetic' }], 'mixed-no-op')
  const transport = vi.mocked(fetch).getMockImplementation()!
  vi.mocked(fetch).mockImplementation((...args) => String(args[0]).endsWith('/groups/create') ? pending.promise as Promise<Response> : transport(...args))
  await act(async () => { fireEvent.click(screen.getByTestId('consent-approve-all')) })
  expect(apply).not.toHaveBeenCalled()
  expect(source.postMessage.mock.calls.map(([p]) => p.contractIndex)).toEqual([0])
  await act(async () => { pending.resolve(ok()) })
  expect(source.postMessage.mock.calls.map(([p]) => p.contractIndex)).toEqual([0, 1])
})

it('a delayed close cannot close a newly selected account or replacement batch', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, close = vi.spyOn(window, 'close').mockImplementation(() => {})
  window.opener = { postMessage: vi.fn() }
  receive(source, [], 'closing')
  act(() => I.current.setUserConfirmed(true))
  act(() => I.current.goToApp())
  session.username = 'bob'; session.token = 'synthetic-bob'
  act(() => I.current.finishLogin())
  await act(async () => { vi.advanceTimersByTime(300) })
  expect(close).not.toHaveBeenCalled()
})

it('logout then login keeps unstarted consent reviewable without the previous grants', async () => {
  const I = mount(), source = { postMessage: vi.fn() }
  receive(source, [appContract()], 'relogin')
  act(() => I.current.logout())
  expect(I.current.pendingContracts).toHaveLength(1)
  session.username = 'bob'; session.token = 'synthetic-bob'
  act(() => I.current.finishLogin())
  expect(I.current.v3Contracts).toEqual([])
  await act(async () => { I.current.approveContract(I.current.pendingContracts[0]) })
  expect(source.postMessage.mock.calls[0][0]).toMatchObject({ requestId: 'relogin', status: 'approved' })
})

it('logout then same-account login preserves an unstarted request for handoff', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, opener = { postMessage: vi.fn() }
  window.opener = opener
  receive(source, [], 'same-account-relogin')
  act(() => I.current.logout())
  act(() => I.current.finishLogin())
  expect(source.postMessage).not.toHaveBeenCalled()
  act(() => I.current.goToApp())
  expect(source.postMessage).toHaveBeenCalledWith({
    type: 'contract_response', requestId: 'same-account-relogin', status: 'approved', contractCount: 0,
  }, 'https://caller.invalid')
  expect(opener.postMessage.mock.calls.some(([payload]) => payload.type === 'auth')).toBe(true)
})

it('real approve-all failure settles every row exactly once without retrying failed writes', async () => {
  mountView()
  const source = { postMessage: vi.fn() }
  apply.mockRejectedValueOnce(new Error('synthetic failure'))
  receive(source, [appContract(), appContract()], 'partial-failure')
  await act(async () => { fireEvent.click(screen.getByTestId('consent-approve-all')) })
  expect(source.postMessage.mock.calls.map(([p]) => [p.contractIndex, p.status]).sort())
    .toEqual([[0, 'error'], [1, 'approved']])
  expect(apply).toHaveBeenCalledTimes(2)
})

it('a replacement request fences the previous delayed close', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, close = vi.spyOn(window, 'close').mockImplementation(() => {})
  window.opener = { postMessage: vi.fn() }
  receive(source, [], 'closing')
  act(() => I.current.setUserConfirmed(true))
  act(() => I.current.goToApp())
  receive(source, [appContract()], 'replacement')
  await act(async () => { vi.advanceTimersByTime(300) })
  expect(close).not.toHaveBeenCalled()
  expect(I.current.pendingContracts).toHaveLength(1)
})

it('a lazy group request opens a separate consent popup after app login', async () => {
  const I = mount(), app = { postMessage: vi.fn() }, group = { postMessage: vi.fn() }
  const opener = { postMessage: vi.fn() }
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  window.opener = opener
  receive(app, [], 'app-login')
  act(() => I.current.setUserConfirmed(true))
  act(() => I.current.goToApp())
  expect(opener.postMessage.mock.calls.filter(([payload]) => payload.type === 'auth')).toHaveLength(1)
  await act(async () => { vi.advanceTimersByTime(300) })
  expect(close).toHaveBeenCalledOnce()
  act(() => I.current.initAuthenticator())
  receive(group, [{ kind: 'group', name: 'lazy-group' }], 'lazy-group')
  expect(I.current.pendingContracts).toHaveLength(1)
})

it('a completed empty batch does not prevent a new account credential handoff', async () => {
  const I = mount(), source = { postMessage: vi.fn() }, opener = { postMessage: vi.fn() }
  window.opener = opener
  const close = vi.spyOn(window, 'close').mockImplementation(() => {})
  receive(source, [], 'empty-handoff')
  act(() => I.current.setUserConfirmed(true))
  act(() => I.current.goToApp())
  act(() => I.current.logout())
  session.username = 'bob'; session.token = 'synthetic-bob'
  act(() => I.current.finishLogin())
  act(() => I.current.goToApp())
  expect(opener.postMessage.mock.calls.filter(([p]) => p.type === 'auth').map(([p]) => p.token))
    .toEqual(['synthetic-token', 'synthetic-bob'])
  expect(source.postMessage).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(300) })
  expect(close).toHaveBeenCalledTimes(1)
})
