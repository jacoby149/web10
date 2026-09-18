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
    update: vi.fn(),
    delete: vi.fn(),
    query: vi.fn().mockResolvedValue({ rows: [], count: 0 }),
    getMyGroups: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

describe('comments v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readComments (v3: read comments for a post)', () => {
    it('reads all comments for a post', async () => {
      const docs = [{ doc_id: 'cm1', body: { post_id: 'p1', text: 'nice!' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('comments', { groups: ['me'] });
      expect(result).toEqual(docs);
    });
  });

  describe('readTopLevelComments (v3: read comments without parent_id)', () => {
    it('reads top-level comments only', async () => {
      const docs = [
        { doc_id: 'cm1', body: { post_id: 'p1', text: 'top level' } },
        { doc_id: 'cm2', body: { post_id: 'p1', text: 'another top' } },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('comments', { groups: ['me'] });
      expect(result.length).toBe(2);
    });
  });

  describe('readReplies (v3: a reply ref_values the post, so the read resolves the parent then filters)', () => {
    it('reads replies to a specific comment (parent post → filter parent_id)', async () => {
      const { readReplies } = await import('../../data/comments');
      // The parent comment: ref_value is the post (comments.md), so the reply
      // read resolves the post from the parent, reads the whole conversation,
      // and filters to the replies in memory.
      mock.readById.mockResolvedValue({ doc_id: 'cm1', ref_value: 'p1', body: { post_id: 'p1', text: 'top' } });
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' } },
        { doc_id: 'cm3', author_key: 'carol', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply' } },
        { doc_id: 'cm4', author_key: 'dave', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply 2' } },
        { doc_id: 'cm5', author_key: 'erin', body: { post_id: 'p1', parent_id: 'cm9', text: 'other reply' } },
      ]);
      const result = await readReplies('cm1', ['me']);
      expect(result.map((c) => c._id)).toEqual(['cm3', 'cm4']);
      // it read the parent (to get the post) + the post's conversation
      expect(mock.readById).toHaveBeenCalledWith('cm1', 'comments');
      expect(mock.read).toHaveBeenCalledWith('comments', { groups: ['me'], ref: 'p1' });
    });

    it('returns [] when the parent has no post ref', async () => {
      const { readReplies } = await import('../../data/comments');
      mock.readById.mockResolvedValue({ doc_id: 'cm1', body: { text: 'orphan' } });
      const result = await readReplies('cm1', ['me']);
      expect(result).toEqual([]);
    });
  });

  describe('createComment (v3: create in comments collection)', () => {
    it('creates a comment document', async () => {
      const doc = { doc_id: 'cm1', body: { post_id: 'p1', text: 'nice!' } };
      mock.create.mockResolvedValue(doc);
      const result = await mock.create('comments', { post_id: 'p1', text: 'nice!' });
      expect(result).toEqual(doc);
    });

    it('sends ref_value = post_id so the ref read can find the comment', async () => {
      // The regression: ref_value was set client-side AFTER create, so the
      // server stored '' and the ref read (ref_value === post_id) never
      // matched. The real createComment must send ref_value in the create opts.
      const { createComment } = await import('../../data/comments');
      const doc = { doc_id: 'cm1', author_key: 'web10.app/users/alice', body: { post_id: 'p1', text: 'nice!' }, ref_value: 'p1' };
      mock.create.mockResolvedValue(doc);
      await createComment({ post_id: 'p1', text: 'nice!' } as any);
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.anything(),
        expect.objectContaining({ ref_value: 'p1' }),
      );
    });
  });

  describe('updateComment (v3: update comment document)', () => {
    it('updates a comment document', async () => {
      const updated = { doc_id: 'cm1', body: { post_id: 'p1', text: 'updated!' } };
      mock.update.mockResolvedValue(updated);
      const result = await mock.update('cm1', { text: 'updated!' });
      expect(result).toEqual(updated);
    });
  });

  describe('deleteComment (v3: delete comment document)', () => {
    it('deletes a comment by doc_id', async () => {
      mock.delete.mockResolvedValue({ doc_id: 'cm1', status: 'deleted' });
      const result = await mock.delete('cm1');
      expect(result).toEqual({ doc_id: 'cm1', status: 'deleted' });
    });
  });

  describe('readThreadComments (comments.md: the whole conversation + comment likes)', () => {
    it('enriches each comment with likeCount + likedByMe', async () => {
      const { readThreadComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
        { doc_id: 'cm2', author_key: 'carol', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply' }, ref_value: 'p1', created_at: '2026-01-01T01:00:00Z' },
      ]);
      // the server-side count: cm1 has 2 likes, cm2 has 0
      mock.query.mockResolvedValue({
        rows: [{ ref_value: 'cm1', like_count: 2 }],
        count: 1,
      });
      // the reader's own reactions: alice liked cm1
      mock.read.mockImplementation(async (service: string, opts: { ref?: unknown }) => {
        if (service === 'reactions') {
          return [{ doc_id: 'r1', author_key: 'alice', body: { type: 'like' }, ref_value: 'cm1' }];
        }
        return [
          { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
          { doc_id: 'cm2', author_key: 'carol', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply' }, ref_value: 'p1', created_at: '2026-01-01T01:00:00Z' },
        ];
      });
      const result = await readThreadComments('p1', ['me']);
      expect(result).toHaveLength(2);
      const cm1 = result.find((c) => c._id === 'cm1');
      const cm2 = result.find((c) => c._id === 'cm2');
      expect(cm1?.likeCount).toBe(2);
      expect(cm1?.likedByMe).toBe(true);
      expect(cm2?.likeCount).toBe(0);
      expect(cm2?.likedByMe).toBe(false);
    });

    it('degrades to no like fields when the count query fails (the thread still renders)', async () => {
      const { readThreadComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
      ]);
      mock.query.mockRejectedValue(new Error('boom'));
      mock.read.mockRejectedValue(new Error('boom'));
      // readComments (the first read) must still succeed — only the like
      // enrichment degrades. Re-mock read to succeed for the comments read.
      mock.read.mockResolvedValue([
        { doc_id: 'cm1', author_key: 'bob', body: { post_id: 'p1', text: 'top' }, ref_value: 'p1', created_at: '2026-01-01T00:00:00Z' },
      ]);
      const result = await readThreadComments('p1', ['me']);
      expect(result).toHaveLength(1);
      expect(result[0]._id).toBe('cm1');
      // like fields degrade to 0 / false (the thread renders, like UI empty)
      expect(result[0].likeCount).toBe(0);
      expect(result[0].likedByMe).toBe(false);
    });

    it('returns comments as-is when there are none', async () => {
      const { readThreadComments } = await import('../../data/comments');
      mock.read.mockResolvedValue([]);
      const result = await readThreadComments('p1', ['me']);
      expect(result).toEqual([]);
      // no like reads issued for an empty conversation
      expect(mock.query).not.toHaveBeenCalled();
    });
  });

  describe('createThreadComment (comments.md: top-level or reply)', () => {
    it('writes parent_id in the body for a reply (ref_value stays the post)', async () => {
      const { createThreadComment } = await import('../../data/comments');
      // the reply nudge reads the parent comment's author (fire-and-forget)
      mock.readById.mockResolvedValue({ doc_id: 'cm1', author_key: 'bob', body: { text: 'top' } });
      mock.create.mockResolvedValue({ doc_id: 'cm2', author_key: 'alice', body: { post_id: 'p1', parent_id: 'cm1', text: 're' }, ref_value: 'p1' });
      await createThreadComment({ postId: 'p1', text: 're', parentId: 'cm1', groups: ['me'] });
      expect(mock.create).toHaveBeenCalledWith(
        'comments',
        expect.objectContaining({ parent_id: 'cm1', post_id: 'p1' }),
        expect.objectContaining({ ref_value: 'p1', groups: ['me'] }),
      );
    });

    it('omits parent_id for a top-level comment', async () => {
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
