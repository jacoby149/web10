import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the three data reads that search.ts fans out to.
// For people, keep the REAL `filterPeople` (the D2 canonical filter) and mock
// only `fetchPeoplePage` (the D0 read) so the test exercises the real filter.
vi.mock('@/data/people', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    fetchPeoplePage: vi.fn(),
  };
});
vi.mock('@/data/groups', () => ({
  readGroupDirectory: vi.fn(),
}));
vi.mock('@/data/feed', () => ({
  readDiscoverFeed: vi.fn(),
}));

import { globalSearch, searchPeople, searchGroups, searchPosts } from '@/data/search';
import { fetchPeoplePage } from '@/data/people';
import { readGroupDirectory } from '@/data/groups';
import { readDiscoverFeed } from '@/data/feed';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const peoplePool = [
  { username: 'alice', provider: 'web10', display_name: 'Alice Smith', followers_count: 100, is_following: false },
  { username: 'bob', provider: 'web10', display_name: 'Bob Jones', followers_count: 50, is_following: true },
  { username: 'charlie', provider: 'web10', display_name: 'Charlie Brown', followers_count: 200, is_following: false },
  { username: 'alicia', provider: 'web10', display_name: 'Alicia Keys', followers_count: 300, is_following: false },
  { username: 'dave', provider: 'web10', display_name: 'Dave', followers_count: 10, is_following: false },
];

const groupsPool = [
  { group_id: 'g1', name: 'Synthwave Sessions', owner: 'nova', slug: 'synthwave', join_policy: 'open', member_count: 50, tags: ['music', 'retro'], permission_summary: 'public' },
  { group_id: 'g2', name: 'Lofi Study Room', owner: 'kai', slug: 'lofi', join_policy: 'open', member_count: 30, tags: ['study'], permission_summary: 'public' },
  { group_id: 'g3', name: 'Nova Fans', owner: 'nova', slug: 'nova-fans', join_policy: 'invite_only', member_count: 100, tags: [], permission_summary: 'private' },
  { group_id: 'g4', name: 'Web10 Devs', owner: 'jacoby', slug: 'web10-devs', join_policy: 'open', member_count: 15, tags: ['dev'], permission_summary: 'public' },
];

const postsPool = [
  { _id: 'p1', text: 'Check out this synthwave mix I made', author_username: 'alice', created_at: '2026-01-01T00:00:00Z' },
  { _id: 'p2', text: 'Study tips for finals week', author_username: 'bob', created_at: '2026-01-02T00:00:00Z' },
  { _id: 'p3', text: 'Synthwave is back and it is beautiful', author_username: 'charlie', created_at: '2026-01-03T00:00:00Z' },
  { _id: 'p4', text: 'New post from alice', author_username: 'alice', created_at: '2026-01-04T00:00:00Z' },
  { _id: 'p5', text: 'Nothing matching here', author_username: 'dave', created_at: '2026-01-05T00:00:00Z' },
];

// ── searchPeople ──────────────────────────────────────────────────────────────

describe('searchPeople', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by username (case-insensitive)', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: peoplePool, hasMore: false } as any);
    const results = await searchPeople('ALICE');
    // Matches 'alice' (username) + 'alicia' (username contains 'alic'... no, 'alicia' doesn't contain 'alice')
    // Actually 'alice' matches username 'alice'. 'alicia' does NOT contain 'alice'.
    // display_name 'Alice Smith' contains 'alice'. 'Alicia Keys' does not.
    expect(results.map((r) => r.username)).toContain('alice');
    expect(results.every((r) => r.username.toLowerCase().includes('alice') || (r.display_name || '').toLowerCase().includes('alice'))).toBe(true);
  });

  it('filters by display name', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: peoplePool, hasMore: false } as any);
    const results = await searchPeople('smith');
    expect(results).toHaveLength(1);
    expect(results[0].username).toBe('alice');
  });

  it('caps at limit (default 5)', async () => {
    const largePool = Array.from({ length: 20 }, (_, i) => ({
      username: `user${i}`,
      provider: 'web10',
      display_name: `User Number ${i}`,
      followers_count: i,
      mutuals: 0,
      is_following: false,
    }));
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: largePool, hasMore: false } as any);
    const results = await searchPeople('user');
    expect(results).toHaveLength(5);
  });

  it('respects a custom limit', async () => {
    const largePool = Array.from({ length: 20 }, (_, i) => ({
      username: `user${i}`,
      provider: 'web10',
      display_name: `User Number ${i}`,
      followers_count: i,
      mutuals: 0,
      is_following: false,
    }));
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: largePool, hasMore: false } as any);
    const results = await searchPeople('user', 3);
    expect(results).toHaveLength(3);
  });

  it('returns [] for empty/whitespace query without calling fetchPeoplePage', async () => {
    const results = await searchPeople('   ');
    expect(results).toHaveLength(0);
    expect(fetchPeoplePage).not.toHaveBeenCalled();
  });

  it('returns [] when no one matches', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: peoplePool, hasMore: false } as any);
    const results = await searchPeople('zzz-not-a-user');
    expect(results).toHaveLength(0);
  });
});

