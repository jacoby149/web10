import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';
import { MusicProvider } from '@/context/MusicContext';
import type { CollectionRecord } from '@/data/saved';

const mocks = vi.hoisted(() => ({ openSave: vi.fn(), username: 'listener' }));
vi.mock('@/context/SaveContext', () => ({ useSave: () => ({ openSave: mocks.openSave, saveOpen: false }) }));

// Mock lucide-react icons (any icon, no manual list)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the data layer — the Music feed (the render-time gate output) + the
// views read + the profile read the screen runs to populate author faces.
vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readMusicPage: vi.fn().mockResolvedValue({ tracks: [], hasMore: false }),
    readViewCounts: vi.fn().mockResolvedValue({}),
    readUserProfile: vi.fn().mockResolvedValue(null),
    getWapi: vi.fn(() => ({ readToken: () => ({ provider: 'node.test', username: mocks.username }), isSignedIn: () => true })),
    getMyCollections: vi.fn(),
    readSavedPostIds: vi.fn(),
    readMusicCollection: vi.fn(),
    readMusicTrack: vi.fn(),
    toggleSavedMusic: vi.fn(),
    createCollection: vi.fn(),
    setCollectionVisibility: vi.fn(),
    readReactions: vi.fn(),
    toggleReactionKind: vi.fn(),
    readPlaylistBookmarks: vi.fn(),
  };
});

// The shared discover package (formatCount).
vi.mock('@web10/discover', async (importOriginal) => ({
  ...await importOriginal<typeof import('@web10/discover')>(),
  formatCount: (n: number) => n.toLocaleString(),
}));

import MusicScreen from '@/components/Music/MusicScreen';
import type { MusicTrack } from '@/data';

function track(over: { id: string; author: string; title?: string; mime?: string; duration?: number; thumb?: string }) {
  return {
    post: {
      _id: over.id,
      author_username: over.author,
      title: over.title,
      text: '',
      created_at: '2026-07-18T00:00:00Z',
    },
    media: {
      _id: `m-${over.id}`,
      url: `https://cdn/${over.id}.mp3`,
      mime_type: over.mime || 'audio/mpeg',
      duration_seconds: over.duration ?? 180,
      thumbnail_url: over.thumb,
    },
    // The gate computes the shared cover precedence from the post's media.
    artworkUrl: over.thumb,
  } as MusicTrack;
}

function Location() {
  const navigate = useNavigate();
  return <><span data-testid="location">{useLocation().search}</span><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}

function tree(url: string) {
  return <MemoryRouter initialEntries={[url]}><MusicProvider sessionKey={mocks.username}><MusicScreen /><Location /></MusicProvider></MemoryRouter>;
}

function collection(groupId: string, name: string, slug = groupId): CollectionRecord {
  return { groupId, name, slug, visibility: 'private', itemCount: 2 } as CollectionRecord;
}

