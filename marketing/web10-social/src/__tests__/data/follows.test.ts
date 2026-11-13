import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as follows from '../../data/follows';
import * as groups from '../../data/groups';
import { extractProvider } from '../../data/types';

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
    it('uses the current node for the legacy bare-author provider, including unfollow and follow state', async () => {
      mock.readToken.mockReturnValue({ provider: 'api.web10.app', username: 'alice' });
      mock.getMyGroups.mockResolvedValue([{ group_id: 'api.web10.app/groups/users/adam/followers' }]);
      const provider = extractProvider('adam'); // The actual local post-author conversion.
      expect(provider).toBe('web10');
      await follows.followUser('adam', provider);
      expect(mock.joinGroup).toHaveBeenCalledWith('api.web10.app/groups/users/adam/followers');
      await follows.unfollowUser('adam', provider);
      expect(mock.leaveGroup).toHaveBeenCalledWith('api.web10.app/groups/users/adam/followers');
      await expect(follows.isFollowing('adam', 'web10')).resolves.toBe(true);
      mock.getGroupMembers.mockResolvedValue([]);
      await follows.countFollowers('adam', 'web10');
      expect(mock.getGroupMembers).toHaveBeenCalledWith('api.web10.app/groups/users/adam/followers', { limit: 100, offset: 0 });
    });

    it('propagates a genuinely missing group without trying a different provider or creating a group', async () => {
      const missing = new Error('entry not found');
      mock.joinGroup.mockRejectedValue(missing);
      await expect(follows.followUser('adam', 'other.node')).rejects.toBe(missing);
      expect(mock.joinGroup).toHaveBeenCalledExactlyOnceWith('other.node/groups/users/adam/followers');
      expect(mock.createGroup).not.toHaveBeenCalled();
    });

    it('keeps explicit providers for writes and the readFollow compatibility seam', async () => {
      mock.getMyGroups.mockResolvedValue([{ group_id: 'other.node/groups/users/adam/followers' }]);
      await follows.followUser('adam', 'other.node');
      await follows.unfollowUser('adam', 'other.node');
      expect(mock.joinGroup).toHaveBeenCalledWith('other.node/groups/users/adam/followers');
      expect(mock.leaveGroup).toHaveBeenCalledWith('other.node/groups/users/adam/followers');
      await expect(follows.readFollow('adam', 'other.node')).resolves.toEqual({ status: 'active' });
      await expect(follows.readFollow('adam', 'web10.app')).resolves.toEqual({ status: 'rejected' });
    });

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

  it('keeps bare follower keys on the current node when resolving their counts', async () => {
    mock.getGroupMembers.mockResolvedValueOnce([
      { member_key: 'bob', role: 'member' },
      { member_key: 'other.node/users/carol', role: 'member' },
    ]).mockResolvedValue([]);
    const people = await follows.listFollowers('alice');
    expect(people).toEqual([
      { username: 'bob', provider: 'web10' },
      { username: 'carol', provider: 'other.node' },
    ]);
    await follows.getFollowersCount(people[0].username, people[0].provider);
    expect(mock.getGroupMembers).toHaveBeenLastCalledWith('web10.app/groups/users/bob/followers', { limit: 100, offset: 0 });
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

  describe('exact follower counts', () => {
    it('counts member-role followers, not owners, reserved principals or profile readers', async () => {
      mock.getGroupMembers.mockResolvedValue([
        ...['bob', 'other.node/bob', 'node/groups/users/bob/team'].map((member_key) => ({ member_key, role: 'member' })),
        ...['alice', 'explicit.node/alice', 'explicit.node/users/alice', 'anyone', 'authenticated', 'anon'].map((member_key) => ({ member_key, role: 'member' })),
        { member_key: 'admin', role: 'owner' }, { member_key: 'public-face', role: 'reader' },
      ]);
      await expect(follows.getFollowersCount('alice', 'explicit.node')).resolves.toBe(3);
      expect(mock.getGroupMembers).toHaveBeenCalledExactlyOnceWith('explicit.node/groups/users/alice/followers', { limit: 100, offset: 0 });
    });

    it('forwards explicit provider through both count aliases', async () => {
      mock.getGroupMembers.mockResolvedValue([]);
      await follows.countFollowers('alice', 'explicit.node');
      const shim = await import('../../data/wapi');
      await shim.countFollowers('alice', 'explicit.node');
      expect(mock.getGroupMembers.mock.calls.map(([id]) => id)).toEqual([
        'explicit.node/groups/users/alice/followers', 'explicit.node/groups/users/alice/followers',
      ]);
    });

    it('defaults provider from the session and returns real zero only for a successful read', async () => {
      mock.getGroupMembers.mockResolvedValue([{ member_key: 'alice', role: 'owner' }, { member_key: 'anyone', role: 'reader' }]);
      await expect(follows.getFollowersCount('alice')).resolves.toBe(0);
      expect(mock.getGroupMembers).toHaveBeenCalledWith('web10.app/groups/users/alice/followers', { limit: 100, offset: 0 });
    });

    it('pages past full pages, including a final empty page at an exact boundary', async () => {
      mock.getGroupMembers.mockImplementation(async (_id, { offset }) => offset < 1200
        ? Array.from({ length: 100 }, (_, i) => ({ member_key: `fan-${offset + i}`, role: 'member' })) : []);
      await expect(follows.getFollowersCount('alice')).resolves.toBe(1200);
      expect(mock.getGroupMembers.mock.calls.map(([, options]) => options.offset)).toEqual(Array.from({ length: 13 }, (_, i) => i * 100));
    });

    it.each([0, 100])('rejects denied/failed page at offset %i instead of returning zero or a partial count', async (failedOffset) => {
      mock.getGroupMembers.mockImplementation(async (_id, { offset }) => {
        if (offset === failedOffset) throw new Error('enumeration denied');
        return Array.from({ length: 100 }, (_, i) => ({ member_key: `fan-${i}`, role: 'member' }));
      });
      await expect(follows.getFollowersCount('alice')).rejects.toThrow('enumeration denied');
    });

    it('rejects repeated pages instead of looping or counting duplicates', async () => {
      mock.getGroupMembers.mockResolvedValue(Array.from({ length: 100 }, (_, i) => ({ member_key: `fan-${i}`, role: 'member' })));
      await expect(follows.getFollowersCount('alice')).rejects.toThrow('Membership changed');
      expect(mock.getGroupMembers).toHaveBeenCalledTimes(2);
    });
  });

  describe('honest public following count', () => {
    it('pages visible memberships and excludes owned/reader groups', async () => {
      mock.byUserGroups.mockImplementation(async (_key, { offset }) => ({ groups: offset === 0
        ? Array.from({ length: 100 }, (_, i) => ({ group_id: `group-${i}`, role: i === 0 ? 'owner' : i === 1 ? 'reader' : 'member' }))
        : [{ group_id: 'last-group', role: 'member' }] }));
      await expect(follows.countUserFollowingReal('alice', 'explicit.node')).resolves.toBe(99);
      expect(mock.byUserGroups).toHaveBeenNthCalledWith(2, 'explicit.node/alice', { tag: 'web10-social-followers', limit: 100, offset: 100 });
    });

    it('returns real zero for a successful empty public read', async () => {
      mock.byUserGroups.mockResolvedValue({ groups: [] });
      await expect(follows.countUserFollowingReal('alice')).resolves.toBe(0);
      expect(mock.byUserGroups).toHaveBeenCalledWith('alice', { tag: 'web10-social-followers', limit: 100, offset: 0 });
    });

    it.each([0, 100])('propagates failed following page at offset %i', async (failedOffset) => {
      mock.byUserGroups.mockImplementation(async (_key, { offset }) => {
        if (offset === failedOffset) throw new Error('following unavailable');
        return { groups: Array.from({ length: 100 }, (_, i) => ({ group_id: `group-${i}`, role: 'member' })) };
      });
      await expect(follows.countUserFollowingReal('alice')).rejects.toThrow('following unavailable');
    });

    it('rejects repeated following pages', async () => {
      mock.byUserGroups.mockResolvedValue({ groups: Array.from({ length: 100 }, (_, i) => ({ group_id: `group-${i}`, role: 'member' })) });
      await expect(follows.countUserFollowingReal('alice')).rejects.toThrow('Membership changed');
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
