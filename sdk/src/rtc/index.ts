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

// A minimal RTCIceServer (the shape RTCPeerConnection.configuration.iceServers
// accepts). Kept as a plain interface so the SDK stays dependency-free.
export interface RTCIceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

// The default ICE servers: a robust set of STUN servers. Without an explicit
// `iceServers`, PeerJS falls back to a single Google STUN that is rate-limited
// and intermittently unreachable — a direct cause of the "handshake goes one
// way" flakiness. Multiple STUNs give ICE more candidates to work with.
//
// TURN is NOT in the default: it requires per-node credentials (a coturn
// deployment + auth), so it is supplied via the `iceServers` option when a node
// has one. STUN-only is the correct default for the open, self-hostable model
// (D41) — it works on most networks and degrades to a relay-less connection on
// the rare symmetric NAT.
export function defaultIceServers(): RTCIceServer[] {
  return [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ]
}

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
  // The app's inbound handler, kept so outbound connections can also deliver
  // data to it. A pong (or any reply) sent back over a channel WE opened is
  // received as `data` on that outbound connection — without wiring it, a
  // reply only travels one way (the "handshake goes one way" flakiness).
  let onInboundRef: ((conn: PeerConnection, data: unknown) => void) | null = null

  const connector: RTCConnector = {
    /** Generate a peer ID from web10 identity components */
    peerId(provider: string, user: string, origin: string, label: string = ''): string {
      return `${provider} ${user} ${origin} ${label}`.replaceAll('.', '_')
    },

    /**
     * Initialize P2P and start listening for inbound connections.
     *
     * Returns a promise that resolves once the local peer is `open` (its
     * signaling connection is established), so callers can wait for readiness
     * before calling `connect`/`send`. PeerJS drops a `connect()` issued
     * before `open`, so sending too early silently loses the message. The
     * promise also resolves after a 10s timeout so an unreachable signaling
     * server cannot hang the caller forever.
     */
    initP2P(onInbound: ((conn: PeerConnection, data: unknown) => void) | null, label: string = '', secure: boolean = true): Promise<void> {
      const PC = getPeer()
      const token = wapi.readToken()
      if (!token) throw new Error('Cannot init P2P without a token')
      const id = this.peerId(token.provider, token.username, token.site, label)
      // ICE servers: the node's configured set (a TURN-capable node supplies
      // its own via the client's `iceServers`), else the robust STUN default.
      // Without this, PeerJS falls back to a single rate-limited Google STUN.
      const iceServers: RTCIceServer[] =
        wapi.state.iceServers && wapi.state.iceServers.length > 0
          ? wapi.state.iceServers
          : defaultIceServers()
      peer = new PC(id, {
        host: wapi.state.rtcServer,
        secure,
        port: secure ? 443 : 80,
        path: '/',
        token: `${wapi.state.token}~${label}`,
        iceServers,
      })
      if (onInbound && peer) {
        onInboundRef = onInbound
        peer.on('connection', (raw: unknown) => {
          const conn = raw as PeerConnection
          inbound.set(conn.peer, conn)
          conn.on('data', (data: unknown) => onInbound(conn, data))
          conn.on('close', () => inbound.delete(conn.peer))
        })
      }
      return new Promise<void>((resolve) => {
        if (!peer) {
          resolve()
          return
        }
        if (peer.open) {
          resolve()
          return
        }
        peer.on('open', () => resolve())
        setTimeout(resolve, 10000)
      })
    },

    /** Get or create an outbound connection to a peer */
    connect(provider: string, username: string, origin: string, label: string = ''): PeerConnection {
      if (!peer) throw new Error('P2P not initialized. Call initP2P first.')
      const id = this.peerId(provider, username, origin, label)
      const existing = outbound.get(id)
      if (existing) return existing
      const conn = peer.connect(id) as unknown as PeerConnection
      outbound.set(conn.peer, conn)
      // Deliver data received over THIS (outbound) channel to the app's
      // inbound handler too — a reply/pong sent back over a channel we opened
      // arrives as `data` here. Without this, replies only travel one way.
      conn.on('data', (data: unknown) => {
        if (onInboundRef) onInboundRef(conn, data)
      })
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
  /** Initialize P2P (resolves when the local peer is open) */
  initP2P(onInbound: ((conn: PeerConnection, data: unknown) => void) | null, label?: string, secure?: boolean): Promise<void>
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
  iceServers?: RTCIceServer[]
}

interface PeerConnection {
  peer: string
  open: boolean
  send(data: unknown): void
  on(event: string, handler: (...args: unknown[]) => void): void
  /** Close the channel (drops a half-dead connection so a fresh one can be opened). */
  close(): void
}

interface PeerInstance {
  id: string
  open: boolean
  on(event: string, handler: (...args: unknown[]) => void): void
  connect(id: string): PeerConnection
}
