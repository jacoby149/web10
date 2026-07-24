import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as feed from '../../data/feed';

describe('mapRawDiscoveryPost', () => {
  it('maps engagement.* to flat likes/comments/reposts', () => {
    const raw = {
      author: 'alice',
      service: 'public_posts',
      post_id: 'p1',
      body_text: 'Hello world',
      tags: ['web10'],
      created_at: '2026-07-23T00:00:00Z',
      engagement: { likes: 10, comments: 2, reposts: 1 },
      engagement_score: 13,
    };
    const mapped = feed.mapRawDiscoveryPost(raw);
    expect(mapped.author).toBe('alice');
    expect(mapped.post_id).toBe('p1');
    expect(mapped.text).toBe('Hello world');
    expect(mapped.tags).toEqual(['web10']);
    expect(mapped.created_at).toBe('2026-07-23T00:00:00Z');
    expect(mapped.likes).toBe(10);
    expect(mapped.comments).toBe(2);
    expect(mapped.reposts).toBe(1);
    expect(mapped.score).toBe(13);
    expect(mapped.provider).toBe('api.web10.app');
  });

  it('maps empty body_text to undefined text', () => {
    const raw = {
      author: 'bob',
      service: 'public_posts',
      post_id: 'p2',
      body_text: '',
      tags: [],
      created_at: '2026-07-23T01:00:00Z',
      engagement: { likes: 0, comments: 0, reposts: 0 },
      engagement_score: 0,
    };
    const mapped = feed.mapRawDiscoveryPost(raw);
    expect(mapped.text).toBeUndefined();
    expect(mapped.tags).toBeUndefined();
  });
});

describe('readDiscoverFeed', () => {
  const originalFetch = (globalThis as unknown as Record<string, unknown>).fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  it('returns mapped posts from real wire shape', async () => {
    const mockRawPosts = [
      {
        author: 'alice',
        service: 'public_posts',
        post_id: 'p1',
        body_text: 'Hello world',
        tags: ['web10'],
        created_at: '2026-07-23T00:00:00Z',
        engagement: { likes: 10, comments: 2, reposts: 1 },
        engagement_score: 13,
      },
    ];
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRawPosts),
    });

    const result = await feed.readDiscoverFeed('trending', 10);
    expect(result).toEqual([
      {
        author: 'alice',
        provider: 'api.web10.app',
        post_id: 'p1',
        text: 'Hello world',
        tags: ['web10'],
        created_at: '2026-07-23T00:00:00Z',
        likes: 10,
        comments: 2,
        reposts: 1,
        score: 13,
      },
    ]);
    expect((globalThis as unknown as Record<string, unknown>).fetch).toHaveBeenCalledWith(
      'https://api.web10.app/discover/posts?sort=trending&limit=10',
      { method: 'PATCH' },
    );
  });

  it('returns empty array on network error', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await feed.readDiscoverFeed('recent', 5);
    expect(result).toEqual([]);
  });

  it('returns empty array on non-ok response', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await feed.readDiscoverFeed('trending', 20);
    expect(result).toEqual([]);
  });

  it('defaults to recent sort and limit 20', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    await feed.readDiscoverFeed();
    expect((globalThis as unknown as Record<string, unknown>).fetch).toHaveBeenCalledWith(
      'https://api.web10.app/discover/posts?sort=recent&limit=20',
      { method: 'PATCH' },
    );
  });
});

describe('fetchDiscoveryPost', () => {
  const originalFetch = (globalThis as unknown as Record<string, unknown>).fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  it('returns mapped post from real wire shape', async () => {
    const mockRawPost = {
      author: 'alice',
      service: 'public_posts',
      post_id: 'p1',
      body_text: 'Single post',
      tags: ['solo'],
      created_at: '2026-07-23T00:00:00Z',
      engagement: { likes: 5, comments: 1, reposts: 0 },
      engagement_score: 8,
    };
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockRawPost),
    });

    const result = await feed.fetchDiscoveryPost('alice', 'public_posts', 'p1');
    expect(result).toEqual({
      author: 'alice',
      provider: 'api.web10.app',
      post_id: 'p1',
      text: 'Single post',
      tags: ['solo'],
      created_at: '2026-07-23T00:00:00Z',
      likes: 5,
      comments: 1,
      reposts: 0,
      score: 8,
    });
  });

  it('returns null on non-ok response', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });

    const result = await feed.fetchDiscoveryPost('alice', 'public_posts', 'p1');
    expect(result).toBeNull();
  });

  it('returns null on network error', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockRejectedValue(new Error('network error'));

    const result = await feed.fetchDiscoveryPost('alice', 'public_posts', 'p1');
    expect(result).toBeNull();
  });
});
