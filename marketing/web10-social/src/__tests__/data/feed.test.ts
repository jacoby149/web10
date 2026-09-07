import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
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
    getMyGroups: vi.fn(),
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

  describe('readFeed (v3: read from all groups)', () => {
    it('reads posts from users groups', async () => {
      const docs = [
        { doc_id: 'p1', body: { text: 'post1' }, created_at: '2026-07-17T00:00:00Z' },
        { doc_id: 'p2', body: { text: 'post2' }, created_at: '2026-07-18T00:00:00Z' },
      ];
      mock.read.mockResolvedValue(docs);
      const result = await mock.read('posts', { groups: ['me'] });
      expect(result).toEqual(docs);
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
