import { describe, it, expect } from 'vitest';
import { mapRawDiscoveryPost, readDiscoverFeed, fetchDiscoveryPost } from '../../data/feed';

describe('mapRawDiscoveryPost', () => {
  it('returns a DiscoveryPost (v3 no-op)', () => {
    const mapped = mapRawDiscoveryPost({ body_text: 'Hello world' });
    expect(mapped).toBeDefined();
    expect(mapped.post_id).toBe('');
    expect(mapped.likes).toBe(0);
  });
});

describe('readDiscoverFeed (v3)', () => {
  it('exists as a function', () => {
    expect(typeof readDiscoverFeed).toBe('function');
  });
});

describe('fetchDiscoveryPost (v3)', () => {
  it('exists as a function', () => {
    expect(typeof fetchDiscoveryPost).toBe('function');
  });
});
