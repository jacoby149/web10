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
// `close` lets us drop a half-dead channel (a ping that got no pong) so a
// fresh one can be opened on the next probe.
export interface P2PInboundConn {
  peer: string;
  open?: boolean;
  send?: (data: unknown) => void;
  on?: (event: string, handler: () => void) => void;
  close?: () => void;
}

type InboundListener = (conn: P2PInboundConn, data: unknown) => void;

let rtc: RTCConnector | null = null;
let p2pReady = false;
let site = 'web10';
const inboundListeners = new Set<InboundListener>();

// Presence: the set of peer ids we currently consider online. Presence is a
// REAL bidirectional ping/pong, not a local channel-state estimate: a peer is
// "online" while a channel to them is open AND a ping we send gets a pong back
// (a round trip). That is what makes presence symmetric — you can't see a peer
// green while they see you gray, because a round trip only succeeds when the
// channel works both ways. A peer goes offline when their connection closes
// (immediate) or when a ping gets no pong within PING_TIMEOUT_MS (fast, ~8s —
// the fix for the stale "online" that lingered up to the old 60s TTL after a
// refresh). The TTL sweep is a backstop for a missed close. Cleared on teardown.
const onlinePeers = new Set<string>();
// lastSeen: peerId → last live-signal timestamp. Drives the TTL sweep.
const lastSeen = new Map<string, number>();
// peerIdentity: peerId → {provider, username}. Lets the ping loop re-ping a
// tracked peer (rtc.connect needs provider+username, not the opaque peer id).
const peerIdentity = new Map<string, { provider: string; username: string }>();
// openConns: peerId → the data channel we hold to that peer. One channel per
// peer, tracked so a half-dead channel (a ping that got no pong) can be closed
// and a fresh one opened on the next ping.
const openConns = new Map<string, P2PInboundConn>();
// pendingPings: peerId → the timeout handle for "no pong yet."
const pendingPings = new Map<string, ReturnType<typeof setTimeout>>();
// missedPings: peerId → consecutive pings that got no pong. A peer flips
// offline only after MISSED_PINGS_TO_OFFLINE consecutive misses — so a single
// transient slow pong doesn't flip a healthy peer offline, but a dead channel
// (a peer who just refreshed) is caught within ~2 ping intervals (~10s).
const missedPings = new Map<string, number>();
const presenceListeners = new Set<() => void>();
let sweepTimer: ReturnType<typeof setInterval> | null = null;

// A peer is considered online for this long after their last live signal. The
// sweep runs more often than the TTL so the dot flips to gray promptly.
const PRESENCE_TTL_MS = 60_000;
const SWEEP_INTERVAL_MS = 15_000;

// The ping loop re-pings every tracked peer on this interval. Two jobs: (1) it
// keeps the data channel to each peer WARM, so a send goes out instantly
// instead of paying the WebRTC handshake on the first message; (2) it refreshes
// liveness, so a peer who's online but quiet (no messages flowing) stays online.
// This is what makes presence + delivery work without the other party sending
// anything.
const PING_INTERVAL_MS = 10_000;
// A ping that gets no pong within this long means the channel is dead → the
// peer is offline (and the stale channel is dropped). Shorter than the old 60s
// TTL, so a peer who just refreshed (their channel died) flips offline fast
// instead of lingering "online" for a minute.
const PING_TIMEOUT_MS = 8_000;
// Consecutive pings that get no pong before a peer flips offline. 2 catches a
// dead channel within ~2 ping intervals (~10s) while tolerating a single
// transient slow pong (a healthy peer never flips offline on one slow round
// trip).
const MISSED_PINGS_TO_OFFLINE = 2;
let pingLoopTimer: ReturnType<typeof setInterval> | null = null;

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
  if (!peerId) return;
  // Clear any in-flight ping timeout (the channel is gone — no pong coming).
  const t = pendingPings.get(peerId);
  if (t) {
    clearTimeout(t);
    pendingPings.delete(peerId);
  }
  // Drop the channel so the next ping opens a fresh one (a half-dead channel
  // would otherwise be reused and keep failing).
  const conn = openConns.get(peerId);
  if (conn) {
    openConns.delete(peerId);
    try {
      conn.close?.();
    } catch {
      // Best-effort — the channel may already be gone.
    }
  }
  // Stop tracking the peer (the ping loop stops pinging a gone peer). Re-
  // tracking happens on the next probePresence / send / inbound.
  peerIdentity.delete(peerId);
  missedPings.delete(peerId);
  if (!onlinePeers.has(peerId)) return;
  onlinePeers.delete(peerId);
  lastSeen.delete(peerId);
  LOG('presence — offline:', peerId);
  notifyPresence();
}