// ── searchGroups ──────────────────────────────────────────────────────────────

describe('searchGroups', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by name', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    const results = await searchGroups('synthwave');
    expect(results).toHaveLength(1);
    expect(results[0].group_id).toBe('g1');
  });

  it('filters by owner', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    const results = await searchGroups('nova');
    // 'nova' owns g1 (Synthwave Sessions) and g3 (Nova Fans)
    expect(results.map((r) => r.group_id).sort()).toEqual(['g1', 'g3']);
  });

  it('filters by tags', async () => {
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    const results = await searchGroups('music');
    expect(results).toHaveLength(1);
    expect(results[0].group_id).toBe('g1');
  });

  it('caps at limit', async () => {
    const largePool = Array.from({ length: 10 }, (_, i) => ({
      group_id: `g${i}`,
      name: `Group Alpha ${i}`,
      owner: 'owner',
      slug: `alpha-${i}`,
      join_policy: 'open',
      member_count: i,
      tags: [],
      permission_summary: 'public',
    }));
    vi.mocked(readGroupDirectory).mockResolvedValue(largePool as any);
    const results = await searchGroups('alpha');
    expect(results).toHaveLength(5);
  });

  it('returns [] for empty query', async () => {
    const results = await searchGroups('');
    expect(results).toHaveLength(0);
    expect(readGroupDirectory).not.toHaveBeenCalled();
  });
});

// ── searchPosts ───────────────────────────────────────────────────────────────

describe('searchPosts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by post text', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchPosts('synthwave');
    expect(results.map((r) => r._id).sort()).toEqual(['p1', 'p3']);
  });

  it('filters by author username', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchPosts('alice');
    expect(results.map((r) => r._id).sort()).toEqual(['p1', 'p4']);
  });

  it('caps at limit', async () => {
    const largePool = Array.from({ length: 10 }, (_, i) => ({
      _id: `p${i}`,
      text: `Post about beta topic ${i}`,
      author_username: `author${i}`,
      created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
    }));
    vi.mocked(readDiscoverFeed).mockResolvedValue(largePool as any);
    const results = await searchPosts('beta');
    expect(results).toHaveLength(5);
  });

  it('returns [] for empty query', async () => {
    const results = await searchPosts('');
    expect(results).toHaveLength(0);
    expect(readDiscoverFeed).not.toHaveBeenCalled();
  });
});

// ── globalSearch (the fan-out) ────────────────────────────────────────────────

describe('globalSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fans out to all three reads and merges the results', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: peoplePool, hasMore: false } as any);
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await globalSearch('a');
    // 'a' matches many things across all three sections
    expect(results.people.length).toBeGreaterThan(0);
    expect(results.groups.length).toBeGreaterThan(0);
    expect(results.posts.length).toBeGreaterThan(0);
    expect(fetchPeoplePage).toHaveBeenCalledTimes(1);
    expect(readGroupDirectory).toHaveBeenCalledTimes(1);
    expect(readDiscoverFeed).toHaveBeenCalledTimes(1);
  });

  it('caps each section independently', async () => {
    const largePeople = Array.from({ length: 20 }, (_, i) => ({
      username: `user${i}`, provider: 'web10', display_name: `User ${i}`, followers_count: i, mutuals: 0, is_following: false,
    }));
    const largeGroups = Array.from({ length: 20 }, (_, i) => ({
      group_id: `g${i}`, name: `Gamma Group ${i}`, owner: 'o', slug: `g-${i}`, join_policy: 'open', member_count: i, tags: [], permission_summary: 'public',
    }));
    const largePosts = Array.from({ length: 20 }, (_, i) => ({
      _id: `p${i}`, text: `Post gamma ${i}`, author_username: `a${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`,
    }));
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: largePeople, hasMore: false } as any);
    vi.mocked(readGroupDirectory).mockResolvedValue(largeGroups as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(largePosts as any);
    const results = await globalSearch('gamma');
    // 'gamma' matches all groups + posts but no people (usernames are user0-19)
    expect(results.people).toHaveLength(0);
    expect(results.groups).toHaveLength(5);
    expect(results.posts).toHaveLength(5);
  });

  it('degrades a failed section to [] without blanking the others', async () => {
    vi.mocked(fetchPeoplePage).mockRejectedValue(new Error('people read failed'));
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    // 'synthwave' matches groups (g1) and posts (p1, p3) but people is mocked to fail.
    const results = await globalSearch('synthwave');
    expect(results.people).toHaveLength(0);
    expect(results.groups.length).toBeGreaterThan(0);
    expect(results.posts.length).toBeGreaterThan(0);
  });

  it('returns all-empty for an empty query without calling any read', async () => {
    const results = await globalSearch('');
    expect(results).toEqual({ people: [], groups: [], posts: [] });
    expect(fetchPeoplePage).not.toHaveBeenCalled();
    expect(readGroupDirectory).not.toHaveBeenCalled();
    expect(readDiscoverFeed).not.toHaveBeenCalled();
  });
});
