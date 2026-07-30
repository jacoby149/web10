import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as follows from '../../data/follows';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice' })),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    getUploadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

function mockFetchOnce(ok: boolean, json: unknown) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok,
    json: async () => json,
  } as Response);
}

function mockDiscoveryResponse(posts: Array<{ post_id: string; author: string; provider: string; text: string; created_at: string; tags?: string[]; media_refs?: string[] }>) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: true,
    json: async () => posts,
  } as Response);
}

function mockDiscoveryFail() {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
    ok: false,
    status: 500,
  } as Response);
}

function mockDiscoveryError() {
  return vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('network error'));
}

describe('follows data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readFollows', () => {
    it('returns all follow records', async () => {
      const followsData = [
        { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' },
        { _id: 'f2', username: 'carol', provider: 'web10', status: 'pending' },
      ];
      mock.read.mockResolvedValue(followsData);
      const result = await follows.readFollows();
      expect(result).toEqual(followsData);
      expect(mock.read).toHaveBeenCalledWith('follows');
    });

    it('returns empty array when no follows exist', async () => {
      mock.read.mockResolvedValue([]);
      const result = await follows.readFollows();
      expect(result).toEqual([]);
    });
  });

  describe('readFollowsByStatus', () => {
    it('filters follows by status', async () => {
      const activeFollows = [
        { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' },
      ];
      mock.read.mockResolvedValue(activeFollows);
      const result = await follows.readFollowsByStatus('active');
      expect(result).toEqual(activeFollows);
      expect(mock.read).toHaveBeenCalledWith('follows', { status: 'active' });
    });
  });

  describe('readFollow', () => {
    it('returns a follow record for a specific user', async () => {
      const follow = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' };
      mock.read.mockResolvedValue([follow]);
      const result = await follows.readFollow('bob', 'web10');
      expect(result).toEqual(follow);
      expect(mock.read).toHaveBeenCalledWith('follows', { username: 'bob', provider: 'web10' });
    });

    it('returns null when follow not found', async () => {
      mock.read.mockResolvedValue([]);
      const result = await follows.readFollow('unknown', 'web10');
      expect(result).toBeNull();
    });
  });

  describe('followUser', () => {
    it('creates a new follow record', async () => {
      mock.read.mockResolvedValueOnce([]);
      const created = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active', followed_at: expect.any(String), notify: true };
      mock.create.mockResolvedValue(created);

      const result = await follows.followUser('bob', 'web10');
      expect(result).toEqual(created);
      expect(mock.create).toHaveBeenCalledWith('follows', expect.objectContaining({
        username: 'bob',
        provider: 'web10',
        status: 'active',
        notify: true,
      }));
    });

    it('reactivates an existing rejected follow', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' };
      mock.read.mockResolvedValueOnce([existing]);

      const result = await follows.followUser('bob', 'web10');
      expect(result.status).toBe('active');
      expect(result.username).toBe('bob');
      expect(result.provider).toBe('web10');
      // Now updates ALL matching records (not just one)
      expect(mock.update).toHaveBeenCalledTimes(1);
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, {
        $set: expect.objectContaining({ status: 'active' }),
      });
    });
  });

  describe('unfollowUser', () => {
    it('sets follow status to rejected', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' };
      mock.read.mockResolvedValueOnce([existing]);

      await follows.unfollowUser('bob', 'web10');
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, { $set: { status: 'rejected' } });
    });

    it('does nothing when follow not found', async () => {
      mock.read.mockResolvedValueOnce([]);
      await follows.unfollowUser('bob', 'web10');
      expect(mock.update).not.toHaveBeenCalled();
    });
  });

  describe('blockUser', () => {
    it('sets existing follow to blocked', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' };
      mock.read.mockResolvedValueOnce([existing]);

      await follows.blockUser('bob', 'web10');
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, { $set: { status: 'blocked' } });
    });

    it('creates a new blocked follow when none exists', async () => {
      mock.read.mockResolvedValueOnce([]);

      await follows.blockUser('bob', 'web10');
      expect(mock.create).toHaveBeenCalledWith('follows', expect.objectContaining({
        username: 'bob',
        provider: 'web10',
        status: 'blocked',
        notify: false,
      }));
    });
  });

  describe('deleteFollow', () => {
    it('deletes a follow record', async () => {
      await follows.deleteFollow('bob', 'web10');
      expect(mock.delete).toHaveBeenCalledWith('follows', { username: 'bob', provider: 'web10' });
    });
  });

  describe('updateFollowNotify', () => {
    it('updates notification preference', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active', notify: true };
      mock.read.mockResolvedValueOnce([existing]);
      const updated = { ...existing, notify: false };
      mock.update.mockResolvedValue(updated);

      const result = await follows.updateFollowNotify('bob', 'web10', false);
      expect(result).toEqual(updated);
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, { $set: { notify: false } });
    });

    it('throws when follow not found', async () => {
      mock.read.mockResolvedValueOnce([]);
      await expect(follows.updateFollowNotify('bob', 'web10', false)).rejects.toThrow('follow not found');
    });
  });

  describe('countFollows', () => {
    it('counts active follows only', async () => {
      mock.read.mockResolvedValue([
        { _id: 'f1', username: 'bob', provider: 'web10', status: 'active' },
        { _id: 'f2', username: 'carol', provider: 'web10', status: 'active' },
        { _id: 'f3', username: 'dave', provider: 'web10', status: 'rejected' },
      ]);
      const result = await follows.countFollows();
      expect(result).toBe(2);
    });
  });

  describe('followUser error handling', () => {
    it('throws when create fails (no terms record)', async () => {
      // Regression pin: when the `follows` service has no terms record
      // (the SMR-only gap), wapi.create throws. The caller (UserProfileScreen)
      // must see this error, NOT a silent no-op with a fake "Following" state.
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockRejectedValue(new Error('create failed: 403'));

      await expect(follows.followUser('bob', 'web10')).rejects.toThrow('create failed: 403');
    });

    it('throws when update fails (reactivate existing)', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' };
      mock.read.mockResolvedValueOnce([existing]);
      mock.update.mockRejectedValue(new Error('update failed: 403'));

      await expect(follows.followUser('bob', 'web10')).rejects.toThrow('update failed: 403');
    });
  });

  describe('followUser backfill', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mock = mockWapi();
    });

    it('backfills inbox with followee posts on new follow', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      // Discovery returns bob's posts + a post from another author
      mockDiscoveryResponse([
        { post_id: 'p1', author: 'bob', provider: 'web10', text: 'hello', created_at: '2024-01-01T00:00:00Z' },
        { post_id: 'p2', author: 'bob', provider: 'web10', text: 'world', created_at: '2024-01-02T00:00:00Z' },
        { post_id: 'p3', author: 'carol', provider: 'web10', text: 'not bob', created_at: '2024-01-03T00:00:00Z' },
      ]);

      // Empty inbox — no dedup needed
      mock.read.mockResolvedValueOnce([]);

      const result = await follows.followUser('bob', 'web10');
      expect(result).toEqual({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      // Wait for async backfill to settle
      await new Promise((r) => setTimeout(r, 10));

      // Should have created 2 inbox records (bob's posts only, not carol's)
      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(2);
      expect(inboxCalls[0][1]).toMatchObject({
        post_id: 'p1',
        author_username: 'bob',
        author_provider: 'web10',
        post_body: { text: 'hello', created_at: '2024-01-01T00:00:00Z' },
      });
      expect(inboxCalls[1][1]).toMatchObject({
        post_id: 'p2',
        author_username: 'bob',
        author_provider: 'web10',
        post_body: { text: 'world', created_at: '2024-01-02T00:00:00Z' },
      });
    });

    it('dedupes on post_id so re-follow does not duplicate', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      mockDiscoveryResponse([
        { post_id: 'p1', author: 'bob', provider: 'web10', text: 'hello', created_at: '2024-01-01T00:00:00Z' },
        { post_id: 'p2', author: 'bob', provider: 'web10', text: 'world', created_at: '2024-01-02T00:00:00Z' },
      ]);

      // Inbox already has p1 — should only create p2
      mock.read.mockResolvedValueOnce([
        { _id: 'inbox-1', post_id: 'p1', author_username: 'bob', delivered_at: '2024-01-01T00:00:00Z' },
      ]);

      await follows.followUser('bob', 'web10');
      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(1);
      expect(inboxCalls[0][1]).toMatchObject({ post_id: 'p2' });
    });

    it('skips backfill when discovery API fails', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });
      mockDiscoveryFail();

      const result = await follows.followUser('bob', 'web10');
      expect(result).toEqual({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(0);
    });

    it('skips backfill when discovery API errors', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });
      mockDiscoveryError();

      const result = await follows.followUser('bob', 'web10');
      expect(result).toEqual({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(0);
    });

    it('backfills on re-follow (reactivate existing)', async () => {
      const existing = { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' };
      mock.read.mockResolvedValueOnce([existing]);
      mock.update.mockResolvedValue({ ...existing, status: 'active' });

      mockDiscoveryResponse([
        { post_id: 'p1', author: 'bob', provider: 'web10', text: 'new post', created_at: '2024-02-01T00:00:00Z' },
      ]);
      mock.read.mockResolvedValueOnce([]);

      await follows.followUser('bob', 'web10');
      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(1);
      expect(inboxCalls[0][1]).toMatchObject({ post_id: 'p1', author_username: 'bob' });
    });

    it('includes tags and media_refs in inbox post_body', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      mockDiscoveryResponse([
        {
          post_id: 'p1',
          author: 'bob',
          provider: 'web10',
          text: 'photo post',
          created_at: '2024-01-01T00:00:00Z',
          tags: ['photo', 'nature'],
          media_refs: ['media-123'],
        },
      ]);
      mock.read.mockResolvedValueOnce([]);

      await follows.followUser('bob', 'web10');
      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(1);
      expect(inboxCalls[0][1].post_body).toMatchObject({
        text: 'photo post',
        tags: ['photo', 'nature'],
        media_refs: ['media-123'],
      });
    });

    it('caps backfill at 20 posts', async () => {
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active' });

      const posts = Array.from({ length: 25 }, (_, i) => ({
        post_id: `p${i}`,
        author: 'bob',
        provider: 'web10',
        text: `post ${i}`,
        created_at: '2024-01-01T00:00:00Z',
      }));
      mockDiscoveryResponse(posts);
      mock.read.mockResolvedValueOnce([]);

      await follows.followUser('bob', 'web10');
      await new Promise((r) => setTimeout(r, 10));

      const inboxCalls = mock.create.mock.calls.filter((c) => c[0] === 'inbox');
      expect(inboxCalls).toHaveLength(20);
    });
  });

  describe('follow toggle round-trip regression (D-follow-toggle)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mock = mockWapi();
    });

    it('readFollow prefers active over rejected when duplicates exist', async () => {
      // Regression: readFollow used to return records[0] with no status
      // filter. If a stale rejected record came first, the UI thought the
      // user wasn't following and the toggle never flipped.
      mock.read.mockResolvedValue([
        { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' },
        { _id: 'f2', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-02-01T00:00:00Z' },
      ]);
      const result = await follows.readFollow('bob', 'web10');
      expect(result?._id).toBe('f2');
      expect(result?.status).toBe('active');
    });

    it('readFollow returns most recent when no active record exists', async () => {
      mock.read.mockResolvedValue([
        { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-02-01T00:00:00Z' },
        { _id: 'f2', username: 'bob', provider: 'web10', status: 'blocked', followed_at: '2024-01-01T00:00:00Z' },
      ]);
      const result = await follows.readFollow('bob', 'web10');
      expect(result?._id).toBe('f1');
    });

    it('followUser updates ALL matching records (not just readFollow winner)', async () => {
      // Regression: followUser only updated the single record from
      // readFollow, leaving stale duplicates behind.
      const stale = { _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' };
      const active = { _id: 'f2', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-02-01T00:00:00Z' };
      mock.read.mockResolvedValueOnce([stale, active]);

      const result = await follows.followUser('bob', 'web10');
      expect(result.status).toBe('active');

      // Both records must be updated
      expect(mock.update).toHaveBeenCalledTimes(2);
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, {
        $set: expect.objectContaining({ status: 'active' }),
      });
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f2' }, {
        $set: expect.objectContaining({ status: 'active' }),
      });
    });

    it('unfollowUser updates ALL matching records (not just readFollow winner)', async () => {
      // Regression: unfollowUser only updated the single record from
      // readFollow, leaving a stale active record behind. After the
      // unfollow, readFollow still returned the stale active record and
      // the UI showed "Following" even though the user unfollowed.
      const active = { _id: 'f1', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-02-01T00:00:00Z' };
      const stale = { _id: 'f2', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-01-01T00:00:00Z' };
      mock.read.mockResolvedValueOnce([active, stale]);

      await follows.unfollowUser('bob', 'web10');

      // Both records must be updated to rejected
      expect(mock.update).toHaveBeenCalledTimes(2);
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, { $set: { status: 'rejected' } });
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f2' }, { $set: { status: 'rejected' } });
    });

    it('full toggle round-trip: follow → readFollow active → unfollow → readFollow null', async () => {
      // End-to-end regression: follow → "Following" → click → unfollows
      // back to "Follow". Hard refresh reflects the truth.
      const mock = mockWapi();

      // Step 1: follow (no existing record)
      mock.read.mockResolvedValueOnce([]);
      mock.create.mockResolvedValue({ _id: 'f1', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-03-01T00:00:00Z', notify: true });
      await follows.followUser('bob', 'web10');

      // Step 2: readFollow should return active
      mock.read.mockResolvedValueOnce([{ _id: 'f1', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-03-01T00:00:00Z' }]);
      const afterFollow = await follows.readFollow('bob', 'web10');
      expect(afterFollow?.status).toBe('active');

      // Step 3: unfollow
      mock.read.mockResolvedValueOnce([{ _id: 'f1', username: 'bob', provider: 'web10', status: 'active', followed_at: '2024-03-01T00:00:00Z' }]);
      await follows.unfollowUser('bob', 'web10');
      expect(mock.update).toHaveBeenCalledWith('follows', { _id: 'f1' }, { $set: { status: 'rejected' } });

      // Step 4: readFollow should NOT return active (status is rejected)
      mock.read.mockResolvedValueOnce([{ _id: 'f1', username: 'bob', provider: 'web10', status: 'rejected', followed_at: '2024-03-01T00:00:00Z' }]);
      const afterUnfollow = await follows.readFollow('bob', 'web10');
      expect(afterUnfollow?.status).toBe('rejected');
      // The UI uses `fr?.status === 'active'` — rejected means NOT following
      expect(afterUnfollow?.status === 'active').toBe(false);
    });
  });

  describe('countUserFollowing (D-user-profile-stats bug #1)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mock = mockWapi();
    });

    it('counts per-user following from the public ledger, not the viewer', async () => {
      // Regression: UserProfileScreen viewer path called countFollows()
      // which reads the SIGNED-IN viewer's follows service. The fix queries
      // the public ledger for entries where author=bob and action=follow.
      mockFetchOnce(true, [
        { _id: 'e1', target: 'follow:charlie@web10', payload: { action: 'follow', author_username: 'bob', author_provider: 'web10' } },
        { _id: 'e2', target: 'follow:dave@web10', payload: { action: 'follow', author_username: 'bob', author_provider: 'web10' } },
        { _id: 'e3', target: 'follow:eve@web10', payload: { action: 'like', author_username: 'bob', author_provider: 'web10' } },
      ]);

      const result = await follows.countUserFollowing('bob', 'web10');
      expect(result).toBe(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('author=bob'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('returns 0 when the user follows nobody', async () => {
      mockFetchOnce(true, []);
      const result = await follows.countUserFollowing('nobody', 'web10');
      expect(result).toBe(0);
    });

    it('never calls countFollows (viewer own follows)', async () => {
      // countUserFollowing must NOT read the viewer's follows service.
      mockFetchOnce(true, []);
      await follows.countUserFollowing('bob', 'web10');
      // countFollows reads from 'follows' service via wapi.read
      expect(mock.read).not.toHaveBeenCalled();
    });
  });

  describe('countFollowers (D-user-profile-stats bug #2)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
      mock = mockWapi();
    });

    it('counts followers from the public ledger, not /discover/users', async () => {
      // Regression: UserProfileScreen viewer path fetched /discover/users?limit=100
      // and filtered client-side. A user outside the first 100 got null.
      // The fix queries the public ledger for entries targeting the user.
      mockFetchOnce(true, [
        { _id: 'e1', target: 'follow:bob@web10', payload: { action: 'follow', author_username: 'alice', author_provider: 'web10' } },
        { _id: 'e2', target: 'follow:bob@web10', payload: { action: 'follow', author_username: 'carol', author_provider: 'web10' } },
      ]);

      const result = await follows.countFollowers('bob', 'web10');
      expect(result).toBe(2);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('target=follow%3Abob%40web10'),
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('returns 0 when nobody follows the user', async () => {
      mockFetchOnce(true, []);
      const result = await follows.countFollowers('nobody', 'web10');
      expect(result).toBe(0);
    });
  });
});