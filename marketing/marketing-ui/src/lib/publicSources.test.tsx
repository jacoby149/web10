import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { parsePublicSources, publicHomeRead, PUBLIC_HOME, PUBLIC_SOURCES_KEY, usePublicSources, usePublicBoard } from './publicSources';
import { defaultKnobState, getPreset } from './powerMean';
import { SourcePostCard } from '../../../shared/discover/src/SourcePostCard';
import { FeedSourcesEditor } from '@web10/discover/source-controls';

const remote = 'https://api.creator.example';
const rows = (count: number, label = 'post') => Array.from({ length: count }, (_, index) => ({
  doc_id: `${label}-${index}`, author_key: 'writer', created_at: '2026-11-08T00:00:00Z',
  body: { text: label }, tags: ['art'], score: 1, likes: 2, comments: 3, reposts: 0,
}));
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function PreferenceHarness() {
  const control = usePublicSources();
  const location = useLocation();
  const navigate = useNavigate();
  return <>
    <output data-testid="prefs">{JSON.stringify(control.sources)}</output>
    <output data-testid="location">{location.search}</output>
    <p>{control.error}</p>
    <button onClick={() => control.save([{ origin: remote, weight: 17 }])}>Save</button>
    <button onClick={() => navigate(-1)}>Back</button>
    <button onClick={() => navigate(1)}>Forward</button>
  </>;
}
function EditorHarness() {
  const control = usePublicSources();
  return <FeedSourcesEditor control={control} onRetry={() => undefined} />;
}

