import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFeedQuery, readFeedPage } from '../../data/feed';
import { createMixedFeedReader } from '../../data/mixedFeed';
import type { PostRecord } from '../../data/types';

const home = 'https://home.example';
const nodes = ['https://a.example', 'https://b.example', 'https://c.example'];
const credential = 'synthetic-secret-not-for-snapshot';
const knobState = { recency: 5, likes: 0, comments: 0, halfLife: 3, character: 3 };
const timestamp = '2026-11-01T00:00:00.000Z';
const row = (id: string, author = 'alice') => ({
  doc_id: id, author_key: author, created_at: timestamp, score: 0,
  body: { text: 'private synthetic content', source_origin: 'https://attacker.example' }, tags: [],
  profile_body: { display_name: 'Alice' }, avatar_url: 'https://media.example/avatar',
});
const post = (id: string): PostRecord => ({ _id: id, author_key: 'alice', created_at: timestamp, score: 0, text: 'home' });

type Call = { origin: string; action: string; body: Record<string, any>; init: RequestInit };
function wire(handler: (call: Call) => unknown | Promise<unknown>) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input);
    const call = { origin: url.origin, action: url.pathname.slice(4), body: JSON.parse(String(init.body)), init };
    calls.push(call);
    const response = await handler(call);
    return response instanceof Response ? response : new Response(JSON.stringify(response), { status: 200 });
  }));
  return calls;
}
function reader(sources = nodes.map((origin) => ({ origin, weight: 100 })), extra: Partial<Parameters<typeof createMixedFeedReader>[0]> = {}) {
  return createMixedFeedReader({ sources, homeOrigin: home, credential, knobState, isCurrent: () => true, ...extra });
}
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('mixed feed actual explicit transport', () => {
  it('batches three nodes, applies actual quotas/prepare, and smoothly interleaves weights', async () => {
    const calls = wire(({ origin, action, body }) => {
      if (action === 'groups/list') return Array.from({ length: 1000 }, (_, i) => ({ group_id: `${new URL(origin).host}/groups/users/u${i}/followers` }));
      const limit = Number(body.sql.match(/LIMIT (\d+)$/)[1]);
      return { rows: Array.from({ length: limit }, (_, i) => row(String(100 - i))) };
    });
    const mixed = reader(nodes.map((origin, i) => ({ origin, weight: [60, 30, 10][i] })));
    const result = await mixed.next();
    expect(result.allocations.map((a) => a.count)).toEqual([12, 6, 2]);
    expect(result.posts).toHaveLength(20);
    expect(result.posts.slice(0, 5).map((p) => p.source_origin)).toEqual([nodes[0], nodes[1], nodes[0], nodes[0], nodes[1]]);
    expect(result.posts.filter((p) => p.source_origin === nodes[2])).toHaveLength(2);
    expect(calls).toHaveLength(6); // 3,000 followed targets, three main queries, not creator HTTP calls.
    expect(calls.filter((c) => c.action === 'query').map((c) => c.body.sql.match(/LIMIT (\d+)$/)[1])).toEqual(['13', '7', '3']);
    for (const call of calls) {
      expect(call.body.token).toBe(credential);
      expect(call.init).toMatchObject({ credentials: 'omit', redirect: 'error', mode: 'cors', referrerPolicy: 'no-referrer' });
      if (call.action === 'query') {
        expect(call.body.groups).toHaveLength(1000);
        expect(call.body).toMatchObject({ surface: 'feed', content_service: 'posts', prepare: { media: true, ads: true, face: { urlField: 'avatar_url' } } });
        expect(call.body.sql).toContain('p.author_key DESC, p.doc_id DESC');
        expect(call.body.sql).not.toContain('now64');
      }
    }
    expect(result.posts[0]).toMatchObject({ _id: '100', source_origin: nodes[0], text: 'private synthetic content', profile: { display_name: 'Alice' } });
    mixed.dispose();
  });

  it('keeps identical IDs across nodes and authors distinct, never accepts content as a destination', async () => {
    const calls = wire(({ action }) => action === 'groups/list' ? [] : { rows: [row('same', 'alice'), row('same', 'bob')] });
    const result = await reader().next();
    expect(result.posts).toHaveLength(6);
    expect(new Set(result.posts.map((p) => p.source_key)).size).toBe(6);
    expect(result.posts.every((p) => p._id === 'same')).toBe(true);
    expect(calls.every((c) => nodes.includes(c.origin))).toBe(true);
    for (const call of calls.filter((c) => c.action === 'query')) {
      expect(call.body.groups).toEqual([`${new URL(call.origin).host}/groups/web10/discover`]);
      expect(call.body.token).toBe(credential); // Discover fallback is authenticated too.
    }
  });

  it('shows role/app denial without anonymous retry, isolates failure, and mutes zero', async () => {
    const calls = wire(({ origin, action }) => action === 'groups/list' ? [] : origin === nodes[0]
      ? new Response('private error body / token must not escape', { status: 403 }) : { rows: [row('ok')] });
    const mixed = reader(nodes.map((origin, i) => ({ origin, weight: i === 2 ? 0 : 100 })));
    const result = await mixed.next();
    expect(result.posts.map((p) => p.source_origin)).toEqual([nodes[1]]);
    expect(result.errors[nodes[0]]).toContain('HTTP 403');
    expect(JSON.stringify(result.errors)).not.toMatch(/private|token|secret/);
    expect(calls.filter((c) => c.origin === nodes[0])).toHaveLength(2);
    expect(calls.some((c) => c.origin === nodes[2])).toBe(false);
    await mixed.next();
    expect(calls).toHaveLength(4); // No automatic retry and no exhausted-source read.
    expect(calls.every((c) => c.body.token === credential)).toBe(true);
  });

  it('does not treat denied membership discovery as no memberships', async () => {
    const calls = wire(() => new Response('denied', { status: 403 }));
    const result = await reader([{ origin: nodes[0], weight: 100 }]).next();
    expect(calls.map((c) => c.action)).toEqual(['groups/list']);
    expect(result.errors[nodes[0]]).toContain('403');
  });

  it('all-zero is intentional pause with no requests', async () => {
    const calls = wire(() => { throw new Error('must not dispatch'); });
    const result = await reader(nodes.map((origin) => ({ origin, weight: 0 }))).next();
    expect(result).toMatchObject({ posts: [], has_more: false, errors: {} });
    expect(calls).toEqual([]);
  });
  it('carries fractional quotas so a small positive fader is not a hidden mute', async () => {
    let id = 10000;
    wire(({ action, body }) => action === 'groups/list' ? [] : { rows: Array.from({ length: Number(body.sql.match(/LIMIT (\d+)$/)[1]) }, () => row(String(id--))) });
    const mixed = reader([{ origin: nodes[0], weight: 100 }, { origin: nodes[1], weight: 1 }]);
    let minority = 0, total = 0;
    for (let page = 0; page < 10; page++) {
      const result = await mixed.next();
      minority += result.posts.filter(post => post.source_origin === nodes[1]).length;
      total += result.posts.length;
    }
    expect(total).toBe(200);
    expect(minority).toBe(2);
  });

  it('retains equal-time lookahead tails and restores only delivered anchors', async () => {
    const calls = wire(({ action, body }) => {
      if (action === 'groups/list') return [];
      const match = body.sql.match(/tuple\(\d+, 'alice', '(\d+)'\)/);
      const before = match ? Number(match[1]) : 99;
      const limit = Number(body.sql.match(/LIMIT (\d+)$/)[1]);
      return { rows: Array.from({ length: Math.min(limit, before) }, (_, i) => row(String(before - i - 1).padStart(3, '0'))) };
    });
    const sources = [{ origin: nodes[0], weight: 100 }];
    const mixed = reader(sources);
    const first = await mixed.next();
    const snapshot = mixed.snapshot();
    const second = await mixed.next();
    expect(first.posts.map((p) => p._id)).toEqual(Array.from({ length: 20 }, (_, i) => String(98 - i).padStart(3, '0')));
    expect(second.posts.map((p) => p._id)).toEqual(Array.from({ length: 20 }, (_, i) => String(78 - i).padStart(3, '0')));
    expect(calls.filter((c) => c.action === 'groups/list')).toHaveLength(1);
    expect(calls.filter((c) => c.action === 'query')[1].body.sql).toContain("'078'");
    expect(calls.filter((c) => c.action === 'query')[1].body.sql).toContain('LIMIT 20');
    expect(snapshot).not.toMatch(/secret|private synthetic|avatar|token/);
    const restored = reader(sources, { initialCursor: snapshot });
    expect((await restored.next()).posts.map((p) => p._id)).toEqual(second.posts.map((p) => p._id));
    const displayed = reader(sources, { initialCursor: second.page_cursor });
    expect((await displayed.next()).posts.map(p => p._id)).toEqual(second.posts.map(p => p._id));
    const all = [...first.posts, ...second.posts];
    let more = true;
    while (more) {
      const next = await mixed.next();
      all.push(...next.posts);
      more = next.has_more;
    }
    expect(all.map((p) => p._id)).toEqual(Array.from({ length: 99 }, (_, i) => String(98 - i).padStart(3, '0')));
  });

  it('retains failed anchors for explicit retry, ignores removed snapshot sources', async () => {
    let denied = false;
    const calls = wire(({ action, origin }) => action === 'groups/list' ? [] : denied
      ? new Response('denied', { status: 403 }) : { rows: Array.from({ length: 11 }, (_, i) => row(`${origin.endsWith('a.example') ? 'a' : 'b'}${20 - i}`)) });
    const sources = nodes.slice(0, 2).map((origin) => ({ origin, weight: 100 }));
    const mixed = reader(sources);
    await mixed.next();
    const before = JSON.parse(mixed.snapshot()).anchors;
    denied = true;
    await mixed.next();
    expect(JSON.parse(mixed.snapshot()).anchors).toEqual(before);
    const restored = reader([sources[0]], { initialCursor: mixed.snapshot() });
    calls.length = 0;
    await restored.next();
    expect(calls.every((c) => c.origin === nodes[0])).toBe(true);
    expect(calls.find((c) => c.action === 'query')!.body.sql).toContain("'a11'");
  });

  it('bounds source workers at four and rejects stale completions/disposed queued reads', async () => {
    let current = true;
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const calls = wire(async () => { await held; return []; });
    const mixed = reader(Array.from({ length: 8 }, (_, i) => ({ origin: `https://n${i}.example`, weight: 100 })), { isCurrent: () => current });
    const pending = mixed.next();
    const queued = mixed.next();
    await vi.waitFor(() => expect(calls).toHaveLength(4));
    current = false;
    mixed.dispose();
    release();
    await expect(pending).rejects.toThrow('scope ended');
    await expect(queued).rejects.toThrow('scope ended');
    expect(calls).toHaveLength(4);
    expect(calls.every((c) => c.init.signal?.aborted)).toBe(true);
    expect(JSON.parse(mixed.snapshot()).anchors.every((a: unknown[]) => a[1] === null)).toBe(true);
  });

  it('calls the normal home page reader with quota and stable paging options', async () => {
    const homeRead = vi.fn<typeof readFeedPage>().mockResolvedValue({ posts: [post('home')], has_more: false, next_cursor: null });
    const calls = wire(({ action }) => action === 'groups/list' ? [] : { rows: [row('foreign')] });
    const mixed = reader([{ origin: home, weight: 100 }, { origin: nodes[0], weight: 100 }], { homeRead });
    const result = await mixed.next();
    expect(homeRead).toHaveBeenCalledWith({ limit: 10, cursor: null, knobState, stable: true, rankingClockMs: expect.any(Number), isCurrent: expect.any(Function) });
    expect(result.posts.find((p) => p._id === 'home')?.source_origin).toBe(home);
    expect(calls.every((c) => c.origin !== home)).toBe(true);
  });

  it('validates numeric cursors and SQL-escapes remote author/id keys', () => {
    const cursor = { created_at: timestamp, score: 0, author_key: "a' OR 1=1 --\\", doc_id: 'id' };
    const sql = buildFeedQuery(null, cursor, 20, { stable: true, rankingClockMs: 1 });
    expect(sql).toContain("'a'' OR 1=1 --\\\\'");
    expect(() => buildFeedQuery(null, { ...cursor, created_at: "x'" }, 20, { stable: true })).toThrow();
    expect(() => buildFeedQuery(null, { ...cursor, score: '0); DROP' as any }, 20, { stable: true })).toThrow();
    expect(() => buildFeedQuery(null, { ...cursor, score: NaN }, 20, { stable: true })).toThrow();
    expect(() => reader([{ origin: 'https://evil.example/path', weight: 100 }])).toThrow();
  });
  it('never promotes echoed credentials into keys or URL anchors', async () => {
    wire(({ action }) => action === 'groups/list' ? [] : { rows: [row(credential)] });
    const mixed = reader([{ origin: nodes[0], weight: 100 }]);
    expect((await mixed.next()).posts).toEqual([]);
    expect(mixed.snapshot()).not.toContain(credential);
    expect(() => reader([{ origin: nodes[0], weight: NaN }])).toThrow();
    expect(() => reader([{ origin: nodes[0], weight: 100 }], { initialCursor: credential })).toThrow();
  });
  it('keeps source media paths on the serving node and drops credential-bearing URLs', async () => {
    wire(({ action }) => action === 'groups/list' ? [] : { rows: [{ ...row('media'), avatar_url: '/avatar.png', body: {
      text: 'media', media_refs: [{ doc_id: 'video', mime_type: 'video/mp4', read_url: '/video.mp4',
        thumbnail_url: `https://bad.example/${credential}`, transcoding_settings: { status: 'done', manifest_url: '/v3/hls/manifest' } }],
    } }] });
    const mixed = reader([{ origin: nodes[0], weight: 100 }]);
    const result = await mixed.next();
    expect(result.posts[0].avatar_url).toBe(`${nodes[0]}/avatar.png`);
    expect(result.posts[0].media_refs?.[0]).toMatchObject({ read_url: `${nodes[0]}/video.mp4`, transcoding_settings: { manifest_url: `${nodes[0]}/v3/hls/manifest` } });
    expect(JSON.stringify(result.posts)).not.toContain(credential);
  });

  it('pins ranked score time and includes created-time/author/id ties after restore', async () => {
    const calls = wire(({ action }) => action === 'groups/list' ? [] : { rows: Array.from({ length: 21 }, (_, i) => row(String(50 - i))) });
    const sources = [{ origin: nodes[0], weight: 100 }];
    const ranked = { ...knobState, likes: 5 };
    const mixed = reader(sources, { knobState: ranked });
    await mixed.next();
    const saved = mixed.snapshot();
    await reader(sources, { knobState: ranked, initialCursor: saved }).next();
    const queries = calls.filter((c) => c.action === 'query').map((c) => c.body.sql);
    const { clock } = JSON.parse(saved);
    expect(queries.every((sql) => sql.includes(`greatest(0, ${clock} -`))).toBe(true);
    expect(queries[1]).toContain("0, 1793491200000, 'alice', '31')");
    expect(queries[1]).toContain(', toUnixTimestamp64Milli(p.created_at) DESC, p.author_key DESC, p.doc_id DESC');
  });
  it.each([
    credential.slice(0, 4) + '\n' + credential.slice(4),
    [...credential].map(char => `%${char.charCodeAt(0).toString(16)}`).join(''),
  ])('rejects normalized or percent-encoded credential echoes in automatic media URLs (%#)', async reflected => {
    wire(({ action }) => action === 'groups/list' ? [] : { rows: [{ ...row('reflected'), avatar_url: `https://unapproved.example/?token=${reflected}`,
      body: { media_refs: [{ doc_id: 'video', read_url: `https://unapproved.example/?token=${reflected}` }] } }] });
    const result = await reader([{ origin: nodes[0], weight: 100 }]).next();
    expect(result.posts[0].avatar_url).toBeUndefined();
    expect(result.posts[0].media_refs?.[0]).toMatchObject({ read_url: undefined });
  });

  it.each([NaN, Infinity, "0); SELECT secret" as any, undefined])('rejects malformed remote scores (%s) without advancing', async (score) => {
    wire(({ action }) => action === 'groups/list' ? [] : { rows: [{ ...row('bad'), score }] });
    const mixed = reader([{ origin: nodes[0], weight: 100 }]);
    const result = await mixed.next();
    expect(result.posts).toEqual([]);
    expect(result.errors[nodes[0]]).toBeTruthy();
    expect(JSON.parse(mixed.snapshot()).anchors).toEqual([[nodes[0], null]]);
  });

  it('captures credential/acting scope, strips extra knob fields, rejects forged cursor scalars', async () => {
    const calls = wire(({ action }) => action === 'groups/list' ? [] : { rows: [] });
    const options = {
      sources: [{ origin: nodes[0], weight: 100 }], homeOrigin: home, credential, knobState: { ...knobState, token: credential },
      actingAuthor: 'home.example/groups/acting', isCurrent: () => true,
    };
    const mixed = createMixedFeedReader(options);
    options.credential = 'changed-after-capture';
    options.actingAuthor = 'changed-after-capture';
    await mixed.next();
    expect(calls[0].body).toMatchObject({ token: credential, author_as: 'home.example/groups/acting', service: 'posts' });
    expect(mixed.snapshot()).not.toContain(credential);
    const forged = JSON.parse(mixed.snapshot());
    forged.anchors = [[nodes[0], { created_at: timestamp, author_key: 'alice', doc_id: 'id', score: '1); SELECT' }]];
    expect(() => reader(options.sources, { actingAuthor: 'home.example/groups/acting', initialCursor: JSON.stringify(forged) })).toThrow('Invalid mixed feed cursor');
  });
});
