import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as v3 from '../../data/v3';
import * as adsCatalog from '../../data/ads-catalog';

function mockV3Client() {
  const mock = {
    isSignedIn: vi.fn(() => true),
    readToken: vi.fn(() => ({ provider: 'web10.app', username: 'alice' })),
    create: vi.fn().mockResolvedValue({ doc_id: 'new-1' }),
    read: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ doc_id: 'x' }),
    delete: vi.fn().mockResolvedValue({ doc_id: 'x', status: 'deleted' }),
    getGroup: vi.fn().mockResolvedValue({ group_id: 'g' }),
    createGroup: vi.fn().mockResolvedValue({ group_id: 'g' }),
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
  body: { text: 'A regular post' },
  tags: [],
  ad_mode: 'pinned',
  ad_target: 'ad-1',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

describe('splitCatalog', () => {
  it('splits a feed read into ads / albums / posts', () => {
    const out = adsCatalog.splitCatalog([AD_DOC as any, ALBUM_DOC as any, POST_DOC as any]);
    expect(out.ads).toHaveLength(1);
    expect(out.albums).toHaveLength(1);
    expect(out.posts).toHaveLength(1);
    // The ad parses its offer + status + albums.
    expect(out.ads[0].text).toBe('Everything I use, linked.');
    expect(out.ads[0].offer.kind).toBe('affiliate');
    expect(out.ads[0].offer.partner).toBe('Amazon');
    expect(out.ads[0].status).toBe('active');
    expect(out.ads[0].albums).toEqual(['album-1']);
    // The album's adCount is computed from the ads' album tags.
    expect(out.albums[0].name).toBe('Summer 2026');
    expect(out.albums[0].adCount).toBe(1);
    // The post carries its pinned ad target.
    expect(out.posts[0].pinnedAdTarget).toBe('ad-1');
  });

  it('returns empty for an empty read', () => {
    const out = adsCatalog.splitCatalog([]);
    expect(out).toEqual({ ads: [], albums: [], posts: [] });
  });
});

describe('buildOfferBody / buildNodeAdBody', () => {
  it('builds a leaf-typed creator ad body with the ad tag + album tags', () => {
    const body = adsCatalog.buildOfferBody(
      { kind: 'affiliate', partner: 'Amazon', link: 'https://amzn.to/abc', cta: 'Get it', disclosure: 'I may earn.' },
      'My ad',
      'active',
      ['album-1'],
    );
    expect(body.tags).toEqual(['ad', 'album:album-1']);
    expect(body.status).toBe('active');
    const offer = body.offer as Record<string, unknown>;
    expect(offer.kind).toEqual({ type: 'text', value: 'affiliate' });
    expect(offer.link).toEqual({ type: 'text', value: 'https://amzn.to/abc' });
  });

  it('builds a node ad body with the node_ad tag (no albums)', () => {
    const body = adsCatalog.buildNodeAdBody(
      { kind: 'direct', partner: 'WorkflowCo', link: 'https://x.com', cta: 'Learn more', disclosure: 'Sponsored' },
      'Node ad',
      'active',
    );
    expect(body.tags).toEqual(['ad', 'node_ad']);
    expect(body.status).toBe('active');
  });

  it('buildOfferBody writes the format + media_refs (ad-improvements.md)', () => {
    // A post-format ad with media: the format + media_refs are written to the body.
    const body = adsCatalog.buildOfferBody(
      { kind: 'none', partner: '', link: 'https://x.com', cta: 'Check it out', disclosure: '' },
      'My post ad',
      'active',
      [],
      ['media-1'],
      'post',
    );
    expect(body.format).toBe('post');
    expect(body.media_refs).toEqual(['media-1']);
    // An inline ad with no media: format inline, media_refs [] (so an update can
    // remove media — the node merges the body).
    const inline = adsCatalog.buildOfferBody(
      { kind: 'none', partner: '', link: 'https://x.com', cta: '', disclosure: '' },
      'My inline ad',
      'active',
      [],
    );
    expect(inline.format).toBe('inline');
    expect(inline.media_refs).toEqual([]);
  });

  it('parseAd reads the format + media_refs', () => {
    const doc = {
      ...AD_DOC,
      body: {
        ...AD_DOC.body,
        format: 'post',
        media_refs: ['media-1'],
      },
    };
    const ad = adsCatalog.parseAd(doc as any);
    expect(ad.format).toBe('post');
    expect(ad.media_refs).toEqual(['media-1']);
    // Absent format defaults to inline (backwards compat — every existing ad).
    const legacy = adsCatalog.parseAd(AD_DOC as any);
    expect(legacy.format).toBe('inline');
    expect(legacy.media_refs).toBeUndefined();
  });
});

