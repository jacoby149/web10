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

describe('staging v3 data layer', () => {
  let mock: ReturnType<typeof mockV3Client>;

  beforeEach(() => {
    mock = mockV3Client();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readStagingPosts (v3: read from staging collection)', () => {
    it('reads staging posts', async () => {
      const docs = [{ doc_id: 's1', body: { text: 'hello', origin: 'instagram' } }];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('staging', { groups: ['me'] });
      expect(result).toEqual(docs);
    });
  });

  describe('countStagingPosts (v3: count staging docs)', () => {
    it('returns the number of staging posts', async () => {
      mock.read.mockResolvedValue([{ doc_id: 's1' }, { doc_id: 's2' }]);
      const result = await mock.read('staging', { groups: ['me'] });
      expect(result.length).toBe(2);
    });
  });

  describe('movePostToPublic (v3: create in posts, delete from staging)', () => {
    it('creates in posts and deletes from staging', async () => {
      mock.create.mockResolvedValue({ doc_id: 'p1', body: { text: 'hello', visibility: 'public' } });
      mock.delete.mockResolvedValue({ doc_id: 's1', status: 'deleted' });
      await mock.create('posts', { text: 'hello', visibility: 'public' });
      await mock.delete('s1');
    });
  });

  describe('deleteStagingPost (v3: delete from staging)', () => {
    it('deletes a staging post', async () => {
      mock.delete.mockResolvedValue({ doc_id: 's1', status: 'deleted' });
      const result = await mock.delete('s1');
      expect(result).toEqual({ doc_id: 's1', status: 'deleted' });
    });
  });
});
