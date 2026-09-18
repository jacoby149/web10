import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    readRefCounts: vi.fn().mockResolvedValue({}),
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
    getMyGroups: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('comments v3 data layer (the Facebook model, comments.md)', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readComments (top-level page, ref = post, keyset cursor)', () => {
    it('reads a page of top-level comments with the cursor + order', async () => {
      const { readComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
      ]);
      const page = await readComments('p1', ['me'], { cursor: 'cur-1', limit: 20 });
      // the ref read keys on the post + carries the cursor + order
      expect(mock.read).toHaveBeenCalledWith('comments', {
        groups: ['me'],
        ref: 'p1',
        limit: 20,
        cursor: 'cur-1',
        order: 'asc',
      });
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0]._id).toBe('cm1');
    });

    it('nextCursor is null when the page is short of the limit (exhausted)', async () => {
      const { readComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
      ]);
      const page = await readComments('p1', ['me'], { limit: 20 });
      // 1 row < limit 20 → no more
      expect(page.nextCursor).toBeNull();
    });

    it('nextCursor is "created_at|doc_id" of the last row when the page is full', async () => {
      const { readComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'a' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
        { doc_id: 'cm2', author_key: 'carol', body: { post_id: 'p1', text: 'b' }, ref_value: 'p1', created_at: '2026-01-01T01:00:00Z' },
      ]);
      const page = await readComments('p1', ['me'], { limit: 2 });
      // 2 rows = limit 2 → more; cursor is the last row's created_at|doc_id
      expect(page.nextCursor).toBe('2026-01-01T01:00:00Z|cm2');
    });
  });

  describe('readReplies (a comment reply page, ref = commentId)', () => {
    it('reads a page of a comment replies (ref = the comment id)', async () => {
      const { readReplies } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm3', author_key: 'carol', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply' }, ref_value: 'cm1', created_at: '2026-01-01T02:00:00Z' },
      ]);
      const page = await readReplies('cm1', ['me'], { limit: 5 });
      // the reply read keys on the PARENT comment (the Facebook model)
      expect(mock.read).toHaveBeenCalledWith('comments', {
        groups: ['me'],
        ref: 'cm1',
        limit: 5,
        cursor: undefined,
        order: 'asc',
      });
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0]._id).toBe('cm3');
    });
  });

  describe('countComments (top-level count via readRefCounts)', () => {
    it('counts a post top-level comments (GROUP BY ref_value)', async () => {
      const { countComments } = await import('../../data/comments');
      mock.readRefCounts.mockResolvedValue({ 'p1': 7 });
      const n = await countComments('p1', ['me']);
      expect(mock.readRefCounts).toHaveBeenCalledWith('comments', { groups: ['me'], ref: 'p1' });
      expect(n).toBe(7);
    });

    it('returns 0 when the post has no top-level comments', async () => {
      const { countComments } = await import('../../data/comments');
      mock.readRefCounts.mockResolvedValue({});
      const n = await countComments('p1', ['me']);
      expect(n).toBe(0);
    });
  });

  describe('countRepliesByComment (reply counts for a set of comments)', () => {
    it('counts replies for each comment (GROUP BY ref_value over the ids)', async () => {
      const { countRepliesByComment } = await import('../../data/comments');
      mock.readRefCounts.mockResolvedValue({ 'cm1': 3, 'cm2': 0 });
      const counts = await countRepliesByComment(['cm1', 'cm2'], ['me']);
      expect(mock.readRefCounts).toHaveBeenCalledWith('comments', { groups: ['me'], ref: ['cm1', 'cm2'] });
      expect(counts).toEqual({ 'cm1': 3, 'cm2': 0 });
    });

    it('returns {} for an empty id set (no read issued)', async () => {
      const { countRepliesByComment } = await import('../../data/comments');
      const counts = await countRepliesByComment([], ['me']);
      expect(counts).toEqual({});
      expect(mock.readRefCounts).not.toHaveBeenCalled();
    });
  });

  describe('createComment (the write model: ref_value = the parent)', () => {
    it('a top-level comment refs the post', async () => {
      const { createComment } = await import('../../data/comments');
      mock.create.mockResolvedValue({ doc_id: 'cm1', author_key: 'alice', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1' });
      await createComment({ post_id: 'p1', text: 'top' } as any);
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.objectContaining({ post_id: 'p1' }),
        expect.objectContaining({ ref_value: 'p1' }),
      );
    });

    it('a reply refs the PARENT comment (the Facebook model)', async () => {
      const { createComment } = await import('../../data/comments');
      // the reply nudge reads the parent comment's author (fire-and-forget)
      mock.readById.mockResolvedValue({ doc_id: 'cm1', author_key: 'bob', body: { text: 'top' } });
      mock.create.mockResolvedValue({ doc_id: 'cm2', author_key: 'alice', body: { post_id: 'p1', parent_id: 'cm1', text: 're' }, ref_value: 'cm1' });
      await createComment({ post_id: 'p1', text: 're', parent_id: 'cm1' } as any);
      // ref_value is the parent comment, NOT the post
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.objectContaining({ parent_id: 'cm1', post_id: 'p1' }),
        expect.objectContaining({ ref_value: 'cm1' }),
      );
    });
  });

  describe('readThreadComments (the thread seam: page + likes + replyCounts)', () => {
    it('returns a page enriched with likeCount/likedByMe + replyCounts', async () => {
      const { readThreadComments } = await import('../../data/comments');
      // the top-level read (ref = post)
      mock.read.mockImplementation(async (service: string, opts: { ref?: unknown }) => {
        if (service === 'reactions') {
          return [{ doc_id: 'r1', author_key: 'alice', body: { type: 'like' }, ref_value: 'cm1' }];
        }
        return [
          { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
        ];
      });
      // the like count (GROUP BY over the page's comments)
      mock.query.mockResolvedValue({ rows: [{ ref_value: 'cm1', like_count: 2 }], count: 1 });
      // the reply counts (cm1 has 3 replies)
      mock.readRefCounts.mockResolvedValue({ 'cm1': 3 });
      const page = await readThreadComments('p1', ['me']);
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0].likeCount).toBe(2);
      expect(page.comments[0].likedByMe).toBe(true);
      expect(page.replyCounts).toEqual({ 'cm1': 3 });
    });

    it('degrades to no like fields + empty replyCounts when the enrichment fails', async () => {
      const { readThreadComments } = await import('../../data/comments');
      mock.read.mockImplementation(async (service: string) => {
        if (service === 'reactions') throw new Error('boom');
        return [
          { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
        ];
      });
      mock.query.mockRejectedValue(new Error('boom'));
      mock.readRefCounts.mockRejectedValue(new Error('boom'));
      const page = await readThreadComments('p1', ['me']);
      expect(page.comments).toHaveLength(1);
      expect(page.comments[0].likeCount).toBe(0);
      expect(page.comments[0].likedByMe).toBe(false);
      expect(page.replyCounts).toEqual({});
    });

    it('returns an empty page when there are no comments', async () => {
      const { readThreadComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([]);
      const page = await readThreadComments('p1', ['me']);
      expect(page.comments).toEqual([]);
      expect(page.replyCounts).toEqual({});
    });
  });

  describe('createThreadComment (top-level or reply)', () => {
    it('a reply writes parent_id + refs the parent', async () => {
      const { createThreadComment } = await import('../../data/comments');
      mock.readById.mockResolvedValue({ doc_id: 'cm1', author_key: 'bob', body: { text: 'top' } });
      mock.create.mockResolvedValue({ doc_id: 'cm2', author_key: 'alice', body: { post_id: 'p1', parent_id: 'cm1', text: 're' }, ref_value: 'cm1' });
      await createThreadComment({ postId: 'p1', text: 're', parentId: 'cm1', groups: ['me'] });
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.objectContaining({ parent_id: 'cm1', post_id: 'p1' }),
        expect.objectContaining({ ref_value: 'cm1', groups: ['me'] }),
      );
    });

    it('a top-level comment omits parent_id + refs the post', async () => {
      const { createThreadComment } = await import('../../data/comments');
      mock.create.mockResolvedValue({ doc_id: 'cm1', author_key: 'alice', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1' });
      await createThreadComment({ postId: 'p1', text: 'top', groups: ['me'] });
      const body = mock.create.mock.calls[0][1] as Record<string, unknown>;
      expect(body.parent_id).toBeUndefined();
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.anything(),
        expect.objectContaining({ ref_value: 'p1' }),
      );
    });
  });
});
