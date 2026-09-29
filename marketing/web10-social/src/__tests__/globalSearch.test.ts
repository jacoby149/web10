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
  readShortsFeed: vi.fn(),
}));

import { globalSearch, searchPeople, searchGroups, searchPosts, searchVideo, searchShorts } from '@/data/search';
import { fetchPeoplePage } from '@/data/people';
import { readGroupDirectory } from '@/data/groups';
import { readDiscoverFeed, readShortsFeed } from '@/data/feed';

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
  // A video post (the /video destination's render-time gate: tagged video).
  { _id: 'v1', text: 'Synthwave video mix', author_username: 'alice', tags: ['video'], created_at: '2026-01-06T00:00:00Z' },
  // A video post with no tag but a resolved video media ref (the backstop).
  { _id: 'v2', text: 'Behind the scenes', author_username: 'bob', media_refs: [{ _id: 'm1', mime_type: 'video/mp4' }], created_at: '2026-01-07T00:00:00Z' },
];

const shortsPool = [
  { post: { _id: 's1', text: 'Synthwave in 15 seconds', author_username: 'alice', created_at: '2026-01-01T00:00:00Z' }, media: { _id: 'm1', mime_type: 'video/mp4', width: 720, height: 1280 } },
  { post: { _id: 's2', text: 'Study vlog vertical', author_username: 'bob', created_at: '2026-01-02T00:00:00Z' }, media: { _id: 'm2', mime_type: 'video/mp4', width: 720, height: 1280 } },
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
    // p1 + p3 (text) + v1 (the tagged video post — posts is the whole board,
    // the video GATE lives in searchVideo, not here).
    expect(results.map((r) => r._id).sort()).toEqual(['p1', 'p3', 'v1']);
  });

  it('filters by author username', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchPosts('alice');
    expect(results.map((r) => r._id).sort()).toEqual(['p1', 'p4', 'v1']);
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

// ── searchVideo (the /video destination's gate) ───────────────────────────────

describe('searchVideo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gates to video posts (the tag OR a resolved video media ref)', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchVideo('synthwave');
    // p1/p3 match the text but are NOT videos (no tag, no video media ref) —
    // the Video destination would not show them, so the search must not.
    expect(results.map((r) => r._id)).toEqual(['v1']);
  });

  it('keeps a video post with no tag but a resolved video media ref (the backstop)', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchVideo('behind');
    expect(results.map((r) => r._id)).toEqual(['v2']);
  });

  it('filters by author username', async () => {
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    const results = await searchVideo('alice');
    expect(results.map((r) => r._id)).toEqual(['v1']);
  });

  it('returns [] for empty query', async () => {
    const results = await searchVideo('');
    expect(results).toHaveLength(0);
    expect(readDiscoverFeed).not.toHaveBeenCalled();
  });
});

// ── searchShorts (the /shorts destination) ────────────────────────────────────

describe('searchShorts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('filters by the short text', async () => {
    vi.mocked(readShortsFeed).mockResolvedValue(shortsPool as any);
    const results = await searchShorts('synthwave');
    expect(results.map((r) => r.post._id)).toEqual(['s1']);
  });

  it('filters by author username', async () => {
    vi.mocked(readShortsFeed).mockResolvedValue(shortsPool as any);
    const results = await searchShorts('bob');
    expect(results.map((r) => r.post._id)).toEqual(['s2']);
  });

  it('caps at limit', async () => {
    const large = Array.from({ length: 10 }, (_, i) => ({
      post: { _id: `s${i}`, text: `Vertical delta ${i}`, author_username: `a${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` },
      media: { _id: `m${i}`, mime_type: 'video/mp4', width: 720, height: 1280 },
    }));
    vi.mocked(readShortsFeed).mockResolvedValue(large as any);
    const results = await searchShorts('delta');
    expect(results).toHaveLength(5);
  });

  it('returns [] for empty query', async () => {
    const results = await searchShorts('');
    expect(results).toHaveLength(0);
    expect(readShortsFeed).not.toHaveBeenCalled();
  });
});

