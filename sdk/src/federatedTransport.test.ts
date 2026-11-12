import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFederatedTransport, nodeOrigin } from './federatedTransport'

afterEach(() => vi.restoreAllMocks())

function setup(credential: string | null = 'explicit-home-token', fetcher = vi.fn<typeof fetch>()) {
  const owner = new AbortController()
  const state = { current: true }
  const transport = createFederatedTransport({ approvedOrigin: 'https://node.example', credential,
    signal: owner.signal, isCurrent: () => state.current, fetcher })
  return { transport, fetcher, owner, state }
}

describe('explicit federation transport', () => {
  it.each([null, 'explicit-home-token'])('directory dispatch preserves credential mode %s and keeps secrets out of GET URLs', async credential => {
    const { transport, fetcher } = setup(credential)
    fetcher.mockResolvedValue(Response.json({ users: [], sort: 'newest' }))
    await transport.post('users/directory', { limit: 10, offset: 2, sort: 'newest' })
    const payload = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
    expect(payload.token).toBe(credential ?? undefined)
    fetcher.mockResolvedValue(Response.json({ groups: [], sort: 'popular' }))
    await transport.post('groups/directory', { limit: 10, offset: 2, sort: 'popular' })
    expect(fetcher.mock.calls[1][0]).toBe('https://node.example/v3/groups/directory?limit=10&offset=2&sort=popular')
    expect(fetcher.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined, credentials: 'omit', redirect: 'error' })
    expect(String(fetcher.mock.calls[1][0])).not.toContain('explicit-home-token')
    for (const body of [{ limit: 10, offset: 0, sort: 'https://evil.example' }, { limit: 10, offset: 0, sort: 'newest', token: 'override' }, { limit: 10, offset: 0, sort: 'newest', redirect: 'evil' }]) {
      await expect(transport.post('groups/directory', body)).rejects.toThrow()
    }
    expect(fetcher).toHaveBeenCalledTimes(2)
    transport.dispose()
  })
  it.each(['http://node.example', 'https://u:p@node.example', 'https://node.example/path',
    'https://node.example?x', 'https://node.example#x', 'https://node.example.', 'https://localhost'])('rejects invalid origin %s', value => {
    expect(() => nodeOrigin(value)).toThrow()
  })

  it('construction has no network or ambient credential side effects', async () => {
    const { transport, fetcher } = setup()
    expect(fetcher).not.toHaveBeenCalled()
    fetcher.mockResolvedValue(Response.json({ rows: [] }))
    await transport.post('query', { sql: 'SELECT doc_id FROM posts' })
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://node.example/v3/query')
    expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer' })
    expect(JSON.parse(init!.body as string).token).toBe('explicit-home-token')
    expect(init!.headers).toEqual({ 'Content-Type': 'application/json' })
    transport.dispose()
  })

  it('public mode never borrows cookies and cannot manage groups or grants', async () => {
    document.cookie = 'token=ambient-secret;path=/'
    const { transport, fetcher } = setup(null)
    fetcher.mockResolvedValue(Response.json([]))
    await transport.post('read', { service: 'posts' })
    expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ service: 'posts' })
    await expect(transport.post('groups/join', {})).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
    document.cookie = 'token=;max-age=0;path=/'
    transport.dispose()
  })

  it.each(['https://evil.example', '../read', 'read?redirect=x', 'login'])('rejects action injection %s', async action => {
    const { transport, fetcher } = setup()
    await expect(transport.post(action, {})).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    transport.dispose()
  })

  it('rejects credential override and oversized bodies before dispatch', async () => {
    const { transport, fetcher } = setup()
    await expect(transport.post('read', { token: 'different' })).rejects.toThrow()
    await expect(transport.post('read', { data: 'x'.repeat(256 * 1024) })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    transport.dispose()
  })

  it.each([null, 'explicit-home-token'])('serialization hooks cannot change credential mode %s', async credential => {
    const { transport, fetcher } = setup(credential)
    await expect(transport.post('read', {
      toJSON: () => ({ token: 'body-controlled-token' }),
    })).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
    transport.dispose()
  })

  it('serialization exceptions do not echo private content', async () => {
    const { transport } = setup()
    await expect(transport.post('read', { nested: { toJSON() { throw Error('SYNTHETIC_PRIVATE_BODY') } } }))
      .rejects.not.toThrow('SYNTHETIC_PRIVATE_BODY')
    transport.dispose()
  })

  it('denial never retries anonymously or leaks server error content', async () => {
    const { transport, fetcher } = setup()
    fetcher.mockResolvedValue(new Response('secret private error', { status: 403 }))
    await expect(transport.post('query', {})).rejects.toThrow('Node request failed')
    expect(fetcher).toHaveBeenCalledTimes(1)
    transport.dispose()
  })

  it('does not preserve external exceptions that impersonate an internal error', async () => {
    const external = Object.assign(new Error('Oversized node response'), {
      request: { token: 'SYNTHETIC_PRIVATE_REQUEST_TOKEN' },
      cause: new Error('SYNTHETIC_PRIVATE_REQUEST_TOKEN'),
    })
    const { transport } = setup('owned-token', vi.fn(async () => { throw external }))
    const error = await transport.post('read', {}).catch(error => error)
    expect(error).not.toBe(external)
    expect(error).not.toHaveProperty('request')
    expect(error).not.toHaveProperty('cause')
    expect(error.message).toBe('Node request failed or scope ended')
    transport.dispose()
  })

  it('rejects late-account responses and aborts active work when owner ends', async () => {
    const { transport, fetcher, state, owner } = setup()
    let release!: (value: Response) => void
    fetcher.mockImplementation(() => new Promise(resolve => { release = resolve }))
    const pending = transport.post('query', {})
    const denied = expect(pending).rejects.toThrow()
    state.current = false
    owner.abort()
    expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true)
    release(Response.json({ rows: ['old-account'] }))
    await denied
    await expect(transport.post('read', {})).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('bounds actual live work and queued work, even when abort is ignored', async () => {
    const { transport, fetcher, owner } = setup()
    const releases: ((value: Response) => void)[] = []
    fetcher.mockImplementation(() => new Promise(resolve => releases.push(resolve)))
    const pending = Array.from({ length: 68 }, () => transport.post('read', {}).catch(() => null))
    expect(fetcher).toHaveBeenCalledTimes(4)
    await expect(transport.post('read', {})).rejects.toThrow('queue full')
    owner.abort()
    expect(fetcher).toHaveBeenCalledTimes(4)
    releases.forEach(release => release(Response.json([])))
    await Promise.all(pending)
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('enforces declared and streamed response byte ceilings', async () => {
    const { transport, fetcher } = setup()
    fetcher.mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Length': '1048577' } }))
    await expect(transport.post('read', {})).rejects.toThrow()
    fetcher.mockResolvedValueOnce(new Response('x'.repeat(1048577)))
    await expect(transport.post('read', {})).rejects.toThrow('Oversized node response')
    transport.dispose()
  })

  it.each(['redirected', 'wrong-origin'])('rejects %s response metadata before reading data', async kind => {
    const { transport, fetcher } = setup()
    const response = Response.json({ rows: ['not-authority'] })
    Object.defineProperty(response, kind === 'redirected' ? 'redirected' : 'url', {
      value: kind === 'redirected' ? true : 'https://other.example/v3/read',
    })
    fetcher.mockResolvedValue(response)
    await expect(transport.post('read', {})).rejects.toThrow()
    transport.dispose()
  })

  it('does not dispatch from an already-aborted owner', async () => {
    const owner = new AbortController()
    owner.abort()
    const fetcher = vi.fn<typeof fetch>()
    const transport = createFederatedTransport({ approvedOrigin: 'https://node.example',
      credential: 'explicit-token', signal: owner.signal, isCurrent: () => true, fetcher })
    await expect(transport.post('read', {})).rejects.toThrow()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('timeout aborts but does not release an underlying ignored-abort slot', async () => {
    vi.useFakeTimers()
    const { transport, fetcher, owner } = setup()
    const releases: ((value: Response) => void)[] = []
    fetcher.mockImplementation(() => new Promise(resolve => releases.push(resolve)))
    const pending = Array.from({ length: 5 }, () => transport.post('read', {}).catch(() => null))
    try {
      await vi.advanceTimersByTimeAsync(10000)
      expect(fetcher).toHaveBeenCalledTimes(4)
      expect(fetcher.mock.calls.every(([, init]) => init!.signal!.aborted)).toBe(true)
      releases[0](Response.json([]))
      await pending[0]
      expect(fetcher).toHaveBeenCalledTimes(5)
      owner.abort()
      releases.slice(1).forEach(release => release(Response.json([])))
      await Promise.all(pending)
    } finally { transport.dispose(); vi.useRealTimers() }
  })

  it('does not publish a result after expiry while streaming', async () => {
    const { transport, fetcher, state } = setup()
    let stream!: ReadableStreamDefaultController<Uint8Array>
    fetcher.mockResolvedValue(new Response(new ReadableStream({ start(controller) { stream = controller } })))
    const pending = transport.post('read', {})
    const denied = expect(pending).rejects.toThrow()
    await Promise.resolve()
    state.current = false
    stream.enqueue(new TextEncoder().encode('[]'))
    stream.close()
    await denied
    transport.dispose()
  })
})
