import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as wapi from '../../data/wapi';
import * as pullFeed from '../../data/pullFeed';

// The pull feed (v0): your own posts + ONE direct read per person you
// follow (their public_posts collection). No inbox, no discovery board —
// discovery is for the Discover page only (operator, 31.07.2026).

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

describe('readPullFeed', () => {
  let mock: ReturnType<typeof mockWapi>;

  beforeEach(() => {
    mock = mockWapi();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty when signed out', async () => {
    mock.readToken.mockReturnValue(null);
    expect(await pullFeed.readPullFeed()).toEqual([]);
    expect(mock.read).not.toHaveBeenCalled();
  });

  it('pulls your own posts (public + private) and each followee public_posts directly', async () => {
    mock.read.mockImplementation(async (service: string, query?: any, username?: string) => {
      if (service === 'public_posts' && !username) return [{ _id: 'mine-pub', text: 'my public', created_at: '2026-07-30T00:00:00Z' }];
      if (service === 'private_posts' && !username) return [{ _id: 'mine-priv', text: 'my private', created_at: '2026-07-29T00:00:00Z' }];
      if (service === 'follows') return [
        { username: 'bob', provider: 'api.web10.app', status: 'active' },
        { username: 'carol', provider: 'api.web10.app', status: 'rejected' },
      ];
      if (service === 'public_posts' && username === 'bob') return [{ _id: 'bob-1', text: 'bob post', created_at: '2026-07-31T00:00:00Z' }];
      return [];
    });

    const feed = await pullFeed.readPullFeed('newest');

    // bob's collection was read DIRECTLY (username + provider args), carol's
    // (rejected follow) was not. No inbox read, no discovery fetch.
    expect(mock.read).toHaveBeenCalledWith('public_posts', {}, 'bob', 'api.web10.app');
    expect(mock.read).not.toHaveBeenCalledWith('public_posts', {}, 'carol', 'api.web10.app');
    expect(mock.read).not.toHaveBeenCalledWith('inbox');

    const ids = feed.map((i) => i.post_id);
    expect(ids).toContain('mine-pub');
    expect(ids).toContain('mine-priv');
    expect(ids).toContain('bob-1');
    expect(ids).not.toContain('carol-1');
    // newest first: bob-1 (31st) > mine-pub (30th) > mine-priv (29th)
    expect(ids).toEqual(['bob-1', 'mine-pub', 'mine-priv']);
    // items carry the inbox shape FeedScreen renders
    const bobItem = feed.find((i) => i.post_id === 'bob-1')!;
    expect(bobItem.author_username).toBe('bob');
    expect(bobItem.post_body?.text).toBe('bob post');
  });

  it('a followee whose collection 403s is skipped, never fatal', async () => {
    mock.read.mockImplementation(async (service: string, query?: any, username?: string) => {
      if (service === 'public_posts' && !username) return [{ _id: 'mine', text: 'mine', created_at: '2026-07-30T00:00:00Z' }];
      if (service === 'private_posts') return [];
      if (service === 'follows') return [
        { username: 'bob', provider: 'api.web10.app', status: 'active' },
        { username: 'dana', provider: 'api.web10.app', status: 'active' },
      ];
      if (service === 'public_posts' && username === 'bob') throw new Error('403');
      if (service === 'public_posts' && username === 'dana') return [{ _id: 'dana-1', text: 'dana', created_at: '2026-07-31T00:00:00Z' }];
      return [];
    });

    const feed = await pullFeed.readPullFeed();
    const ids = feed.map((i) => i.post_id);
    expect(ids).toEqual(['dana-1', 'mine']);
  });

  it('dedupes by post_id and sorts oldest-first on demand', async () => {
    mock.read.mockImplementation(async (service: string, query?: any, username?: string) => {
      if (service === 'public_posts' && !username) return [{ _id: 'dup', text: 'mine', created_at: '2026-07-29T00:00:00Z' }];
      if (service === 'private_posts') return [{ _id: 'dup', text: 'mine', created_at: '2026-07-29T00:00:00Z' }];
      if (service === 'follows') return [{ username: 'bob', provider: 'api.web10.app', status: 'active' }];
      if (service === 'public_posts' && username === 'bob') return [{ _id: 'bob-1', text: 'bob', created_at: '2026-07-30T00:00:00Z' }];
      return [];
    });

    const feed = await pullFeed.readPullFeed('oldest');
    expect(feed.map((i) => i.post_id)).toEqual(['dup', 'bob-1']);
  });
});
