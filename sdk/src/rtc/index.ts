/**
 * Optional RTC/P2P module — `web10-npm/rtc`.
 *
 * This subpath export provides WebRTC peer-to-peer connectivity
 * using PeerJS. It is optional: the core SDK has zero dependencies.
 *
 * @example
 * ```ts
 * import { createClient } from 'web10-npm'
 * import { createRTC } from 'web10-npm/rtc'
 *
 * const w = createClient()
 * const rtc = createRTC(w)
 *
 * rtc.initP2P((conn, data) => {
 *   console.log('received:', data)
 * })
 *
 * rtc.send('api.web10.app', 'bob', 'myapp.com', '', { text: 'hello' })
 * ```
 */

import type { V3Client } from '../v3'

// Lazy import — peerjs is a peer dependency, optional
let PeerClass: { new (id: string, opts: PeerJSOptions): PeerInstance } | null = null

/**
 * Set the PeerJS constructor. Call this before initP2P if bundling manually.
 */
export function setPeer(
  Peer: { new (id: string, opts: PeerJSOptions): PeerInstance },
): void {
  PeerClass = Peer
}

function getPeer(): { new (id: string, opts: PeerJSOptions): PeerInstance } {
  if (!PeerClass) {
    throw new Error(
      'PeerJS is not configured. Either:\n' +
      '  1. Install peerjs and import it: `import Peer from "peerjs"; import { setPeer } from "web10-npm/rtc"; setPeer(Peer)`\n' +
      '  2. Or use a bundler that auto-resolves the peer dependency.',
    )
  }
  return PeerClass
}

/**
 * Create an RTC/P2P connector.
 *
 * @param wapi - A web10 client instance
 * @returns An RTC connector for P2P communication
 */
export function createRTC(wapi: V3Client): RTCConnector {
  let peer: PeerInstance | null = null
  const outbound = new Map<string, PeerConnection>()
  const inbound = new Map<string, PeerConnection>()

  const connector: RTCConnector = {
    /** Generate a peer ID from web10 identity components */
    peerId(provider: string, user: string, origin: string, label: string = ''): string {
      return `${provider} ${user} ${origin} ${label}`.replaceAll('.', '_')
    },

    /** Initialize P2P and start listening for inbound connections */
    initP2P(onInbound: ((conn: PeerConnection, data: unknown) => void) | null, label: string = '', secure: boolean = true): void {
      const PC = getPeer()
      const token = wapi.readToken()
      if (!token) throw new Error('Cannot init P2P without a token')
      const id = this.peerId(token.provider, token.username, token.site, label)
      peer = new PC(id, {
        host: wapi.state.rtcServer,
        secure,
        port: secure ? 443 : 80,
        path: '/',
        token: `${wapi.state.token}~${label}`,
      })
      if (onInbound && peer) {
        peer.on('connection', (raw: unknown) => {
          const conn = raw as PeerConnection
          inbound.set(conn.peer, conn)
          conn.on('data', (data: unknown) => onInbound(conn, data))
          conn.on('close', () => inbound.delete(conn.peer))
        })
      }
    },

    /** Get or create an outbound connection to a peer */
    connect(provider: string, username: string, origin: string, label: string = ''): PeerConnection {
      if (!peer) throw new Error('P2P not initialized. Call initP2P first.')
      const id = this.peerId(provider, username, origin, label)
      const existing = outbound.get(id)
      if (existing) return existing
      const conn = peer.connect(id) as unknown as PeerConnection
      outbound.set(conn.peer, conn)
      conn.on('close', () => outbound.delete(conn.peer))
      return conn
    },

    /** Send data to a peer */
    send(provider: string, username: string, origin: string, label: string, data: unknown): { connected: boolean } {
      const conn = this.connect(provider, username, origin, label)
      if (conn.open) {
        conn.send(data)
        return { connected: true }
      } else {
        conn.on('open', () => conn.send(data))
        return { connected: false }
      }
    },
  }

  return connector
}

/**
 * RTC/P2P connector interface.
 */
export interface RTCConnector {
  /** Generate a peer ID */
  peerId(provider: string, user: string, origin: string, label?: string): string
  /** Initialize P2P */
  initP2P(onInbound: ((conn: PeerConnection, data: unknown) => void) | null, label?: string, secure?: boolean): void
  /** Get or create an outbound connection */
  connect(provider: string, username: string, origin: string, label?: string): PeerConnection
  /** Send data to a peer */
  send(provider: string, username: string, origin: string, label: string, data: unknown): { connected: boolean }
}

// ── PeerJS type declarations (minimal, to avoid requiring the full types) ──

interface PeerJSOptions {
  host: string
  secure: boolean
  port: number
  path: string
  token: string
}

interface PeerConnection {
  peer: string
  open: boolean
  send(data: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
}

interface PeerInstance {
  id: string
  on(event: string, handler: (...args: unknown[]) => void): void
  connect(id: string): PeerConnection
}
