import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam (the D0 directory read + the my-follows read).
const mockReadToken = vi.fn();
const mockListPeopleDirectory = vi.fn();
const mockGetMyGroups = vi.fn();

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    listPeopleDirectory: (...args: unknown[]) => mockListPeopleDirectory(...args),
    getMyGroups: (...args: unknown[]) => mockGetMyGroups(...args),
  }),
}));

const mockResolveMediaRefs = vi.fn().mockResolvedValue([]);
vi.mock('@/data/posts', () => ({
  resolveMediaRefs: (...args: unknown[]) => mockResolveMediaRefs(...args),
}));

import {
  fetchPeoplePage,
  sortPeople,
  filterPeople,
  type PersonCard,
} from '@/data/people';

// A D0 directory user: { username, follower_count, profile }.
const dirUser = (username: string, follower_count: number, profile: Record<string, unknown> = {}) => ({
  username,
  follower_count,
  profile,
});

describe('sortPeople', () => {
  const people: PersonCard[] = [
    { username: 'zeta', provider: 'p', followers_count: 100, is_following: false },
    { username: 'alpha', provider: 'p', followers_count: 50, is_following: false },
    { username: 'mid', provider: 'p', followers_count: 200, is_following: false },
    { username: 'beta', provider: 'p', followers_count: 500, is_following: false },
  ];

  it('sorts by popular (followers_count descending, default)', () => {
    const sorted = sortPeople(people, 'popular');
    expect(sorted.map((p) => p.username)).toEqual(['beta', 'mid', 'zeta', 'alpha']);
  });

  it('breaks popular ties by username', () => {
    const tied: PersonCard[] = [
      { username: 'zoe', provider: 'p', followers_count: 10, is_following: false },
      { username: 'amy', provider: 'p', followers_count: 10, is_following: false },
    ];
    expect(sortPeople(tied, 'popular').map((p) => p.username)).toEqual(['amy', 'zoe']);
  });

  it('sorts by az (username alphabetical)', () => {
    const sorted = sortPeople(people, 'az');
    expect(sorted.map((p) => p.username)).toEqual(['alpha', 'beta', 'mid', 'zeta']);
  });

  it('does not mutate the original array', () => {
    const original = [...people];
    sortPeople(people, 'popular');
    expect(people).toEqual(original);
  });
});

describe('filterPeople', () => {
  const people: PersonCard[] = [
    { username: 'zoe', provider: 'p', display_name: 'Zoe Rivers', followers_count: 10, is_following: false },
    { username: 'amy', provider: 'p', display_name: 'Amy', followers_count: 20, is_following: false },
    { username: 'river-king', provider: 'p', display_name: 'King', followers_count: 30, is_following: false },
  ];

  it('filters by display name (case-insensitive)', () => {
    expect(filterPeople(people, 'zoe').map((p) => p.username)).toEqual(['zoe']);
  });

  it('filters by handle/username', () => {
    expect(filterPeople(people, 'river-king').map((p) => p.username)).toEqual(['river-king']);
  });

  it('matches the display name substring', () => {
    expect(filterPeople(people, 'rivers').map((p) => p.username)).toEqual(['zoe']);
  });

  it('returns everyone for an empty/whitespace query', () => {
    expect(filterPeople(people, '').length).toBe(3);
    expect(filterPeople(people, '   ').length).toBe(3);
  });

  it('returns empty when nothing matches', () => {
    expect(filterPeople(people, 'nobody')).toEqual([]);
  });
});

