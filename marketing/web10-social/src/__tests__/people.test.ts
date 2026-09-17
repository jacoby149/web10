import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam
const mockReadToken = vi.fn().mockReturnValue({ provider: 'api.localhost', username: 'me' });
const mockGetMyGroups = vi.fn();
const mockRead = vi.fn();
const mockGetGroupMembers = vi.fn();

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    getMyGroups: (...args: unknown[]) => mockGetMyGroups(...args),
    read: (...args: unknown[]) => mockRead(...args),
  }),
}));

vi.mock('@/data/groups', () => ({
  followersGroupId: (username: string, provider?: string) =>
    `${provider || 'api.localhost'}/groups/users/${username}/followers`,
  getGroupMembers: (...args: unknown[]) => mockGetGroupMembers(...args),
  getDiscoverGroupId: () => 'api.localhost/groups/web10/discover',
  isInfrastructureGroup: (groupId: string, username?: string) => {
    if (groupId === 'api.localhost/groups/web10/discover') return true;
    if (groupId.endsWith('/followers')) return true;
    if (/\/dm-[^/]+$/.test(groupId)) return true;
    if (username && groupId.split('/').pop()?.endsWith(`-${username}`)) return true;
    return false;
  },
}));

const mockReadUserProfile = vi.fn();
vi.mock('@/data/profile', () => ({
  readUserProfile: (...args: unknown[]) => mockReadUserProfile(...args),
}));

const mockResolveMediaRefs = vi.fn().mockResolvedValue([]);
vi.mock('@/data/posts', () => ({
  resolveMediaRefs: (...args: unknown[]) => mockResolveMediaRefs(...args),
}));

vi.mock('@/data/types', () => ({
  extractUsername: (key: string) => key.split('/').pop() || key,
}));

import { fetchPeople, computeMutuals, sortPeople, type PersonCard } from '@/data/people';

describe('computeMutuals', () => {
  it('counts intersection of their followers and my following', () => {
    const myFollowing = new Set(['a', 'b', 'c', 'd']);
    const theirFollowers = ['a', 'c', 'e', 'f'];
    expect(computeMutuals(theirFollowers, myFollowing)).toBe(2);
  });

  it('returns 0 when no overlap', () => {
    const myFollowing = new Set(['a', 'b']);
    const theirFollowers = ['x', 'y', 'z'];
    expect(computeMutuals(theirFollowers, myFollowing)).toBe(0);
  });

  it('returns 0 for empty sets', () => {
    expect(computeMutuals([], new Set(['a']))).toBe(0);
    expect(computeMutuals(['a'], new Set())).toBe(0);
  });

  it('handles duplicates in their followers', () => {
    const myFollowing = new Set(['a', 'b']);
    const theirFollowers = ['a', 'a', 'b', 'c'];
    expect(computeMutuals(theirFollowers, myFollowing)).toBe(3);
  });
});

describe('sortPeople', () => {
  const people: PersonCard[] = [
    { username: 'zeta', provider: 'p', mutuals: 2, followers_count: 100, is_following: false },
    { username: 'alpha', provider: 'p', mutuals: 5, followers_count: 50, is_following: false },
    { username: 'mid', provider: 'p', mutuals: 2, followers_count: 200, is_following: false },
    { username: 'beta', provider: 'p', mutuals: 0, followers_count: 500, is_following: false },
  ];

  it('sorts by mutuals descending (default)', () => {
    const sorted = sortPeople(people, 'mutuals');
    expect(sorted[0].username).toBe('alpha');
    expect(sorted[1].username).toBe('mid');
    expect(sorted[2].username).toBe('zeta');
    expect(sorted[3].username).toBe('beta');
  });

  it('breaks mutuals ties by followers_count descending', () => {
    const sorted = sortPeople(people, 'mutuals');
    expect(sorted[1].username).toBe('mid');
    expect(sorted[2].username).toBe('zeta');
  });

  it('sorts by popular (followers_count descending)', () => {
    const sorted = sortPeople(people, 'popular');
    expect(sorted[0].username).toBe('beta');
    expect(sorted[1].username).toBe('mid');
    expect(sorted[2].username).toBe('zeta');
    expect(sorted[3].username).toBe('alpha');
  });

  it('sorts by az (username alphabetical)', () => {
    const sorted = sortPeople(people, 'az');
    expect(sorted.map(p => p.username)).toEqual(['alpha', 'beta', 'mid', 'zeta']);
  });

  it('does not mutate the original array', () => {
    const original = [...people];
    sortPeople(people, 'popular');
    expect(people).toEqual(original);
  });
});

