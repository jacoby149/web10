import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation, useSearchParams } from 'react-router-dom';
import MusicScreen from '@/components/Music/MusicScreen';
import ShortsScreen from '@/components/Shorts/ShortsScreen';
import { MusicProvider, useMusic } from '@/context/MusicContext';
import * as musicData from '@/data/music';
import { useTunedSurface, tunedShort, preparedSurfaceMedia } from '@/components/Feed/useTunedSurface';
import { musicTrackFromPost, musicTrackKey } from '@/data/musicTrack';
import { readFeedPage } from '@/data/feed';
import type { PostRecord } from '@/data/types';

const setup = vi.hoisted(() => ({ home: 'https://home.example', foreign: 'https://foreign.example',
  sources: [] as { origin: string; weight: number }[], approved: new Set<string>(), credential: 'synthetic-session' }));
vi.mock('@/components/Feed/useFeedSources', () => ({ useFeedSources: () => ({ ...setup, scope: setup.credential, ready: true,
  busy: false, error: '', live: () => true, save: vi.fn(), approve: vi.fn(), reload: vi.fn() }) }));
vi.mock('@/data/actingIdentity', () => ({ useActingAuthor: () => null, getActingAuthor: () => null }));
vi.mock('@/data/feed', async original => ({ ...await original<typeof import('@/data/feed')>(), readFeedPage: vi.fn() }));
vi.mock('@/data/groups', async original => ({ ...await original<typeof import('@/data/groups')>(), getDiscoverGroupId: () => 'home.example/groups/web10/discover' }));

