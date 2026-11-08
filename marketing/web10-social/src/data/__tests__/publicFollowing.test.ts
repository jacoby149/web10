import { describe, expect, it, vi } from 'vitest';
import { createPublicFollowingReader, type PublicFollow } from '../publicFollowing';

const providers = { 'a.example': 'https://api.a.example', 'b.example': 'https://api.b.example' };
const record = (provider = 'a.example', user = 'alice', ttl = 30) => ({
  type: 16, name: 'web10.creator.example.', TTL: ttl,
  data: JSON.stringify(`web10.v=1;provider=${provider};user=${user}`),
});
const doc = (user: string, id = 'shared-id', created_at = '2026-11-08T12:00:00Z') => ({
  doc_id: id, author_key: user, body: { text: 'public fixture' }, tags: [], created_at,
});
const json = (body: unknown) => new Response(JSON.stringify(body));
function fixture() {
  let answer: unknown = { Status: 0, Answer: [record()] };
  let alias = true;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.host === 'dns.example') return json(answer);
    if (url.pathname.endsWith('/domain')) return json({ domain: 'creator.example', verified: alias });
    const body = JSON.parse(String(init?.body));
    return json(body.groups.map((group: string) => doc(group.split('/').slice(-2)[0])));
  });
  const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/resolve', fetcher });
  return { reader, fetcher, setAnswer: (value: unknown) => { answer = value; }, setAlias: (value: boolean) => { alias = value; } };
}
const current = () => true;
const follows: PublicFollow[] = [{ domain: 'creator.example' }, { provider: 'a.example', user: 'alice' },
  { provider: 'a.example', user: 'bob' }, { provider: 'b.example', user: 'alice' }];

