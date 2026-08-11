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

describe('dms v3 data layer', () => {
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

    it('handles same provider different users', () => {
      expect(groups.dmGroupId('zara', 'amir')).toBe('web10.app/groups/amir/dm-zara');
    });
  });

  describe('sendDm (v3: create post in DM group)', () => {
    it('creates a post in the DM group', async () => {
      const doc = { doc_id: 'dm1', body: { message: 'hello' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { message: 'hello' }, { groups: ['web10.app/groups/alice/dm-bob'] });
      expect(result).toEqual(doc);
    });
  });

  describe('readDms (v3: read posts from DM group)', () => {
    it('reads DM posts from the group', async () => {
      const docs = [{ doc_id: 'dm1', body: { message: 'hello' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('posts', { groups: ['web10.app/groups/alice/dm-bob'] });
      expect(result).toEqual(docs);
    });
  });

  describe('ensureDmGroup', () => {
    it('creates DM group if it does not exist', async () => {
      mock.getGroup.mockRejectedValue(new Error('not found'));
      mock.createGroup = vi.fn().mockResolvedValue({ group_id: 'web10.app/groups/alice/dm-bob' });
      const groupId = await groups.ensureDmGroup('alice', 'bob');
      expect(mock.createGroup).toHaveBeenCalled();
      expect(groupId).toBe('web10.app/groups/alice/dm-bob');
    });

    it('returns existing group if it exists', async () => {
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/alice/dm-bob' });
      const groupId = await groups.ensureDmGroup('alice', 'bob');
      expect(groupId).toBe('web10.app/groups/alice/dm-bob');
    });
  });
});
