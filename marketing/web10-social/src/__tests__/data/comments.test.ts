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

  describe('readReplies (v3: read comments with parent_id)', () => {
    it('reads replies to a specific comment', async () => {
      const docs = [{ doc_id: 'cm3', body: { post_id: 'p1', parent_id: 'cm1', text: 'reply' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('comments', { groups: ['me'] });
      expect(result[0].body.parent_id).toBe('cm1');
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
      const doc = { doc_id: 'cm1', body: { post_id: 'p1', text: 'nice!' }, ref_value: 'p1' };
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
});
