import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as follows from '../../data/follows';
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
    getGroupsManages: vi.fn(),
    joinGroup: vi.fn(),
    leaveGroup: vi.fn(),
    getGroupMembers: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    blockUser: vi.fn(),
    unblockUser: vi.fn(),
    blockUserInGroup: vi.fn(),
    unblockUserInGroup: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('follows v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('followersGroupId', () => {
    it('produces the correct group ID pattern', () => {
      expect(groups.followersGroupId('bob')).toBe('web10.app/groups/bob/followers');
    });
  });

  describe('followUser (v3: join followers group)', () => {
    it('joins the target users followers group', async () => {
      mock.joinGroup.mockResolvedValue({ member_key: 'web10.app/users/alice', role: 'member' });
      await follows.followUser('bob');
      expect(mock.joinGroup).toHaveBeenCalledWith('web10.app/groups/bob/followers');
    });
  });

  describe('unfollowUser (v3: leave followers group)', () => {
    it('leaves the target users followers group', async () => {
      mock.leaveGroup.mockResolvedValue({ member_key: 'web10.app/users/alice', role: 'member' });
      await follows.unfollowUser('bob');
      expect(mock.leaveGroup).toHaveBeenCalledWith('web10.app/groups/bob/followers');
    });
  });

  describe('readFollows (v3: get followers groups)', () => {
    it('returns followers groups the user belongs to', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/bob/followers', my_role: 'member' },
        { group_id: 'web10.app/groups/carol/followers', my_role: 'member' },
      ]);
      const result = await groups.getFollowersGroups();
      expect(result).toContain('web10.app/groups/bob/followers');
      expect(result).toContain('web10.app/groups/carol/followers');
    });
  });

  describe('ensureFollowers', () => {
    it('creates followers group if it does not exist', async () => {
      mock.getGroup.mockRejectedValue(new Error('not found'));
      mock.createGroup = vi.fn().mockResolvedValue({ group_id: 'web10.app/groups/alice/followers' });
      const groupId = await groups.ensureFollowers('alice');
      expect(mock.createGroup).toHaveBeenCalled();
      expect(groupId).toBe('web10.app/groups/alice/followers');
    });

    it('returns existing group if it exists', async () => {
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/alice/followers' });
      const groupId = await groups.ensureFollowers('alice');
      expect(groupId).toBe('web10.app/groups/alice/followers');
    });
  });
});