beforeEach(() => { localStorage.clear(); vi.stubGlobal('fetch', vi.fn(async () => json({ rows: [] }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('public destination preferences', () => {
  it('copies only validated destinations and integer weights, never identity metadata', () => {
    expect(parsePublicSources(JSON.stringify([{ origin: remote, weight: 1, token: 'not-an-authority', owner: 'someone' }]))).toEqual([{ origin: remote, weight: 1 }]);
    expect(() => parsePublicSources(JSON.stringify([{ origin: 'https://user:secret@api.creator.example', weight: 1 }]))).toThrow();
    expect(() => parsePublicSources(JSON.stringify([{ origin: 'http://api.other.example', weight: 1 }]))).toThrow();
    expect(() => parsePublicSources(JSON.stringify([{ origin: remote, weight: 1.5 }]))).toThrow();
    expect(() => parsePublicSources(JSON.stringify([{ origin: remote, weight: 1 }, { origin: remote, weight: 2 }]))).toThrow();
    expect(() => parsePublicSources(JSON.stringify(Array.from({ length: 33 }, (_, i) => ({ origin: `https://api${i}.example`, weight: 1 }))))).toThrow();
    expect(parsePublicSources('[]')).toEqual([]);
  });

  it('uses URL > saved browser preference > configured home, with back/forward restoration', async () => {
    localStorage.setItem(PUBLIC_SOURCES_KEY, JSON.stringify([{ origin: PUBLIC_HOME, weight: 50 }]));
    const first = JSON.stringify([{ origin: remote, weight: 1 }]);
    render(<MemoryRouter initialEntries={[`/trending?servers=${encodeURIComponent(first)}`]}><PreferenceHarness /></MemoryRouter>);
    expect(screen.getByTestId('prefs').textContent).toBe(first);
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => expect(screen.getByTestId('prefs').textContent).toContain('17'));
    expect(JSON.parse(localStorage.getItem(PUBLIC_SOURCES_KEY)!)).toEqual([{ origin: remote, weight: 17 }]);
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => expect(screen.getByTestId('prefs').textContent).toBe(first));
    fireEvent.click(screen.getByText('Forward'));
    await waitFor(() => expect(screen.getByTestId('prefs').textContent).toContain('17'));
  });

  it('surfaces malformed browser preferences and fails closed with no destinations', () => {
    localStorage.setItem(PUBLIC_SOURCES_KEY, 'not-json');
    render(<MemoryRouter><PreferenceHarness /></MemoryRouter>);
    expect(screen.getByTestId('prefs').textContent).toBe('[]');
    expect(screen.getByText(/preferences are invalid/)).toBeTruthy();
  });
  it('removes a real URL-owned public server without confirmation navigation restoring the old list', async () => {
    const sources = JSON.stringify([{ origin: remote, weight: 100 }]);
    render(<MemoryRouter initialEntries={[`/trending?editServers=1&servers=${encodeURIComponent(sources)}`]}><EditorHarness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Remove api.creator.example' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm remove' }));
    await waitFor(() => expect(screen.queryByRole('slider', { name: 'Fetch weight for api.creator.example' })).toBeNull());
    expect(localStorage.getItem(PUBLIC_SOURCES_KEY)).toBe('[]');
  });
});

function BoardContent({ sources = [{ origin: PUBLIC_HOME, weight: 100 }], knobs = defaultKnobState(), enabled = true, view = 'posts' }: {
  sources?: { origin: string; weight: number }[]; knobs?: ReturnType<typeof defaultKnobState>; enabled?: boolean; view?: string;
}) {
  const board = usePublicBoard(sources, knobs, enabled, undefined, view);
  const navigate = useNavigate();
  return <><output data-testid="posts">{JSON.stringify(board.posts)}</output><output data-testid="errors">{JSON.stringify(board.errors)}</output>
    <output data-testid="done">{String(!board.loading)}</output><button onClick={board.loadMore}>More</button><button onClick={board.retry}>Retry</button>
    <button onClick={() => navigate(-1)}>Back page</button><button onClick={() => navigate(1)}>Forward page</button></>;
}
function BoardHarness(props: Parameters<typeof BoardContent>[0]) {
  return <MemoryRouter><BoardContent {...props} /></MemoryRouter>;
}

describe('public mixed reads (actual shared reader + explicit SDK transport)', () => {
  it('sends no token or ambient cookies and applies real 3:1 quotas to two nodes', async () => {
    vi.mocked(fetch).mockImplementation(async (url, init) => {
      expect(String(url)).toMatch(/\/v3\/query$/);
      expect(init?.credentials).toBe('omit'); expect(init?.redirect).toBe('error'); expect(init?.referrerPolicy).toBe('no-referrer');
      const body = JSON.parse(String(init?.body));
      expect(body.token).toBeUndefined(); expect(body.access_token).toBeUndefined();
      expect(body.groups).toEqual([`${new URL(String(url)).host}/groups/web10/discover`]);
      const limit = Number(body.sql.match(/LIMIT (\d+)$/)[1]);
      return json({ rows: rows(limit, 'same') });
    });
    render(<BoardHarness sources={[{ origin: PUBLIC_HOME, weight: 75 }, { origin: remote, weight: 25 }]} />);
    await waitFor(() => expect(screen.getByTestId('done').textContent).toBe('true'));
    const calls = vi.mocked(fetch).mock.calls;
    expect(calls).toHaveLength(2);
    expect(JSON.parse(String(calls.find(call => String(call[0]).startsWith(PUBLIC_HOME))![1]?.body)).sql).toMatch(/LIMIT 16$/);
    expect(JSON.parse(String(calls.find(call => String(call[0]).startsWith(remote))![1]?.body)).sql).toMatch(/LIMIT 6$/);
    const posts = JSON.parse(screen.getByTestId('posts').textContent!);
    expect(posts).toHaveLength(20);
    expect(new Set(posts.map((post: { source_key: string }) => post.source_key)).size).toBe(20);
    expect(posts.filter((post: { source_origin: string }) => post.source_origin === remote)).toHaveLength(5);
  });

  it('never dispatches muted, empty or People-only sources', async () => {
    const { rerender } = render(<BoardHarness sources={[{ origin: remote, weight: 0 }]} />);
    await waitFor(() => expect(screen.getByTestId('done').textContent).toBe('true'));
    expect(fetch).not.toHaveBeenCalled();
    rerender(<BoardHarness sources={[]} />);
    rerender(<BoardHarness sources={[{ origin: remote, weight: 100 }]} enabled={false} />);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rebuilds real SQL when presets change rather than merely resorting a capped pool', async () => {
    const { rerender } = render(<BoardHarness />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const initial = JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).sql;
    rerender(<BoardHarness knobs={getPreset('most-recent')!.state} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const next = JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body)).sql;
    expect(next).not.toBe(initial);
    expect(next).toContain('ORDER BY toUnixTimestamp64Milli(p.created_at) DESC');
  });

  it('aborts old destinations and denies late rows after removal/view transitions', async () => {
    let resolve!: (response: Response) => void;
    let oldSignal: AbortSignal | undefined;
    vi.mocked(fetch).mockImplementationOnce(async (_url, init) => { oldSignal = init?.signal as AbortSignal; return new Promise<Response>(done => { resolve = done; }); });
    const { rerender } = render(<BoardHarness sources={[{ origin: remote, weight: 100 }]} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    rerender(<BoardHarness sources={[]} view="shorts" />);
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { resolve(json({ rows: rows(1, 'obsolete') })); });
    expect(screen.getByTestId('posts').textContent).toBe('[]');
  });

  it('isolates source errors, strips remote error bodies and retries with public authority only', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(json({ detail: 'private-remote-body' }, 403)).mockResolvedValue(json({ rows: [] }));
    render(<BoardHarness sources={[{ origin: remote, weight: 100 }]} />);
    await waitFor(() => expect(screen.getByTestId('errors').textContent).toContain('403'));
    expect(screen.getByTestId('errors').textContent).not.toContain('private-remote-body');
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId('errors').textContent).toBe('{}'));
  });
  it('restores the displayed page on history navigation rather than skipping to the next page', async () => {
    vi.mocked(fetch).mockImplementation(async (_url, init) => {
      const sql = JSON.parse(String(init?.body)).sql as string;
      const before = Number(sql.match(/tuple\(\d+, 'writer', '(\d+)'\)/)?.[1] || 100);
      const count = Number(sql.match(/LIMIT (\d+)$/)![1]);
      return json({ rows: rows(Math.min(before, count)).map((post, i) => ({ ...post, doc_id: String(before - i - 1).padStart(3, '0') })) });
    });
    render(<BoardHarness sources={[{ origin: remote, weight: 100 }]} knobs={getPreset('most-recent')!.state} />);
    const posts = () => JSON.parse(screen.getByTestId('posts').textContent!);
    await waitFor(() => expect(posts()).toHaveLength(20));
    expect(posts()[0]._id).toBe('099');
    fireEvent.click(screen.getByText('More'));
    await waitFor(() => expect(posts()).toHaveLength(40));
    fireEvent.click(screen.getByText('Back page'));
    await waitFor(() => expect(posts()).toHaveLength(20));
    expect(posts()[0]._id).toBe('099');
    fireEvent.click(screen.getByText('Forward page'));
    await waitFor(() => expect(posts()[0]?._id).toBe('079'));
    expect(posts()).toHaveLength(20);
  });
});

describe('configured HTTP development-home adapter', () => {
  it('uses the same public query and prepared rows without a cookie or groups/list fallback', async () => {
    const fetcher = vi.fn(async () => json({ rows: rows(3) }));
    const read = publicHomeRead('http://api.localhost', new AbortController().signal, fetcher);
    const result = await read({ limit: 2, knobState: defaultKnobState(), isCurrent: () => true });
    expect(result.posts).toHaveLength(2); expect(result.has_more).toBe(true);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.localhost/v3/query'); expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body)).token).toBeUndefined();
  });
});

describe('foreign public card boundary', () => {
  it('renders source-labelled prepared media without home profile/comment links or enabled no-op controls', () => {
    render(<SourcePostCard origin={remote} author="foreign writer" title="Foreign post"
      text="@home-lookalike is just text here" media={[{ url: 'https://cdn.creator.example/real.jpg', mime_type: 'image/jpeg' }]} />);
    expect(screen.getByText(/api.creator.example · public read-only/)).toBeTruthy();
    expect(screen.getByText('Foreign post')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('https://cdn.creator.example/real.jpg');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(fetch).not.toHaveBeenCalled();
  });
});
