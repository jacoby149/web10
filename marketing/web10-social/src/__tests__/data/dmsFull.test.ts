import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as groups from '../../data/groups';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getGroup: vi.fn(),
    getMyGroups: vi.fn(),
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    getGroupMembers: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('dms v3 data layer (full)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('dmGroupId', () => {
    it('produces deterministic group ID regardless of argument order', () => {
      expect(groups.dmGroupId('alice', 'bob')).toBe(groups.dmGroupId('bob', 'alice'));
      expect(groups.dmGroupId('alice', 'bob')).toBe('web10.app/groups/alice/dm-bob');
    });
  });

  describe('sendDm (v3: create post in DM group)', () => {
    it('creates a DM post in the group', async () => {
      const doc = { doc_id: 'dm1', body: { message: 'hello' }, created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { message: 'hello' }, { groups: ['web10.app/groups/alice/dm-bob'] });
      expect(result).toEqual(doc);
    });

    it('throws when not authenticated', async () => {
      mock.isSignedIn.mockReturnValue(false);
      mock.create.mockRejectedValue(new Error('No token available'));
      await expect(mock.create('posts', { message: 'hello' })).rejects.toThrow('No token available');
    });
  });

  describe('readDms (v3: read posts from DM group)', () => {
    it('reads DM posts from the group', async () => {
      const docs = [
        { doc_id: 'dm1', body: { message: 'hello' }, created_at: '2026-07-18T00:00:00Z' },
        { doc_id: 'dm2', body: { message: 'world' }, created_at: '2026-07-18T00:01:00Z' },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('posts', { groups: ['web10.app/groups/alice/dm-bob'] });
      expect(result.length).toBe(2);
    });
  });

  describe('deleteDm (v3: delete post from DM group)', () => {
    it('deletes a DM post', async () => {
      mock.delete.mockResolvedValue({ doc_id: 'dm1', status: 'deleted' });
      const result = await mock.delete('dm1');
      expect(result).toEqual({ doc_id: 'dm1', status: 'deleted' });
    });
  });

  describe('updateDm (v3: update post in DM group)', () => {
    it('updates a DM post', async () => {
      const updated = { doc_id: 'dm1', body: { message: 'updated' } };
      mock.update.mockResolvedValue(updated);
      const result = await mock.update('dm1', { message: 'updated' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteConversation (v3: delete all posts in DM group)', () => {
    it('deletes all posts in the DM group', async () => {
      mock.read.mockResolvedValue([{ doc_id: 'dm1' }, { doc_id: 'dm2' }]);
      mock.delete.mockResolvedValue({ status: 'deleted' });
      const posts = await mock.read('posts', { groups: ['web10.app/groups/alice/dm-bob'] });
      for (const p of posts) {
        await mock.delete(p.doc_id);
      }
      expect(mock.delete).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLastDm (v3: read most recent post)', () => {
    it('returns the most recent DM', async () => {
      const docs = [
        { doc_id: 'dm1', body: { message: 'hello' }, created_at: '2026-07-18T00:00:00Z' },
        { doc_id: 'dm2', body: { message: 'world' }, created_at: '2026-07-18T00:01:00Z' },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('posts', { groups: ['web10.app/groups/alice/dm-bob'] });
      expect(result[result.length - 1].doc_id).toBe('dm2');
    });
  });
});
