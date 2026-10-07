import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as p2p from '../../data/p2p';
import * as rtcModule from 'web10-npm/rtc';

// Mock the SDK's rtc module (PeerJS is not exercised in unit tests).
vi.mock('web10-npm/rtc', () => ({
  createRTC: vi.fn(),
  setPeer: vi.fn(),
}));

// A mock P2P connection: captures `on` handlers so tests can emit 'open' /
// 'close', and records `send` calls. When the shared `autoPongRef` flag is on,
// a ping sent over the channel gets a pong back through the connector's
// inbound handler — simulating a reachable peer (the round trip that confirms
// presence). Tests flip `autoPongRef.value = false` to simulate a dead peer.
function mockConnection(
  overrides: { open?: boolean } = {},
  onPong?: (conn: ReturnType<typeof mockConnection>, data: unknown) => void,
  autoPongRef?: { value: boolean },
) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  const conn = {
    open: overrides.open ?? true,
    peer: '',
    send: vi.fn((data: unknown) => {
      // A ping from us → the peer answers with a pong (the round trip), as long
      // as the peer is still reachable.
      if (
        (autoPongRef ? autoPongRef.value : true) &&
        data &&
        typeof data === 'object' &&
        (data as { __p2p?: string }).__p2p === 'ping'
      ) {
        onPong?.(conn, { __p2p: 'pong' });
      }
    }),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] || (handlers[event] = [])).push(handler);
    }),
    close: vi.fn(),
    _emit(event: string, ...args: unknown[]): void {
      for (const h of handlers[event] || []) h(...args);
    },
  };
  return conn;
}

// A mock connector that captures the onInbound callback + the connections it
// hands out, so tests can drive inbound P2P + connection close/open.
function mockConnector() {
  const autoPongRef = { value: true };
  const c = {
    destroy: vi.fn(),
    _onInbound: null as null | (
      (conn: { peer: string; on?: (e: string, h: () => void) => void; close?: () => void }, data: unknown) => void
    ),
    _connections: [] as ReturnType<typeof mockConnection>[],
    // When false, the mock peer stops answering pings (simulates a dead peer).
    get autoPong() {
      return autoPongRef.value;
    },
    set autoPong(v: boolean) {
      autoPongRef.value = v;
    },
    peerId: vi.fn(
      (provider: string, user: string, origin: string, label?: string) =>
        `${provider} ${user} ${origin} ${label || ''}`.split('.').join('_'),
    ),
    initP2P: vi.fn(
      async (
        onInbound:
          | ((conn: { peer: string; on?: (e: string, h: () => void) => void; close?: () => void }, data: unknown) => void)
          | null,
      ) => {
        c._onInbound = onInbound;
      },
    ),
    connect: vi.fn((provider: string, username: string, origin: string, label?: string) => {
      const conn = mockConnection({ open: true }, (conn2, data) => {
        if (c._onInbound) c._onInbound(conn2 as never, data);
      }, autoPongRef);
      // The peer id this channel is to (the pong resolves the peer from it).
      conn.peer = c.peerId(provider, username, origin, label);
      c._connections.push(conn);
      return conn;
    }),
    send: vi.fn(() => ({ connected: true })),
  };
  return c;
}

function mockClient(overrides: { token?: unknown } = {}) {
  return {
    readToken: vi.fn(() =>
      overrides.token === undefined
        ? { provider: 'web10.app', username: 'alice', site: 'web10' }
        : overrides.token,
    ),
    state: { apiOrigin: 'https://api.web10.app', token: 'tok', rtcServer: 'rtc.web10.app' },
  };
}

