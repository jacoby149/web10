import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as groups from '../../data/groups';
import { installWeb10Mock } from '../helpers/web10Mock';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.localhost', username: 'alice' })),
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

describe('groups v3 data layer — community filter', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isAppFunctionGroup', () => {
    it('matches the per-user app-function groups (media/notes/sharing-{username})', () => {
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/media-alice', 'alice')).toBe(true);
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/notes-alice', 'alice')).toBe(true);
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/sharing-alice', 'alice')).toBe(true);
    });

    it('does not match community slugs', () => {
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/gaming', 'alice')).toBe(false);
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/bob/photography', 'alice')).toBe(false);
    });

    it('does not match another user\'s app-function group (creator must be the reader)', () => {
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/bob/media-bob', 'alice')).toBe(false);
    });

    it('does not match a slug that merely starts with a prefix', () => {
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/media-alice-fans', 'alice')).toBe(false);
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/noteshq', 'alice')).toBe(false);
    });

    it('requires a username', () => {
      expect(groups.isAppFunctionGroup('api.localhost/groups/users/alice/media-alice')).toBe(false);
    });
  });

  describe('getMyCommunityGroups', () => {
    it('drops the infrastructure (discover, followers, DMs, app-function) and keeps communities', async () => {
      mock.getMyGroups.mockResolvedValue([
        // infrastructure — filtered
        { group_id: 'web10.app/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 999 },
        { group_id: 'api.localhost/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 12 },
        { group_id: 'web10.app/groups/alice/dm-bob', join_policy: 'invite_only', my_role: 'member', member_count: 2 },
        { group_id: 'api.localhost/groups/users/alice/media-alice', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
        { group_id: 'api.localhost/groups/users/alice/notes-alice', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
        { group_id: 'api.localhost/groups/users/alice/sharing-alice', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
        // communities — kept
        { group_id: 'api.localhost/groups/users/alice/gaming', join_policy: 'open', my_role: 'owner', member_count: 7 },
        { group_id: 'api.localhost/groups/users/bob/photography', join_policy: 'request', my_role: 'member', member_count: 42 },
      ]);
      const visible = await groups.getMyCommunityGroups();
      expect(visible.map((g) => g.group_id)).toEqual([
        'api.localhost/groups/users/alice/gaming',
        'api.localhost/groups/users/bob/photography',
      ]);
    });
  });

  describe('requestGroupCreation', () => {
    afterEach(() => {
      delete (window as any).web10;
    });

    it('sends a create_group GCR (name, policy, owner member) to the authenticator', () => {
      const mock = installWeb10Mock({
        token: 'the-token',
        payload: { username: 'alice', provider: 'api.localhost' } as never,
      });
      const onResult = vi.fn();
      const sent = groups.requestGroupCreation('My Community', 'request', onResult);
      expect(sent).toBe(true);
      expect(mock.client.contractRequest).toHaveBeenCalledOnce();
      const [contracts, origin, cb] = mock.client.contractRequest.mock.calls[0];
      expect(origin).toBe('http://auth.localhost');
      expect(contracts).toHaveLength(1);
      expect(contracts[0]).toMatchObject({
        kind: 'group',
        app_origin: window.location.origin,
        action: 'create_group',
        name: 'My Community',
        join_policy: 'request',
        members: [{ member_key: 'alice', role: 'owner' }],
      });
      expect(typeof cb).toBe('function');
      expect(onResult).not.toHaveBeenCalled(); // the callback is handed to the SDK, not fired here
    });

    it('returns false when the SDK (window.web10) is missing', () => {
      delete (window as any).web10;
      expect(groups.requestGroupCreation('X', 'open', vi.fn())).toBe(false);
    });

    it('returns false when no signed-in token is present', () => {
      installWeb10Mock({ token: null });
      expect(groups.requestGroupCreation('X', 'open', vi.fn())).toBe(false);
    });
  });
});
