import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useFeedSources } from '@/components/Feed/useFeedSources';

const fixture = vi.hoisted(() => ({ client: {} as Record<string, any>, username: 'alice', rows: [] as { origin: string; weight: number }[] }));
vi.mock('@/data/v3', () => ({ getV3Client: () => fixture.client, readTokenCookie: () => null, Web10Error: class extends Error {} }));
const home = 'https://home.example', foreign = 'https://foreign.example';
beforeEach(async () => {
  const { webcrypto } = await import(/* @vite-ignore */ 'node:' + 'crypto');
  vi.stubGlobal('crypto', webcrypto); sessionStorage.clear();
  fixture.username = 'alice'; fixture.rows = [{ origin: home, weight: 100 }, { origin: foreign, weight: 100 }];
  const group = () => `home.example/groups/users/${fixture.username}/feed-sources`;
  fixture.client = {
    state: { apiOrigin: home, token: 'synthetic-credential-A' },
    readToken: () => ({ username: fixture.username, provider: 'home.example' }),
    getGroup: vi.fn(async () => ({ group_id: group(), join_policy: 'closed', discoverable: false, membership_visibility: 'hidden' })),
    getGroupMembers: vi.fn(async () => [{ member_key: fixture.username, role: 'owner' }]),
    read: vi.fn(async () => [{ doc_id: 'catalog' }]),
    readById: vi.fn(async () => ({ doc_id: 'catalog', service: 'settings', author_key: fixture.username,
      groups: [group()], body: { version: 1, sources: fixture.rows } })),
    update: vi.fn(async (_id, body) => {
      if (body.sources) fixture.rows = body.sources;
      return { doc_id: 'catalog', service: 'settings', author_key: fixture.username,
        groups: [group()], body: { version: 1, sources: fixture.rows } };
    }), create: vi.fn(),
  };
});
afterEach(() => { vi.unstubAllGlobals(); sessionStorage.clear(); });
describe('catalog data is not dispatch approval', () => {
  it('requires a separate approval even for an owner-private stored foreign source', async () => {
    const { result } = renderHook(useFeedSources);
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.sources).toContainEqual({ origin: foreign, weight: 100 });
    expect(result.current.approved.has(foreign)).toBe(false);
    act(() => result.current.approve(foreign));
    expect(result.current.approved.has(foreign)).toBe(true);
    expect(JSON.stringify(sessionStorage)).not.toContain(fixture.client.state.token);
  });
  it('old callbacks cannot approve or write after another account takes ownership', async () => {
    const { result, rerender } = renderHook(useFeedSources);
    await waitFor(() => expect(result.current.ready).toBe(true));
    const old = result.current;
    fixture.username = 'bob'; fixture.client.state.token = 'synthetic-credential-B';
    rerender();
    await waitFor(() => expect(result.current.ready && result.current.scope !== old.scope).toBe(true));
    act(() => { old.approve(foreign); old.save([], foreign); });
    expect(result.current.approved.has(foreign)).toBe(false);
    expect(fixture.client.update.mock.calls.some(([, body]: any[]) => 'sources' in body)).toBe(false);
  });
  it('does not lose an explicit Add approval when a later weight save is queued', async () => {
    fixture.rows = [{ origin: home, weight: 100 }];
    const { result } = renderHook(useFeedSources);
    await waitFor(() => expect(result.current.ready).toBe(true));
    let release!: () => void;
    const update = fixture.client.update.getMockImplementation();
    fixture.client.update.mockImplementation(async (id: string, body: any) => {
      if (body.sources && !release) await new Promise<void>(resolve => { release = resolve; });
      return update(id, body);
    });
    act(() => result.current.save([...fixture.rows, { origin: foreign, weight: 100 }], foreign));
    await waitFor(() => expect(release).toBeDefined());
    act(() => result.current.save([{ origin: home, weight: 50 }, { origin: foreign, weight: 100 }]));
    await act(async () => release());
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.approved.has(foreign)).toBe(true);
    expect(fixture.client.update.mock.calls.filter(([, body]: any[]) => 'sources' in body)).toHaveLength(2);
  });
  it('cannot resurrect removed consent through a retained same-account callback', async () => {
    const { result } = renderHook(useFeedSources);
    await waitFor(() => expect(result.current.ready).toBe(true));
    act(() => result.current.approve(foreign));
    const old = result.current;
    act(() => result.current.save([{ origin: home, weight: 100 }]));
    await waitFor(() => expect(result.current.busy).toBe(false));
    act(() => old.approve(foreign));
    expect(result.current.approved.has(foreign)).toBe(false);
    act(() => old.save(old.sources, foreign));
    await act(async () => { await Promise.resolve(); });
    expect(result.current.sources).toEqual([{ origin: home, weight: 100 }]);
    expect(result.current.approved.has(foreign)).toBe(false);
    fixture.rows = [{ origin: home, weight: 100 }, { origin: foreign, weight: 100 }];
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.ready && result.current.sources.length === 2).toBe(true));
    expect(result.current.approved.has(foreign)).toBe(false);
  });
});