// ── globalSearch (the fan-out) ────────────────────────────────────────────────

describe('globalSearch', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fans out to all five reads and merges the results', async () => {
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: peoplePool, hasMore: false } as any);
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    vi.mocked(readShortsFeed).mockResolvedValue(shortsPool as any);
    const results = await globalSearch('a');
    // 'a' matches many things across all five sections
    expect(results.people.length).toBeGreaterThan(0);
    expect(results.groups.length).toBeGreaterThan(0);
    expect(results.video.length).toBeGreaterThan(0);
    expect(results.shorts.length).toBeGreaterThan(0);
    expect(results.posts.length).toBeGreaterThan(0);
    expect(fetchPeoplePage).toHaveBeenCalledTimes(1);
    expect(readGroupDirectory).toHaveBeenCalledTimes(1);
    expect(readDiscoverFeed).toHaveBeenCalledTimes(2);
    expect(readShortsFeed).toHaveBeenCalledTimes(1);
  });

  it('caps each section independently', async () => {
    const largePeople = Array.from({ length: 20 }, (_, i) => ({
      username: `user${i}`, provider: 'web10', display_name: `User ${i}`, followers_count: i, mutuals: 0, is_following: false,
    }));
    const largeGroups = Array.from({ length: 20 }, (_, i) => ({
      group_id: `g${i}`, name: `Gamma Group ${i}`, owner: 'o', slug: `g-${i}`, join_policy: 'open', member_count: i, tags: [], permission_summary: 'public',
    }));
    const largePosts = Array.from({ length: 20 }, (_, i) => ({
      _id: `p${i}`, text: `Post gamma ${i}`, author_username: `a${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z`, tags: ['video'],
    }));
    const largeShorts = Array.from({ length: 20 }, (_, i) => ({
      post: { _id: `s${i}`, text: `Short gamma ${i}`, author_username: `a${i}`, created_at: `2026-01-0${(i % 9) + 1}T00:00:00Z` },
      media: { _id: `m${i}`, mime_type: 'video/mp4', width: 720, height: 1280 },
    }));
    vi.mocked(fetchPeoplePage).mockResolvedValue({ people: largePeople, hasMore: false } as any);
    vi.mocked(readGroupDirectory).mockResolvedValue(largeGroups as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(largePosts as any);
    vi.mocked(readShortsFeed).mockResolvedValue(largeShorts as any);
    const results = await globalSearch('gamma');
    // 'gamma' matches all groups + posts + shorts but no people (usernames are user0-19)
    expect(results.people).toHaveLength(0);
    expect(results.groups).toHaveLength(5);
    expect(results.video).toHaveLength(5);
    expect(results.shorts).toHaveLength(5);
    expect(results.posts).toHaveLength(5);
  });

  it('degrades a failed section to [] without blanking the others', async () => {
    vi.mocked(fetchPeoplePage).mockRejectedValue(new Error('people read failed'));
    vi.mocked(readGroupDirectory).mockResolvedValue(groupsPool as any);
    vi.mocked(readDiscoverFeed).mockResolvedValue(postsPool as any);
    vi.mocked(readShortsFeed).mockResolvedValue(shortsPool as any);
    // 'synthwave' matches groups (g1), posts (p1, p3, v1) and shorts (s1) —
    // people is mocked to fail.
    const results = await globalSearch('synthwave');
    expect(results.people).toHaveLength(0);
    expect(results.groups.length).toBeGreaterThan(0);
    expect(results.video.length).toBeGreaterThan(0);
    expect(results.shorts.length).toBeGreaterThan(0);
    expect(results.posts.length).toBeGreaterThan(0);
  });

  it('returns all-empty for an empty query without calling any read', async () => {
    const results = await globalSearch('');
    expect(results).toEqual({ people: [], groups: [], video: [], shorts: [], posts: [] });
    expect(fetchPeoplePage).not.toHaveBeenCalled();
    expect(readGroupDirectory).not.toHaveBeenCalled();
    expect(readDiscoverFeed).not.toHaveBeenCalled();
    expect(readShortsFeed).not.toHaveBeenCalled();
  });
});