describe('p2p (WebRTC P2P seam)', () => {
  let connector: ReturnType<typeof mockConnector>;

  beforeEach(() => {
    // Reset the module's internal state (rtc, ready, online peers, listeners).
    p2p.teardownP2P();
    // The vi.mock factory mock accumulates call counts across tests — clear.
    vi.clearAllMocks();
    connector = mockConnector();
    vi.mocked(rtcModule.createRTC).mockReturnValue(connector as never);
    vi.spyOn(v3, 'getV3Client').mockReturnValue(mockClient() as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    p2p.teardownP2P();
  });

  describe('initP2P', () => {
    it('returns false and does not create a connector when there is no token', async () => {
      vi.spyOn(v3, 'getV3Client').mockReturnValue(mockClient({ token: null }) as never);
      const ok = await p2p.initP2P();
      expect(ok).toBe(false);
      expect(rtcModule.createRTC).not.toHaveBeenCalled();
      expect(p2p.isP2PReady()).toBe(false);
    });

    it('creates the connector, inits the peer, and reports ready', async () => {
      const ok = await p2p.initP2P();
      expect(ok).toBe(true);
      expect(rtcModule.createRTC).toHaveBeenCalledTimes(1);
      expect(connector.initP2P).toHaveBeenCalledTimes(1);
      expect(p2p.isP2PReady()).toBe(true);
    });

    it('is idempotent — a second call while ready is a no-op', async () => {
      await p2p.initP2P();
      await p2p.initP2P();
      expect(rtcModule.createRTC).toHaveBeenCalledTimes(1);
      expect(connector.initP2P).toHaveBeenCalledTimes(1);
    });

    it('reports false (and not ready) when the signaling server rejects', async () => {
      connector.initP2P.mockRejectedValueOnce(new Error('unreachable'));
      const ok = await p2p.initP2P();
      expect(ok).toBe(false);
      expect(p2p.isP2PReady()).toBe(false);
    });
  });

  describe('sendP2P', () => {
    it('returns false and does not open a channel when P2P is not ready', () => {
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(false);
      expect(connector.connect).not.toHaveBeenCalled();
    });

    it('sends over an open channel and the round trip marks the recipient online', async () => {
      await p2p.initP2P();
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(true);
      const conn = connector._connections[0];
      expect(conn.send).toHaveBeenCalledWith({ message: 'hi' });
      // The ping/pong round trip confirms presence (async — the pong arrives
      // through the inbound handler).
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(true);
      });
    });

    it('queues the send on open and the round trip confirms presence', async () => {
      await p2p.initP2P();
      const notOpen = mockConnection({ open: false }, (conn2, data) => {
        if (connector._onInbound) connector._onInbound(conn2 as never, data);
      });
      connector._connections.push(notOpen);
      connector.connect.mockReturnValueOnce(notOpen as never);
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(false);
      expect(notOpen.send).not.toHaveBeenCalled();
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(false);
      // The channel opens → the queued send goes out + the round trip confirms.
      notOpen._emit('open');
      expect(notOpen.send).toHaveBeenCalledWith({ message: 'hi' });
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(true);
      });
    });
  });

  describe('onP2PInbound', () => {
    it('dispatches to subscribers and the round trip marks the sender online', async () => {
      await p2p.initP2P();
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      const seen: unknown[] = [];
      const unsub = p2p.onP2PInbound((_conn, data) => seen.push(data));
      // Drive an inbound from bob's peer through the captured callback.
      connector._onInbound!({ peer: bobPeer }, { message: 'yo' });
      expect(seen).toEqual([{ message: 'yo' }]);
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      unsub();
    });

    it('unsubscribe stops delivery', async () => {
      await p2p.initP2P();
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      const seen: unknown[] = [];
      const unsub = p2p.onP2PInbound((_conn, data) => seen.push(data));
      unsub();
      connector._onInbound!({ peer: bobPeer }, { message: 'yo' });
      expect(seen).toEqual([]);
    });

    it('answers a ping with a pong and does not dispatch it to listeners', async () => {
      await p2p.initP2P();
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      const seen: unknown[] = [];
      const unsub = p2p.onP2PInbound((_conn, data) => seen.push(data));
      // Drive a ping from bob → we answer with a pong (not dispatched).
      const conn = mockConnection({ open: true });
      conn.peer = bobPeer;
      connector._onInbound!(conn as never, { __p2p: 'ping' });
      expect(conn.send).toHaveBeenCalledWith({ __p2p: 'pong' });
      expect(seen).toEqual([]); // a ping is not a message nudge
      unsub();
    });
  });

  describe('offline detection', () => {
    it('marks a peer offline when their outbound connection closes', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      // The channel drops → bob flips offline immediately.
      connector._connections[0]._emit('close');
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });

    it('marks a peer offline when their inbound connection closes', async () => {
      await p2p.initP2P();
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      let closeSpy: (() => void) | null = null;
      // Drive an inbound whose connection we can close.
      connector._onInbound!({ peer: bobPeer, on: (_e, h) => { closeSpy = h; } }, { message: 'yo' });
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      closeSpy!();
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });

    it('expires a peer after the TTL once they go unreachable (sweep backstop)', async () => {
      vi.useFakeTimers();
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      // The pong is synchronous (the mock peer answers immediately), so bob is
      // online right away.
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      // Bob goes unreachable: the ping loop's pings get no pong, so the
      // consecutive-miss count hits the threshold and bob flips offline.
      connector.autoPong = false;
      // Advance well past 2 ping intervals (10s each) + the ping timeout (8s).
      vi.advanceTimersByTime(40_000);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });

    it('stays online while the ping loop keeps a reachable peer warm', async () => {
      vi.useFakeTimers();
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      // Advance well past the TTL (60s). The ping loop (10s) re-pings bob;
      // the mock peer still answers, so each round trip refreshes liveness and
      // bob never flips offline — a quiet-but-online peer stays online.
      vi.advanceTimersByTime(120_000);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
    });

    it('stays online while activity keeps refreshing liveness', async () => {
      vi.useFakeTimers();
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      // 45s idle (under the 60s TTL) + a fresh send → still online after the sweep.
      vi.advanceTimersByTime(45_000);
      p2p.sendP2P('web10.app', 'bob', { message: 'again' });
      vi.advanceTimersByTime(45_000);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
    });

    it('notifies presence subscribers when a peer goes offline', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      let ticks = 0;
      const unsub = p2p.onPresenceChange(() => {
        ticks += 1;
      });
      connector._connections[0]._emit('close');
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
      expect(ticks).toBe(1);
      unsub();
    });
  });

  describe('presence notifications', () => {
    it('notifies presence subscribers once per new online peer', async () => {
      await p2p.initP2P();
      let ticks = 0;
      const unsub = p2p.onPresenceChange(() => {
        ticks += 1;
      });
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' }); // new peer → online
      await vi.waitFor(() => {
        expect(ticks).toBe(1);
      });
      p2p.sendP2P('web10.app', 'bob', { message: 'again' }); // same peer → no re-mark
      expect(ticks).toBe(1);
      p2p.sendP2P('web10.app', 'carol', { message: 'hi' }); // new peer → re-mark
      await vi.waitFor(() => {
        expect(ticks).toBe(2);
      });
      unsub();
    });
  });

  describe('probePresence', () => {
    it('returns false and does not open a channel when P2P is not ready', () => {
      const ok = p2p.probePresence('web10.app', 'bob');
      expect(ok).toBe(false);
      expect(connector.connect).not.toHaveBeenCalled();
    });

    it('marks the peer online once the round trip completes', async () => {
      await p2p.initP2P();
      const ok = p2p.probePresence('web10.app', 'bob');
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      // The channel is open, so the probe reports it (a strong signal).
      expect(ok).toBe(true);
      // The pong confirms presence (async).
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
    });

    it('marks the peer online once a not-yet-open channel opens + the round trip completes', async () => {
      await p2p.initP2P();
      const notOpen = mockConnection({ open: false }, (conn2, data) => {
        if (connector._onInbound) connector._onInbound(conn2 as never, data);
      });
      notOpen.peer = p2p.peerIdFor('web10.app', 'bob')!;
      connector._connections.push(notOpen);
      connector.connect.mockReturnValueOnce(notOpen as never);
      const ok = p2p.probePresence('web10.app', 'bob');
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      expect(ok).toBe(false);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
      // The channel opens → the ping goes out → the pong confirms.
      notOpen._emit('open');
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
    });

    it('marks the peer offline when the probed connection closes', async () => {
      await p2p.initP2P();
      p2p.probePresence('web10.app', 'bob');
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      });
      connector._connections[0]._emit('close');
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });
  });

  describe('teardownP2P', () => {
    it('clears ready + the online set and notifies presence subscribers', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      await vi.waitFor(() => {
        expect(p2p.getOnlinePeers().size).toBe(1);
      });
      let ticks = 0;
      const unsub = p2p.onPresenceChange(() => {
        ticks += 1;
      });
      p2p.teardownP2P();
      expect(p2p.isP2PReady()).toBe(false);
      expect(connector.destroy).toHaveBeenCalledTimes(1);
      expect(p2p.getOnlinePeers().size).toBe(0);
      expect(ticks).toBe(1);
      unsub();
    });
  });
});
