import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as staging from '../../data/staging';

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
    confirmUpload: vi.fn(),
    getReadUrl: vi.fn(),
    initP2P: vi.fn(),
    sendP2P: vi.fn(),
  };
  vi.spyOn(wapi, 'getWapi').mockReturnValue(mock as any);
  return mock;
}

describe('staging data layer', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readStagingPosts', () => {
    it('reads from staging_posts service', async () => {
      const staged = [{ _id: 's1', text: 'hello', created_at: '2026-07-23T00:00:00Z', origin: 'instagram' }];
      mock.read.mockResolvedValue(staged);

      const result = await staging.readStagingPosts();
      expect(mock.read).toHaveBeenCalledWith('staging_posts', {}, undefined, undefined);
      expect(result).toEqual(staged);
    });
  });

  describe('countStagingPosts', () => {
    it('returns the number of staging posts', async () => {
      mock.read.mockResolvedValue([{ _id: 's1' }, { _id: 's2' }, { _id: 's3' }]);
      const count = await staging.countStagingPosts();
      expect(count).toBe(3);
    });

    it('returns 0 when no staging posts', async () => {
      mock.read.mockResolvedValue([]);
      const count = await staging.countStagingPosts();
      expect(count).toBe(0);
    });
  });

  describe('movePostToPublic', () => {
    it('creates in public_posts and deletes from staging_posts (D30 collection move)', async () => {
      const post = { _id: 's1', text: 'hello', created_at: '2026-07-23T00:00:00Z', origin: 'instagram' as const };
      mock.create.mockResolvedValue({ ...post, visibility: 'public' });
      mock.delete.mockResolvedValue(undefined);

      const result = await staging.movePostToPublic(post);

      expect(mock.create).toHaveBeenCalledWith('public_posts', {
        text: 'hello',
        created_at: '2026-07-23T00:00:00Z',
        origin: 'instagram',
        visibility: 'public',
      });
      expect(mock.delete).toHaveBeenCalledWith('staging_posts', { _id: 's1' });
      expect(result.visibility).toBe('public');
    });
  });

  describe('movePostToPrivate', () => {
    it('creates in private_posts and deletes from staging_posts (D30 collection move)', async () => {
      const post = { _id: 's1', text: 'hello', created_at: '2026-07-23T00:00:00Z', origin: 'facebook' as const };
      mock.create.mockResolvedValue({ ...post, visibility: 'private' });
      mock.delete.mockResolvedValue(undefined);

      const result = await staging.movePostToPrivate(post);

      expect(mock.create).toHaveBeenCalledWith('private_posts', {
        text: 'hello',
        created_at: '2026-07-23T00:00:00Z',
        origin: 'facebook',
        visibility: 'private',
      });
      expect(mock.delete).toHaveBeenCalledWith('staging_posts', { _id: 's1' });
      expect(result.visibility).toBe('private');
    });
  });

  describe('deleteStagingPost', () => {
    it('deletes from staging_posts', async () => {
      mock.delete.mockResolvedValue(undefined);
      await staging.deleteStagingPost('s1');
      expect(mock.delete).toHaveBeenCalledWith('staging_posts', { _id: 's1' });
    });
  });

  describe('bulkMovePosts', () => {
    it('moves multiple posts to public', async () => {
      const posts = [
        { _id: 's1', text: 'a', created_at: '2026-07-23T00:00:00Z' },
        { _id: 's2', text: 'b', created_at: '2026-07-23T01:00:00Z' },
      ];
      mock.create.mockImplementation((service, body) => Promise.resolve({ ...body, visibility: 'public' }));
      mock.delete.mockResolvedValue(undefined);

      const result = await staging.bulkMovePosts(posts, 'public');

      expect(mock.create).toHaveBeenCalledTimes(2);
      expect(mock.delete).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.visibility === 'public')).toBe(true);
    });

    it('moves multiple posts to private', async () => {
      const posts = [
        { _id: 's1', text: 'a', created_at: '2026-07-23T00:00:00Z' },
      ];
      mock.create.mockImplementation((service, body) => Promise.resolve({ ...body, visibility: 'private' }));
      mock.delete.mockResolvedValue(undefined);

      const result = await staging.bulkMovePosts(posts, 'private');

      expect(mock.create).toHaveBeenCalledWith('private_posts', expect.objectContaining({ visibility: 'private' }));
      expect(result[0].visibility).toBe('private');
    });
  });

  describe('bulkDeleteStagingPosts', () => {
    it('deletes multiple staging posts', async () => {
      mock.delete.mockResolvedValue(undefined);
      await staging.bulkDeleteStagingPosts(['s1', 's2', 's3']);
      expect(mock.delete).toHaveBeenCalledTimes(3);
      expect(mock.delete).toHaveBeenNthCalledWith(1, 'staging_posts', { _id: 's1' });
      expect(mock.delete).toHaveBeenNthCalledWith(2, 'staging_posts', { _id: 's2' });
      expect(mock.delete).toHaveBeenNthCalledWith(3, 'staging_posts', { _id: 's3' });
    });
  });

  describe('groupByOrigin', () => {
    it('groups posts by origin', () => {
      const posts = [
        { _id: 's1', text: 'a', created_at: '2026-07-23T00:00:00Z', origin: 'instagram' as const },
        { _id: 's2', text: 'b', created_at: '2026-07-23T01:00:00Z', origin: 'facebook' as const },
        { _id: 's3', text: 'c', created_at: '2026-07-23T02:00:00Z', origin: 'instagram' as const },
      ];
      const groups = staging.groupByOrigin(posts);
      expect(groups.get('instagram')).toHaveLength(2);
      expect(groups.get('facebook')).toHaveLength(1);
    });

    it('defaults to native for posts without origin', () => {
      const posts = [
        { _id: 's1', text: 'a', created_at: '2026-07-23T00:00:00Z' },
      ];
      const groups = staging.groupByOrigin(posts);
      expect(groups.has('native')).toBe(true);
      expect(groups.get('native')).toHaveLength(1);
    });
  });
});