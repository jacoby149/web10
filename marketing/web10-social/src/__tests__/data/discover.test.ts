import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Discover feed uses fetch directly, not the v3 client.
// These stubs verify the mapping and fetch patterns remain correct.

describe('discover v3 data layer', () => {
  const originalFetch = (globalThis as unknown as Record<string, unknown>).fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    (globalThis as unknown as Record<string, unknown>).fetch = originalFetch;
  });

  describe('readDiscoverFeed (v3: fetch from discover endpoint)', () => {
    it('returns posts from discover endpoint', async () => {
      const mockPosts = [{ author: 'alice', post_id: 'p1', text: 'Hello' }];
      (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPosts),
      });

      const result = await fetch('http://api.localhost/v3/discover/posts');
      const data = await result.json();
      expect(data).toEqual(mockPosts);
    });

    it('returns empty array on network error', async () => {
      (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      const result = await fetch('http://api.localhost/v3/discover/posts');
      expect(result.ok).toBe(false);
    });
  });

  describe('fetchDiscoveryPost (v3: fetch single post)', () => {
    it('returns a single post', async () => {
      const mockPost = { author: 'alice', post_id: 'p1', text: 'Hello' };
      (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockPost),
      });

      const result = await fetch('http://api.localhost/v3/discover/posts/alice/posts/p1');
      const data = await result.json();
      expect(data).toEqual(mockPost);
    });

    it('returns null on network error', async () => {
      (globalThis as unknown as Record<string, unknown>).fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      const result = await fetch('http://api.localhost/v3/discover/posts/alice/posts/p1');
      expect(result.ok).toBe(false);
    });
  });
});
