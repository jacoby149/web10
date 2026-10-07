import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { V3Client } from '../v3'
import { createRTC, setPeer, type RTCConnector } from './index'

const session = 'session.jwt.secret'
const peerId = 'api_example alice app_example test'
let instances: FakePeer[] = []
let initiallyOpen = true
class FakePeer {
  open = initiallyOpen
  disconnected = false
  destroyed = false
  handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  constructor(public id: string, public options: {
    host: string; secure: boolean; port: number; path: string; token: string
  }) { instances.push(this) }
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }
  reconnect = vi.fn(() => { this.disconnected = false; this.open = true; this.emit('open') })
  destroy = vi.fn(() => { this.destroyed = true; this.emit('close') })
  connect() { throw new Error('not used') }
}
let rtc: RTCConnector
let fetchMock: ReturnType<typeof vi.fn>
function client(host = 'rtc.example'): V3Client {
  return {
    state: { token: session, rtcServer: host, iceServers: [{ urls: 'stun:example' }] },
    readToken: () => ({ provider: 'api.example', username: 'alice', site: 'app.example' }),
    getIceServers: vi.fn().mockResolvedValue([{ urls: 'stun:example' }]),
  } as unknown as V3Client
}
function reply(ticket = 'a'.repeat(43), id = peerId, ok = true) {
  return { ok, status: ok ? 200 : 401, json: async () => ({ ticket, peer_id: id, expires_in: 30 }) }
}
async function flush() { for (let i = 0; i < 10; i++) await Promise.resolve() }

beforeEach(() => {
  instances = []
  initiallyOpen = true
  vi.useFakeTimers()
  setPeer(FakePeer)
  fetchMock = vi.fn().mockResolvedValue(reply())
  vi.stubGlobal('fetch', fetchMock)
  rtc = createRTC(client())
})
afterEach(() => {
  rtc.destroy()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RTC admission tickets', () => {
  it('exchanges the JWT only in a POST body and uses only the opaque ticket in signaling', async () => {
    await rtc.initP2P(null, 'test')
    expect(fetchMock).toHaveBeenCalledWith('https://rtc.example/ticket', expect.objectContaining({
      method: 'POST', redirect: 'error', credentials: 'omit', signal: expect.any(AbortSignal),
      body: JSON.stringify({ token: session, label: 'test' }),
    }))
    expect(instances[0].id).toBe(peerId)
    expect(instances[0].options).toMatchObject({ token: 'a'.repeat(43), secure: true, port: 443 })
    expect(JSON.stringify(instances[0].options)).not.toContain(session)
  })

  it.each(['rtc.example', 'localhost.evil.example', 'localhost@evil.example'])('denies insecure production host %s before sending credentials', async (host) => {
    rtc = createRTC(client(host))
    await expect(rtc.initP2P(null, 'test', false)).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(instances).toHaveLength(0)
  })

  it.each(['localhost:3001', 'rtc.localhost', '127.0.0.1:3001', '[::1]:3001'])('permits explicit local HTTP signaling for %s', async (host) => {
    rtc = createRTC(client(host))
    await rtc.initP2P(null, 'test', false)
    expect(fetchMock.mock.calls[0][0]).toBe(`http://${host}/ticket`)
    expect(instances[0].options.secure).toBe(false)
  })

  it.each(['rtc.example/path', 'rtc.example?token=secret', 'user:secret@rtc.example', 'rtc.example/#secret'])('rejects malformed signaling recipient %s', async (host) => {
    rtc = createRTC(client(host))
    await expect(rtc.initP2P(null, 'test')).rejects.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([reply('bad'), reply('a'.repeat(43), 'another identity'), reply('a'.repeat(43), peerId, false)])('fails closed on invalid ticket or identity response', async (response) => {
    fetchMock.mockResolvedValue(response)
    await expect(rtc.initP2P(null, 'test')).rejects.toThrow()
    expect(instances).toHaveLength(0)
  })

  it('rejects failed ticket requests without creating a peer', async () => {
    fetchMock.mockRejectedValue(new Error('network failed'))
    await expect(rtc.initP2P(null, 'test')).rejects.toThrow()
    expect(instances).toHaveLength(0)
  })

  it('waits for slow ICE discovery before minting the short-lived ticket', async () => {
    const wapi = client()
    wapi.state.iceServers = undefined
    let finish!: () => void
    vi.mocked(wapi.getIceServers).mockReturnValueOnce(new Promise(resolve => {
      finish = () => resolve([{ urls: 'stun:example' }])
    }))
    rtc = createRTC(wapi)
    const initializing = rtc.initP2P(null, 'test')
    await flush()
    await vi.advanceTimersByTimeAsync(31_000)
    expect(fetchMock).not.toHaveBeenCalled()
    expect(instances).toHaveLength(0)
    finish()
    await initializing
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(instances).toHaveLength(1)
  })

  it('refreshes a consumed ticket on reconnect and leaves the existing peer alive', async () => {
    await rtc.initP2P(null, 'test')
    fetchMock.mockResolvedValue(reply('b'.repeat(43)))
    const peer = instances[0]
    peer.disconnected = true
    peer.emit('disconnected')
    peer.emit('disconnected')
    await flush()
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(peer.options.token).toBe('b'.repeat(43))
    expect(peer.reconnect).toHaveBeenCalledTimes(1)
    expect(peer.destroy).not.toHaveBeenCalled()
  })

  it('backs off failed renewal and stops renewing after logout', async () => {
    await rtc.initP2P(null, 'test')
    fetchMock.mockRejectedValue(new Error('unreachable'))
    instances[0].disconnected = true
    instances[0].emit('disconnected')
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    rtc.destroy()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(instances[0].destroy).toHaveBeenCalled()
  })

  it('cannot reconnect after logout while a renewal request is in flight', async () => {
    await rtc.initP2P(null, 'test')
    let release!: (value: unknown) => void
    fetchMock.mockReturnValue(new Promise(resolve => { release = resolve }))
    const peer = instances[0]
    peer.disconnected = true
    peer.emit('disconnected')
    rtc.destroy()
    release(reply('b'.repeat(43)))
    await flush()
    expect(peer.reconnect).not.toHaveBeenCalled()
  })

  it('does not report a signaling timeout as ready', async () => {
    initiallyOpen = false
    const result = rtc.initP2P(null, 'test')
    const rejection = expect(result).rejects.toThrow()
    await flush()
    await vi.advanceTimersByTimeAsync(10_000)
    await rejection
    expect(instances[0].destroy).toHaveBeenCalled()
  })
})
