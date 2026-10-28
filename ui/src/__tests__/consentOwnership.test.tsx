import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import useInterface from '../interfaces/Interface'

vi.mock('../interfaces/authAdapter', () => ({ default: () => ({ v3: {
  state: { token: 'synthetic-token' },
  readToken: () => ({ username: 'alice', provider: 'api.localhost', expires: '2099-01-01' }),
  getProfile: async () => ({}),
} }) }))

const ok = (value: unknown = []) => ({ ok: true, json: async () => value })
let apply = vi.fn()
let subscriptions: ReturnType<typeof vi.spyOn>
beforeEach(() => {
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
  for (const contracts of [[], [null], [undefined], new Array(1)]) receive(source, contracts as object[], 'invalid-shape')
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
  expect(a.postMessage).not.toHaveBeenCalled()
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
