import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDirectoryReader, sortDirectory, type DirectoryRows } from '@web10/discover/directory-mixer';

const home = 'https://home.example', foreign = 'https://foreign.example';
const rows = (origin: string, limit: number, offset: number): DirectoryRows => ({ groups: [], people: Array.from({ length: limit }, (_, i) => ({
  username: `user-${offset + i}`, provider: new URL(origin).host, followers_count: 100 - offset - i, created_at: '2026-01-01T00:00:00.000Z',
})) });
function setup(weights = [100, 100], credential: string | null = null) {
  const calls: { origin: string; limit: number; offset: number; token?: string }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)), body = JSON.parse(String(init?.body || '{}'));
    if (url.pathname.endsWith('/query')) return Response.json({ rows: [] });
    calls.push({ origin: url.origin, limit: body.limit, offset: body.offset, token: body.token });
    const page = rows(url.origin, body.limit, body.offset);
    return Response.json({ users: page.people.map(p => ({ username: p.username, follower_count: p.followers_count, created_at: p.created_at, profile: {} })), sort: body.sort });
  });
  vi.stubGlobal('fetch', fetcher);
  const state = { current: true };
  const reader = createDirectoryReader({ sources: [{ origin: home, weight: weights[0] }, { origin: foreign, weight: weights[1] }],
    home, credential, kind: 'profiles', sort: 'popular', isCurrent: () => state.current });
  return { reader, calls, fetcher, state };
}
afterEach(() => vi.unstubAllGlobals());

describe('directory server mixer', () => {
  it('faders change actual limits and equal usernames stay source-qualified', async () => {
    const { reader, calls } = setup([25, 75]);
    const result = await reader.next();
    expect(calls.map(call => call.limit)).toEqual([5, 15]);
    expect(result.people).toHaveLength(20);
    expect(new Set(result.people.map(p => p.source_key)).size).toBe(20);
    expect(result.people.filter(p => p.username === 'user-0')).toHaveLength(2);
    await reader.next();
    expect(calls.slice(2).map(call => call.offset)).toEqual([5, 15]);
    expect(calls.every(call => call.token === undefined)).toBe(true);
    reader.dispose();
  });

  it('mute and all-paused make no reads to muted servers', async () => {
    const { reader, calls } = setup([0, 100]);
    await reader.next();
    expect(calls).toHaveLength(1);
    expect(calls[0].origin).toBe(foreign);
    reader.dispose();
    const paused = setup([0, 0]);
    expect((await paused.reader.next()).hasMore).toBe(false);
    expect(paused.fetcher).not.toHaveBeenCalled();
    paused.reader.dispose();
  });

  it('small positive weights are not permanently rounded to mute', async () => {
    const { reader, calls } = setup([1, 100]);
    for (let i = 0; i < 10; i++) await reader.next();
    expect(calls.filter(call => call.origin === home).reduce((sum, call) => sum + call.limit, 0)).toBe(2);
    reader.dispose();
  });

  it('failed source keeps its own offset and never retries a denied token anonymously', async () => {
    const { reader, calls, fetcher } = setup([100, 100], 'owned-token');
    const real = fetcher.getMockImplementation()!;
    let denied = true;
    fetcher.mockImplementation(async (input, init) => String(input).startsWith(foreign) && denied ? new Response('', { status: 403 }) : real(input, init));
    const first = await reader.next();
    expect(first.people).toHaveLength(10);
    expect(first.errors).toHaveProperty(foreign);
    denied = false;
    const second = await reader.next();
    expect(second.errors).toEqual({});
    expect(calls.filter(call => call.origin === home).map(call => call.offset)).toEqual([0, 10]);
    expect(calls.filter(call => call.origin === foreign).map(call => call.offset)).toEqual([0]);
    expect(calls.every(call => call.token === 'owned-token')).toBe(true);
    reader.dispose();
  });

  it('discarded identity generations cannot publish or continue', async () => {
    const { reader, state, fetcher } = setup();
    let release!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    // One source makes the held request ownership explicit.
    const held = createDirectoryReader({ sources: [{ origin: home, weight: 100 }], home, credential: null, kind: 'profiles', sort: 'newest', isCurrent: () => state.current });
    const pending = held.next();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    state.current = false;
    release(Response.json({ users: [], sort: 'newest' }));
    await expect(pending).rejects.toThrow();
    await expect(held.next()).rejects.toThrow();
    held.dispose(); reader.dispose();
  });

  it('old nodes cannot silently return popular ordering for a newest request', async () => {
    const { reader, fetcher } = setup();
    fetcher.mockResolvedValue(Response.json({ users: [], sort: 'old-order' }));
    const page = await reader.next();
    expect(page.people).toEqual([]);
    expect(Object.keys(page.errors)).toHaveLength(2);
    reader.dispose();
  });

  it('simple sorting uses creation or audience with deterministic source ties, never a power mean', () => {
    const items = [{ source_key: 'a', created_at: '2026-01-01', count: 100 }, { source_key: 'b', created_at: '2026-01-03', count: 1 }, { source_key: 'c', count: 10 }];
    expect(sortDirectory(items, 'newest', row => row.count).map(row => row.source_key)).toEqual(['b', 'a', 'c']);
    expect(sortDirectory(items, 'popular', row => row.count).map(row => row.source_key)).toEqual(['a', 'c', 'b']);
    expect(items[0].source_key).toBe('a');
  });
});
