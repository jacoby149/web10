import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as groups from '../../data/groups';
import * as notifications from '../../data/notifications';

// Mock the P2P seam — capture the onP2PInbound subscription so tests can drive
// inbound nudges (the app-wide bus the store subscribes to).
const inboundListeners: Array<(conn: { peer: string }, data: unknown) => void> = [];
vi.mock('../../data/p2p', () => ({
  onP2PInbound: (listener: (conn: { peer: string }, data: unknown) => void) => {
    inboundListeners.push(listener);
    return () => {
      const i = inboundListeners.indexOf(listener);
      if (i >= 0) inboundListeners.splice(i, 1);
    };
  },
}));

// A mock V3 client: controls readToken + the CRUD reads the store uses for the
// derive (posts / reactions / comments / the last-seen cursor).
function mockClient(overrides: {
  token?: unknown;
  posts?: unknown[];
  reactions?: unknown[];
  comments?: unknown[];
  cursor?: unknown[];
} = {}) {
  return {
    readToken: vi.fn(() =>
      overrides.token === undefined
        ? { provider: 'web10.app', username: 'alice', site: 'web10' }
        : overrides.token,
    ),
    read: vi.fn(async (collection: string) => {
      if (collection === 'posts') return overrides.posts ?? [];
      if (collection === 'reactions') return overrides.reactions ?? [];
      if (collection === 'comments') return overrides.comments ?? [];
      if (collection === 'notifications') return overrides.cursor ?? [];
      return [];
    }),
    create: vi.fn(async () => ({ doc_id: 'new-doc', author_key: 'alice', body: {} })),
    update: vi.fn(async (docId: string) => ({ doc_id: docId, author_key: 'alice', body: {} })),
    state: { apiOrigin: 'https://api.web10.app', token: 'tok', rtcServer: 'rtc.web10.app' },
  };
}

function driveInbound(data: unknown): void {
  for (const l of inboundListeners) l({ peer: 'web10_app bob web10 web10-social' }, data);
}

