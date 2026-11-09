// The server mixer on the Discover board (Hot Gossip — the /feed default tab —
// and the Video wall): the same Advanced chassis as Following / Shorts / Music,
// and the faders change the actual reads (server-mixer-component.md).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import { lucideMock } from './helpers/lucideMock';
import { readDiscoverFeed, readFeedPage } from '@/data/feed';

const setup = vi.hoisted(() => ({ home: 'https://home.example', foreign: 'https://foreign.example',
  sources: [] as { origin: string; weight: number }[], approved: new Set<string>(), credential: 'synthetic-session' as string | null }));
vi.mock('lucide-react', () => lucideMock);
vi.mock('@/components/Feed/useFeedSources', () => ({ useFeedSources: () => ({ ...setup, scope: String(setup.credential), ready: true,
  busy: false, error: '', live: () => true, save: vi.fn(), approve: vi.fn(), reload: vi.fn() }) }));
vi.mock('@/data/feedSources', async original => ({ ...await original<typeof import('@/data/feedSources')>(), homeFeedOrigin: () => setup.home }));
vi.mock('@/data/feed', async original => ({ ...await original<typeof import('@/data/feed')>(), readFeedPage: vi.fn(), readDiscoverFeed: vi.fn() }));
vi.mock('@/data/groups', async original => ({ ...await original<typeof import('@/data/groups')>(), getDiscoverGroupId: () => 'home.example/groups/web10/discover' }));
// Signed-out reads skip the home engagement pass (it needs a session token).
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => null }), resetWapi: vi.fn() }));

const created = '2026-11-01T00:00:00.000Z';
const foreignRow = { doc_id: 'same', author_key: 'alice', score: 0, created_at: created, body: { text: 'from the foreign node' }, tags: [] };
const homePost = { _id: 'same', author_key: 'bob', author_username: 'bob', text: 'from the home node', created_at: created, avatar_url: 'https://home.example/a.png' };

async function renderAt(path: string) {
  const { default: DiscoverScreen } = await import('@/components/Discover/DiscoverScreen');
  function NavigationProbe() {
    const location = useLocation(); const navigate = useNavigate();
    return <><output data-testid="location">{location.search}</output><button onClick={() => navigate(-1)}>History back</button></>;
  }
  render(<MemoryRouter initialEntries={[path]}><DiscoverScreen /><NavigationProbe /></MemoryRouter>);
}

beforeEach(() => {
  setup.credential = 'synthetic-session';
  setup.sources = [{ origin: setup.home, weight: 100 }, { origin: setup.foreign, weight: 100 }];
  setup.approved = new Set([setup.home, setup.foreign]);
  vi.mocked(readDiscoverFeed).mockResolvedValue([homePost]);
  vi.mocked(readFeedPage).mockResolvedValue({ posts: [homePost], has_more: false, next_cursor: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('Discover board server mixer', () => {
  it.each(['/hot-gossip', '/video'])('renders the mixer in the %s rack', async path => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [] }))));
    await renderAt(path);
    expect(await screen.findByTestId('server-mixer')).toBeInTheDocument();
    expect(screen.getAllByTestId('server-mixer-row')).toHaveLength(2);
  });

  it('keeps the board read when only the home server is active', async () => {
    setup.approved = new Set([setup.home]);
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await renderAt('/hot-gossip');
    await waitFor(() => expect(readDiscoverFeed).toHaveBeenCalled());
    expect(await screen.findByTestId('discover-card')).toHaveTextContent('from the home node');
    expect(readFeedPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reads every approved node through the Discover group and renders foreign rows read-only', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ rows: [foreignRow] })));
    vi.stubGlobal('fetch', fetcher);
    await renderAt('/hot-gossip');
    expect(await screen.findByTestId('foreign-feed-card')).toHaveTextContent('foreign.example');
    expect(screen.getByText('from the foreign node')).toBeInTheDocument();
    // The colliding home row (same doc id) stays its own card.
    expect(screen.getByTestId('discover-card')).toHaveTextContent('from the home node');
    expect(readDiscoverFeed).not.toHaveBeenCalled();
    expect(readFeedPage).toHaveBeenCalledWith(expect.objectContaining({ groups: ['home.example/groups/web10/discover'] }));
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${setup.foreign}/v3/query`);
    const payload = JSON.parse(String(options.body));
    expect(payload.groups).toEqual(['foreign.example/groups/web10/discover']);
    expect(payload.token).toBe(setup.credential);
  });

  it('never dispatches to a saved but unapproved server', async () => {
    setup.approved = new Set([setup.home]);
    setup.sources = [{ origin: setup.home, weight: 0 }, { origin: setup.foreign, weight: 100 }];
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await renderAt('/hot-gossip');
    expect(await screen.findByTestId('discover-sources-paused')).toBeInTheDocument();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('pauses the board when every fader is at zero — no reads, no silent home fallback', async () => {
    setup.sources = setup.sources.map(source => ({ ...source, weight: 0 }));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await renderAt('/hot-gossip');
    expect(await screen.findByTestId('discover-sources-paused')).toHaveTextContent('All servers are paused');
    expect(readDiscoverFeed).not.toHaveBeenCalled();
    expect(readFeedPage).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('pins the recent cutoff in the URL and restores all-time/recent through history', async () => {
    const now = Date.parse('2026-11-09T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    setup.approved = new Set([setup.home]);
    await renderAt('/hot-gossip');
    await waitFor(() => expect(vi.mocked(readDiscoverFeed).mock.calls.at(-1)?.[5]).toBe(now - 30 * 86400000), { timeout: 2000 });
    expect(screen.getByTestId('location')).toHaveTextContent(`asOf=${now}`);
    const before = vi.mocked(readDiscoverFeed).mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Older / Advanced' }));
    await waitFor(() => {
      expect(vi.mocked(readDiscoverFeed).mock.calls.length).toBeGreaterThan(before);
      expect(vi.mocked(readDiscoverFeed).mock.calls.at(-1)?.[5]).toBeUndefined();
    }, { timeout: 2000 });
    expect(screen.getByTestId('location')).toHaveTextContent('history=all');
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => expect(vi.mocked(readDiscoverFeed).mock.calls.at(-1)?.[5]).toBe(now - 30 * 86400000), { timeout: 2000 });
    expect(screen.getByTestId('discover-date-window')).toHaveTextContent('Last 30 days');
  });

  it('passes the same date eligibility to home and foreign Discover queries', async () => {
    const now = Date.parse('2026-11-09T12:00:00Z');
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ rows: [] })));
    vi.stubGlobal('fetch', fetcher);
    await renderAt(`/hot-gossip?asOf=${now}`);
    await waitFor(() => expect(readFeedPage).toHaveBeenCalled());
    expect(readFeedPage).toHaveBeenCalledWith(expect.objectContaining({ createdAfterMs: now - 30 * 86400000 }));
    const query = fetcher.mock.calls.map(call => JSON.parse(String((call as unknown as [string, RequestInit])[1].body))).find(payload => payload.sql?.includes('FROM posts p'));
    expect(query.sql).toContain(`p.created_at >= fromUnixTimestamp64Milli(${now - 30 * 86400000})`);
  });

  it('does not restrict the Video board', async () => {
    setup.approved = new Set([setup.home]);
    await renderAt('/video');
    await waitFor(() => expect(readDiscoverFeed).toHaveBeenCalled());
    expect(vi.mocked(readDiscoverFeed).mock.calls.at(-1)?.[5]).toBeUndefined();
    expect(screen.queryByTestId('discover-date-window')).not.toBeInTheDocument();
  });
});
