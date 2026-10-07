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
    byUserGroups: vi.fn(),
    addGroupMember: vi.fn(),
    removeGroupMember: vi.fn(),
    createGroup: vi.fn(),
    reconcileGroupContract: vi.fn(),
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

  describe('listUserFollowing (D80: the real following read)', () => {
    it('queries by-user with the provider/username member key + the followers tag, and derives the followed user from each group owner', async () => {
      mock.byUserGroups.mockResolvedValue({
        groups: [
          { group_id: 'web10.app/groups/users/bob/followers', owner: 'bob' },
          { group_id: 'web10.app/groups/users/carol/followers', owner: 'carol' },
        ],
        limit: 20,
        offset: 0,
      });
      const result = await follows.listUserFollowing('alice', 'web10.app', { limit: 20, offset: 0 });
      // The node stores member_key as the bare username; the endpoint
      // normalizes the provider/username form, so the client sends the full
      // form and the node resolves it to the same rows.
      expect(mock.byUserGroups).toHaveBeenCalledWith('web10.app/alice', {
        tag: 'web10-social-followers',
        limit: 20,
        offset: 0,
      });
      expect(result).toEqual([
        { username: 'bob', provider: 'web10.app' },
        { username: 'carol', provider: 'web10.app' },
      ]);
    });

    it('falls back to the bare username when no provider is given', async () => {
      mock.byUserGroups.mockResolvedValue({ groups: [], limit: 20, offset: 0 });
      await follows.listUserFollowing('alice', undefined, { limit: 20, offset: 0 });
      expect(mock.byUserGroups).toHaveBeenCalledWith('alice', {
        tag: 'web10-social-followers',
        limit: 20,
        offset: 0,
      });
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
      // with the bare username as the owner member_key. Public by default
      // (D41 + D58 point 7): the `anyone` row carries the `reader` role
      // (profile: readAll), so the face is discoverable from birth.
      expect(mock.createGroup).toHaveBeenCalledWith(
        'followers',
        'open',
        expect.anything(),
        [
          { member_key: 'alice', role: 'owner' },
          { member_key: 'anyone', role: 'reader' },
        ],
        { tags: ['web10-social-followers'] },
      );
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      // A freshly created group has the creator as owner — no join needed.
      expect(mock.getMyGroups).not.toHaveBeenCalled();
    });

    it('creation and reconciliation share explicit audience services without member management', async () => {
      mock.getGroup.mockRejectedValueOnce(new Error('not found'));
      mock.createGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      await groups.ensureFollowers('alice');
      const createdRoles = mock.createGroup.mock.calls[0][2];
      const member = createdRoles.find((role: any) => role.name === 'member');
      expect(member.permissions).toEqual({
        posts: ['readAll'], profile: ['readAll'],
        comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        media_metadata: ['readAll'], public_media: ['readAll'],
      });
      expect(member.permissions.group).toBeUndefined();
      expect(member.permissions['*']).toBeUndefined();
      expect(createdRoles.find((role: any) => role.name === 'reader').permissions)
        .toEqual({ profile: ['readAll'] });
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([{ group_id: 'web10.app/groups/users/alice/followers', my_role: 'owner' }]);
      mock.reconcileGroupContract.mockResolvedValue({ healed: false });
      await groups.ensureFollowers('alice');
      expect(mock.reconcileGroupContract.mock.calls[0][1].roles).toEqual(createdRoles);
      expect(mock.reconcileGroupContract.mock.calls[0][1].members).toBeUndefined();
    });

    it('returns existing group if it exists and the user is a member, and self-heals the contract', async () => {
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', my_role: 'owner' },
      ]);
      // The contract is already in sync — the reconcile is a no-op (no writes).
      mock.reconcileGroupContract.mockResolvedValue({
        inSync: true,
        healed: false,
        diff: { missingRoles: [], rolePermissionGaps: [], missingMembers: [], joinPolicyDrifted: false, missingTags: [], inSync: true },
      });
      const groupId = await groups.ensureFollowers('alice');
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      // Already a member — no join (a join would add a duplicate member row
      // with the `member` role, downgrading the owner on merge).
      expect(mock.joinGroup).not.toHaveBeenCalled();
      // The contract self-heal runs against the canonical followers spec —
      // roles + open join policy + the followers tag. It does NOT list the
      // `anyone` publicness row (that's the owner's choice, not app infra).
      expect(mock.reconcileGroupContract).toHaveBeenCalledWith('web10.app/groups/users/alice/followers', {
        roles: expect.anything(),
        join_policy: 'open',
        tags: ['web10-social-followers'],
      });
      // The heal is additive — it never re-adds the `anyone` row directly.
      expect(mock.addGroupMember).not.toHaveBeenCalled();
    });

    it('SELF-HEALS a contract missing the reader role (the followers `reader` bug)', async () => {
      // A group created before the `reader` role existed lacks the role
      // definition — the `anyone → reader` row is present but inert, so the
      // owner is absent from the public people directory. ensureFollowers
      // (run on sign-in) reconciles the contract, appending the missing role.
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', my_role: 'owner' },
      ]);
      mock.reconcileGroupContract.mockResolvedValue({
        inSync: false,
        healed: true,
        diff: {
          missingRoles: [{ name: 'reader', permissions: { profile: ['readAll'] } }],
          rolePermissionGaps: [],
          missingMembers: [],
          joinPolicyDrifted: false,
          missingTags: [],
          inSync: false,
        },
      });
      await groups.ensureFollowers('alice');
      // The reconcile is what heals it (the SDK primitive does the diff + the
      // additive updateGroup/addGroupMember) — ensureFollowers delegates.
      expect(mock.reconcileGroupContract).toHaveBeenCalledTimes(1);
      const spec = mock.reconcileGroupContract.mock.calls[0][1];
      // The spec carries the reader role (the app infrastructure the heal guarantees).
      expect(spec.roles.map((r: any) => r.name)).toContain('reader');
      // It does NOT declare the `anyone` row (the owner's publicness choice).
      expect(spec.members).toBeUndefined();
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
      // The contract self-heal runs after the join.
      mock.reconcileGroupContract.mockResolvedValue({
        inSync: true,
        healed: false,
        diff: { missingRoles: [], rolePermissionGaps: [], missingMembers: [], joinPolicyDrifted: false, missingTags: [], inSync: true },
      });
      const groupId = await groups.ensureFollowers('alice');
      expect(groupId).toBe('web10.app/groups/users/alice/followers');
      expect(mock.joinGroup).toHaveBeenCalledWith('web10.app/groups/users/alice/followers');
    });

    it('degrades gracefully if the contract self-heal throws (never blocks sign-in)', async () => {
      mock.getGroup.mockResolvedValue({ group_id: 'web10.app/groups/users/alice/followers' });
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', my_role: 'owner' },
      ]);
      mock.reconcileGroupContract.mockRejectedValue(new Error('network'));
      // The heal failure is non-fatal — ensureFollowers still returns the id.
      await expect(groups.ensureFollowers('alice')).resolves.toBe('web10.app/groups/users/alice/followers');
    });
  });
});