describe('notifications (app-wide store, D69)', () => {
  let client: ReturnType<typeof mockClient>;

  beforeEach(() => {
    // Reset the store's internal state (items, listeners, subscription).
    notifications.teardownNotifications();
    inboundListeners.length = 0;
    vi.clearAllMocks();
    client = mockClient();
    vi.spyOn(v3, 'getV3Client').mockReturnValue(client as never);
    vi.spyOn(groups, 'ensureFollowers').mockResolvedValue('web10.app/groups/users/alice/followers');
    // One non-DM group (the derive reads posts/reactions/comments from it; no
    // DM groups → listConversations returns [] → no DM notifications).
    vi.spyOn(groups, 'getMyGroups').mockResolvedValue([
      { group_id: 'web10.app/groups/web10/discover', member_count: 10 } as never,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    notifications.teardownNotifications();
  });

  describe('initNotifications', () => {
    it('does nothing when there is no token', async () => {
      vi.spyOn(v3, 'getV3Client').mockReturnValue(mockClient({ token: null }) as never);
      await notifications.initNotifications();
      expect(notifications.unreadCount()).toBe(0);
      expect(inboundListeners.length).toBe(0); // not subscribed (not signed in)
    });

    it('is idempotent — a second call while initialized is a no-op', async () => {
      await notifications.initNotifications();
      const subsAfterFirst = inboundListeners.length;
      await notifications.initNotifications();
      expect(inboundListeners.length).toBe(subsAfterFirst);
    });

    it('seeds by deriving reactions + comments on my posts (from others)', async () => {
      // My post (authored by alice) + a reaction from bob + a comment from carol.
      client.read = vi.fn(async (collection: string) => {
        if (collection === 'posts') return [{ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } }];
        if (collection === 'reactions') return [{ doc_id: 'r1', author_key: 'web10.app/bob', body: { type: 'like', target_id: 'post-1', created_at: '2026-01-01T00:00:00Z' } }];
        if (collection === 'comments') return [{ doc_id: 'c1', author_key: 'web10.app/carol', body: { text: 'nice', post_id: 'post-1', created_at: '2026-01-01T01:00:00Z' } }];
        return [];
      }) as never;
      await notifications.initNotifications();
      expect(notifications.getNotifications()).toHaveLength(2);
      // No last_seen cursor → both are unread.
      expect(notifications.unreadCount()).toBe(2);
      const types = notifications.getNotifications().map((n) => n.type).sort();
      expect(types).toEqual(['comment', 'reaction']);
    });

    it('does not notify on my own reactions/comments (self-filter)', async () => {
      // My post + a reaction from alice (me) → filtered out.
      client.read = vi.fn(async (collection: string) => {
        if (collection === 'posts') return [{ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } }];
        if (collection === 'reactions') return [{ doc_id: 'r1', author_key: 'web10.app/alice', body: { type: 'like', target_id: 'post-1', created_at: '2026-01-01T00:00:00Z' } }];
        return [];
      }) as never;
      await notifications.initNotifications();
      expect(notifications.getNotifications()).toHaveLength(0);
    });

    it('marks derived events read when they predate the last-seen cursor', async () => {
      client.read = vi.fn(async (collection: string) => {
        if (collection === 'posts') return [{ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } }];
        if (collection === 'reactions') return [{ doc_id: 'r1', author_key: 'web10.app/bob', body: { type: 'like', target_id: 'post-1', created_at: '2026-01-01T00:00:00Z' } }];
        if (collection === 'notifications') return [{ doc_id: 'cursor', author_key: 'web10.app/alice', body: { last_seen: '2026-01-02T00:00:00Z' } }];
        return [];
      }) as never;
      await notifications.initNotifications();
      // The reaction (Jan 1) predates the cursor (Jan 2) → read.
      expect(notifications.getNotifications()).toHaveLength(1);
      expect(notifications.unreadCount()).toBe(0);
    });
  });

  describe('live nudge (the fast path)', () => {
    it('appends a notification + bumps the badge from any screen', async () => {
      await notifications.initNotifications();
      let ticks = 0;
      const unsub = notifications.onNotificationChange(() => {
        ticks += 1;
      });
      expect(notifications.unreadCount()).toBe(0);
      driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1', sent_at: '2026-01-02T00:00:00Z' });
      expect(notifications.unreadCount()).toBe(1);
      expect(ticks).toBe(1);
      const [top] = notifications.getNotifications();
      expect(top).toMatchObject({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false });
      unsub();
    });

    it('ignores a non-nudge inbound (a DM message nudge is DmsScreen\'s)', async () => {
      await notifications.initNotifications();
      driveInbound({ doc_id: 'msg-1', message: 'hi', from: 'bob', to: 'alice', sent_at: '2026-01-02T00:00:00Z' });
      expect(notifications.unreadCount()).toBe(0);
      expect(notifications.getNotifications()).toHaveLength(0);
    });

    it('dedupes a double-nudge (same type+from+ref) so the badge does not double-count', async () => {
      await notifications.initNotifications();
      driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1' });
      driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1' });
      expect(notifications.unreadCount()).toBe(1);
      expect(notifications.getNotifications()).toHaveLength(1);
    });

    it('does not double-count a nudge that the seed already covers', async () => {
      client.read = vi.fn(async (collection: string) => {
        if (collection === 'posts') return [{ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } }];
        if (collection === 'reactions') return [{ doc_id: 'r1', author_key: 'web10.app/bob', body: { type: 'like', target_id: 'post-1', created_at: '2026-01-01T00:00:00Z' } }];
        return [];
      }) as never;
      await notifications.initNotifications();
      expect(notifications.unreadCount()).toBe(1);
      // A live nudge for the same (type, from, ref) the seed already has → no dup.
      driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1' });
      expect(notifications.unreadCount()).toBe(1);
      expect(notifications.getNotifications()).toHaveLength(1);
    });
  });

  describe('markAllRead', () => {
    it('flips every row read + clears the badge + advances the cursor', async () => {
      client.read = vi.fn(async (collection: string) => {
        if (collection === 'posts') return [{ doc_id: 'post-1', author_key: 'web10.app/alice', body: { text: 'hi' } }];
        if (collection === 'reactions') return [{ doc_id: 'r1', author_key: 'web10.app/bob', body: { type: 'like', target_id: 'post-1', created_at: '2026-01-01T00:00:00Z' } }];
        return [];
      }) as never;
      await notifications.initNotifications();
      expect(notifications.unreadCount()).toBe(1);
      let ticks = 0;
      const unsub = notifications.onNotificationChange(() => {
        ticks += 1;
      });
      await notifications.markAllRead();
      expect(notifications.unreadCount()).toBe(0);
      expect(ticks).toBe(1);
      // It advanced the cursor (no cursor doc yet → create).
      expect(client.create).toHaveBeenCalledTimes(1);
      unsub();
    });

    it('is a no-op when everything is already read', async () => {
      await notifications.initNotifications(); // empty store
      await notifications.markAllRead();
      expect(client.create).not.toHaveBeenCalled();
    });
  });

  describe('teardownNotifications', () => {
    it('unsubscribes from the P2P bus + clears the items', async () => {
      await notifications.initNotifications();
      driveInbound({ type: 'reaction', from: 'bob', ref_doc_id: 'post-1' });
      expect(notifications.unreadCount()).toBe(1);
      expect(inboundListeners.length).toBe(1);
      notifications.teardownNotifications();
      expect(inboundListeners.length).toBe(0);
      expect(notifications.getNotifications()).toHaveLength(0);
      // A nudge after teardown is dropped (no subscription).
      driveInbound({ type: 'reaction', from: 'carol', ref_doc_id: 'post-2' });
      expect(notifications.unreadCount()).toBe(0);
    });
  });
});
