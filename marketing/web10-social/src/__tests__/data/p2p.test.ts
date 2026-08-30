import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as p2p from '../../data/p2p';
import * as rtcModule from 'web10-npm/rtc';

// Mock the SDK's rtc module (PeerJS is not exercised in unit tests).
vi.mock('web10-npm/rtc', () => ({
  createRTC: vi.fn(),
  setPeer: vi.fn(),
}));

// A mock connector that captures the onInbound callback so tests can drive
// inbound P2P messages through the public surface.
function mockConnector() {
  const c = {
    _onInbound: null as null | ((conn: { peer: string }, data: unknown) => void),
    peerId: vi.fn(
      (provider: string, user: string, origin: string, label?: string) =>
        `${provider} ${user} ${origin} ${label || ''}`.split('.').join('_'),
    ),
    initP2P: vi.fn(async (onInbound: ((conn: { peer: string }, data: unknown) => void) | null) => {
      c._onInbound = onInbound;
    }),
    send: vi.fn(() => ({ connected: true })),
    connect: vi.fn(),
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
    it('returns false and does not send when P2P is not ready', () => {
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(false);
      expect(connector.send).not.toHaveBeenCalled();
    });

    it('sends over the channel and marks the recipient online when connected', async () => {
      await p2p.initP2P();
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(true);
      expect(connector.send).toHaveBeenCalledWith(
        'web10.app', 'bob', 'web10', 'web10-social', { message: 'hi' },
      );
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(true);
    });

    it('does not mark the recipient online when the channel is not connected', async () => {
      await p2p.initP2P();
      connector.send.mockReturnValueOnce({ connected: false });
      const ok = p2p.sendP2P('web10.app', 'bob', { message: 'hi' });
      expect(ok).toBe(false);
      expect(p2p.getOnlinePeers().has(p2p.peerIdFor('web10.app', 'bob')!)).toBe(false);
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

  describe('presence notifications', () => {
    it('notifies presence subscribers once per new online peer', async () => {
      await p2p.initP2P();
      let ticks = 0;
      const unsub = p2p.onPresenceChange(() => {
        ticks += 1;
      });
      p2p.sendP2P('web10.app', 'bob', { message: 'hi' }); // connected → marks online
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
