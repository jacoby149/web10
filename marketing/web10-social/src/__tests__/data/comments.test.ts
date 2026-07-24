import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as feed from '../../data/feed';
import * as comments from '../../data/comments';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice', site: 'api.web10.app' })),
    openAuthPortal: vi.fn(),
    authListen: vi.fn(),
    read: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    aggregate: vi.fn(),
    getUploadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

  describe('comments data layer', () => {
  let mock: ReturnType<typeof mockWapi>;
  let querySpy: ReturnType<typeof vi.spyOn>;
  const commentSchemaId = 'web10.01arz3n8q5';

  beforeEach(() => {
    mock = mockWapi();
    vi.spyOn(feed, 'getCachedSchema').mockReturnValue({
      _id: commentSchemaId,
      name: 'Comment',
      author_username: 'system',
      author_provider: 'web10',
      schema: {},
    });
    vi.spyOn(feed, 'createPublicEntry').mockResolvedValue({ _id: 'le1', schema_id: commentSchemaId, target: '', payload: {} });
    querySpy = vi.spyOn(feed, 'queryPublicEntries').mockResolvedValue([]);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => ({}),
    } as Response);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readComments', () => {
    it('reads all comments for a post', async () => {
      const list = [
        { _id: 'cm1', post_id: 'p1', text: 'nice!', created_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(list);
      const result = await comments.readComments('p1');
      expect(mock.read).toHaveBeenCalledWith('comments', { post_id: 'p1' });
      expect(result).toEqual(list);
    });
  });

  describe('readTopLevelComments', () => {
    it('reads top-level comments only', async () => {
      mock.read.mockResolvedValue([]);
      await comments.readTopLevelComments('p1');
      expect(mock.read).toHaveBeenCalledWith('comments', {
        post_id: 'p1',
        parent_id: { $exists: false },
      });
    });
  });

  describe('readReplies', () => {
    it('reads replies to a comment', async () => {
      mock.read.mockResolvedValue([]);
      await comments.readReplies('cm1');
      expect(mock.read).toHaveBeenCalledWith('comments', { parent_id: 'cm1' });
    });
  });

  describe('createComment', () => {
    it('creates a new comment', async () => {
      const comment = { post_id: 'p1', text: 'Great post!', created_at: '2026-07-18T00:00:00Z' };
      const created = { _id: 'cm1', ...comment };
      mock.create.mockResolvedValue(created);
      const result = await comments.createComment(comment);
      expect(mock.create).toHaveBeenCalledWith('comments', comment);
      expect(result).toEqual(created);
    });

    it('mirrors to the public ledger with action=comment', async () => {
      const comment = { post_id: 'p1', text: 'Great post!', created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue({ _id: 'cm1', ...comment });
      await comments.createComment(comment);

      expect(feed.createPublicEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          schema_id: commentSchemaId,
          target: 'posts:p1',
          payload: expect.objectContaining({
            action: 'comment',
            text: 'Great post!',
            author_username: 'alice',
            author_provider: 'api.web10.app',
          }),
        }),
      );
    });

    it('does not fail if schema is not cached', async () => {
      vi.spyOn(feed, 'getCachedSchema').mockReturnValue(undefined);
      const comment = { post_id: 'p1', text: 'no schema', created_at: '2026-07-18T00:00:00Z' };
      mock.create.mockResolvedValue({ _id: 'cm2', ...comment });
      const result = await comments.createComment(comment);
      expect(result._id).toBe('cm2');
      expect(feed.createPublicEntry).not.toHaveBeenCalled();
    });
  });

  describe('updateComment', () => {
    it('updates a comment by ID', async () => {
      const updated = { _id: 'cm1', text: 'Updated comment', post_id: 'p1', author_username: 'alice', author_provider: 'api.web10.app' };
      mock.update.mockResolvedValue(updated);
      await comments.updateComment('cm1', { text: 'Updated comment' });
      expect(mock.update).toHaveBeenCalledWith('comments', { _id: 'cm1' }, { $set: { text: 'Updated comment' } });
    });

    it('updates the mirrored ledger entry', async () => {
      const updated = { _id: 'cm1', text: 'Updated comment', post_id: 'p1', author_username: 'alice', author_provider: 'api.web10.app' };
      mock.update.mockResolvedValue(updated);
      querySpy.mockResolvedValue([
        {
          _id: 'le-old',
          schema_id: commentSchemaId,
          target: 'posts:p1',
          payload: { action: 'comment', text: 'Old text', author_username: 'alice', author_provider: 'api.web10.app' },
        },
      ]);
      await comments.updateComment('cm1', { text: 'Updated comment' });
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/public/entries/le-old'),
        expect.objectContaining({ method: 'DELETE' }),
      );
      expect(feed.createPublicEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            text: 'Updated comment',
          }),
        }),
      );
    });
  });

  describe('deleteComment', () => {
    beforeEach(() => {
      mock.read.mockResolvedValue([{ _id: 'cm1', post_id: 'p1', text: 'delete me', author_username: 'alice', author_provider: 'api.web10.app', created_at: '2026-07-18T00:00:00Z' }]);
    });

    it('deletes a comment by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await comments.deleteComment('cm1');
      expect(mock.delete).toHaveBeenCalledWith('comments', { _id: 'cm1' });
    });

    it('queries the ledger for matching entries', async () => {
      mock.delete.mockResolvedValue(undefined);
      await comments.deleteComment('cm1');
      expect(feed.queryPublicEntries).toHaveBeenCalledWith({ target: 'posts:p1' });
    });

    it('deletes matching ledger entry when found', async () => {
      querySpy.mockResolvedValue([
        {
          _id: 'le-matching',
          schema_id: commentSchemaId,
          target: 'posts:p1',
          payload: { action: 'comment', text: 'delete me', author_username: 'alice', author_provider: 'api.web10.app' },
        },
      ]);
      mock.delete.mockResolvedValue(undefined);
      await comments.deleteComment('cm1');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/public/entries/le-matching'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('does not delete non-matching ledger entries', async () => {
      vi.spyOn(feed, 'queryPublicEntries').mockResolvedValue([
        {
          _id: 'le-other',
          schema_id: commentSchemaId,
          target: 'posts:p1',
          payload: { action: 'comment', text: 'other text', author_username: 'bob', author_provider: 'other' },
        },
      ]);
      mock.delete.mockResolvedValue(undefined);
      await comments.deleteComment('cm1');
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });
  });

  describe('countComments', () => {
    it('returns the number of comments on a post', async () => {
      mock.read.mockResolvedValue([
        { _id: 'cm1', post_id: 'p1', text: 'a', created_at: '2026-07-18T00:00:00Z' },
        { _id: 'cm2', post_id: 'p1', text: 'b', created_at: '2026-07-18T00:00:00Z' },
      ]);
      const count = await comments.countComments('p1');
      expect(count).toBe(2);
    });
  });
});