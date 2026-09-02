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
    createGroup: vi.fn(),
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
    it('produces the deterministic created-group ID (provider/users/username/followers)', () => {
      // The mock token's provider is web10.app — the ID must use it (the API
      // derives created-group IDs from the token's provider claim).
      expect(groups.followersGroupId('bob')).toBe('web10.app/groups/users/bob/followers');
    });

    it('honors an explicit provider override', () => {
      expect(groups.followersGroupId('bob', 'api.localhost')).toBe('api.localhost/groups/users/bob/followers');
    });
  });

  describe('followUser (v3: join followers group)', () => {
    it('joins the target users followers group', async () => {
      mock.joinGroup.mockResolvedValue({ member_key: 'alice', role: 'member' });
      await follows.followUser('bob');
      expect(mock.joinGroup).toHaveBeenCalledWith('web10.app/groups/users/bob/followers');
    });
  });

  describe('unfollowUser (v3: leave followers group)', () => {
    it('leaves the target users followers group', async () => {
      mock.leaveGroup.mockResolvedValue({ member_key: 'alice', role: 'member' });
      await follows.unfollowUser('bob');
      expect(mock.leaveGroup).toHaveBeenCalledWith('web10.app/groups/users/bob/followers');
    });
  });

  describe('isFollowing (v3: membership in the followers group)', () => {
    it('true when the followers group is in the user group list', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', my_role: 'member' },
        { group_id: 'web10.app/groups/users/bob/followers', my_role: 'member' },
      ]);
      await expect(follows.isFollowing('bob')).resolves.toBe(true);
    });

    it('false when the followers group is absent from the list', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', my_role: 'member' },
      ]);
      await expect(follows.isFollowing('bob')).resolves.toBe(false);
    });
  });

  describe('readFollows (v3: get followers groups)', () => {
    it('returns followers groups the user belongs to', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/bob/followers', my_role: 'member' },
        { group_id: 'web10.app/groups/users/carol/followers', my_role: 'member' },
      ]);
      const result = await groups.getFollowersGroups();
      expect(result).toContain('web10.app/groups/users/bob/followers');
      expect(result).toContain('web10.app/groups/users/carol/followers');
    });
  });

  describe('ensureFollowers', () => {
    it('creates followers group if it does not exist', async () => {
      mock.getGroup.mockRejectedValue(new Error('not found'));
      mock.createGroup = vi.fn().mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      const groupId = await groups.ensureFollowers('alice');
      // Created under the bare slug `followers` (the API embeds the creator)
      // with the bare username as the owner member_key.
      expect(mock.createGroup).toHaveBeenCalledWith(
        'followers',
        'open',
        expect.anything(),
        [{ member_key: 'alice', role: 'owner' }],
      );
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      // A freshly created group has the creator as owner — no join needed.
      expect(mock.getMyGroups).not.toHaveBeenCalled();
    });

    it('returns existing group if it exists and the user is a member', async () => {
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', my_role: 'owner' },
      ]);
      const groupId = await groups.ensureFollowers('alice');
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      // Already a member — no join (a join would add a duplicate member row
      // with the `member` role, downgrading the owner on merge).
      expect(mock.joinGroup).not.toHaveBeenCalled();
    });

    it('HEALS the phantom-member state: group exists but the user is not a member', async () => {
      // Pre-3.25.1 groups were created with a phantom member key
      // (web10.app/users/{username}) the membership checks never match — the
      // group exists but its owner is NOT a member, so every group-scoped read
      // 403s. getGroup doesn't require membership, so "exists" is not "can
      // read": ensureFollowers must join to heal it.
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', my_role: 'member' },
      ]);
      mock.joinGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers', member_key: 'alice', role: 'member' });
      const groupId = await groups.ensureFollowers('alice');
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      expect(mock.joinGroup).toHaveBeenCalledWith('web10.app/groups/users/alice/followers');
    });
  });
});