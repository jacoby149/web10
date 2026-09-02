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
// 'close', and records `send` calls.
function mockConnection(overrides: { open?: boolean } = {}) {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
  return {
    open: overrides.open ?? true,
    send: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      (handlers[event] || (handlers[event] = [])).push(handler);
    }),
    _emit(event: string, ...args: unknown[]): void {
      for (const h of handlers[event] || []) h(...args);
    },
  };
}

// A mock connector that captures the onInbound callback + the connections it
// hands out, so tests can drive inbound P2P + connection close/open.
function mockConnector() {
  const c = {
    _onInbound: null as null | (
      (conn: { peer: string; on?: (e: string, h: () => void) => void }, data: unknown) => void
    ),
    _connections: [] as ReturnType<typeof mockConnection>[],
    peerId: vi.fn(
      (provider: string, user: string, origin: string, label?: string) =>
        `${provider} ${user} ${origin} ${label || ''}`.split('.').join('_'),
    ),
    initP2P: vi.fn(
      async (
        onInbound:
          | ((conn: { peer: string; on?: (e: string, h: () => void) => void }, data: unknown) => void)
          | null,
      ) => {
        c._onInbound = onInbound;
      },
    ),
    connect: vi.fn(() => {
      const conn = mockConnection({ open: true });
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

    it('sends over an open channel and marks the recipient online', async () => {
      await p2p.initP2P();
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(true);
      const conn = connector._connections[0];
      expect(conn.send).toHaveBeenCalledWith({ message: 'hi' });
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(true);
    });

    it('queues the send on open and stays offline until the channel opens', async () => {
      await p2p.initP2P();
      const notOpen = mockConnection({ open: false });
      connector._connections.push(notOpen);
      connector.connect.mockReturnValueOnce(notOpen as never);
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(false);
      expect(notOpen.send).not.toHaveBeenCalled();
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(false);
      // The channel opens → the queued send goes out + the peer comes online.
      notOpen._emit('open');
      expect(notOpen.send).toHaveBeenCalledWith({ message: 'hi' });
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(true);
    });
  });

  describe('onP2PInbound', () => {
    it('dispatches to subscribers and marks the sender online', async () => {
      await p2p.initP2P();
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      const seen: unknown[] = [];
      const unsub = p2p.onP2PInbound((_conn, data) => seen.push(data));
      // Drive an inbound from bob's peer through the captured callback.
      connector._onInbound!({ peer: bobPeer }, { message: 'yo' });
      expect(seen).toEqual([{ message: 'yo' }]);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
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
  });

  describe('offline detection', () => {
    it('marks a peer offline when their outbound connection closes', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
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
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      closeSpy!();
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });

    it('expires a peer after the TTL with no further activity (sweep backstop)', async () => {
      vi.useFakeTimers();
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
      // Advance well past the TTL (60s) + a sweep interval (15s).
      vi.advanceTimersByTime(90_000);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(false);
    });

    it('stays online while activity keeps refreshing the TTL', async () => {
      vi.useFakeTimers();
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
      // 45s idle (under the 60s TTL) + a fresh signal → still online after the sweep.
      vi.advanceTimersByTime(45_000);
      p2p.sendP2P('web10.app', 'bob', { message: 'again' });
      vi.advanceTimersByTime(45_000);
      expect(p2p.getOnlinePeers().has(bobPeer)).toBe(true);
    });

    it('notifies presence subscribers when a peer goes offline', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      const bobPeer = p2p.peerIdFor('web10.app', 'bob')!;
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
      expect(ticks).toBe(1);
      p2p.sendP2P('web10.app', 'bob', { message: 'again' }); // same peer → no re-mark
      expect(ticks).toBe(1);
      p2p.sendP2P('web10.app', 'carol', { message: 'hi' }); // new peer → re-mark
      expect(ticks).toBe(2);
      unsub();
    });
  });

  describe('teardownP2P', () => {
    it('clears ready + the online set and notifies presence subscribers', async () => {
      await p2p.initP2P();
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(p2p.getOnlinePeers().size).toBe(1);
      let ticks = 0;
      const unsub = p2p.onPresenceChange(() => {
        ticks += 1;
      });
      p2p.teardownP2P();
      expect(p2p.isP2PReady()).toBe(false);
      expect(p2p.getOnlinePeers().size).toBe(0);
      expect(ticks).toBe(1);
      unsub();
    });
  });
});
