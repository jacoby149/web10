import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import { readDiscoverFeed, readShortsFeed, readFeedPage, readFeedReactions } from '../../data/feed';
import { getFeedGroups } from '../../data/groups';

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
    listMedia: vi.fn(),
    getMyGroups: vi.fn(),
    query: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('feed v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readDiscoverFeed (v3: read the discover board, server-side ranking)', () => {
    it('passes a power-mean sort config through to the node', async () => {
      mock.read.mockResolvedValue([]);
      const sort = { recency: 0.6, likes: 0.6, comments: 0.4, half_life_ms: 86400000, character: 0 };

      await readDiscoverFeed(sort, 50);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/web10/discover'], sort }),
      );
    });

    it('sorts chronologically only when there is no server sort', async () => {
      mock.read.mockResolvedValue([
        { doc_id: 'old', author_key: 'web10.app/users/alice', body: { text: 'old' }, created_at: '2026-07-01T00:00:00Z' },
        { doc_id: 'new', author_key: 'web10.app/users/alice', body: { text: 'new' }, created_at: '2026-07-18T00:00:00Z' },
      ]);

      const posts = await readDiscoverFeed(null, 50);

      expect(posts.map((p) => p._id)).toEqual(['new', 'old']);
    });

    it('omits the tag filter by default (the Discover board read is unchanged)', async () => {
      mock.read.mockResolvedValue([]);

      await readDiscoverFeed(null, 50);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/web10/discover'] }),
      );
      expect((mock.read.mock.calls[0][1] as Record<string, unknown>).tags).toBeUndefined();
    });

    it('passes a tag filter through to the node (the generic has(tags, …) read)', async () => {
      mock.read.mockResolvedValue([]);

      await readDiscoverFeed(null, 50, ['short']);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/web10/discover'], tags: ['short'] }),
      );
    });
  });

  describe('readFeedPage (D73: the feed as a query over the engine)', () => {
    // A prepared feed row (the shape the engine returns after the prepare pass).
    function feedRow(overrides: Record<string, unknown> = {}) {
      return {
        doc_id: 'p1',
        author_key: 'web10.app/users/bob',
        body: { text: 'a post', media_refs: [{ read_url: 'https://cdn/m1' }] },
        tags: [],
        created_at: '2026-09-15T12:00:00Z',
        ref_value: '',
        ad_mode: 'none',
        ad_target: '',
        likes: 5,
        comments: 2,
        score: 0.7,
        profile_body: JSON.stringify({ display_name: 'Bob', avatar_ref: 'av1' }),
        avatar_url: 'https://cdn/av1',
        ...overrides,
      };
    }

    beforeEach(async () => {
      // readFeedPage reads the feed groups (followers groups only).
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 1 },
        { group_id: 'web10.app/groups/users/bob/followers', join_policy: 'open', my_role: 'member', member_count: 5 },
      ]);
    });

    it('runs the feed as a w.query with the prepare pass (media + ads + face), then reads engagement counts from the discover group', async () => {
      // The feed query returns the prepared post rows; the two follow-up
      // queries (reactions / comments, scoped to the discover group where the
      // engagement docs actually live) return the tallies.
      mock.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM posts p')) return { rows: [feedRow()], count: 1 };
        if (sql.includes('FROM reactions')) return { rows: [{ ref_value: 'p1', like_count: 5, dislike_count: 0 }], count: 1 };
        if (sql.includes('FROM comments')) return { rows: [{ ref_value: 'p1', comment_count: 2 }], count: 1 };
        return { rows: [], count: 0 };
      });

      const page = await readFeedPage({ limit: 20 });

      // One feed query + one reactions-count query + one comments-count query.
      expect(mock.query).toHaveBeenCalledTimes(3);
      const [sql, opts] = mock.query.mock.calls[0];
      expect(opts.groups).toEqual(['web10.app/groups/users/alice/followers', 'web10.app/groups/users/bob/followers']);
      expect(opts.prepare).toEqual({
        media: true,
        ads: true,
        face: { bodyField: 'profile_body', mediaField: 'avatar_ref', authorColumn: 'author_key', urlField: 'avatar_url' },
      });
      // The query is the feed shape: the posts board + the engagement joins +
      // the profile join + the keyset limit (page + 1).
      expect(sql).toContain('FROM posts p');
      expect(sql).toContain('FROM reactions');
      expect(sql).toContain('FROM comments');
      expect(sql).toContain('FROM profile');
      expect(sql).toContain('LIMIT 21');
      // The Most recent preset (no knobState) → chronological, cursor on created_at.
      expect(sql).toContain('ORDER BY toUnixTimestamp64Milli(p.created_at) DESC');
      expect(page.posts).toHaveLength(1);
      // The engagement-count queries are scoped to the feed groups + discover
      // (the group the reactions / comments are written to).
      const [, reactionOpts] = mock.query.mock.calls[1];
      expect(reactionOpts.groups).toEqual([
        'web10.app/groups/users/alice/followers',
        'web10.app/groups/users/bob/followers',
        'web10.app/groups/web10/discover',
      ]);
    });

    it('maps the prepared rows to PostRecords (counts from the discover group + profile + avatar)', async () => {
      mock.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM posts p')) return { rows: [feedRow()], count: 1 };
        if (sql.includes('FROM reactions')) return { rows: [{ ref_value: 'p1', like_count: 5, dislike_count: 1 }], count: 1 };
        if (sql.includes('FROM comments')) return { rows: [{ ref_value: 'p1', comment_count: 2 }], count: 1 };
        return { rows: [], count: 0 };
      });

      const page = await readFeedPage({ limit: 20 });

      const post = page.posts[0];
      expect(post._id).toBe('p1');
      // The like / dislike / comment tallies come from the discover-group count
      // queries (the in-query joins are scoped to the follower groups and see
      // nothing), not from the feed row.
      expect(post.likes).toBe(5);
      expect(post.dislikes).toBe(1);
      expect(post.comments).toBe(2);
      expect(post.score).toBe(0.7);
      expect(post.avatar_url).toBe('https://cdn/av1');
      expect(post.profile?.display_name).toBe('Bob');
      expect(post.author_username).toBe('bob');
    });

    it('computes has_more from the +1 row and the next cursor on created_at (Newest)', async () => {
      // 21 rows for a limit of 20 → has_more, cursor on the 20th row's created_at.
      const rows = Array.from({ length: 21 }, (_, i) =>
        feedRow({ doc_id: `p${i}`, created_at: `2026-09-15T12:00:${String(i).padStart(2, '0')}Z` }),
      );
      mock.query.mockResolvedValue({ rows, count: 21 });

      const page = await readFeedPage({ limit: 20 });

      expect(page.has_more).toBe(true);
      expect(page.posts).toHaveLength(20);
      expect(page.next_cursor).toEqual({ created_at: '2026-09-15T12:00:19Z' });
    });

    it('returns an empty page when there are no feed groups', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 1 },
      ]);
      const page = await readFeedPage({ limit: 20 });
      expect(page).toEqual({ posts: [], has_more: false, next_cursor: null });
      expect(mock.query).not.toHaveBeenCalled();
    });

    it('a tuned (non-Most recent) preset scores on total reactions, not a stale reaction_count column', async () => {
      // Regression: 3.101.0 split the reactions join into like_count / dislike_count
      // but left the power-mean score referencing the old `eng.reaction_count`
      // column. Any preset with a likes weight (e.g. Most liked) emitted a feed
      // query referencing a non-existent column → ClickHouse error → empty feed.
      const captured: string[] = [];
      mock.query.mockImplementation(async (sql: string) => {
        captured.push(sql);
        if (sql.includes('FROM posts p')) return { rows: [feedRow()], count: 1 };
        return { rows: [], count: 0 };
      });

      // "Most liked": recency 0, likes 5, comments 0 → a tuned sort.
      await readFeedPage({
        limit: 20,
        knobState: { recency: 0, likes: 5, comments: 0, halfLife: 5, character: 0 },
      });

      const feedSql = captured.find((s) => s.includes('FROM posts p'))!;
      // The score must use the split columns (total = likes + dislikes), not the
      // pre-split column name that no longer exists in the join.
      expect(feedSql).not.toContain('eng.reaction_count');
      expect(feedSql).toContain('eng.like_count');
      expect(feedSql).toContain('eng.dislike_count');
      // A tuned sort orders by the score, not by created_at.
      expect(feedSql).not.toContain('ORDER BY toUnixTimestamp64Milli(p.created_at) DESC');
    });

    it('counts reposts as posts with repost_of (not type=repost reactions, reposts.md)', async () => {
      const captured: string[] = [];
      mock.query.mockImplementation(async (sql: string) => {
        captured.push(sql);
        if (sql.includes('FROM posts p')) return { rows: [feedRow()], count: 1 };
        return { rows: [], count: 0 };
      });
      await readFeedPage({ limit: 20 });
      const feedSql = captured.find((s) => s.includes('FROM posts p'))!;
      // A repost is a real post doc (reposts.md) — the count is the number of
      // posts whose body.repost_of points at the post, NOT a `type='repost'`
      // reaction (the pre-3.106.0 model). The reactions join keeps like/dislike
      // only.
      expect(feedSql).toContain("JSONExtractString(body, 'repost_of')");
      expect(feedSql).not.toContain("countIf(JSONExtractString(body, 'type') = 'repost')");
      // The repost count column is still selected + coalesced into `reposts`.
      expect(feedSql).toContain('repost_count');
      expect(feedSql).toContain('AS reposts');
    });
  });

  describe('readShortsFeed (the two-layer filter — shorts.md v1.5)', () => {
    // The filter is two-layered (defense in depth):
    //   1. SERVER — readDiscoverFeed(…, ["short"]) sends has(tags, 'short'), so
    //      the node pulls only tagged shorts (cheap + indexable).
    //   2. RENDER — the gate re-derives 9:16 from the resolved media and drops
    //      fakes (a doc tagged `short` whose media isn't a real vertical video).
    // The mock simulates the server's tag filter so the test drives the real
    // two-layer seam (an untagged 9:16 video is dropped server-side, not by
    // the gate).
    function discoverPost(id: string, mediaRefs: string[], tags: string[], author = 'alice') {
      return {
        doc_id: id,
        author_key: `web10.app/users/${author}`,
        body: { media_refs: mediaRefs, tags },
        created_at: '2026-07-18T00:00:00Z',
      };
    }
    function mediaDoc(id: string, mime: string, width: number, height: number) {
      return { doc_id: id, created_at: '2026-07-18T00:00:00Z', body: { mime_type: mime, width, height } };
    }
    // A `read` mock that honors the server-side tag filter (has(tags, …)): it
    // returns only the seeded posts carrying every requested tag.
    function serverFilteredRead(posts: unknown[]) {
      mock.read.mockImplementation(async (_coll: string, opts: { tags?: string[] }) => {
        const all = posts as { body: { tags: string[] } }[];
        if (!opts.tags?.length) return all;
        return all.filter((p) => opts.tags!.every((t) => p.body.tags.includes(t)));
      });
    }

    it('sends the server-side tag filter (["short"]) so the node pulls only shorts', async () => {
      serverFilteredRead([discoverPost('p1', ['m1'], ['short'])]);
      mock.listMedia.mockResolvedValue([mediaDoc('m1', 'video/mp4', 1080, 1920)]);

      await readShortsFeed(50);

      expect(mock.read).toHaveBeenCalledWith(
        'posts',
        expect.objectContaining({ groups: ['web10.app/groups/web10/discover'], tags: ['short'] }),
      );
    });

    it('the render-time gate still drops fakes among the tagged posts (image / lying ratio / multi-media)', async () => {
      // The server already filtered to `short`-tagged posts (the mock simulates
      // that). The gate re-derives 9:16 from the resolved media and drops the
      // fakes:
      // p1: 9:16 video, tagged short        → SHORT
      // p2: image, tagged short             → NOT (image faked as short)
      // p3: 16:9 video, tagged short        → NOT (lying ratio)
      // p5: 9:16 video + image, tagged      → NOT (a short is a single video)
      serverFilteredRead([
        discoverPost('p1', ['m1'], ['short']),
        discoverPost('p2', ['m2'], ['short']),
        discoverPost('p3', ['m3'], ['short']),
        discoverPost('p5', ['m5', 'm6'], ['short']),
      ]);
      mock.listMedia.mockResolvedValue([
        mediaDoc('m1', 'video/mp4', 1080, 1920), // 9:16 video
        mediaDoc('m2', 'image/jpeg', 1080, 1920), // image (faked short)
        mediaDoc('m3', 'video/mp4', 1920, 1080), // 16:9 video (lying ratio)
        mediaDoc('m5', 'video/mp4', 1080, 1920), // 9:16 video
        mediaDoc('m6', 'image/jpeg', 1080, 1080), // image
      ]);

      const shorts = await readShortsFeed(50);
      const ids = shorts.map((s) => s.post._id).sort();

      expect(ids).toEqual(['p1']);
      // The kept short carries its resolved 9:16 media.
      const p1 = shorts.find((s) => s.post._id === 'p1')!;
      expect(p1.media.mime_type).toBe('video/mp4');
      expect(p1.media.width!).toBeLessThan(p1.media.height!);
    });

    it('an untagged 9:16 video is not a short (the server tag filter is the inclusion rule)', async () => {
      // v1 (client-only) kept an untagged 9:16 video. v1.5 makes the tag the
      // server-side inclusion rule: the node filters it out, so it never
      // reaches the gate. Simulate the server: the tagged read returns only
      // tagged posts — the untagged p4 is absent.
      serverFilteredRead([
        discoverPost('p1', ['m1'], ['short']), // tagged 9:16 → SHORT
        discoverPost('p4', ['m4'], []), // untagged 9:16 → dropped server-side
      ]);
      mock.listMedia.mockResolvedValue([
        mediaDoc('m1', 'video/mp4', 1080, 1920),
        mediaDoc('m4', 'video/mp4', 1080, 1920),
      ]);

      const shorts = await readShortsFeed(50);
      const ids = shorts.map((s) => s.post._id).sort();

      // p4 (untagged) was filtered server-side; only p1 remains.
      expect(ids).toEqual(['p1']);
      // And the read did send the tag filter.
      expect(mock.read).toHaveBeenCalledWith('posts', expect.objectContaining({ tags: ['short'] }));
    });

    it('returns an empty list when no post is a genuine short', async () => {
      serverFilteredRead([
        discoverPost('p1', ['m1'], ['short']), // image faked as short
        discoverPost('p2', [], ['short']), // no media
      ]);
      mock.listMedia.mockResolvedValue([mediaDoc('m1', 'image/png', 800, 600)]);

      const shorts = await readShortsFeed(50);
      expect(shorts).toEqual([]);
    });
  });

  describe('getFeedGroups (the following feed — followers groups only)', () => {
    it('includes the user own followers group + followed users followers groups', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 100 },
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
        { group_id: 'web10.app/groups/users/bob/followers', join_policy: 'open', my_role: 'member', member_count: 50 },
        { group_id: 'web10.app/groups/users/carol/followers', join_policy: 'open', my_role: 'member', member_count: 30 },
      ]);
      const feedGroups = await getFeedGroups();
      expect(feedGroups).toContain('web10.app/groups/users/alice/followers');
      expect(feedGroups).toContain('web10.app/groups/users/bob/followers');
      expect(feedGroups).toContain('web10.app/groups/users/carol/followers');
      // Discover is not a feed group
      expect(feedGroups).not.toContain('web10.app/groups/web10/discover');
      expect(feedGroups).toHaveLength(3);
    });

    it('excludes DM groups, community groups, close-friends, and app-storage groups', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/web10/discover', join_policy: 'open', my_role: 'member', member_count: 100 },
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
        // DM group (the message thread) — NOT a feed group
        { group_id: 'web10.app/groups/users/alice/dm-bob', join_policy: 'invite_only', my_role: 'member', member_count: 2 },
        // Community group — NOT a feed group (surfaces in the Groups screen)
        { group_id: 'web10.app/groups/users/bob/chess-club', join_policy: 'request', my_role: 'member', member_count: 42 },
        // Close-friends group — NOT a feed group
        { group_id: 'web10.app/groups/users/alice/close-friends', join_policy: 'request', my_role: 'owner', member_count: 5 },
        // App-storage group (media/notes/sharing) — NOT a feed group
        { group_id: 'web10.app/groups/users/alice/media-alice', join_policy: 'invite_only', my_role: 'owner', member_count: 1 },
      ]);
      const feedGroups = await getFeedGroups();
      // Only the followers group survives
      expect(feedGroups).toEqual(['web10.app/groups/users/alice/followers']);
      expect(feedGroups).not.toContain('web10.app/groups/users/alice/dm-bob');
      expect(feedGroups).not.toContain('web10.app/groups/users/bob/chess-club');
      expect(feedGroups).not.toContain('web10.app/groups/users/alice/close-friends');
      expect(feedGroups).not.toContain('web10.app/groups/users/alice/media-alice');
    });
  });

  describe('readFeedReactions (the reader\'s own like/dislike — the feed\'s initial-state load)', () => {
    // The mock token is alice (see mockV3Client). A reaction doc's author_key
    // is the bare username; only alice's docs count as "mine".
    function reactionDoc(id: string, author: string, type: string, ref: string) {
      return { doc_id: id, author_key: `web10.app/users/${author}`, body: { type, target_id: ref }, ref_value: ref };
    }

    it('returns the reader\'s own liked/disliked posts, ignoring other users\' reactions', async () => {
      // getFeedGroups reads the followers groups off getMyGroups.
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
        { group_id: 'web10.app/groups/users/bob/followers', join_policy: 'open', my_role: 'member', member_count: 50 },
      ]);
      // Two reads: (1) the batched reactions ref read, (2) the reader's own
      // posts (to find their reposts — a repost is a post, reposts.md). The
      // mock routes by service.
      mock.read.mockImplementation(async (service: string) => {
        if (service === 'reactions') {
          return [
            reactionDoc('r1', 'alice', 'like', 'p1'),    // mine → liked p1
            reactionDoc('r2', 'alice', 'dislike', 'p2'), // mine → disliked p2
            reactionDoc('r3', 'bob', 'like', 'p1'),      // not mine → ignored
            reactionDoc('r4', 'bob', 'like', 'p3'),      // not mine → ignored
          ];
        }
        // posts — alice's own posts (no reposts in this case).
        return [];
      });

      const { liked, disliked, reposted } = await readFeedReactions(['p1', 'p2', 'p3']);

      expect(liked).toEqual({ p1: true });
      expect(disliked).toEqual({ p2: true });
      expect(reposted).toEqual({});
      // The reactions read is scoped to the feed (followers) groups, batched over the post ids.
      expect(mock.read).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ groups: expect.any(Array), ref: ['p1', 'p2', 'p3'] }),
      );
    });

    it('marks a post as reposted when the reader has a repost post for it (reposts.md)', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
      ]);
      mock.read.mockImplementation(async (service: string) => {
        if (service === 'reactions') return [];
        // posts — alice's own posts, one of which is a repost of p9.
        return [
          { doc_id: 'my1', author_key: 'web10.app/users/alice', body: { text: 'normal' } },
          { doc_id: 'my2', author_key: 'web10.app/users/alice', body: { text: 'quote', repost_of: 'p9' } },
        ];
      });

      const { reposted } = await readFeedReactions(['p9']);
      // The reader's repost post (repost_of: 'p9') marks p9 as reposted.
      expect(reposted).toEqual({ p9: true });
    });

    it('returns empty maps when there are no posts', async () => {
      const { liked, disliked } = await readFeedReactions([]);
      expect(liked).toEqual({});
      expect(disliked).toEqual({});
      expect(mock.read).not.toHaveBeenCalled();
    });

    it('returns empty maps when signed out (no token)', async () => {
      mock.readToken.mockReturnValue(null);
      const { liked, disliked } = await readFeedReactions(['p1']);
      expect(liked).toEqual({});
      expect(disliked).toEqual({});
      expect(mock.read).not.toHaveBeenCalled();
    });

    it('degrades to empty maps on a read failure (never throws)', async () => {
      mock.getMyGroups.mockResolvedValue([
        { group_id: 'web10.app/groups/users/alice/followers', join_policy: 'open', my_role: 'owner', member_count: 10 },
      ]);
      mock.read.mockRejectedValue(new Error('boom'));
      const { liked, disliked } = await readFeedReactions(['p1']);
      expect(liked).toEqual({});
      expect(disliked).toEqual({});
    });
  });

  describe('readById (v3: read single document)', () => {
    it('reads a document by ID', async () => {
      const doc = { doc_id: 'p1', body: { text: 'hello' } };
      mock.readById.mockResolvedValue(doc);
      const result = await mock.readById('p1', 'posts');
      expect(result).toEqual(doc);
    });
  });

  describe('create (v3: create document with groups)', () => {
    it('creates a document with group attachments', async () => {
      const doc = { doc_id: 'p1', body: { text: 'hello' }, groups: ['g1'] };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('posts', { text: 'hello' }, { groups: ['g1'] });
      expect(result).toEqual(doc);
    });
  });
});
