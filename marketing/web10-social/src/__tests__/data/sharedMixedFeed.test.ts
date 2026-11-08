import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFeedQuery, feedCursorFromPost, fromFeedQueryRow, knobStateToSort, type FeedCursor, type FeedRanking, type SourcePost } from '@web10/discover/feed-query';
import { createMixedFeedReader as createSharedMixedFeedReader } from '@web10/discover/mixed-feed';
import * as socialFeed from '../../data/feed';
import { createMixedFeedReader } from '../../data/mixedFeed';
import { knobStateToSort as socialKnobStateToSort } from '../../lib/powerMean';
import type { PostRecord } from '../../data/types';

const clock = 1794096000000;
const timestamp = '2026-11-01T00:00:00.000Z';
const knobState = { recency: 3, likes: 3, comments: 2, halfLife: 3, character: 2 };
const home = 'https://home.example';
const cursor: FeedCursor = { created_at: '2026-11-01T03:00:00+03:00', score: 0.25, author_key: "host/users/a'\\", doc_id: "id'\\" };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('portable feed parity with the unchanged social implementation', () => {
  it('retains every app weight detent and fixed one-day/geometric ranking', () => {
    for (let recency = 0; recency <= 5; recency++) {
      for (let likes = 0; likes <= 5; likes++) {
        for (let comments = 0; comments <= 5; comments++) {
          for (let retired = 0; retired <= 5; retired++) {
            const state = { recency, likes, comments, halfLife: retired, character: 5 - retired };
            expect(knobStateToSort(state)).toEqual(socialKnobStateToSort(state));
          }
        }
      }
    }
  });

  const sorts: (FeedRanking | null)[] = [null, knobStateToSort(knobState),
    { recency: 1, likes: 0, comments: 0, half_life_ms: 0, character: -5 },
    { recency: 0, likes: 0, comments: 0, half_life_ms: 0, character: 1 },
    { recency: 0.4, likes: 1, comments: 0.8, half_life_ms: 1234, character: -1 }];

  it.each(sorts.map((sort, index) => ({ sort, index })))('keeps byte-identical legacy/stable SQL (sort $index)', ({ sort }) => {
    for (const anchor of [null, { created_at: timestamp }, { score: 0.25 }, cursor]) {
      expect(buildFeedQuery(sort, anchor, 20)).toBe(socialFeed.buildFeedQuery(sort, anchor, 20));
    }
    for (const anchor of [null, cursor]) {
      for (const tags of [undefined, [], ['short'], ['music', "tag'\\"]]) {
        const opts = { stable: true, rankingClockMs: clock, tags };
        const sql = buildFeedQuery(sort, anchor, 20, opts);
        expect(sql).toBe(socialFeed.buildFeedQuery(sort, anchor, 20, opts));
        expect(sql).not.toContain('now64');
        expect(sql).toContain('p.author_key DESC, p.doc_id DESC');
        if (tags?.length) expect(sql).toContain(`has(p.tags, '${tags[0]}')`);
      }
    }
    expect(buildFeedQuery(sort, null, 0)).toBe(socialFeed.buildFeedQuery(sort, null, 0));
  });

  it('retains timestamp normalization and exact author/document tie anchors', () => {
    const post: PostRecord = { _id: "id'\\", author_key: 'node/users/alice', created_at: cursor.created_at!, score: 0.25 };
    const structural: SourcePost = post;
    // The shared output can enter a social PostRecord list without app imports.
    const backToSocial: PostRecord = structural;
    expect(feedCursorFromPost(backToSocial)).toEqual(socialFeed.feedCursorFromPost(post));
    expect(feedCursorFromPost(post).created_at).toBe(timestamp);
  });

  it.each([
    { ...cursor, created_at: 'invalid' },
    { ...cursor, author_key: '' },
    { ...cursor, doc_id: 'bad\u0000key' },
    { ...cursor, score: NaN },
    { ...cursor, score: Infinity },
    { ...cursor, score: '1); SELECT' as unknown as number },
  ])('denies the same malformed stable cursor %#', (bad) => {
    expect(() => buildFeedQuery(knobStateToSort(knobState), bad, 20, { stable: true })).toThrow();
    expect(() => socialFeed.buildFeedQuery(knobStateToSort(knobState), bad, 20, { stable: true })).toThrow();
  });

  it('maps personal/group prepared posts, profiles, products and attached ads identically', () => {
    const attached = { doc_id: 'ad', author_key: 'node/users/sponsor', created_at: timestamp,
      tags: ['ad', 'node_ad', 'album:album-id'], body: { title: 'Sponsor', text: 'Creative', format: 'post', status: 'paused',
        media_refs: [{ doc_id: 'creative', read_url: '/creative' }], product_id: { type: 'text', value: 'p' },
        offer: { kind: { type: 'text', value: 'affiliate' }, partner: 'Shop', link: 'https://shop.example', cta: 'Buy', disclosure: 'Sponsored' },
        product: { name: { type: 'text', value: 'Item' }, price: { type: 'number', value: 10 }, commission: 2,
          commission_is_percent: { type: 'boolean', value: true }, pics: ['one', { type: 'text', value: 'two' }], actuals: 4, calibration: 6 } } };
    for (const author_key of ['alice', 'node/users/alice', 'node/groups/team']) {
      for (const profile_body of [undefined, {}, JSON.stringify({ display_name: 'Alice', avatar_ref: 'face', banner_ref: 'banner', bio: 'Bio', website: 'https://example.com', location: 'Here' })]) {
        const row = { doc_id: 'post', author_key, posted_by: 'human', created_at: timestamp, group_id: 'node/groups/readable',
          body: { title: 'Title', text: 'Caption', media_refs: ['bare', { doc_id: 'video', read_url: '/video', transcoding_settings: { status: 'done', manifest_url: '/hls' } }],
            origin: 'other', origin_id: 'external', visibility: 'public', location: { name: 'Here' },
            mentions: [{ username: 'bob', provider: 'node' }], encrypted: false, repost_of: 'original',
            name: 'Product body', price: 12, tags: ['body-tag'], source_origin: 'https://not-authority.example' },
          tags: [], likes: 5, dislikes: 2, comments: 3, reposts: 4, score: 0.5, ad: attached, node_ad: attached,
          ad_target: 'ad', profile_body, avatar_url: '/face' };
        expect(fromFeedQueryRow(row)).toEqual(socialFeed.fromFeedQueryRow(row));
        expect(fromFeedQueryRow(row)).not.toHaveProperty('source_origin');
      }
    }
  });
});