describe('updateAd', () => {
  beforeEach(mockV3Client);

  it('updates the same doc_id with the new body (pins survive the edit)', async () => {
    const mock = v3.getV3Client() as any;
    const ad = adsCatalog.parseAd(AD_DOC as any);
    await adsCatalog.updateAd(
      ad,
      { kind: 'none', partner: '', link: 'https://new.com', cta: 'Check it out', disclosure: '' },
      'Updated copy',
      'active',
      [],
      ['media-2'],
      'post',
    );
    // Same doc_id (an update is a new version, not a new doc).
    expect(mock.update).toHaveBeenCalledWith(
      'ad-1',
      expect.objectContaining({
        text: 'Updated copy',
        format: 'post',
        media_refs: ['media-2'],
        tags: ['ad'],
      }),
    );
  });
});

describe('isNodeAd / splitNodeAds', () => {
  it('flags only node_ad-tagged docs', () => {
    const nodeAd = { ...AD_DOC, tags: ['ad', 'node_ad'], doc_id: 'node-1' };
    expect(adsCatalog.isNodeAd(nodeAd as any)).toBe(true);
    expect(adsCatalog.isNodeAd(AD_DOC as any)).toBe(false);
    const ads = adsCatalog.splitNodeAds([nodeAd as any, AD_DOC as any]);
    expect(ads).toHaveLength(1);
    expect(ads[0].doc.doc_id).toBe('node-1');
  });
});

describe('readMyCatalog / readNodeAds', () => {
  beforeEach(mockV3Client);

  it('readMyCatalog reads the followers group and splits', async () => {
    const mock = v3.getV3Client() as any;
    mock.read.mockResolvedValue([AD_DOC, ALBUM_DOC]);
    const out = await adsCatalog.readMyCatalog();
    expect(mock.read).toHaveBeenCalledWith('posts', { groups: ['web10.app/groups/users/alice/followers'] });
    expect(out.ads).toHaveLength(1);
    expect(out.albums).toHaveLength(1);
  });

  it('readMyCatalog returns empty when signed out', async () => {
    const mock = v3.getV3Client() as any;
    mock.readToken.mockReturnValue(null);
    const out = await adsCatalog.readMyCatalog();
    expect(out).toEqual({ ads: [], albums: [], posts: [] });
    expect(mock.read).not.toHaveBeenCalled();
  });

  it('readNodeAds reads the discover group and filters node ads', async () => {
    const mock = v3.getV3Client() as any;
    const nodeAd = { ...AD_DOC, tags: ['ad', 'node_ad'], doc_id: 'node-1' };
    mock.read.mockResolvedValue([nodeAd, AD_DOC]);
    const out = await adsCatalog.readNodeAds();
    expect(mock.read).toHaveBeenCalledWith('posts', { groups: ['web10.app/groups/web10/discover'], limit: 200 });
    expect(out).toHaveLength(1);
    expect(out[0].doc.doc_id).toBe('node-1');
  });
});

describe('checkNodeAdmin', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when /am_admin says admin', async () => {
    // Set the token cookie (checkNodeAdmin reads the raw JWT from the cookie).
    document.cookie = 'token=raw-jwt; path=/';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ admin: true }) });
    vi.stubGlobal('fetch', fetchMock);
    const admin = await adsCatalog.checkNodeAdmin();
    expect(admin).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/am_admin'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ token: 'raw-jwt' }) }),
    );
  });

  it('returns false when /am_admin says not admin', async () => {
    document.cookie = 'token=raw-jwt; path=/';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ admin: false }) }));
    expect(await adsCatalog.checkNodeAdmin()).toBe(false);
  });

  it('returns false when /am_admin errors', async () => {
    document.cookie = 'token=raw-jwt; path=/';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await adsCatalog.checkNodeAdmin()).toBe(false);
  });

  it('returns false when signed out (no token cookie)', async () => {
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await adsCatalog.checkNodeAdmin()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
