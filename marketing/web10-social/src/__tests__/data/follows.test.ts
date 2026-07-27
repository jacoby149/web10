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
      const updated = { ...existing, status: 'active' };
      mock.update.mockResolvedValue(updated);

      const result = await follows.followUser('bob', 'web10');
      expect(result).toEqual(updated);
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
});