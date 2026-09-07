import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import {
  isAppStorageGroup,
  isInfrastructureGroup,
  getMyCommunityGroups,
  getFeedGroups,
  createCommunityGroup,
  readGroupFeed,
} from '../../data/groups';

function mockV3Client(username = 'jacoby149') {
  const mock = {
    readToken: vi.fn(() => ({ provider: 'api.localhost', username })),
    getMyGroups: vi.fn(),
    createGroup: vi.fn(),
    create: vi.fn(),
    read: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('app-storage group filtering', () => {
  it('isAppStorageGroup matches {service}-{username} slugs', () => {
    expect(isAppStorageGroup('api.localhost/groups/users/jacoby149/media-jacoby149', 'jacoby149')).toBe(true);
    expect(isAppStorageGroup('api.localhost/groups/users/jacoby149/notes-jacoby149', 'jacoby149')).toBe(true);
    expect(isAppStorageGroup('api.localhost/groups/users/jacoby149/sharing-jacoby149', 'jacoby149')).toBe(true);
    // A real community group (named by its owner, not suffixed with the owner) is not app storage
    expect(isAppStorageGroup('api.localhost/groups/users/jacoby149/gaming-night', 'jacoby149')).toBe(false);
    // Another user's app-storage group is not MINE
    expect(isAppStorageGroup('api.localhost/groups/users/bob/media-bob', 'jacoby149')).toBe(false);
    // No username → can't decide → not app storage
    expect(isAppStorageGroup('api.localhost/groups/users/jacoby149/media-jacoby149', undefined)).toBe(false);
  });

  it('isInfrastructureGroup includes app-storage groups', () => {
    expect(isInfrastructureGroup('api.localhost/groups/users/jacoby149/media-jacoby149', 'jacoby149')).toBe(true);
    expect(isInfrastructureGroup('api.localhost/groups/users/jacoby149/gaming-night', 'jacoby149')).toBe(false);
  });

  it('getMyCommunityGroups filters out app-storage + infra groups, keeps communities', async () => {
    const mock = mockV3Client('jacoby149');
    mock.getMyGroups.mockResolvedValue([
      { group_id: 'api.localhost/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 179 },
      { group_id: 'api.localhost/groups/users/jacoby149/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
      { group_id: 'api.localhost/groups/users/jacoby149/media-jacoby149', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      { group_id: 'api.localhost/groups/users/jacoby149/notes-jacoby149', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      { group_id: 'api.localhost/groups/users/jacoby149/sharing-jacoby149', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      { group_id: 'api.localhost/groups/users/jacoby149/gaming-night', join_policy: 'open', my_role: 'member', member_count: 42 },
      { group_id: 'api.localhost/groups/users/bob/photography', join_policy: 'request', my_role: 'owner', member_count: 7 },
    ]);
    const visible = await getMyCommunityGroups();
    const ids = visible.map((g) => g.group_id);
    // App-storage + discover + followers are filtered out
    expect(ids).not.toContain('api.localhost/groups/web10/discover');
    expect(ids).not.toContain('api.localhost/groups/users/jacoby149/followers');
    expect(ids).not.toContain('api.localhost/groups/users/jacoby149/media-jacoby149');
    expect(ids).not.toContain('api.localhost/groups/users/jacoby149/notes-jacoby149');
    expect(ids).not.toContain('api.localhost/groups/users/jacoby149/sharing-jacoby149');
    // Real communities remain
    expect(ids).toContain('api.localhost/groups/users/jacoby149/gaming-night');
    expect(ids).toContain('api.localhost/groups/users/bob/photography');
    expect(visible).toHaveLength(2);
  });
});

describe('getFeedGroups (the feed must be posts, not messages)', () => {
  it('excludes DM groups + app-storage + discover, keeps followers / close-friends / community', async () => {
    const mock = mockV3Client('jacoby149');
    mock.getMyGroups.mockResolvedValue([
      // discover board — its own feed, excluded
      { group_id: 'api.localhost/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 179 },
      // my followers group — public/friends posts attach here, KEPT
      { group_id: 'api.localhost/groups/users/jacoby149/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
      // a followed user's followers group — their posts attach here, KEPT
      { group_id: 'api.localhost/groups/users/bob/followers', join_policy: 'open', my_role: 'member', member_count: 5 },
      // my close-friends group — private posts attach here, KEPT
      { group_id: 'api.localhost/groups/users/jacoby149/close-friends', join_policy: 'request', my_role: 'owner', member_count: 3 },
      // a DM group — messages live here (the bug: they leaked into the feed as empty posts)
      { group_id: 'api.localhost/groups/users/jacoby149/dm-bob-jacoby149', join_policy: 'invite_only', my_role: 'member', member_count: 2 },
      // app-storage groups — other apps' data, excluded
      { group_id: 'api.localhost/groups/users/jacoby149/media-jacoby149', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      { group_id: 'api.localhost/groups/users/jacoby149/notes-jacoby149', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      // real community groups — KEPT
      { group_id: 'api.localhost/groups/users/jacoby149/gaming-night', join_policy: 'open', my_role: 'member', member_count: 42 },
      { group_id: 'api.localhost/groups/users/bob/photography', join_policy: 'request', my_role: 'owner', member_count: 7 },
    ]);
    const feedGroups = await getFeedGroups();

    // The leak: DM + app-storage + discover are gone from the feed
    expect(feedGroups).not.toContain('api.localhost/groups/web10/discover');
    expect(feedGroups).not.toContain('api.localhost/groups/users/jacoby149/dm-bob-jacoby149');
    expect(feedGroups).not.toContain('api.localhost/groups/users/jacoby149/media-jacoby149');
    expect(feedGroups).not.toContain('api.localhost/groups/users/jacoby149/notes-jacoby149');
    // Real post groups remain
    expect(feedGroups).toContain('api.localhost/groups/users/jacoby149/followers');
    expect(feedGroups).toContain('api.localhost/groups/users/bob/followers');
    expect(feedGroups).toContain('api.localhost/groups/users/jacoby149/close-friends');
    expect(feedGroups).toContain('api.localhost/groups/users/jacoby149/gaming-night');
    expect(feedGroups).toContain('api.localhost/groups/users/bob/photography');
    expect(feedGroups).toHaveLength(5);
  });
});

describe('createCommunityGroup', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());

  it('creates the group with a public read grant (anyone → reader) and writes the face', async () => {
    const mock = mockV3Client('jacoby149');
    mock.createGroup.mockResolvedValue({ group_id: 'web10.app/groups/jacoby149/my-group' });
    mock.create.mockResolvedValue({ doc_id: 'identity-doc' });

    const groupId = await createCommunityGroup(
      { name: 'My Group', description: 'About', visibility: 'public', tags: ['a', 'b'], website: 'https://x.com', banner_ref: 'banner-1', avatar_ref: 'avatar-1' },
      'jacoby149',
    );

    expect(groupId).toBe('web10.app/groups/jacoby149/my-group');
    // The group is created with a clean slug + the owner + the public read grant (anyone → reader)
    const [name, joinPolicy, roles, members] = mock.createGroup.mock.calls[0];
    expect(name).toBe('my-group');
    expect(joinPolicy).toBe('open');
    const roleNames = roles.map((r: { name: string }) => r.name);
    expect(roleNames).toContain('reader');
    expect(roleNames).toContain('member');
    expect(roleNames).toContain('owner');
    expect(members).toEqual([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'anyone', role: 'reader' },
    ]);
    // The face is written to the identity service
    expect(mock.create).toHaveBeenCalledWith(
      'web10-social-group-identity',
      expect.objectContaining({
        name: 'My Group',
        description: 'About',
        tags: ['a', 'b'],
        website: 'https://x.com',
        banner_ref: 'banner-1',
        avatar_ref: 'avatar-1',
      }),
      { groups: ['web10.app/groups/jacoby149/my-group'] },
    );
  });

  it('signed-in visibility grants the authenticated reader, private grants neither', async () => {
    const mock = mockV3Client('jacoby149');
    mock.createGroup.mockResolvedValue({ group_id: 'g' });
    mock.create.mockResolvedValue({ doc_id: 'x' });

    await createCommunityGroup({ name: 'S', visibility: 'signed_in' }, 'jacoby149');
    let members = mock.createGroup.mock.calls[0][3];
    expect(members).toEqual([
      { member_key: 'web10.app/users/jacoby149', role: 'owner' },
      { member_key: 'authenticated', role: 'reader' },
    ]);

    mock.createGroup.mockClear();
    await createCommunityGroup({ name: 'P', visibility: 'private' }, 'jacoby149');
    members = mock.createGroup.mock.calls[0][3];
    expect(members).toEqual([{ member_key: 'web10.app/users/jacoby149', role: 'owner' }]);
  });
});

describe('readGroupFeed', () => {
  it('reads posts from the single group', async () => {
    const mock = mockV3Client('jacoby149');
    mock.read.mockResolvedValue([{ doc_id: 'p1' }, { doc_id: 'p2' }]);
    const docs = await readGroupFeed('web10.app/groups/jacoby149/my-group', 50);
    expect(mock.read).toHaveBeenCalledWith('posts', { groups: ['web10.app/groups/jacoby149/my-group'], limit: 50 });
    expect(docs).toHaveLength(2);
  });
});
