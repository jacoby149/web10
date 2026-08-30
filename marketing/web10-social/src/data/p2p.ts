// ── p2p.ts — WebRTC P2P seam (real-time message delivery) ───────────────────
// The group + CRUD is the source of truth (a message is a `posts` doc in the
// DM group). P2P is the fast path: when both parties are online, a just-
// persisted message is also pushed over a WebRTC data channel so the recipient
// sees it instantly instead of on their next read. The pattern is the one the
// messages-demo runs (marketing-ui/public/docs/messages): CRUD is truth, P2P
// is the nudge that triggers a re-read.
//
// The connector is the SDK's optional `web10-npm/rtc` module (PeerJS under the
// hood). PeerJS is an optional peer dependency of the SDK, so the app must
// install it and inject the constructor via setPeer before initP2P.
//
// Presence model: the P2P peer connection IS the presence. A user is "online"
// while their local peer is open (connected to the signaling server) — that's
// when they're reachable over P2P. Opting out of real-time (the settings
// toggle) means no peer is initialized, so the user is offline: messages still
// work via CRUD, just without the instant nudge.
//
// Opt-in: initP2P is only called when the user's `p2pEnabled` setting is on
// (default on). App.tsx gates the call on sign-in; DmsScreen consumes the
// inbound nudge + fires the outbound one on send.

import { getV3Client } from './v3';
import { createRTC, setPeer as sdkSetPeer, type RTCConnector } from 'web10-npm/rtc';

const LOG = (...args: unknown[]) => console.log('[p2p]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[p2p]', ...args);

// The label scopes the P2P connection to this app. Both parties must use the
// same label + site to match. Distinct from the demo's 'messages-demo' so the
// two surfaces never collide on the signaling server.
const P2P_LABEL = 'web10-social';

// Minimal shape of an inbound P2P connection (the SDK's PeerConnection is not
// re-exported). We only need the peer id (to know who sent it) — the payload
// mirrors the CRUD message body and the handler re-reads from the group.
export interface P2PInboundConn {
  peer: string;
}

type InboundListener = (conn: P2PInboundConn, data: unknown) => void;

let rtc: RTCConnector | null = null;
let p2pReady = false;
let site = 'web10';
const inboundListeners = new Set<InboundListener>();

// Presence: the set of peer ids we've had a live P2P connection to in this
// session (a successful send, or an inbound message). This is the honest
// "online" signal available without a server-side presence service — a peer is
// online while we can reach them over P2P. Cleared on teardown (sign-out).
const onlinePeers = new Set<string>();
const presenceListeners = new Set<() => void>();

function markOnline(peerId: string): void {
  if (!peerId || onlinePeers.has(peerId)) return;
  onlinePeers.add(peerId);
  LOG('presence — online:', peerId);
  for (const l of presenceListeners) {
    try {
      l();
    } catch (e) {
      LOG_ERR('presence listener threw:', e);
    }
  }
}

/**
 * Inject the PeerJS constructor. Must be called before initP2P (the SDK's
 * rtc module keeps peerjs as an optional peer dependency).
 */
export function setPeer(
  Peer: { new (id: string, opts: unknown): unknown },
): void {
  sdkSetPeer(Peer as never);
  LOG('setPeer — PeerJS injected');
}

/** Whether the local peer is open (signaling connected) — i.e. online. */
export function isP2PReady(): boolean {
  return p2pReady;
}

/**
 * Subscribe to inbound P2P messages. Returns an unsubscribe function.
 * The handler is called with the sender's peer id + the raw payload (which
 * mirrors the persisted message body).
 */
export function onP2PInbound(listener: InboundListener): () => void {
  inboundListeners.add(listener);
  return () => {
    inboundListeners.delete(listener);
  };
}

function dispatchInbound(conn: P2PInboundConn, data: unknown): void {
  LOG('inbound — from peer:', conn.peer, 'data:', JSON.stringify(data));
  // A live inbound means the sender is online right now.
  markOnline(conn.peer);
  for (const listener of inboundListeners) {
    try {
      listener(conn, data);
    } catch (e) {
      LOG_ERR('inbound listener threw:', e);
    }
  }
}

/**
 * Initialize the P2P peer. Resolves true once the local peer is open (online),
 * false if there's no token or the signaling server is unreachable. Idempotent
 * — a second call while ready is a no-op.
 *
 * The token must be present (set on sign-in) — the SDK reads it for the peer
 * id + the signaling auth token.
 */
export async function initP2P(): Promise<boolean> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) {
    LOG('initP2P — no token, skipping (not signed in)');
    return false;
  }
  if (rtc && p2pReady) {
    LOG('initP2P — already ready, no-op');
    return true;
  }
  site = token.site || 'web10';
  LOG('initP2P — initializing, rtcServer:', w.state.rtcServer, 'label:', P2P_LABEL, 'site:', site);
  try {
    rtc = createRTC(w);
    // secure: the signaling server is https in prod; the SDK picks the port
    // from this flag. Local dev (http) passes false.
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:';
    await rtc.initP2P((conn, data) => dispatchInbound(conn as P2PInboundConn, data), P2P_LABEL, secure);
    p2pReady = true;
    const id = rtc.peerId(token.provider, token.username, site, P2P_LABEL);
    LOG('initP2P — READY, peerId:', id);
    return true;
  } catch (e) {
    LOG_ERR('initP2P FAILED:', e);
    p2pReady = false;
    return false;
  }
}

/**
 * Fire-and-forget P2P delivery of a just-persisted message to the recipient.
 * Returns true if the data went out over an open channel, false if P2P isn't
 * ready (CRUD-only delivery — the message still lands via the group, the
 * recipient just won't get the instant nudge).
 */
export function sendP2P(
  toProvider: string,
  toUsername: string,
  payload: unknown,
): boolean {
  if (!rtc || !p2pReady) {
    LOG('sendP2P — P2P not ready, skipping (CRUD-only delivery)');
    return false;
  }
  LOG('sendP2P — sending to', `${toProvider}/${toUsername}`, 'site:', site, 'label:', P2P_LABEL);
  try {
    const result = rtc.send(toProvider, toUsername, site, P2P_LABEL, payload);
    LOG('sendP2P — result:', JSON.stringify(result));
    if (result.connected) {
      // A connected send means the recipient answered over P2P — they're online.
      markOnline(rtc.peerId(toProvider, toUsername, site, P2P_LABEL));
    }
    return result.connected;
  } catch (e) {
    LOG_ERR('sendP2P FAILED:', e);
    return false;
  }
}

/** The peer id for a user (to compare against the online set). Null if not ready. */
export function peerIdFor(provider: string, username: string): string | null {
  if (!rtc) return null;
  return rtc.peerId(provider, username, site, P2P_LABEL);
}

/** The set of peer ids we've had a live P2P connection to this session. */
export function getOnlinePeers(): ReadonlySet<string> {
  return onlinePeers;
}

/** Subscribe to presence-set changes. Returns an unsubscribe function. */
export function onPresenceChange(listener: () => void): () => void {
  presenceListeners.add(listener);
  return () => {
    presenceListeners.delete(listener);
  };
}

/**
 * Tear down the P2P peer (sign-out). Clears the ready flag + listeners so a
 * subsequent sign-in as a different user starts clean.
 */
export function teardownP2P(): void {
  p2pReady = false;
  rtc = null;
  inboundListeners.clear();
  if (onlinePeers.size > 0) {
    onlinePeers.clear();
    for (const l of presenceListeners) {
      try {
        l();
      } catch (e) {
        LOG_ERR('presence listener threw:', e);
      }
    }
  }
  LOG('teardownP2P — torn down');
}