describe('public following preview (PF1, not production Following)', () => {
  it('resolves/deduplicates domains and accounts, reads once per node, keeps namesake IDs distinct', async () => {
    const { reader, fetcher } = fixture();
    const result = await reader.read([...follows, { domain: 'CREATOR.EXAMPLE.' }], current);
    expect(result.posts).toHaveLength(3);
    expect(new Set(result.posts.map(row => row.key)).size).toBe(3);
    expect(result.unavailable).toEqual([]);
    const reads = fetcher.mock.calls.filter(([url]) => String(url).endsWith('/v3/read'));
    expect(reads).toHaveLength(2);
    expect(JSON.parse(String(reads[0][1]?.body)).groups).toEqual(['a.example/groups/users/alice/followers', 'a.example/groups/users/bob/followers']);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('dns.example'))).toHaveLength(1);
    for (const [, init] of fetcher.mock.calls) {
      expect(init).toMatchObject({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' });
      expect(init?.body ?? '').not.toContain('token');
      expect(init?.headers).not.toHaveProperty('Authorization');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it.each([
    { Status: 3, Answer: [] }, { Status: 0, Answer: [record(), record()] },
    { Status: 0, Answer: [record('evil.example')] },
    { Status: 0, Answer: [record('https://a.example')] },
    { Status: 0, Answer: [record('a.example', 'anon')] },
    { Status: 0, Answer: [{ ...record(), data: '"web10.v=2;provider=a.example;user=alice"' }] },
    { Status: 0, Answer: [{ ...record(), name: 'web10.other.example.' }] },
    { Status: 0, Answer: [{ ...record(), data: 'garbage "web10.v=1;provider=a.example;user=alice"' }] },
  ])('rejects invalid/ambiguous/unconfigured TXT without a destination request: %j', async (answer) => {
    const { reader, fetcher, setAnswer } = fixture(); setAnswer(answer);
    expect((await reader.read([{ domain: 'creator.example' }], current)).unavailable).toEqual([{ kind: 'follow', index: 0 }]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('joins split TXT chunks but requires the target account alias', async () => {
    const { reader, setAnswer, setAlias, fetcher } = fixture();
    setAnswer({ Status: 0, Answer: [{ ...record(), data: '"web10.v=1;provider=" "a.example;user=alice"' }] });
    setAlias(false);
    expect((await reader.read([{ domain: 'creator.example' }], current)).posts).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    setAlias(true);
    expect((await reader.read([{ domain: 'creator.example' }], current)).posts).toHaveLength(1);
  });

  it('uses DNS TTL, retargets without refollowing, and never falls back to an expired pointer', async () => {
    const { fetcher, setAnswer } = fixture(); let now = 0;
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher, now: () => now });
    const saved = [{ domain: 'creator.example' }];
    expect((await reader.read(saved, current)).posts[0].provider).toBe('a.example');
    now = 29999; await reader.read(saved, current);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('dns.example'))).toHaveLength(1);
    now = 30000; setAnswer({ Status: 0, Answer: [record('b.example')] });
    expect((await reader.read(saved, current)).posts[0].provider).toBe('b.example');
    now = 60000; setAnswer({ Status: 3 });
    const before = fetcher.mock.calls.length;
    expect((await reader.read(saved, current)).unavailable).toHaveLength(1);
    expect(fetcher.mock.calls.length - before).toBe(1);
    expect(saved).toEqual([{ domain: 'creator.example' }]);
  });

  it.each([0, 3600])('does not cache TTL zero and caps long TTLs (%s)', async ttl => {
    const { fetcher, setAnswer } = fixture(); setAnswer({ Status: 0, Answer: [record('a.example', 'alice', ttl)] });
    let now = 0;
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher, now: () => now });
    await reader.read([{ domain: 'creator.example' }], current);
    now = ttl ? 60000 : 1;
    await reader.read([{ domain: 'creator.example' }], current);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes('dns.example'))).toHaveLength(2);
  });

  it('keeps healthy nodes when another node denies the read', async () => {
    const fetcher = vi.fn<typeof fetch>(async input => String(input).includes('api.a.') ? new Response('', { status: 403 }) : json([doc('alice')]));
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher });
    const result = await reader.read(follows.slice(1), current);
    expect(result.posts.map(row => row.provider)).toEqual(['b.example']);
    expect(result.unavailable).toEqual([{ kind: 'node', provider: 'a.example' }]);
  });

  it.each([doc('mallory'), doc('b.example/users/alice'), { ...doc('alice'), created_at: 'invalid' }])('rejects out-of-scope/malformed rows', async row => {
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher: async () => json([row]) });
    expect((await reader.read([follows[1]], current)).unavailable).toHaveLength(1);
  });

  it('bounds the response body and makes oversized replies unavailable', async () => {
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher: async () => new Response('x'.repeat(262145)) });
    expect((await reader.read([follows[1]], current)).unavailable).toHaveLength(1);
  });

  it('discards obsolete results and never enters the node-read phase after DNS', async () => {
    const { fetcher } = fixture(); let live = true;
    const wrapped: typeof fetch = async (...args) => { const result = await fetcher(...args); live = false; return result; };
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher: wrapped });
    await expect(reader.read([{ domain: 'creator.example' }], () => live)).rejects.toThrow('superseded');
    expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/v3/read'))).toBe(false);
  });

  it('enforces four live transports across overlapping reads', async () => {
    let active = 0, peak = 0;
    const releases: (() => void)[] = [];
    const fetcher: typeof fetch = async () => {
      active++; peak = Math.max(peak, active);
      await new Promise<void>(resolve => releases.push(resolve)); active--; return json([doc('alice')]);
    };
    const reader = createPublicFollowingReader({ providers, resolver: 'https://dns.example/', fetcher });
    const reads = Array.from({ length: 10 }, () => reader.read([follows[1]], current));
    for (const size of [4, 4, 2]) {
      await vi.waitFor(() => expect(releases).toHaveLength(size));
      releases.splice(0).forEach(release => release());
    }
    await Promise.all(reads); expect(peak).toBe(4);
  });

  it('rejects invalid configuration/input before network work', async () => {
    expect(() => createPublicFollowingReader({ providers: { 'a.example': 'http://a.example' }, resolver: 'https://dns.example' })).toThrow();
    const { reader, fetcher } = fixture();
    await expect(reader.read([], current, 51)).rejects.toThrow('bounds');
    expect((await reader.read([{ domain: 'https://creator.example' }], current)).unavailable).toHaveLength(1);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