// Track the channel we hold to a peer + hook its close (a drop flips the peer
// offline immediately, not just via the TTL backstop).
function registerConn(peerId: string, conn: P2PInboundConn): void {
  if (!peerId || !conn) return;
  openConns.set(peerId, conn);
  conn.on?.('close', () => markOffline(peerId));
}

// A pong from a peer: the round trip succeeded → they're online right now.
// Cancel the pending "no pong" timeout + refresh liveness. Guarded on
// peerIdentity: a LATE pong from a peer we already marked offline (their
// channel died) must not resurrect them — they're untracked until the next
// ping re-tracks them.
function handlePong(peerId: string): void {
  if (!peerIdentity.has(peerId)) return; // already gone — ignore the late pong
  const t = pendingPings.get(peerId);
  if (t) {
    clearTimeout(t);
    pendingPings.delete(peerId);
  }
  missedPings.delete(peerId); // a pong resets the consecutive-miss count
  markOnline(peerId, identityFromPeerId(peerId));
  LOG('presence — pong:', peerId);
}

// Send a ping to a peer over the (open or newly-opened) channel and arm a
// timeout. The peer is NOT marked online here — only a pong (the round trip)
// confirms liveness. This is what makes presence symmetric: a peer is online
// only while a ping we send gets a pong back.
function sendPing(peerId: string, identity: { provider: string; username: string }): void {
  if (!rtc || !p2pReady) return;
  try {
    const conn = rtc.connect(identity.provider, identity.username, site, P2P_LABEL) as unknown as P2PInboundConn;
    registerConn(peerId, conn);
    // Track the identity so the ping loop keeps re-pinging this peer (without
    // changing their online state — that's the pong's job).
    peerIdentity.set(peerId, identity);
    // Arm the no-pong timeout FIRST, so a synchronous pong (the round trip
    // completing before we finish here) clears it. When the timeout fires, no
    // pong arrived → a genuine miss. After MISSED_PINGS_TO_OFFLINE consecutive
    // misses the channel is dead → offline + dropped. This tolerates a single
    // transient slow pong while still catching a dead channel (a peer who just
    // refreshed) within ~2 ping intervals.
    const prev = pendingPings.get(peerId);
    if (prev) clearTimeout(prev);
    const handle = setTimeout(() => {
      pendingPings.delete(peerId);
      const misses = (missedPings.get(peerId) ?? 0) + 1;
      missedPings.set(peerId, misses);
      if (misses >= MISSED_PINGS_TO_OFFLINE) {
        LOG('presence — no pong after', misses, 'pings, offline:', peerId);
        markOffline(peerId);
      } else {
        LOG('presence — no pong (miss', misses, 'of', MISSED_PINGS_TO_OFFLINE, '):', peerId);
      }
    }, PING_TIMEOUT_MS);
    (handle as { unref?: () => void }).unref?.();
    pendingPings.set(peerId, handle);
    // Now send the ping (the pong, if it arrives, clears the timeout above).
    // A fresh channel (not open yet) can't carry the ping — it goes out on
    // open (the round trip still happens, just one tick later).
    if (conn.open) {
      conn.send?.({ __p2p: 'ping' });
    } else {
      conn.on?.('open', () => {
        try {
          conn.send?.({ __p2p: 'ping' });
        } catch {
          // Channel closed before open — the close hook already handled it.
        }
      });
    }
  } catch (e) {
    LOG_ERR('sendPing FAILED:', e);
  }
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

// Re-ping every tracked peer: keeps their data channel warm (instant sends)
// and refreshes liveness (a quiet-but-online peer stays online; a dead one
// flips offline on the ping timeout). Only runs while at least one peer is
// tracked, so it's a no-op when idle.
function pingLoop(): void {
  if (!p2pReady) return;
  for (const [peerId, identity] of peerIdentity) {
    if (!lastSeen.has(peerId) && !onlinePeers.has(peerId)) continue; // expired — don't resurrect
    sendPing(peerId, identity);
  }
}

function startPingLoop(): void {
  if (pingLoopTimer !== null) return;
  pingLoopTimer = setInterval(pingLoop, PING_INTERVAL_MS);
  (pingLoopTimer as { unref?: () => void }).unref?.();
}

function stopPingLoop(): void {
  if (pingLoopTimer !== null) {
    clearInterval(pingLoopTimer);
    pingLoopTimer = null;
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
  // identity from the peer id so the ping loop can re-ping them later.
  markOnline(conn.peer, identityFromPeerId(conn.peer));
  // Mark them offline the moment this connection drops (immediate, not just
  // the TTL backstop).
  registerConn(conn.peer, conn);
  // A ping from the other side: answer it (the round trip confirms we're
  // reachable) and treat the round trip as a liveness signal.
  if (isPing(data)) {
    LOG('inbound — ping from', conn.peer, '— answering');
    try {
      conn.send?.({ __p2p: 'pong' });
    } catch {
      // Channel closed mid-flight — the close hook handled it.
    }
    return; // a ping is not a message nudge — don't dispatch to listeners
  }
  // A pong to a ping WE sent: the round trip succeeded → they're online.
  if (isPong(data)) {
    handlePong(conn.peer);
    return; // a pong is not a message nudge — don't dispatch to listeners
  }
  for (const listener of inboundListeners) {
    try {
      listener(conn, data);
    } catch (e) {
      LOG_ERR('inbound listener threw:', e);
    }
  }
}

// Is a raw inbound payload a presence ping (vs. a message/nudge)? Pings are
// the `{__p2p: 'ping' | 'pong'}` frames the ping loop exchanges; they never
// reach the app's message handlers.
function isPing(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { __p2p?: string }).__p2p === 'ping';
}

function isPong(data: unknown): boolean {
  return !!data && typeof data === 'object' && (data as { __p2p?: string }).__p2p === 'pong';
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
    // Keep tracked peers' channels warm + their liveness fresh (instant sends,
    // and a quiet-but-online peer stays online while a dead one flips offline
    // on the ping timeout). No-op until a peer is tracked, so it costs nothing
    // when idle.
    startPingLoop();
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
    // it), else opens a new one. registerConn tracks it + hooks close so the
    // peer flips offline the moment the channel drops.
    const conn = rtc.connect(toProvider, toUsername, site, P2P_LABEL) as unknown as P2PInboundConn;
    registerConn(peerId, conn);
    if (conn.open) {
      conn.send?.(payload);
      // A send over an open channel means the recipient answered — online.
      markOnline(peerId, { provider: toProvider, username: toUsername });
      LOG('sendP2P — sent over open channel');
      return true;
    }
    // Channel not open yet — send once it opens (the recipient is connecting).
    conn.on?.('open', () => {
      try {
        conn.send?.(payload);
      } catch {
        // Channel closed before open — the close hook handled it.
      }
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
 * Probe a peer's presence without sending a message. Registers the peer (so
 * the ping loop keeps it warm) and fires an immediate ping. Liveness is
 * confirmed by the round trip: a pong marks the peer online; no pong within
 * PING_TIMEOUT_MS marks it offline (and drops the channel).
 *
 * Returns true if the channel is open right now (a strong signal, but the
 * authoritative online/offline state is set by the ping/pong round trip, which
 * is async). Returns false if P2P isn't ready or the channel isn't open yet.
 */
export function probePresence(provider: string, username: string): boolean {
  if (!rtc || !p2pReady) {
    LOG('probePresence — P2P not ready, skipping');
    return false;
  }
  const peerId = rtc.peerId(provider, username, site, P2P_LABEL);
  try {
    // Register the identity so the ping loop keeps this peer warm + re-pings
    // it. A peer that was previously expired (offline) is re-tracked here.
    peerIdentity.set(peerId, { provider, username });
    sendPing(peerId, { provider, username });
    const conn = openConns.get(peerId);
    const open = !!conn && (conn as { open?: boolean }).open;
    LOG('probePresence — pinged', peerId, 'channel open:', open);
    return open;
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
  rtc?.destroy();
  rtc = null;
  inboundListeners.clear();
  stopSweep();
  stopPingLoop();
  // Clear any in-flight ping timeouts.
  for (const t of pendingPings.values()) clearTimeout(t);
  pendingPings.clear();
  missedPings.clear();
  openConns.clear();
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