describe('fetchPeople', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadToken.mockReturnValue({ provider: 'api.localhost', username: 'me' });
    mockResolveMediaRefs.mockResolvedValue([]);
    mockReadUserProfile.mockResolvedValue(null);
    mockGetGroupMembers.mockResolvedValue([]);
  });

  it('returns empty array when no token', async () => {
    mockReadToken.mockReturnValue(null);
    const result = await fetchPeople();
    expect(result).toEqual([]);
  });

  it('returns empty array when no candidates found', async () => {
    mockGetMyGroups.mockResolvedValue([]);
    mockRead.mockResolvedValue([]);
    const result = await fetchPeople();
    expect(result).toEqual([]);
  });

  it('builds candidate pool from discover authors and community members', async () => {
    mockGetMyGroups.mockResolvedValue([
      { group_id: 'api.localhost/groups/users/me/followers', join_policy: 'open', my_role: 'owner', member_count: 1 },
      { group_id: 'api.localhost/groups/users/alice/community1', join_policy: 'open', my_role: 'member', member_count: 3 },
    ]);
    mockRead.mockResolvedValue([
      { author_key: 'bob', doc_id: 'd1' },
      { author_key: 'alice', doc_id: 'd2' },
      { author_key: 'me', doc_id: 'd3' },
    ]);
    mockGetGroupMembers.mockResolvedValue([
      { member_key: 'alice', role: 'owner' },
      { member_key: 'charlie', role: 'member' },
    ]);
    mockReadUserProfile.mockResolvedValue({ display_name: 'Alice', bio: 'hi' });

    const result = await fetchPeople(10);
    const usernames = result.map(p => p.username);
    expect(usernames).toContain('bob');
    expect(usernames).toContain('alice');
    expect(usernames).toContain('charlie');
    expect(usernames).not.toContain('me');
  });

  it('computes mutuals correctly from follower lists', async () => {
    mockGetMyGroups.mockResolvedValue([
      { group_id: 'api.localhost/groups/users/alice/followers', join_policy: 'open', my_role: 'member', member_count: 1 },
      { group_id: 'api.localhost/groups/users/bob/followers', join_policy: 'open', my_role: 'member', member_count: 1 },
    ]);
    mockRead.mockResolvedValue([
      { author_key: 'alice', doc_id: 'd1' },
      { author_key: 'bob', doc_id: 'd2' },
    ]);
    // alice's followers: me, bob, dave → mutuals = 1 (bob)
    // bob's followers: me, alice, eve → mutuals = 1 (alice)
    mockGetGroupMembers.mockImplementation(async (groupId: string) => {
      if (groupId.includes('/alice/followers')) {
        return [{ member_key: 'me', role: 'member' }, { member_key: 'bob', role: 'member' }, { member_key: 'dave', role: 'member' }];
      }
      if (groupId.includes('/bob/followers')) {
        return [{ member_key: 'me', role: 'member' }, { member_key: 'alice', role: 'member' }, { member_key: 'eve', role: 'member' }];
      }
      return [];
    });
    mockReadUserProfile.mockResolvedValue({ display_name: 'Test' });

    const result = await fetchPeople(10);
    const alice = result.find(p => p.username === 'alice');
    const bob = result.find(p => p.username === 'bob');
    expect(alice?.mutuals).toBe(1);
    expect(bob?.mutuals).toBe(1);
    expect(alice?.is_following).toBe(true);
    expect(bob?.is_following).toBe(true);
  });

  it('excludes self from candidates', async () => {
    mockGetMyGroups.mockResolvedValue([]);
    mockRead.mockResolvedValue([
      { author_key: 'me', doc_id: 'd1' },
      { author_key: 'other', doc_id: 'd2' },
    ]);
    mockReadUserProfile.mockResolvedValue({ display_name: 'Other' });

    const result = await fetchPeople(10);
    const usernames = result.map(p => p.username);
    expect(usernames).not.toContain('me');
    expect(usernames).toContain('other');
  });

  it('caps candidates at limit', async () => {
    mockGetMyGroups.mockResolvedValue([]);
    mockRead.mockResolvedValue(
      Array.from({ length: 30 }, (_, i) => ({ author_key: `user${i}`, doc_id: `d${i}` }))
    );
    mockReadUserProfile.mockResolvedValue(null);

    const result = await fetchPeople(5);
    expect(result.length).toBe(5);
  });

  it('resolves media URLs for avatar and banner', async () => {
    mockGetMyGroups.mockResolvedValue([]);
    mockRead.mockResolvedValue([{ author_key: 'testuser', doc_id: 'd1' }]);
    mockReadUserProfile.mockResolvedValue({
      display_name: 'Test User',
      avatar_ref: 'av-1',
      banner_ref: 'bn-1',
    });
    mockResolveMediaRefs.mockResolvedValue([
      { _id: 'av-1', url: 'http://x/avatar.png' },
      { _id: 'bn-1', url: 'http://x/banner.png' },
    ]);

    const result = await fetchPeople(10);
    expect(result[0].avatar_url).toBe('http://x/avatar.png');
    expect(result[0].banner_url).toBe('http://x/banner.png');
  });

  it('handles readUserProfile failure gracefully', async () => {
    mockGetMyGroups.mockResolvedValue([]);
    mockRead.mockResolvedValue([{ author_key: 'ghost', doc_id: 'd1' }]);
    mockReadUserProfile.mockRejectedValue(new Error('404'));

    const result = await fetchPeople(10);
    expect(result.length).toBe(1);
    expect(result[0].username).toBe('ghost');
    expect(result[0].display_name).toBe('ghost');
  });
});
