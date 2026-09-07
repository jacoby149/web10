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
import { API_ORIGIN } from '../lib/origins';
import { createRTC, setPeer as sdkSetPeer, type RTCConnector } from 'web10-npm/rtc';

const LOG = (...args: unknown[]) => console.log('[p2p]', ...args);
const LOG_ERR = (...args: unknown[]) => console.error('[p2p]', ...args);

// The label scopes the P2P connection to this app. Both parties must use the
// same label + site to match. Distinct from the demo's 'messages-demo' so the
// two surfaces never collide on the signaling server.
const P2P_LABEL = 'web10-social';

// Minimal shape of an inbound P2P connection (the SDK's PeerConnection is not
// re-exported). We need the peer id (to know who sent it) — the payload
// mirrors the CRUD message body and the handler re-reads from the group — and
// the `on` hook (to mark the peer offline when their connection closes).
export interface P2PInboundConn {
  peer: string;
  on?: (event: string, handler: () => void) => void;
}

type InboundListener = (conn: P2PInboundConn, data: unknown) => void;

let rtc: RTCConnector | null = null;
let p2pReady = false;
let site = 'web10';
const inboundListeners = new Set<InboundListener>();

// Presence: the set of peer ids we currently consider online. A peer goes
// online on a live P2P signal (a successful send, or an inbound message) and
// goes offline when their connection closes (immediate) or after a TTL of no
// activity (backstop, in case a close event is missed — e.g. the page was
// backgrounded and the socket dropped silently). This is the honest "online"
// signal available without a server-side presence service. Cleared on teardown.
const onlinePeers = new Set<string>();
// lastSeen: peerId → last live-signal timestamp. Drives the TTL sweep.
const lastSeen = new Map<string, number>();
// peerIdentity: peerId → {provider, username}. Lets the heartbeat re-probe a
// tracked peer (rtc.connect needs provider+username, not the opaque peer id).
const peerIdentity = new Map<string, { provider: string; username: string }>();
const presenceListeners = new Set<() => void>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

// A peer is considered online for this long after their last live signal. The
// sweep runs more often than the TTL so the dot flips to gray promptly.
const PRESENCE_TTL_MS = 60_000;
const SWEEP_INTERVAL_MS = 15_000;

// The heartbeat re-probes every tracked peer on an interval shorter than the
// TTL. Two jobs: (1) it keeps the data channel to each peer WARM, so a send
// goes out instantly instead of paying the WebRTC handshake on the first
// message; (2) it refreshes the TTL, so a peer who's online but quiet (no
// messages flowing) doesn't flip to offline after 60s of silence. This is what
// makes presence + delivery work without the other party sending anything.
const HEARTBEAT_INTERVAL_MS = 25_000;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function notifyPresence(): void {
  for (const l of presenceListeners) {
    try {
      l();
    } catch (e) {
      LOG_ERR('presence listener threw:', e);
    }
  }
}

function markOnline(peerId: string, identity?: { provider: string; username: string }): void {
  if (!peerId) return;
  if (identity) peerIdentity.set(peerId, identity);
  lastSeen.set(peerId, Date.now());
  startSweep();
  if (onlinePeers.has(peerId)) return;
  onlinePeers.add(peerId);
  LOG('presence — online:', peerId);
  notifyPresence();
}

function markOffline(peerId: string): void {
  if (!peerId || !onlinePeers.has(peerId)) return;
  onlinePeers.delete(peerId);
  lastSeen.delete(peerId);
  LOG('presence — offline:', peerId);
  notifyPresence();
}

// Expire peers whose last live signal is older than the TTL (the backstop for
// missed close events). Only runs while at least one peer is tracked.
function sweep(): void {
  const now = Date.now();
  for (const [peerId, ts] of lastSeen) {
    if (now - ts > PRESENCE_TTL_MS) markOffline(peerId);
  }
  if (lastSeen.size === 0) stopSweep();
}

function startSweep(): void {
  if (sweepTimer !== null) return;
  sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS);
  // Don't keep the process alive on the sweep timer (node/test envs).
  (sweepTimer as { unref?: () => void }).unref?.();
}

function stopSweep(): void {
  if (sweepTimer !== null) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
}

// Re-probe every tracked peer: keeps their data channel warm (instant sends)
// and refreshes their TTL (a quiet-but-online peer doesn't flip offline). Only
// runs while at least one peer is tracked, so it's a no-op when idle.
function heartbeat(): void {
  if (!p2pReady) return;
  for (const [peerId, identity] of peerIdentity) {
    if (!lastSeen.has(peerId)) continue; // already expired — don't resurrect
    probePresence(identity.provider, identity.username);
  }
}

function startHeartbeat(): void {
  if (heartbeatTimer !== null) return;
  heartbeatTimer = setInterval(heartbeat, HEARTBEAT_INTERVAL_MS);
  (heartbeatTimer as { unref?: () => void }).unref?.();
}

