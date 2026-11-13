import { afterEach, describe, expect, it, vi } from 'vitest';
import { readHashtagBoard } from '@/data/hashtags';
import { buildFeedQuery } from '@/data/feed';
import { fromV3DocToPost } from '@/data/types';
import * as v3 from '@/data/v3';
import { getDiscoverGroupId } from '@/data/groups';

afterEach(() => vi.restoreAllMocks());

describe('hashtag board query', () => {
  it('uses the generic query on Discover only, including anonymous reads and prepared media', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    vi.spyOn(v3, 'getV3Client').mockReturnValue({ query, readToken: () => null } as any);
    expect(await readHashtagBoard('Walking')).toEqual({ posts: [], has_more: false, next_cursor: null });
    expect(query).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("has(JSONExtract(p.body, 'hashtags', 'Array(String)'), 'walking')"), expect.objectContaining({
      groups: [getDiscoverGroupId()], surface: 'hashtag', contentService: 'posts',
      prepare: expect.objectContaining({ media: true, ads: true }),
    }));
    expect(query.mock.calls[0][0]).toContain("not has(p.tags, 'ad')");
    expect(query.mock.calls[0][0]).toContain("not has(p.tags, 'product')");
  });
  it('filters before stable keyset paging, never by machine classification tags', () => {
    const sql = buildFeedQuery(null, { created_at: '2026-11-11T00:00:00Z', author_key: 'bob', doc_id: 'p' }, 20, { stable: true, hashtags: ['walking'] });
    expect(sql).toContain("JSONExtract(p.body, 'hashtags', 'Array(String)')");
    expect(sql).not.toContain("has(p.tags, 'walking')");
    expect(sql).toContain('p.author_key');
    expect(sql).toContain('p.doc_id');
    expect(sql).toContain('LIMIT 21');
  });
  it('refuses invalid topic parameters without dispatch, and respects ended read ownership', async () => {
    const query = vi.fn();
    vi.spyOn(v3, 'getV3Client').mockReturnValue({ query } as any);
    await expect(readHashtagBoard("a' OR 1=1")).rejects.toThrow('Invalid hashtag');
    await expect(readHashtagBoard('walking', { isCurrent: () => false })).rejects.toThrow('Feed scope ended');
    expect(query).not.toHaveBeenCalled();
  });
  it('maps only valid array hashtags and never mistakes machine tags for topics', () => {
    const doc = { doc_id: 'p', author_key: 'alice', created_at: '', tags: ['short'], body: { hashtags: ['walking', 1, null, 'INVALID', ''] } };
    expect(fromV3DocToPost(doc as any)).toMatchObject({ tags: ['short'], hashtags: ['walking'] });
    expect(fromV3DocToPost({ ...doc, body: { hashtags: 'bad' } } as any).hashtags).toBeUndefined();
  });
});
