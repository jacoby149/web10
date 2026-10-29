// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createRTC, defaultIceServers, setPeer } from './index'
import type { V3Client } from '../v3'

const sdk = fileURLToPath(new URL('../../', import.meta.url))
const shipped = readFileSync(join(sdk, '../marketing/marketing-ui/public/docs/rtc.js'), 'utf8')
let directory: string
let canonical: string

beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'web10-rtc-artifact-'))
  const staging = join(directory, 'sdk')
  cpSync(join(sdk, 'src/rtc'), join(staging, 'src/rtc'), { recursive: true })
  cpSync(join(sdk, 'package.json'), join(staging, 'package.json'))
  const output = join(directory, 'marketing/marketing-ui/public/docs')
  mkdirSync(output, { recursive: true })
  execFileSync('bun', ['run', 'build:rtc:browser'], { cwd: staging, stdio: 'pipe' })
  canonical = readFileSync(join(output, 'rtc.js'), 'utf8')
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

function browserAPI(code: string) {
  const host = {} as { web10rtc: { createRTC: typeof createRTC; setPeer: typeof setPeer } }
  // Inert peers start open, so readiness timers need not keep the process alive.
  runInNewContext(code, { window: host, setTimeout: vi.fn() })
  expect(Object.keys(host)).toEqual(['web10rtc'])
  expect(Object.keys(host.web10rtc).sort()).toEqual(['createRTC', 'setPeer'])
  return host.web10rtc
}

class Events {
  handlers = new Map<string, ((...args: unknown[]) => void)[]>()
  on(event: string, handler: (...args: unknown[]) => void) {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), handler])
  }
  emit(event: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(event) ?? []) handler(...args)
  }
}

class Channel extends Events {
  open = true
  send = vi.fn()
  constructor(public peer: string) { super() }
  close() { this.emit('close') }
}

describe('docs RTC producer and runtime parity', () => {
  it('builds the public RTC asset in Docker and gates marketing-only changes in SDK CI', () => {
    const docker = readFileSync(join(sdk, '../marketing/marketing-ui/Dockerfile'), 'utf8')
    expect(docker).toContain('RUN bunx bun@1.3.14 run build:rtc:browser')
    expect(docker.indexOf('run build:rtc:browser')).toBeLessThan(docker.indexOf('RUN bun run build\n'))
    const workflow = readFileSync(join(sdk, '../.github/workflows/js-ci.yml'), 'utf8')
    const filter = workflow.slice(workflow.indexOf('            sdk:'), workflow.indexOf('            web10-social:'))
    for (const path of ['sdk/**', 'marketing/marketing-ui/public/docs/rtc.js', 'marketing/marketing-ui/Dockerfile']) {
      expect(filter).toContain(`- ${path}`)
    }
  })

  it('ships the SHA-256 of a fresh tracked-wrapper build', () => {
    const hash = (code: string) => createHash('sha256').update(code).digest('hex')
    expect(hash(shipped)).toBe(hash(canonical))
  })

  for (const runtime of ['source', 'fresh', 'shipped'] as const) {
    it(`${runtime}: forwards replies on an outbound channel`, async () => {
      const api = runtime === 'source' ? { createRTC, setPeer } : browserAPI(runtime === 'fresh' ? canonical : shipped)
      const channel = new Channel('remote')
      class Peer extends Events {
        id = 'local'
        open = true
        connect() { return channel }
      }
      api.setPeer(Peer)
      const rtc = api.createRTC({
        state: { token: 'SYNTHETIC', rtcServer: 'rtc.invalid', iceServers: [{ urls: 'stun:stun.invalid' }] },
        readToken: () => ({ provider: 'node.invalid', username: 'alice', site: 'app.invalid' }),
      } as unknown as V3Client)
      const receive = vi.fn()
      await rtc.initP2P(receive)
      rtc.connect('node.invalid', 'bob', 'app.invalid')
      channel.emit('data', 'synthetic reply')
      expect(receive).toHaveBeenCalledExactlyOnceWith(channel, 'synthetic reply')
    })

    for (const ice of ['explicit', 'fetched', 'fallback'] as const) {
      it(`${runtime}: ${ice} ICE, constructor, callbacks, cache/close and send`, async () => {
        const api = runtime === 'source' ? { createRTC, setPeer } : browserAPI(runtime === 'fresh' ? canonical : shipped)
        const peers: Peer[] = []
        class Peer extends Events {
          open = true
          connect = vi.fn((id: string) => new Channel(id))
          constructor(public id: string, public options: unknown) { super(); peers.push(this) }
        }
        api.setPeer(Peer)
        expect(peers).toHaveLength(0)
        const servers = [{ urls: 'turn:relay.invalid', username: 'synthetic', credential: 'synthetic' }]
        const getIceServers = vi.fn(async () => {
          if (ice === 'fallback') throw new Error('synthetic offline helper')
          return servers
        })
        const w = {
          state: { token: 'SYNTHETIC', rtcServer: 'rtc.invalid', iceServers: ice === 'explicit' ? servers : [] },
          readToken: () => ({ provider: 'node.invalid', username: 'alice', site: 'app.invalid' }),
          getIceServers,
        } as unknown as V3Client
        const rtc = api.createRTC(w)
        expect(Object.keys(rtc).sort()).toEqual(['connect', 'initP2P', 'peerId', 'send'])
        expect(() => rtc.connect('node.invalid', 'bob', 'app.invalid')).toThrow('P2P not initialized')
        const inbound = vi.fn()
        await rtc.initP2P(inbound, 'demo', false)
        const peer = peers[0]
        expect(peers).toHaveLength(1)
        expect(peer.id).toBe('node_invalid alice app_invalid demo')
        expect(peer.options).toEqual({ host: 'rtc.invalid', secure: false, port: 80, path: '/', token: 'SYNTHETIC~demo', iceServers: ice === 'fallback' ? defaultIceServers() : servers })
        expect(getIceServers).toHaveBeenCalledTimes(ice === 'explicit' ? 0 : 1)
        const incoming = new Channel('incoming')
        peer.emit('connection', incoming)
        incoming.emit('data', { inbound: true })
        expect(inbound).toHaveBeenLastCalledWith(incoming, { inbound: true })
        incoming.close()
        const args = ['node.invalid', 'bob', 'app.invalid', 'demo'] as const
        const outgoing = rtc.connect(...args) as Channel
        expect(outgoing.peer).toBe('node_invalid bob app_invalid demo')
        expect(rtc.connect(...args)).toBe(outgoing)
        expect(peer.connect).toHaveBeenCalledTimes(1)
        outgoing.emit('data', { reply: true })
        expect(inbound).toHaveBeenCalledTimes(2)
        expect(inbound).toHaveBeenLastCalledWith(outgoing, { reply: true })
        expect(rtc.send(...args, { immediate: true })).toEqual({ connected: true })
        expect(outgoing.send).toHaveBeenLastCalledWith({ immediate: true })
        outgoing.open = false
        expect(rtc.send(...args, { deferred: true })).toEqual({ connected: false })
        expect(outgoing.send).toHaveBeenCalledTimes(1)
        outgoing.emit('open')
        expect(outgoing.send).toHaveBeenLastCalledWith({ deferred: true })
        outgoing.close()
        expect(rtc.connect(...args)).not.toBe(outgoing)
        expect(peer.connect).toHaveBeenCalledTimes(2)
        await rtc.initP2P(null)
        expect(peers[1].id).toBe('node_invalid alice app_invalid ')
        expect(peers[1].options).toMatchObject({ secure: true, port: 443, token: 'SYNTHETIC~' })
      })
    }
  }
})
