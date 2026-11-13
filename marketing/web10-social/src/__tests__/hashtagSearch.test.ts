import { beforeEach, describe, expect, it, vi } from 'vitest';
import { hashtagPostCount, hashtagSearchSql, searchHashtags } from '@/data/hashtagSearch';

const mocks = vi.hoisted(() => ({ query: vi.fn(), account: 'one', client: null as unknown }));
vi.mock('@/data/v3', () => ({ getV3Client: () => mocks.client }));
vi.mock('@/data/groups', () => ({ getDiscoverGroupId: () => 'discover' }));
beforeEach(() => {
  mocks.account = 'one'; mocks.query.mockReset();
  mocks.query.mockResolvedValue({ rows: [{ hashtag: 'music', post_count: '100000' }] });
  mocks.client = { query: mocks.query, readToken: () => ({ username: mocks.account, provider: 'node' }) };
});
const signal = () => new AbortController().signal;

describe('hashtag suggestion reads', () => {
  it('uses the public board, counts distinct posts and ranks exact then prefix before popularity', async () => {
    expect(await searchHashtags('MuS', signal())).toEqual([{ hashtag: 'music', postCount: 100000 }]);
    expect(mocks.query).toHaveBeenCalledWith(hashtagSearchSql('mus'), { groups: ['discover'] });
    const sql = hashtagSearchSql('mus');
    expect(sql).toContain("arrayJoin(JSONExtract(body, 'hashtags', 'Array(String)'))");
    expect(sql).toContain('uniqExact(tuple(author_key, doc_id))');
    expect(sql).toContain("not has(tags, 'ad') AND not has(tags, 'product')");
    expect(sql).toContain("if(hashtag = 'mus', 0, if(startsWith(hashtag, 'mus'), 1, 2)), post_count DESC, hashtag ASC LIMIT 8");
    expect(hashtagSearchSql('')).not.toContain('position(');
    expect(() => hashtagSearchSql("x' OR 1=1")).toThrow();
    expect(hashtagPostCount(100000)).toBe('100K posts');
    expect(hashtagPostCount(1)).toBe('1 post');
  });
  it('coalesces reads and caches by normalized query, but not across accounts', async () => {
    await Promise.all([searchHashtags('Music', signal()), searchHashtags('music', signal())]);
    await searchHashtags('music', signal());
    expect(mocks.query).toHaveBeenCalledTimes(1);
    mocks.account = 'two'; await searchHashtags('music', signal());
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });
  it('retries failures and expires results after one minute', async () => {
    mocks.query.mockRejectedValueOnce(new Error('offline'));
    await expect(searchHashtags('music', signal())).rejects.toThrow('offline');
    await searchHashtags('music', signal());
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 60001);
    await searchHashtags('music', signal());
    expect(mocks.query).toHaveBeenCalledTimes(3); vi.restoreAllMocks();
  });
  it('denies stale-account and cancelled replies without cancelling a shared read', async () => {
    let resolve!: (value: unknown) => void;
    mocks.query.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const abort = new AbortController();
    const cancelled = searchHashtags('mus', abort.signal);
    const current = searchHashtags('mus', signal());
    abort.abort(); resolve({ rows: [{ hashtag: 'music', post_count: 2 }] });
    expect(await cancelled).toEqual([]); expect(await current).toHaveLength(1);
    mocks.query.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const stale = searchHashtags('other', signal()); mocks.account = 'two';
    resolve({ rows: [{ hashtag: 'other', post_count: 1 }] }); expect(await stale).toEqual([]);
  });
  it('rejects malformed results and bounds its response/cache', async () => {
    mocks.query.mockResolvedValue({ rows: [{ hashtag: 'bad-tag', post_count: 4 }, { hashtag: 'okay', post_count: -1 },
      { hashtag: 'huge', post_count: '9007199254740993' }, ...Array.from({ length: 10 }, (_, i) => ({ hashtag: `tag${i}`, post_count: i + 1 }))] });
    expect(await searchHashtags('', signal())).toHaveLength(8);
    for (let i = 0; i < 65; i++) await searchHashtags(`q${i}`, signal());
    await searchHashtags('', signal()); expect(mocks.query).toHaveBeenCalledTimes(67);
  });
});
