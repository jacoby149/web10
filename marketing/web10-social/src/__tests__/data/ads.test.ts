import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as posts from '../../data/posts';
import * as ads from '../../data/ads';
import { fromV3DocToAd, fromV3DocToPost } from '../../data/types';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn(),
    read: vi.fn(),
    readById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getGroup: vi.fn(),
    createGroup: vi.fn(),
    getMyGroups: vi.fn(),
    confirmMediaUpload: vi.fn(),
    listMedia: vi.fn(),
    deleteMedia: vi.fn(),
  };
  vi.spyOn(v3, 'getV3Client').mockReturnValue(mock as any);
  return mock;
}

const AD_DOC = {
  doc_id: 'ad-1',
  author_key: 'web10.app/users/alice',
  collection_name: 'posts',
  body: {
    text: 'Everything I use, linked.',
    tags: ['ad', 'album:album-1'],
    offer: {
      kind: { type: 'text', value: 'affiliate' },
      partner: { type: 'text', value: 'Amazon' },
      link: { type: 'text', value: 'https://amzn.to/abc' },
      cta: { type: 'text', value: 'Get it' },
      disclosure: { type: 'text', value: 'I may earn a commission.' },
    },
    status: 'active',
  },
  tags: ['ad', 'album:album-1'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const ALBUM_DOC = {
  doc_id: 'album-1',
  author_key: 'web10.app/users/alice',
  collection_name: 'posts',
  body: { name: 'Summer 2026', tags: ['ad_album'] },
  tags: ['ad_album'],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

const POST_DOC = {
  doc_id: 'post-1',
  author_key: 'web10.app/users/alice',
  collection_name: 'posts',
  body: { text: 'a post', tags: [] },
  tags: [],
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('fromV3DocToAd', () => {
  it('extracts the leaf-typed offer + status + album tags', () => {
    const ad = fromV3DocToAd(AD_DOC as any);
    expect(ad._id).toBe('ad-1');
    expect(ad.text).toBe('Everything I use, linked.');
    expect(ad.offer).toEqual({
      kind: 'affiliate',
      partner: 'Amazon',
      link: 'https://amzn.to/abc',
      cta: 'Get it',
      disclosure: 'I may earn a commission.',
    });
    expect(ad.status).toBe('active');
    expect(ad.albums).toEqual(['album-1']);
  });

  it('treats a missing status as active and no album tags as empty', () => {
    const ad = fromV3DocToAd({ ...AD_DOC, body: { text: 'x', tags: ['ad'] }, tags: ['ad'] } as any);
    expect(ad.status).toBe('active');
    expect(ad.albums).toEqual([]);
  });
});

describe('fromV3DocToPost (ad mapping)', () => {
  it('maps the inline ad (doc.ad) to an AdRecord', () => {
    const post = fromV3DocToPost({ ...POST_DOC, ad: AD_DOC } as any);
    expect(post.ad?._id).toBe('ad-1');
    expect(post.ad?.offer?.link).toBe('https://amzn.to/abc');
  });

  it('leaves ad undefined when the post carries no ad', () => {
    const post = fromV3DocToPost(POST_DOC as any);
    expect(post.ad).toBeUndefined();
  });
});

describe('readMyAds (v3: catalog read over the followers group)', () => {
  let mock: ReturnType<typeof mockV3Client>;
  beforeEach(() => { mock = mockV3Client(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('reads the followers group and splits into ads + albums', async () => {
    mock.read.mockResolvedValue([AD_DOC, ALBUM_DOC, POST_DOC]);
    const result = await ads.readMyAds();
    expect(mock.read).toHaveBeenCalledWith('posts', { groups: ['web10.app/groups/users/alice/followers'] });
    expect(result.ads.map((a) => a._id)).toEqual(['ad-1']);
    expect(result.albums.map((a) => a._id)).toEqual(['album-1']);
    // the plain post is neither an ad nor an album
    expect(result.ads.find((a) => a._id === 'post-1')).toBeUndefined();
    expect(result.albums.find((a) => a._id === 'post-1')).toBeUndefined();
  });

  it('returns empty on no token', async () => {
    mock.readToken.mockReturnValue(null);
    const result = await ads.readMyAds();
    expect(result).toEqual({ ads: [], albums: [] });
    expect(mock.read).not.toHaveBeenCalled();
  });
});

describe('createPost (v3: ad_preference on create)', () => {
  let mock: ReturnType<typeof mockV3Client>;
  beforeEach(() => { mock = mockV3Client(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('passes ad_preference to the create call when pinning an ad', async () => {
    mock.create.mockResolvedValue(POST_DOC);
    mock.getGroup.mockResolvedValue({ group_id: 'g' });
    await posts.createPost(
      { text: 'hello', media_refs: [], visibility: 'public', created_at: '2026-01-01T00:00:00Z' } as any,
      undefined,
      { mode: 'pinned', target: 'ad-1' },
    );
    expect(mock.create).toHaveBeenCalledWith(
      'posts',
      expect.objectContaining({ text: 'hello' }),
      expect.objectContaining({ ad_preference: { mode: 'pinned', target: 'ad-1' } }),
    );
  });

  it('omits ad_preference when no ad is pinned', async () => {
    mock.create.mockResolvedValue(POST_DOC);
    mock.getGroup.mockResolvedValue({ group_id: 'g' });
    await posts.createPost(
      { text: 'hello', media_refs: [], visibility: 'public', created_at: '2026-01-01T00:00:00Z' } as any,
    );
    const opts = mock.create.mock.calls[0][2];
    expect(opts).not.toHaveProperty('ad_preference');
  });
});
