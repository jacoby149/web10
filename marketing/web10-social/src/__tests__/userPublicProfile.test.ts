import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the v3 client seam — the query engine is the read mechanism.
const mockQuery = vi.fn();
const mockReadToken = vi.fn();

vi.mock('@/data/v3', () => ({
  getV3Client: () => ({
    readToken: () => mockReadToken(),
    query: (...args: unknown[]) => mockQuery(...args),
  }),
}));

vi.mock('@/data/groups', () => ({
  followersGroupId: (username: string, provider?: string) =>
    `${provider || 'web10'}/groups/users/${username}/followers`,
  getDiscoverGroupId: () => 'web10/groups/web10/discover',
}));

import { readUserPublicProfile } from '@/data/posts';

// A query row shaped like the engine's prepare pass output (the feed's shape):
// the post doc + resolved media inline in body.media_refs.
const postRow = (docId: string, text: string, media?: Record<string, unknown>) => ({
  doc_id: docId,
  author_key: 'jacobtest',
  body: { text, ...(media ? { media_refs: [media] } : {}) },
  tags: [],
  created_at: '2026-09-28T00:00:00Z',
  ref_value: '',
  ad_mode: 'none',
  ad_target: '',
});

const mediaRef = {
  doc_id: 'media-1',
  object_key: 'videos/post1.mp4',
  mime_type: 'video/mp4',
  read_url: 'http://cdn/video.mp4?sig=x',
  width: 1920,
  height: 1080,
};

describe('readUserPublicProfile — the anon / non-follower profile read (D73 query engine)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Anon — no token (the signed-out visitor).
    mockReadToken.mockReturnValue(null);
  });

  it('reads the author\'s public posts (author-filtered, scoped to followers + discover) + resolves the face', async () => {
    // The posts query returns the author's posts with media resolved inline.
    // The two face queries (avatar + banner) return the presigned URLs.
    mockQuery
      .mockResolvedValueOnce({ rows: [postRow('p-1', 'hello', mediaRef)], count: 1 }) // posts
      .mockResolvedValueOnce({ rows: [{ author_key: 'jacobtest', body: {}, avatar_url: 'http://cdn/avatar.jpg?sig=a' }], count: 1 }) // avatar
      .mockResolvedValueOnce({ rows: [{ author_key: 'jacobtest', body: {}, banner_url: 'http://cdn/banner.jpg?sig=b' }], count: 1 }); // banner

    const result = await readUserPublicProfile('jacobtest');

    // Three queries: the posts (author-filtered) + the avatar face + the banner face.
    expect(mockQuery).toHaveBeenCalledTimes(3);

    // The posts query is author-filtered and scoped to [followers, discover].
    const [postsSql, postsOpts] = mockQuery.mock.calls[0] as [string, { groups: string[]; prepare: Record<string, unknown> }];
    expect(postsSql).toContain("FROM posts p WHERE p.author_key = 'jacobtest'");
    expect(postsOpts.groups).toEqual([
      'web10/groups/users/jacobtest/followers',
      'web10/groups/web10/discover',
    ]);
    // The prepare pass mints the rows (media + ads) — render-ready.
    expect(postsOpts.prepare).toMatchObject({ media: true, ads: true });

    // The posts map to PostRecords with the inline-resolved media.
    expect(result.posts).toHaveLength(1);
    expect(result.posts[0]._id).toBe('p-1');
    expect(result.posts[0].text).toBe('hello');
    expect(result.posts[0].media_refs?.[0]).toMatchObject({ doc_id: 'media-1', read_url: 'http://cdn/video.mp4?sig=x' });

    // The face (avatar + banner) — the presigned URLs the screen renders.
    expect(result.avatarUrl).toBe('http://cdn/avatar.jpg?sig=a');
    expect(result.bannerUrl).toBe('http://cdn/banner.jpg?sig=b');
  });

  it('escapes the username in the SQL literal (a quote cannot break out)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], count: 0 })
      .mockResolvedValueOnce({ rows: [], count: 0 })
      .mockResolvedValueOnce({ rows: [], count: 0 });

    await readUserPublicProfile("o'brien");

    const [postsSql] = mockQuery.mock.calls[0] as [string];
    expect(postsSql).toContain("p.author_key = 'o''brien'");
    expect(postsSql).not.toContain("o'brien'");
  });

  it('returns empty posts + no face when the author has none', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [], count: 0 })
      .mockResolvedValueOnce({ rows: [], count: 0 })
      .mockResolvedValueOnce({ rows: [], count: 0 });

    const result = await readUserPublicProfile('ghost');
    expect(result.posts).toEqual([]);
    expect(result.avatarUrl).toBeUndefined();
    expect(result.bannerUrl).toBeUndefined();
  });
});