function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
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
  // A live inbound means the sender is online right now. Recover their
  // identity from the peer id so the heartbeat can re-probe them later.
  markOnline(conn.peer, identityFromPeerId(conn.peer));
  // Mark them offline the moment this connection drops (immediate, not just
  // the TTL backstop).
  conn.on?.('close', () => markOffline(conn.peer));
  for (const listener of inboundListeners) {
    try {
      listener(conn, data);
    } catch (e) {
      LOG_ERR('inbound listener threw:', e);
    }
  }
}

/**
 * Recover {provider, username} from a peer id. The peer id is
 * `${provider} ${user} ${site} ${label}` with `.` → `_` (see the SDK's
 * peerId), so the first two space-separated tokens are the provider (dots
 * restored) and the username. Null when the shape doesn't parse (defensive —
 * a malformed id just means the heartbeat can't re-probe that peer).
 */
function identityFromPeerId(peerId: string): { provider: string; username: string } | null {
  const parts = peerId.split(' ');
  if (parts.length < 2) return null;
  return { provider: parts[0].replace(/_/g, '.'), username: parts[1] };
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
    // secure: the signaling server's protocol matches the API origin's (the RTC
    // host tracks the API host — http://api.localhost → ws://rtc.localhost,
    // https://api.web10.app → wss://rtc.web10.app). Deriving it from the page
    // protocol would be wrong when the app is served over http but the node is
    // https (or vice versa).
    const secure = API_ORIGIN.startsWith('https');
    await rtc.initP2P((conn, data) => dispatchInbound(conn as P2PInboundConn, data), P2P_LABEL, secure);
    p2pReady = true;
    // Keep tracked peers' channels warm + their TTL fresh (instant sends, and
    // a quiet-but-online peer doesn't flip offline). No-op until a peer is
    // tracked (a probe/send/inbound), so it costs nothing when idle.
    startHeartbeat();
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
    const peerId = rtc.peerId(toProvider, toUsername, site, P2P_LABEL);
    // connect() returns the existing connection if one is open (the SDK caches
    // it), else opens a new one. Hook its close so the peer flips offline the
    // moment the channel drops (immediate, not just the TTL backstop).
    const conn = rtc.connect(toProvider, toUsername, site, P2P_LABEL);
    conn.on('close', () => markOffline(peerId));
    if (conn.open) {
      conn.send(payload);
      // A send over an open channel means the recipient answered — online.
      markOnline(peerId, { provider: toProvider, username: toUsername });
      LOG('sendP2P — sent over open channel');
      return true;
    }
    // Channel not open yet — send once it opens (the recipient is connecting).
    conn.on('open', () => {
      conn.send(payload);
      markOnline(peerId, { provider: toProvider, username: toUsername });
    });
    LOG('sendP2P — channel not open yet, queued on open');
    return false;
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

/**
 * Probe a peer's presence without sending a message. Opens (or reuses) the
 * data channel to them: if it opens, they're online (markOnline); if it errors
 * (peer unreachable / not connected to signaling), they're offline (markOffline).
 *
 * Presence is otherwise established only by a live data-channel exchange (a
 * send or an inbound), so two users who are both in the app but haven't
 * messaged each other see each other as offline. Probing on conversation-open
 * closes that gap: the channel handshake IS the presence check.
 *
 * Returns true if the probe confirmed the peer online, false otherwise (P2P
 * not ready, or the peer is unreachable).
 */
export function probePresence(provider: string, username: string): boolean {
  if (!rtc || !p2pReady) {
    LOG('probePresence — P2P not ready, skipping');
    return false;
  }
  const peerId = rtc.peerId(provider, username, site, P2P_LABEL);
  try {
    const conn = rtc.connect(provider, username, site, P2P_LABEL);
    // Hook close + error up front so a connection that opens and then drops
    // (or errors — peer unreachable) flips offline regardless of which branch
    // handled the open.
    conn.on('close', () => markOffline(peerId));
    conn.on('error', () => {
      markOffline(peerId);
      LOG('probePresence — offline (error):', peerId);
    });
    if (conn.open) {
      markOnline(peerId, { provider, username });
      LOG('probePresence — online:', peerId);
      return true;
    }
    conn.on('open', () => {
      markOnline(peerId, { provider, username });
      LOG('probePresence — online (on open):', peerId);
    });
    LOG('probePresence — channel not open yet, probing');
    return false;
  } catch (e) {
    LOG_ERR('probePresence FAILED:', e);
    return false;
  }
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
  stopSweep();
  stopHeartbeat();
  if (onlinePeers.size > 0) {
    onlinePeers.clear();
    lastSeen.clear();
    peerIdentity.clear();
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
