import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as comments from '../../data/comments';

function mockWapi() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    signOut: vi.fn(),
    setToken: vi.fn(),
    readToken: vi.fn(() => ({ provider: 'api.web10.app', username: 'alice' })),
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

  beforeEach(() => {
    mock = mockWapi();
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
  });

  describe('updateComment', () => {
    it('updates a comment by ID', async () => {
      const updated = { _id: 'cm1', text: 'Updated comment' };
      mock.update.mockResolvedValue(updated);
      await comments.updateComment('cm1', { text: 'Updated comment' });
      expect(mock.update).toHaveBeenCalledWith('comments', { _id: 'cm1' }, { $set: { text: 'Updated comment' } });
    });
  });

  describe('deleteComment', () => {
    it('deletes a comment by ID', async () => {
      mock.delete.mockResolvedValue(undefined);
      await comments.deleteComment('cm1');
      expect(mock.delete).toHaveBeenCalledWith('comments', { _id: 'cm1' });
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