function Probe({ tag = 'short' }: { tag?: 'short' | 'music' }) {
  const tuned = useTunedSurface(tag);
  return <>{tuned.panel}<output data-testid="posts">{tuned.posts.map(post => post.source_key).join(';')}</output><output data-testid="url">{useLocation().search}</output><button onClick={tuned.next}>Next page</button></>;
}
const row = { doc_id: 'same', author_key: 'alice', score: 0, created_at: '2026-11-01T00:00:00.000Z', body: { text: 'remote' }, tags: ['short'] };
beforeEach(() => {
  HTMLElement.prototype.scrollIntoView = vi.fn();
  setup.credential = 'synthetic-session';
  setup.sources = [{ origin: setup.home, weight: 100 }, { origin: setup.foreign, weight: 100 }, { origin: 'https://unapproved.example', weight: 100 }];
  setup.approved = new Set([setup.home, setup.foreign]);
  vi.mocked(readFeedPage).mockResolvedValue({ posts: [{ _id: 'same', author_key: 'alice', score: 0, created_at: row.created_at }], has_more: false, next_cursor: null });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('real media-surface mixed reads', () => {
  it.each(['short', 'music'] as const)('sends %s Discover/tag reads with actual quotas and only approved destinations', async tag => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ rows: [row] })));
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter><Probe tag={tag} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByTestId('posts').textContent).toContain(setup.foreign));
    expect(screen.getByTestId('posts').textContent).toContain(setup.home);
    expect(readFeedPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, tags: [tag], groups: ['home.example/groups/web10/discover'], stable: true }));
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${setup.foreign}/v3/query`);
    const payload = JSON.parse(String(options.body));
    expect(payload.groups).toEqual(['foreign.example/groups/web10/discover']);
    expect(payload.sql).toContain(`'${tag}'`);
    expect(payload.token).toBe(setup.credential);
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error' });
    fireEvent.click(screen.getByTestId('preset-most-liked'));
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('knobs='));
    await waitFor(() => expect(readFeedPage).toHaveBeenCalledTimes(2));
  });

  it('mutes actual source dispatch, not just the displayed count', async () => {
    setup.sources = setup.sources.map(source => ({ ...source, weight: source.origin === setup.home ? 100 : 0 }));
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter><Probe /></MemoryRouter>);
    await waitFor(() => expect(readFeedPage).toHaveBeenCalled());
    expect(readFeedPage).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('retains available rows after denial and retries the failed source explicitly with the same credential', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('private denial body', { status: 403 }))
      .mockImplementation(async () => new Response(JSON.stringify({ rows: [row] })));
    vi.stubGlobal('fetch', fetcher);
    render(<MemoryRouter><Probe /></MemoryRouter>);
    await screen.findByText(/Some servers could not be read/);
    expect(screen.getByTestId('posts').textContent).toContain(setup.home);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('knobs-advanced-toggle'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit servers' }));
    fireEvent.click(screen.getByRole('button', { name: 'Retry source reads' }));
    await waitFor(() => expect(screen.getByTestId('posts').textContent).toContain(setup.foreign));
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, options] of fetcher.mock.calls) expect(JSON.parse(String(options.body)).token).toBe(setup.credential);
  });

  it('drops an old credential completion', async () => {
    let release!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(resolve => { release = resolve; })));
    const view = render(<MemoryRouter><Probe /></MemoryRouter>);
    await waitFor(() => expect(release).toBeTypeOf('function'));
    setup.credential = 'replacement-session'; setup.sources = [{ origin: setup.home, weight: 0 }];
    view.rerender(<MemoryRouter><Probe /></MemoryRouter>);
    await act(async () => { release(new Response(JSON.stringify({ rows: [row] }))); });
    expect(screen.getByTestId('posts').textContent).not.toContain(setup.foreign);
  });

  it('renders source-bound native music with source-qualified links and no home write controls', async () => {
    setup.sources = [{ origin: setup.foreign, weight: 100 }];
    const remote = { ...row, tags: ['music'], body: { title: 'Foreign song', media_refs: [{ doc_id: 'audio', read_url: '/song.mp3', mime_type: 'audio/mpeg' }] } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [remote] }))));
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    const source = vi.spyOn(HTMLMediaElement.prototype, 'src', 'set');
    const homeRecovery = vi.spyOn(musicData, 'readMusicTrack');
    render(<MemoryRouter initialEntries={['/music']}><MusicProvider><MusicScreen /><PlaybackProbe /><output data-testid="url"><LocationValue /></output></MusicProvider></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Play Foreign song' }));
    await waitFor(() => expect(screen.getByTestId('url').textContent).toContain('source=https%3A%2F%2Fforeign.example'));
    expect(source).toHaveBeenCalledWith('https://foreign.example/song.mp3');
    expect(screen.queryByRole('button', { name: 'More actions: Foreign song' })).toBeNull();
    expect(screen.getByText('Read-only source')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open expanded player' }));
    expect(await screen.findByRole('button', { name: 'Comments' })).toBeDisabled();
    expect(screen.queryByTestId('music-reactions')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open original post' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry playback' }));
    await screen.findByText(/This source cannot refresh playback yet/);
    expect(homeRecovery).not.toHaveBeenCalled();
  });

  it('renders a foreign Short from prepared media while blocking home comments and reactions', async () => {
    setup.sources = [{ origin: setup.foreign, weight: 100 }];
    const remote = { ...row, body: { title: 'Foreign short', media_refs: [{ doc_id: 'video', read_url: '/short.mp4', mime_type: 'video/mp4', width: 720, height: 1280 }] } };
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ rows: [remote] }))));
    render(<MemoryRouter initialEntries={['/shorts/same?source=https%3A%2F%2Fforeign.example']}><Routes><Route path="/shorts/:postId" element={<ShortsScreen />} /></Routes></MemoryRouter>);
    await screen.findByText('Foreign short');
    expect(screen.getByTestId('short-like-0').hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('short-comment-0').hasAttribute('disabled')).toBe(true);
    expect(screen.queryByTestId('short-comments-0')).toBeNull();
  });
});

function LocationValue() { return useLocation().search; }
function PlaybackProbe() {
  const music = useMusic();
  const [, setParams] = useSearchParams();
  return <><button onClick={music.retry}>Retry playback</button><output>{music.error}</output>
    <button onClick={() => setParams(previous => { const next = new URLSearchParams(previous); next.set('panel', 'player'); return next; })}>Open expanded player</button></>;
}

describe('prepared source media gates', () => {
  const post = (mime: string, width = 720, height = 1280): PostRecord => ({ _id: 'same', source_key: 'foreign/same', tags: ['short', 'music'], created_at: '', media_refs: [{ doc_id: 'm', read_url: 'https://foreign.example/movie', mime_type: mime, width, height }] });
  it('retains the real vertical-video gate without resolving raw foreign IDs', () => {
    expect(tunedShort(post('video/mp4'))?.media.url).toBe('https://foreign.example/movie');
    expect(tunedShort(post('image/jpeg'))).toBeNull();
    expect(tunedShort(post('video/mp4', 1280, 720))).toBeNull();
    expect(tunedShort({ ...post('video/mp4'), media_refs: ['raw-foreign-id'] })).toBeNull();
  });
  it('retains the existing native music attachment gate and composite identity', () => {
    const source = post('audio/mpeg');
    const track = musicTrackFromPost(source, preparedSurfaceMedia(source))!;
    expect(track.media.url).toBe('https://foreign.example/movie');
    expect(musicTrackKey(track)).toBe('foreign/same');
    expect(musicTrackFromPost({ ...source, media_refs: ['missing'] }, preparedSurfaceMedia(source))).toBeNull();
  });
});