describe('fetchPeoplePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadToken.mockReturnValue({ provider: 'api.localhost', username: 'me' });
    mockGetMyGroups.mockResolvedValue([]);
    mockResolveMediaRefs.mockResolvedValue([]);
  });

  it('maps D0 users to person cards (face + unspoofable follower count)', async () => {
    mockListPeopleDirectory.mockResolvedValue({
      users: [
        dirUser('alice', 120, { display_name: 'Alice', bio: 'hi', avatar_ref: 'av-1' }),
        dirUser('bob', 40),
      ],
      limit: 20,
      offset: 0,
    });

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people).toHaveLength(2);
    const alice = people.find((p) => p.username === 'alice')!;
    expect(alice.display_name).toBe('Alice');
    expect(alice.bio).toBe('hi');
    expect(alice.followers_count).toBe(120);
    expect(alice.provider).toBe('api.localhost');
    // bob has no profile face fields — falls back to the username.
    const bob = people.find((p) => p.username === 'bob')!;
    expect(bob.display_name).toBe('bob');
    expect(bob.followers_count).toBe(40);
  });

  it('passes limit + offset to the D0 read', async () => {
    mockListPeopleDirectory.mockResolvedValue({ users: [], limit: 20, offset: 20 });
    await fetchPeoplePage({ limit: 20, offset: 20 });
    expect(mockListPeopleDirectory).toHaveBeenCalledWith({ limit: 20, offset: 20 });
  });

  it('sets is_following from the my-follows group membership', async () => {
    mockListPeopleDirectory.mockResolvedValue({
      users: [dirUser('alice', 10), dirUser('bob', 5)],
      limit: 20,
      offset: 0,
    });
    // I follow alice (member of her /followers group) but not bob.
    mockGetMyGroups.mockResolvedValue([
      { group_id: 'api.localhost/groups/users/alice/followers', join_policy: 'open', my_role: 'member', member_count: 1 },
    ]);

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people.find((p) => p.username === 'alice')!.is_following).toBe(true);
    expect(people.find((p) => p.username === 'bob')!.is_following).toBe(false);
  });

  it('resolves the face media (avatar + banner) per person', async () => {
    mockListPeopleDirectory.mockResolvedValue({
      users: [dirUser('alice', 10, { avatar_ref: 'av-1', banner_ref: 'bn-1' })],
      limit: 20,
      offset: 0,
    });
    mockResolveMediaRefs.mockResolvedValue([
      { _id: 'av-1', url: 'http://x/avatar.png' },
      { _id: 'bn-1', url: 'http://x/banner.png' },
    ]);

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people[0].avatar_url).toBe('http://x/avatar.png');
    expect(people[0].banner_url).toBe('http://x/banner.png');
  });

  it('reports hasMore=true when the page is full, false when short', async () => {
    // Full page (20 of 20) → there may be more.
    mockListPeopleDirectory.mockResolvedValue({
      users: Array.from({ length: 20 }, (_, i) => dirUser(`u${i}`, i)),
      limit: 20,
      offset: 0,
    });
    expect((await fetchPeoplePage({ limit: 20, offset: 0 })).hasMore).toBe(true);

    // Short page (3 of 20) → last page.
    mockListPeopleDirectory.mockResolvedValue({
      users: [dirUser('a', 1), dirUser('b', 2), dirUser('c', 3)],
      limit: 20,
      offset: 40,
    });
    expect((await fetchPeoplePage({ limit: 20, offset: 40 })).hasMore).toBe(false);
  });

  it('degrades is_following to false when the my-follows read fails', async () => {
    mockListPeopleDirectory.mockResolvedValue({ users: [dirUser('alice', 10)], limit: 20, offset: 0 });
    mockGetMyGroups.mockRejectedValue(new Error('boom'));

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people[0].is_following).toBe(false);
  });

  it('degrades face media to the fallback when the media read fails', async () => {
    mockListPeopleDirectory.mockResolvedValue({
      users: [dirUser('alice', 10, { avatar_ref: 'av-1' })],
      limit: 20,
      offset: 0,
    });
    mockResolveMediaRefs.mockRejectedValue(new Error('boom'));

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people[0].avatar_url).toBeUndefined();
    expect(people[0].avatar_ref).toBe('av-1');
  });

  it('works anon (no token) — is_following false, provider defaults', async () => {
    mockReadToken.mockReturnValue(null);
    mockListPeopleDirectory.mockResolvedValue({ users: [dirUser('alice', 10)], limit: 20, offset: 0 });

    const { people } = await fetchPeoplePage({ limit: 20, offset: 0 });
    expect(people[0].is_following).toBe(false);
    expect(people[0].provider).toBe('web10');
    // Anon: no my-follows read is attempted.
    expect(mockGetMyGroups).not.toHaveBeenCalled();
  });
});