describe('shared/public home read ownership', () => {
  const options = { sources: [{ origin: home, weight: 100 }], homeOrigin: home, credential: null,
    knobState, isCurrent: () => true, groupMode: 'discover' as const, tags: ['music'] };

  it('uses explicit anonymous transport even on home, never the social cookie-aware reader', async () => {
    const ambient = vi.spyOn(socialFeed, 'readFeedPage').mockRejectedValue(new Error('must not read ambient auth'));
    const calls: { url: string; body: Record<string, unknown>; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init, body: JSON.parse(String(init.body)) });
      return new Response(JSON.stringify({ rows: [] }), { status: 200 });
    }));
    const reader = createMixedFeedReader(options);
    expect((await reader.next()).errors).toEqual({});
    expect(ambient).not.toHaveBeenCalled();
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${home}/v3/query`);
    expect(calls[0].body).not.toHaveProperty('token');
    expect(calls[0].body.groups).toEqual(['home.example/groups/web10/discover']);
    expect(calls[0].body.sql).toContain("has(p.tags, 'music')");
    expect(calls[0].init).toMatchObject({ credentials: 'omit', redirect: 'error' });
    reader.dispose();
  });

  it('lets a configured public HTTP home use only its explicit adapter and passes tags', async () => {
    const ambient = vi.spyOn(socialFeed, 'readFeedPage').mockRejectedValue(new Error('must not read ambient auth'));
    const homeRead = vi.fn().mockResolvedValue({ posts: [{ _id: 'p', author_key: 'alice', created_at: timestamp, score: 0 }], has_more: false });
    const reader = createSharedMixedFeedReader({ ...options, homeOrigin: 'http://api.localhost',
      sources: [{ origin: 'http://api.localhost', weight: 100 }], homeRead });
    expect((await reader.next()).posts[0].source_origin).toBe('http://api.localhost');
    expect(homeRead).toHaveBeenCalledWith(expect.objectContaining({ tags: ['music'], stable: true, limit: 20, rankingClockMs: expect.any(Number) }));
    expect(ambient).not.toHaveBeenCalled();
    reader.dispose();
  });

  it('injects the normal home reader only in authenticated social options', async () => {
    const ambient = vi.spyOn(socialFeed, 'readFeedPage').mockResolvedValue({ posts: [], has_more: false, next_cursor: null });
    const reader = createMixedFeedReader({ ...options, credential: 'explicit-synthetic' });
    await reader.next();
    expect(ambient).toHaveBeenCalledOnce();
    reader.dispose();
  });
});