async function openMenu(title: string) {
  const trigger = await screen.findByRole('button', { name: `More actions: ${title}` });
  trigger.focus();
  fireEvent.click(trigger);
  return within(await screen.findByRole('dialog', { name: title }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function renderScreen(tracks: MusicTrack[] = [], url = '/music') {
  vi.mocked(data.readMusicPage).mockResolvedValue({ tracks, hasMore: false });
  return render(
    tree(url),
  );
}

describe('MusicScreen', () => {
  it.each(['private', 'public'] as const)('keeps %s track comments under the track replay boundary', async (visibility) => {
    const song = track({ id: 'song', author: 'artist', title: 'Replay track' });
    song.post.visibility = visibility;
    song.post.text = 'Replay caption';
    vi.spyOn(data, 'readThreadComments').mockResolvedValue({ comments: [], nextCursor: null, replyCounts: {} });
    vi.mocked(data.readMusicTrack).mockResolvedValue(song);
    renderScreen([song]);
    const menu = await openMenu('Replay track');
    fireEvent.click(menu.getByRole('link', { name: 'Comments' }));
    const comments = await screen.findByTestId('music-comments');
    expect(comments.hasAttribute('data-replay-private')).toBe(visibility !== 'public');
    expect(within(comments).getByText('Replay caption')).toBeVisible();
  });

  it.each(['private', 'public'] as const)('keeps %s playlist list/detail metadata under its replay boundary', async (visibility) => {
    vi.mocked(data.getMyCollections).mockResolvedValue([{ ...collection('replay-list', 'Replay playlist'), visibility }]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [], name: 'Replay playlist', skipped: 0 });
    renderScreen([], '/music?view=playlists');
    const name = await screen.findByRole('heading', { name: 'Replay playlist' });
    expect(!!name.closest('[data-replay-private]')).toBe(visibility !== 'public');
    fireEvent.click(name.closest('button')!);
    const detail = await screen.findByRole('heading', { name: 'Replay playlist' });
    expect(!!detail.closest('[data-replay-private]')).toBe(visibility !== 'public');
  });

  it('opens a track-native URL-backed comment panel from the action sheet and returns with browser history', async () => {
    const song = track({ id: 'song', author: 'artist', title: 'Our song' });
    vi.spyOn(data, 'readThreadComments').mockResolvedValue({ comments: [], nextCursor: null, replyCounts: {} });
    vi.mocked(data.readMusicTrack).mockResolvedValue(song);
    renderScreen([song]);
    const menu = await openMenu('Our song');
    fireEvent.click(menu.getByRole('link', { name: 'Comments' }));
    expect(await screen.findByTestId('music-comments')).toBeVisible();
    expect(screen.getByTestId('location')).toHaveTextContent('track=song&panel=comments');
    expect(await screen.findByTestId('comment-input')).toBeVisible();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(screen.queryByTestId('music-comments')).toBeNull();
  });

  it('shows the group display name in the track row, action sheet and player instead of its slug', async () => {
    const song = track({ id: 'club-track', author: 'new-group-6', title: 'Hello from the club' });
    song.post.author_key = 'node.test/groups/users/listener/new-group-6';
    song.post.group_identity = { name: 'Century Club Music' };
    renderScreen([song]);

    const row = await screen.findByTestId('music-track-card');
    expect(within(row).getByText('Century Club Music')).toBeInTheDocument();
    expect(screen.queryByText('@new-group-6')).not.toBeInTheDocument();
    const menu = await openMenu('Hello from the club');
    expect(menu.getByText('Century Club Music')).toBeInTheDocument();
    expect(menu.getByRole('link', { name: 'Go to artist' })).toHaveAttribute('href', '/groups/node.test%2Fgroups%2Fusers%2Flistener%2Fnew-group-6');
    fireEvent.click(menu.getByRole('button', { name: 'Close track menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(screen.getAllByText('Century Club Music').length).toBeGreaterThan(0);
    expect(screen.queryByText('@new-group-6')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open original post' })).toHaveAttribute('href', '/groups/node.test%2Fgroups%2Fusers%2Flistener%2Fnew-group-6/p/club-track');
  });

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.username = 'listener';
    vi.mocked(data.getWapi).mockImplementation(() => ({ readToken: () => ({ provider: 'node.test', username: mocks.username }), isSignedIn: () => true }) as ReturnType<typeof data.getWapi>);
    vi.mocked(data.getMyCollections).mockResolvedValue([]);
    vi.mocked(data.readSavedPostIds).mockResolvedValue(new Set());
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [], name: '', skipped: 0 });
    vi.mocked(data.readMusicTrack).mockResolvedValue(null);
    vi.mocked(data.toggleSavedMusic).mockResolvedValue({ groupId: 'favorites' });
    vi.mocked(data.createCollection).mockResolvedValue('new-playlist');
    vi.mocked(data.setCollectionVisibility).mockResolvedValue(undefined);
    vi.mocked(data.readReactions).mockResolvedValue([]);
    vi.mocked(data.toggleReactionKind).mockResolvedValue('like');
    vi.mocked(data.readPlaylistBookmarks).mockResolvedValue([]);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders track rows with title, author, and duration alongside the hero', async () => {
    renderScreen([
      track({ id: 't1', author: 'alice', title: 'Midnight Drive', duration: 245 }),
      track({ id: 't2', author: 'bob', title: 'Sunset Loop' }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(2);
    });

    // Titles render.
    expect(within(screen.getByRole('region', { name: 'Music tracks' })).getByText('Midnight Drive')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Music tracks' })).getByText('Sunset Loop')).toBeInTheDocument();

    // Authors render (@handle).
    expect(screen.getByText('@alice')).toBeInTheDocument();
    expect(screen.getByText('@bob')).toBeInTheDocument();

    // Duration renders (4:05 for 245s, 3:00 for 180s default).
    expect(screen.getByText(/4:05/)).toBeInTheDocument();
    expect(screen.getByText(/3:00/)).toBeInTheDocument();
  });

  it('shows the default musical-note fallback when a track has no album art', async () => {
    // No thumbnail_url → the fallback gradient + note icon renders (not an img).
    renderScreen([track({ id: 't1', author: 'alice', title: 'No Art' })]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    // The card should NOT contain an <img> for the cover (no thumbnail_url).
    const card = screen.getByTestId('music-track-card');
    expect(card.querySelector('img')).toBeNull();
  });

  it('shows the uploaded album art when a track has a thumbnail', async () => {
    renderScreen([
      track({ id: 't1', author: 'alice', title: 'With Art', thumb: 'https://cdn/art.jpg' }),
    ]);

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    const card = screen.getByTestId('music-track-card');
    const img = card.querySelector('img[alt="With Art"]');
    expect(img).not.toBeNull();
    expect(img?.getAttribute('src')).toBe('https://cdn/art.jpg');
  });

  it('shows the empty state when there are no tracks', async () => {
    renderScreen([]);

    await waitFor(() => {
      expect(screen.getByText(/No music yet/)).toBeInTheDocument();
    });
  });

  it('filters tracks by ?q= search query', async () => {
    (data.readMusicPage as ReturnType<typeof vi.fn>).mockResolvedValue({
      tracks: [
        track({ id: 't1', author: 'alice', title: 'Midnight Drive' }),
        track({ id: 't2', author: 'bob', title: 'Sunset Loop' }),
      ],
      hasMore: false,
    });

    render(tree('/music?q=midnight'));

    await waitFor(() => {
      expect(screen.getAllByTestId('music-track-card')).toHaveLength(1);
    });

    expect(screen.getByText('Midnight Drive')).toBeInTheDocument();
    expect(screen.queryByText('Sunset Loop')).toBeNull();
    // The query chip shows.
    expect(screen.getByText('midnight')).toBeInTheDocument();
  });

  it('round-trips saved and playlist views and edited search through the URL', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('favorites', 'Saved Music', 'saved-music'), collection('night', 'Night drives')]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [track({ id: 'saved', author: 'alice', title: 'Private favorite' })], name: 'Saved Music', skipped: 0 });
    renderScreen([], '/music?view=saved');
    expect(await screen.findByRole('button', { name: 'Play Private favorite' })).toBeInTheDocument();
    expect(data.readMusicCollection).toHaveBeenCalledWith('favorites');
    expect(screen.getByRole('button', { name: 'Saved Music' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(await screen.findByRole('button', { name: /Night drives/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search music & your playlists'), { target: { value: 'night' } });
    expect(screen.queryByRole('button', { name: /Saved Music.*saved items/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('view=playlists&q=night');
    fireEvent.click(screen.getByRole('button', { name: 'Clear music search' }));
    expect(screen.getByTestId('location')).toHaveTextContent('?view=playlists');
    expect(screen.getByLabelText('Search music & your playlists')).toHaveValue('');
  });

  it('restores a playlist-name search from a deep link', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('night', 'Night drives'), collection('day', 'Daylight')]);
    renderScreen([], '/music?view=playlists&q=night');
    expect(await screen.findByRole('button', { name: /Night drives/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Daylight/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Search music & your playlists')).toHaveValue('night');
  });

  it('creates a playlist through the existing collection API without overriding its private default', async () => {
    renderScreen([], '/music?view=playlists');
    fireEvent.change(screen.getByLabelText('New private playlist'), { target: { value: '  Night drives  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(data.createCollection).toHaveBeenCalledExactlyOnceWith('Night drives', { assertCurrent: expect.any(Function) }));
    expect(vi.mocked(data.createCollection).mock.calls[0][1]).not.toHaveProperty('visibility');
    await waitFor(() => expect(data.readMusicCollection).toHaveBeenCalledWith('new-playlist'));
    expect(screen.getByTestId('location')).toHaveTextContent('view=playlists&collection=new-playlist');
    expect(screen.getByRole('link', { name: 'Manage collection & order' })).toHaveAttribute('href', '/u/listener/saved/new-playlist');
  });

  it('replaces failed playlist art with the music fallback and retries a changed cover URL', async () => {
    const col = { ...collection('night', 'Night drives'), coverUrl: 'https://cdn/broken.webp' };
    vi.mocked(data.getMyCollections).mockResolvedValue([col, collection('empty', 'No cover')]);
    renderScreen([], '/music?view=playlists');
    const card = await screen.findByRole('button', { name: /Night drives/ });
    const image = card.querySelector('img')!;
    fireEvent.error(image);
    expect(card.querySelector('img')).toBeNull();
    expect(within(card).getByTestId('music-artwork-fallback')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: /No cover/ })).getByTestId('music-artwork-fallback')).toBeInTheDocument();
    vi.mocked(data.getMyCollections).mockResolvedValue([{ ...col, coverUrl: 'https://cdn/fresh.webp' }]);
    fireEvent.change(screen.getByLabelText('New private playlist'), { target: { value: 'Trigger library refresh' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(data.getMyCollections).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    const refreshed = await screen.findByRole('button', { name: /Night drives/ });
    expect(refreshed.querySelector('img')).toHaveAttribute('src', 'https://cdn/fresh.webp');
  });

  it('does not create Saved Music on visit and delegates the first save then refreshes saved state', async () => {
    renderScreen([track({ id: 't1', author: 'alice', title: 'First favorite' })]);
    const menu = await openMenu('First favorite');
    const save = menu.getByRole('button', { name: 'Save to Saved Music' });
    await waitFor(() => expect(save).toBeEnabled());
    expect(data.toggleSavedMusic).not.toHaveBeenCalled();
    expect(data.createCollection).not.toHaveBeenCalled();
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('favorites', 'Saved Music', 'saved-music')]);
    vi.mocked(data.readSavedPostIds).mockResolvedValue(new Set(['t1']));
    fireEvent.click(save);
    expect(await menu.findByRole('button', { name: 'Remove from Saved Music' })).toBeEnabled();
    expect(data.toggleSavedMusic).toHaveBeenCalledExactlyOnceWith('t1', false, expect.any(Function));
    expect(screen.getByRole('status')).toHaveTextContent('Added to Saved Music.');
    expect(data.getMyCollections).toHaveBeenCalledTimes(2);
  });

  it('recognizes Saved Music on return by slug and unsaves through the toggle seam', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('decoy', 'Saved Music'), collection('favorites', 'Renamed favorites', 'saved-music')]);
    vi.mocked(data.readSavedPostIds).mockResolvedValue(new Set(['t1']));
    renderScreen([track({ id: 't1', author: 'alice', title: 'Returning favorite' })]);
    const menu = await openMenu('Returning favorite');
    const unsave = await menu.findByRole('button', { name: 'Remove from Saved Music' });
    expect(data.readSavedPostIds).toHaveBeenCalledExactlyOnceWith('favorites');
    expect(data.toggleSavedMusic).not.toHaveBeenCalled();
    vi.mocked(data.readSavedPostIds).mockResolvedValue(new Set());
    fireEvent.click(unsave);
    expect(await menu.findByRole('button', { name: 'Save to Saved Music' })).toBeEnabled();
    expect(data.toggleSavedMusic).toHaveBeenCalledExactlyOnceWith('t1', true, expect.any(Function));
    expect(screen.getByRole('status')).toHaveTextContent('Removed from Saved Music.');
    expect(data.createCollection).not.toHaveBeenCalled();
  });

  it('keeps a failed save retryable without optimistically marking it saved', async () => {
    vi.mocked(data.toggleSavedMusic).mockRejectedValueOnce(new Error('offline'));
    renderScreen([track({ id: 't1', author: 'alice', title: 'Retry favorite' })]);
    const menu = await openMenu('Retry favorite');
    const save = menu.getByRole('button', { name: 'Save to Saved Music' });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    expect(await screen.findByText('Could not update Saved Music. Try again.')).toBeInTheDocument();
    expect(menu.queryByRole('button', { name: 'Remove from Saved Music' })).not.toBeInTheDocument();
    expect(save).toBeEnabled();
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('favorites', 'Saved Music', 'saved-music')]);
    vi.mocked(data.readSavedPostIds).mockResolvedValue(new Set(['t1']));
    fireEvent.click(save);
    expect(await menu.findByRole('button', { name: 'Remove from Saved Music' })).toBeEnabled();
    expect(data.toggleSavedMusic).toHaveBeenNthCalledWith(1, 't1', false, expect.any(Function));
    expect(data.toggleSavedMusic).toHaveBeenNthCalledWith(2, 't1', false, expect.any(Function));
  });

  it('opens the existing Save picker from Add to playlist with the original post', async () => {
    const song = track({ id: 't1', author: 'alice', title: 'Picker song' });
    renderScreen([song]);
    const menu = await openMenu('Picker song');
    fireEvent.click(menu.getByRole('button', { name: 'Save to playlist' }));
    expect(mocks.openSave).toHaveBeenCalledExactlyOnceWith(song.post);
    expect(data.toggleSavedMusic).not.toHaveBeenCalled();
  });

  it('hydrates a playlist in collection order and explains skipped targets without rewriting it', async () => {
    const songs = [track({ id: 'second', author: 'bob', title: 'Second' }), track({ id: 'first', author: 'alice', title: 'First' })];
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: songs, name: 'My order', skipped: 2 });
    renderScreen([], '/music?view=playlists&collection=ordered');
    await waitFor(() => expect(screen.getAllByTestId('music-track-card')).toHaveLength(2));
    expect(screen.getAllByTestId('music-track-card').map(row => row.getAttribute('aria-label'))).toEqual(['Play Second', 'Play First']);
    expect(screen.getByText("2 unavailable or nonmusic items aren't shown. Your collection is unchanged.")).toBeInTheDocument();
    expect(data.readMusicCollection).toHaveBeenCalledWith('ordered');
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map(row => row.textContent)).toEqual([expect.stringContaining('Second'), expect.stringContaining('First')]);
    expect(data.createCollection).not.toHaveBeenCalled();
    expect(data.toggleSavedMusic).not.toHaveBeenCalled();
  });

  it('opens an anonymous public playlist in Music without autoplay, management or library writes', async () => {
    vi.mocked(data.getWapi).mockReturnValue({ readToken: () => null, isSignedIn: () => false } as never);
    const songs = [track({ id: 'last', author: 'alice', title: 'Curator first' }), track({ id: 'first', author: 'bob', title: 'Curator second' })];
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: songs, name: 'A public mix', skipped: 1 });
    renderScreen([], '/music?view=playlists&scope=browse&collection=public');
    expect(await screen.findByRole('button', { name: 'Play Curator first' })).toBeVisible();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(data.getMyCollections).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: 'Manage collection & order' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Play all' }));
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map(row => row.textContent)).toEqual([expect.stringContaining('Curator first'), expect.stringContaining('Curator second')]);
    expect(data.createCollection).not.toHaveBeenCalled(); expect(data.toggleSavedMusic).not.toHaveBeenCalled();
  });

  it('explains an unavailable target deep link and lets the user dismiss it', async () => {
    renderScreen([], '/music?track=missing&panel=player');
    expect(await screen.findByRole('alert')).toHaveTextContent('This track is unavailable or is no longer music.');
    expect(data.readMusicTrack).toHaveBeenCalledWith('missing');
    fireEvent.click(screen.getByRole('button', { name: 'Back to music' }));
    expect(screen.getByTestId('location').textContent).toBe('');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selects a deep-linked track outside Explore without autoplay', async () => {
    vi.mocked(data.readMusicTrack).mockResolvedValue(track({ id: 'linked', author: 'alice', title: 'Outside Explore' }));
    renderScreen([], '/music?track=linked&panel=player');
    expect(await screen.findByRole('heading', { name: 'Outside Explore' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play track' })).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Open original post' })).toHaveAttribute('href', '/u/alice/p/linked');
  });

  it('loads more using nextOffset and appends tracks without duplicate rows', async () => {
    const first = track({ id: 'first', author: 'alice', title: 'First' });
    vi.mocked(data.readMusicPage).mockResolvedValueOnce({ tracks: [first], hasMore: true, nextOffset: 77 }).mockResolvedValueOnce({ tracks: [first, track({ id: 'next', author: 'bob', title: 'Next page' })], hasMore: false, nextOffset: 90 });
    render(tree('/music'));
    fireEvent.click(await screen.findByRole('button', { name: 'Explore more music' }));
    await waitFor(() => expect(screen.getAllByTestId('music-track-card')).toHaveLength(2));
    expect(data.readMusicPage).toHaveBeenNthCalledWith(1, 30, 0);
    expect(data.readMusicPage).toHaveBeenNthCalledWith(2, 30, 77);
    expect(screen.queryByRole('button', { name: 'Explore more music' })).not.toBeInTheDocument();
  });

  it('retries an Explore read failure', async () => {
    vi.mocked(data.readMusicPage).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ tracks: [track({ id: 'retry', author: 'alice', title: 'Recovered' })], hasMore: false });
    render(tree('/music'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Music could not be loaded. Please try again.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Play Recovered' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(data.readMusicPage).toHaveBeenCalledTimes(2);
  });

  it('retries a library read failure', async () => {
    vi.mocked(data.getMyCollections).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([collection('recovered', 'Recovered library')]);
    renderScreen([], '/music?view=playlists');
    expect(await screen.findByRole('alert')).toHaveTextContent('Your music library could not be loaded.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry library' }));
    expect(await screen.findByRole('button', { name: /Recovered library/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores stale Explore and private library promises after a session switch', async () => {
    const oldPage = deferred<Awaited<ReturnType<typeof data.readMusicPage>>>();
    const oldLibrary = deferred<CollectionRecord[]>();
    vi.mocked(data.readMusicPage).mockReturnValueOnce(oldPage.promise).mockResolvedValue({ tracks: [track({ id: 'new', author: 'bob', title: 'New account song' })], hasMore: false });
    vi.mocked(data.getMyCollections).mockReturnValueOnce(oldLibrary.promise).mockResolvedValue([collection('new-library', 'New account library')]);
    const view = render(tree('/music'));
    await waitFor(() => expect(data.getMyCollections).toHaveBeenCalledTimes(1));
    mocks.username = 'next-listener';
    view.rerender(tree('/music'));
    expect(await screen.findByRole('button', { name: 'Play New account song' })).toBeInTheDocument();
    await act(async () => {
      oldPage.resolve({ tracks: [track({ id: 'old', author: 'alice', title: 'Old private song' })], hasMore: false });
      oldLibrary.resolve([collection('old-library', 'Old private library', 'saved-music')]);
    });
    expect(screen.queryByRole('button', { name: 'Play Old private song' })).not.toBeInTheDocument();
    expect(data.readSavedPostIds).not.toHaveBeenCalledWith('old-library');
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(await screen.findByRole('button', { name: /New account library/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Old private library/ })).not.toBeInTheDocument();
  });

  it('retries a failed playlist read without losing its deep link', async () => {
    vi.mocked(data.readMusicCollection).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ tracks: [track({ id: 'retry', author: 'alice', title: 'Recovered playlist song' })], name: 'Recovered playlist', skipped: 0 });
    renderScreen([], '/music?view=playlists&collection=retry-list');
    expect(await screen.findByRole('alert')).toHaveTextContent('This playlist could not be opened. It may be unavailable.');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: 'Play Recovered playlist song' })).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('collection=retry-list');
    expect(data.readMusicCollection).toHaveBeenCalledTimes(2);
  });

  it('ignores a stale deep-link read after switching sessions', async () => {
    const stale = deferred<MusicTrack | null>();
    vi.mocked(data.readMusicTrack).mockReturnValueOnce(stale.promise).mockResolvedValueOnce(null);
    const view = renderScreen([], '/music?track=private&panel=player');
    await waitFor(() => expect(data.readMusicTrack).toHaveBeenCalledTimes(1));
    mocks.username = 'next-listener';
    view.rerender(tree('/music?track=private&panel=player'));
    expect(await screen.findByRole('alert')).toHaveTextContent('This track is unavailable');
    await act(async () => { stale.resolve(track({ id: 'private', author: 'alice', title: 'Previous account track' })); });
    expect(screen.queryByRole('heading', { name: 'Previous account track' })).not.toBeInTheDocument();
    expect(screen.getByText('Choose a track to start listening.')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it.each([
    ['save', false], ['save', true], ['create', false], ['create', true],
  ] as const)('invalidates a pending %s guard after unmount (same-account remount: %s)', async (operation, remount) => {
    const pending = deferred<void>();
    let guard!: () => void;
    const committed = vi.fn();
    if (operation === 'save') {
      vi.mocked(data.toggleSavedMusic).mockImplementationOnce(async (_id, _saved, assertCurrent) => {
        guard = assertCurrent!;
        await pending.promise;
        guard();
        committed();
        return { groupId: 'late-save' };
      });
    } else {
      vi.mocked(data.createCollection).mockImplementationOnce(async (_name, options) => {
        guard = options!.assertCurrent!;
        await pending.promise;
        guard();
        committed();
        return 'late-playlist';
      });
    }
    const songs = [track({ id: 't1', author: 'alice', title: 'Pending favorite' })];
    const view = renderScreen(songs, operation === 'save' ? '/music' : '/music?view=playlists');
    if (operation === 'save') {
      const menu = await openMenu('Pending favorite');
      const save = menu.getByRole('button', { name: 'Save to Saved Music' });
      await waitFor(() => expect(save).toBeEnabled());
      fireEvent.click(save);
    } else {
      fireEvent.change(screen.getByLabelText('New private playlist'), { target: { value: 'Late playlist' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    }
    expect(guard).toEqual(expect.any(Function));
    expect(() => guard()).not.toThrow();
    view.unmount();
    expect(() => guard()).toThrow('Music session changed');
    if (remount) {
      renderScreen(songs);
      const menu = await openMenu('Pending favorite');
      await waitFor(() => expect(menu.getByRole('button', { name: 'Save to Saved Music' })).toBeEnabled());
      expect(() => guard()).toThrow('Music session changed');
    }
    const libraryReads = vi.mocked(data.getMyCollections).mock.calls.length;
    await act(async () => { pending.resolve(); });
    expect(committed).not.toHaveBeenCalled();
    expect(data.getMyCollections).toHaveBeenCalledTimes(libraryReads);
    expect(data.readMusicCollection).not.toHaveBeenCalledWith('late-playlist');
    if (remount) {
      expect(screen.getByTestId('location').textContent).toBe('?menu=t1');
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Save to Saved Music' })).toBeEnabled();
    }
  });

  it('restores views and selected tracks with Back/Forward without autoplay on history restoration', async () => {
    const first = track({ id: 'first', author: 'alice', title: 'First selection' });
    const second = track({ id: 'second', author: 'bob', title: 'Second selection' });
    vi.mocked(data.readMusicTrack).mockImplementation(async id => id === 'first' ? first : second);
    renderScreen([first, second]);
    await screen.findByRole('button', { name: 'Play First selection' });
    fireEvent.click(screen.getByRole('button', { name: 'Saved Music' }));
    expect(screen.getByTestId('location')).toHaveTextContent('view=saved');
    fireEvent.click(screen.getByRole('button', { name: 'Playlists' }));
    expect(screen.getByRole('heading', { name: 'Your playlists' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(screen.getByRole('button', { name: 'Saved Music' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(screen.getByRole('button', { name: 'Explore' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('location').textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(screen.getByRole('button', { name: 'Saved Music' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play First selection' }));
    expect(screen.getByTestId('location')).toHaveTextContent('track=first');
    fireEvent.click(screen.getByRole('button', { name: 'Play Second selection' }));
    expect(screen.getByTestId('location')).toHaveTextContent('track=second');
    vi.mocked(HTMLMediaElement.prototype.play).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => expect(data.readMusicTrack).toHaveBeenCalledWith('first'));
    expect(screen.getByTestId('location')).toHaveTextContent('track=first');
    expect(screen.getByRole('button', { name: 'Play First selection' }).closest('article')).toHaveClass('bg-brand-muted/40');
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    await waitFor(() => expect(data.readMusicTrack).toHaveBeenCalledWith('second'));
    expect(screen.getByTestId('location')).toHaveTextContent('track=second');
    expect(screen.getByRole('button', { name: 'Play Second selection' }).closest('article')).toHaveClass('bg-brand-muted/40');
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('keeps compact rows limited to play and More while preserving long titles and artists', async () => {
    const title = 'A very long track title that should remain available in full to assistive technology';
    const artist = 'An unusually long artist name and the entire supporting orchestra';
    const song = track({ id: 'long', author: 'alice', title });
    song.post.profile = { display_name: artist } as NonNullable<MusicTrack['post']['profile']>;
    renderScreen([song]);
    const row = (await screen.findByRole('button', { name: `Play ${title}` })).closest('article')!;
    expect(within(row).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual([`Play ${title}`, `More actions: ${title}`]);
    expect(within(row).getByText(title)).toBeInTheDocument();
    expect(within(row).getByText(artist)).toBeInTheDocument();
    const menu = await openMenu(title);
    expect(menu.getByRole('heading', { name: title })).toBeInTheDocument();
    expect(menu.getByText(artist)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `More actions: ${title}` })).toHaveAttribute('aria-expanded', 'true');
    expect(menu.getByRole('link', { name: 'Go to artist' })).toHaveAttribute('href', '/u/alice');
  });

  it.each(['Escape', 'outside', 'close button'])('closes the menu with %s and restores focus to its trigger', async method => {
    renderScreen([track({ id: 't1', author: 'alice', title: 'Focus song' })]);
    await openMenu('Focus song');
    expect(screen.getByRole('button', { name: 'Close track menu' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else if (method === 'outside') fireEvent.click(screen.getByTestId('music-track-menu-backdrop'));
    else fireEvent.click(screen.getByRole('button', { name: 'Close track menu' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More actions: Focus song' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'More actions: Focus song' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByTestId('location').textContent).toBe('');
    expect(document.body.style.overflow).not.toBe('hidden');
  });

  it('wraps keyboard focus inside the portal menu', async () => {
    renderScreen([track({ id: 't1', author: 'alice', title: 'Keyboard song' })]);
    const menu = await openMenu('Keyboard song');
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(menu.getByRole('link', { name: 'Go to artist' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(menu.getByRole('button', { name: 'Close track menu' })).toHaveFocus();
  });

  it('allows anonymous queue and share actions but hides saving actions', async () => {
    vi.mocked(data.getWapi).mockReturnValue({ readToken: () => null, isSignedIn: () => false } as unknown as ReturnType<typeof data.getWapi>);
    renderScreen([track({ id: 't1', author: 'alice', title: 'Public song' })]);
    const menu = await openMenu('Public song');
    expect(menu.getByRole('button', { name: 'Play next' })).toBeEnabled();
    expect(menu.getByRole('button', { name: 'Add to queue' })).toBeEnabled();
    expect(menu.getByRole('button', { name: 'Share track' })).toBeEnabled();
    expect(menu.queryByRole('button', { name: /Saved Music|Save to playlist/ })).not.toBeInTheDocument();
    expect(data.getMyCollections).not.toHaveBeenCalled();
  });

  it('copies a player deep link from the Share track action', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    try {
      renderScreen([track({ id: 't1', author: 'alice', title: 'Shared song' })]);
      const menu = await openMenu('Shared song');
      fireEvent.click(menu.getByRole('button', { name: 'Share track' }));
      await waitFor(() => expect(writeText).toHaveBeenCalledExactlyOnceWith(`${window.location.origin}/music?track=t1&panel=player`));
      expect(await screen.findByRole('status')).toHaveTextContent('Track link copied.');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Reflect.deleteProperty(navigator, 'clipboard');
    }
  });

  it('resolves a menu deep link outside Explore without selecting or playing the track', async () => {
    vi.mocked(data.readMusicTrack).mockResolvedValue(track({ id: 'remote', author: 'alice', title: 'Remote menu' }));
    renderScreen([], '/music?menu=remote&panel=player');
    expect(await screen.findByRole('dialog', { name: 'Remote menu' })).toBeInTheDocument();
    expect(data.readMusicTrack).toHaveBeenCalledWith('remote');
    expect(screen.getByText('Choose a track to start listening.')).toBeInTheDocument();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('explains an unavailable menu deep link without offering actions for a missing track', async () => {
    renderScreen([], '/music?menu=missing');
    expect(await screen.findByRole('status')).toHaveTextContent('This track is unavailable.');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(data.toggleSavedMusic).not.toHaveBeenCalled();
  });

  it('ignores a pending menu resolution from the previous account', async () => {
    const stale = deferred<MusicTrack | null>();
    vi.mocked(data.readMusicTrack).mockReturnValueOnce(stale.promise).mockResolvedValueOnce(null);
    const view = renderScreen([], '/music?menu=private');
    await waitFor(() => expect(data.readMusicTrack).toHaveBeenCalledWith('private'));
    mocks.username = 'next-listener';
    view.rerender(tree('/music?menu=private'));
    expect(await screen.findByRole('status')).toHaveTextContent('This track is unavailable.');
    await act(async () => { stale.resolve(track({ id: 'private', author: 'alice', title: 'Previous account menu' })); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Previous account menu')).not.toBeInTheDocument();
  });

  it.each([['Add to queue', 'Added to queue.'], ['Play next', 'Added to play next.']])('queues through %s without autoplay', async (action, notice) => {
    const song = track({ id: 'remote', author: 'alice', title: 'Queued song' });
    vi.mocked(data.readMusicTrack).mockResolvedValue(song);
    renderScreen([], '/music?menu=remote&panel=queue');
    const menu = within(await screen.findByRole('dialog', { name: 'Queued song' }));
    fireEvent.click(menu.getByRole('button', { name: action }));
    expect(screen.getByRole('status')).toHaveTextContent(notice);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(1);
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  // ── Playlist sharing ───────────────────────────────────────────────────────

  function stubClipboard() {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    return writeText;
  }

  it('Explore has no playlist share (a playlist is open, not the feed)', async () => {
    renderScreen([track({ id: 't1', author: 'alice', title: 'Any tune' })]);
    await screen.findByTestId('music-track-card');
    expect(screen.queryByTestId('music-share-playlist')).not.toBeInTheDocument();
  });

  it('an open playlist offers Share with its canonical /u/…/saved/… link', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('night', 'Night drives')]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [track({ id: 'n1', author: 'alice', title: 'Night one' })], name: 'Night drives', skipped: 0 });
    renderScreen([], '/music?view=playlists&collection=night');
    await screen.findByRole('button', { name: 'Share playlist' });
    expect(screen.getByRole('button', { name: 'Share playlist' })).toBeVisible();
  });

  it('the playlist share sheet copies the link (public collections share straight away)', async () => {
    const writeText = stubClipboard();
    vi.mocked(data.getMyCollections).mockResolvedValue([{ ...collection('night', 'Night drives'), visibility: 'public' }]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [], name: 'Night drives', skipped: 0 });
    renderScreen([], '/music?view=playlists&collection=night');
    fireEvent.click(await screen.findByRole('button', { name: 'Share playlist' }));
    const sheet = await screen.findByTestId('music-share-playlist-sheet');
    expect(sheet).toHaveAccessibleName('Share “Night drives”');
    expect(screen.getByTestId('music-share-playlist-url')).toHaveTextContent(`/u/listener/saved/night`);
    fireEvent.click(screen.getByTestId('music-share-playlist-share'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      new URL('/u/listener/saved/night', window.location.origin).href,
    ));
    expect(screen.getByTestId('music-share-playlist-status')).toHaveTextContent('Link copied.');
    expect(screen.getByText('Playlist link copied.')).toBeInTheDocument();
  });

  it('the playlist share sheet makes a private playlist public before the link goes out', async () => {
    const writeText = stubClipboard();
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('night', 'Night drives')]); // private by default
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [], name: 'Night drives', skipped: 0 });
    renderScreen([], '/music?view=playlists&collection=night');
    fireEvent.click(await screen.findByRole('button', { name: 'Share playlist' }));
    await screen.findByTestId('music-share-playlist-sheet');
    expect(screen.getByText(/This playlist is private/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('music-share-playlist-make-public-share'));
    await waitFor(() => expect(data.setCollectionVisibility).toHaveBeenCalledWith('night', 'public'));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(
      new URL('/u/listener/saved/night', window.location.origin).href,
    ));
    expect(screen.getByTestId('music-share-playlist-status')).toHaveTextContent('Playlist is public');
  });

  it('the Saved Music view shares its reserved collection too', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([collection('favorites', 'Saved Music', 'saved-music')]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [track({ id: 'f1', author: 'alice', title: 'Favorite' })], name: 'Saved Music', skipped: 0 });
    renderScreen([], '/music?view=saved');
    fireEvent.click(await screen.findByRole('button', { name: 'Share playlist' }));
    await screen.findByTestId('music-share-playlist-sheet');
    expect(screen.getByTestId('music-share-playlist-url')).toHaveTextContent(`/u/listener/saved/favorites`);
  });

  it('an open collection that is not in the library offers no share (stale url)', async () => {
    vi.mocked(data.getMyCollections).mockResolvedValue([]);
    vi.mocked(data.readMusicCollection).mockResolvedValue({ tracks: [], name: 'Ghost', skipped: 0 });
    renderScreen([], '/music?view=playlists&collection=ghost');
    await screen.findByRole('heading', { name: 'Ghost' });
    expect(screen.queryByTestId('music-share-playlist')).not.toBeInTheDocument();
  });
});
