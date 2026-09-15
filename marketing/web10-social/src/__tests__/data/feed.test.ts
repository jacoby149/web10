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

    it('runs the feed as one w.query with the prepare pass (media + ads + face)', async () => {
      mock.query.mockResolvedValue({ rows: [feedRow()], count: 1 });

      const page = await readFeedPage({ limit: 20 });

      expect(mock.query).toHaveBeenCalledTimes(1);
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
      // The Newest preset (no knobState) → chronological, cursor on created_at.
      expect(sql).toContain('ORDER BY toUnixTimestamp64Milli(p.created_at) DESC');
      expect(page.posts).toHaveLength(1);
    });

    it('maps the prepared rows to PostRecords (counts + profile + avatar)', async () => {
      mock.query.mockResolvedValue({ rows: [feedRow()], count: 1 });

      const page = await readFeedPage({ limit: 20 });

      const post = page.posts[0];
      expect(post._id).toBe('p1');
      expect(post.likes).toBe(5);
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
  });

  describe('readShortsFeed (the render-time gate — shorts.md)', () => {
    // The security seam: a short is a post whose single media is a REAL 9:16
    // video, re-derived from the resolved media — NOT trusted from the
    // client-asserted `short` tag. A direct API caller can tag an image or a
    // lying-ratio file as `short`; the gate must drop it.
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

    it('keeps a real 9:16 video and drops a faked one (image / lying ratio / multi-media)', async () => {
      // p1: 9:16 video, tagged short        → SHORT
      // p2: image, tagged short             → NOT (the anti-hack: image faked as short)
      // p3: 16:9 video, tagged short        → NOT (lying ratio)
      // p4: 9:16 video, NOT tagged          → SHORT (the tag is not required)
      // p5: 9:16 video + image              → NOT (a short is a single video)
      mock.read.mockResolvedValue([
        discoverPost('p1', ['m1'], ['short']),
        discoverPost('p2', ['m2'], ['short']),
        discoverPost('p3', ['m3'], ['short']),
        discoverPost('p4', ['m4'], []),
        discoverPost('p5', ['m5', 'm6'], ['short']),
      ]);
      mock.listMedia.mockResolvedValue([
        mediaDoc('m1', 'video/mp4', 1080, 1920), // 9:16 video
        mediaDoc('m2', 'image/jpeg', 1080, 1920), // image (faked short)
        mediaDoc('m3', 'video/mp4', 1920, 1080), // 16:9 video (lying ratio)
        mediaDoc('m4', 'video/mp4', 1080, 1920), // 9:16 video (untagged)
        mediaDoc('m5', 'video/mp4', 1080, 1920), // 9:16 video
        mediaDoc('m6', 'image/jpeg', 1080, 1080), // image
      ]);

      const shorts = await readShortsFeed(50);
      const ids = shorts.map((s) => s.post._id).sort();

      expect(ids).toEqual(['p1', 'p4']);
      // The kept short carries its resolved 9:16 media.
      const p1 = shorts.find((s) => s.post._id === 'p1')!;
      expect(p1.media.mime_type).toBe('video/mp4');
      expect(p1.media.width!).toBeLessThan(p1.media.height!);
    });

    it('returns an empty list when no post is a genuine short', async () => {
      mock.read.mockResolvedValue([
        discoverPost('p1', ['m1'], ['short']), // image faked as short
        discoverPost('p2', [], []), // no media
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
      // The batched ref read returns reactions from alice (mine) + bob (not mine).
      mock.read.mockResolvedValue([
        reactionDoc('r1', 'alice', 'like', 'p1'),    // mine → liked p1
        reactionDoc('r2', 'alice', 'dislike', 'p2'), // mine → disliked p2
        reactionDoc('r3', 'bob', 'like', 'p1'),      // not mine → ignored
        reactionDoc('r4', 'bob', 'like', 'p3'),      // not mine → ignored
      ]);

      const { liked, disliked } = await readFeedReactions(['p1', 'p2', 'p3']);

      expect(liked).toEqual({ p1: true });
      expect(disliked).toEqual({ p2: true });
      // The read is scoped to the feed (followers) groups, batched over the post ids.
      expect(mock.read).toHaveBeenCalledWith(
        'reactions',
        expect.objectContaining({ groups: expect.any(Array), ref: ['p1', 'p2', 'p3'] }),
      );
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
