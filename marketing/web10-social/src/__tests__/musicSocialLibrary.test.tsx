import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useSearchParams, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import * as data from '@/data';
import MusicPlaylistBrowser from '@/components/Music/MusicPlaylistBrowser';
import MusicReactions from '@/components/Music/MusicReactions';
import type { MusicTrack, ReactionRecord } from '@/data';
vi.mock('lucide-react', async () => (await import('./helpers/lucideMock')).lucideMock);
const owner = vi.hoisted(() => ({ username: 'listener', actor: undefined as string | undefined }));
vi.mock('@/data/actingIdentity', async original => ({ ...await original<typeof import('@/data/actingIdentity')>(), useActingAuthor: () => owner.actor }));
vi.mock('@/data', async original => ({
  ...await original<typeof import('@/data')>(),
  getWapi: vi.fn(), readReactions: vi.fn(), toggleReactionKind: vi.fn(),
  readPlaylistBookmarks: vi.fn(), readPlaylistBookmarkName: vi.fn(), setPlaylistBookmarked: vi.fn(),
  readUserPublicCollections: vi.fn(), readGroupPublicCollections: vi.fn(),
}));
const target = 'node/groups/users/alice/saved-night';
const song = { post: { _id: 'song', author_username: 'alice', title: 'Night drive', groups: ['music-group'] }, media: {} } as MusicTrack;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Browser({ signedIn = true, session = 'listener' }: { signedIn?: boolean; session?: string }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  return <><MusicPlaylistBrowser tracks={[song]} session={session} signedIn={signedIn} change={values => setParams(previous => {
    const next = new URLSearchParams(previous);
    Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    return next;
  })} /><span data-testid="url">{params.toString()}</span><button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button></>;
}
beforeEach(() => {
  vi.resetAllMocks(); owner.username = 'listener'; owner.actor = undefined;
  vi.mocked(data.getWapi).mockReturnValue({ readToken: () => ({ provider: 'node', username: owner.username }) } as never);
  vi.mocked(data.readReactions).mockResolvedValue([]);
  vi.mocked(data.toggleReactionKind).mockResolvedValue('like');
  vi.mocked(data.readPlaylistBookmarks).mockResolvedValue([]);
  vi.mocked(data.readPlaylistBookmarkName).mockResolvedValue('Night drives');
  vi.mocked(data.setPlaylistBookmarked).mockResolvedValue();
  vi.mocked(data.readUserPublicCollections).mockResolvedValue([]);
  vi.mocked(data.readGroupPublicCollections).mockResolvedValue([]);
});
afterEach(cleanup);
describe('music original-post reactions', () => {
  const reaction = (type: string, author = 'listener') => ({ type, author_key: author, author_username: author }) as ReactionRecord;
  it('hydrates existing personal reactions and counts, swaps to dislike and clears through the original post seam', async () => {
    vi.mocked(data.readReactions).mockResolvedValue([reaction('like'), reaction('like', 'other')]);
    render(<MusicReactions track={song} signedIn />);
    const like = await screen.findByRole('button', { name: /^Like,/ });
    expect(like).toHaveAttribute('aria-pressed', 'true');
    expect(like).toHaveTextContent('2');
    vi.mocked(data.toggleReactionKind).mockResolvedValueOnce('dislike').mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /^Dislike,/ }));
    await waitFor(() => expect(data.toggleReactionKind).toHaveBeenCalledWith('song', 'dislike', ['music-group'], 'posts', expect.any(Function)));
    expect(screen.getByRole('button', { name: /^Dislike,/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Dislike,/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Dislike,/ })).toHaveAttribute('aria-pressed', 'false'));
  });
  it('serializes taps, rolls back a failed write and permits retry', async () => {
    render(<MusicReactions track={song} signedIn />);
    const like = await screen.findByRole('button', { name: /^Like,/ });
    const pending = deferred<'like'>();
    vi.mocked(data.toggleReactionKind).mockReturnValueOnce(pending.promise);
    fireEvent.click(like); fireEvent.click(screen.getByRole('button', { name: /^Dislike,/ }));
    expect(data.toggleReactionKind).toHaveBeenCalledTimes(1);
    await act(async () => { pending.resolve('like'); });
    vi.mocked(data.toggleReactionKind).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(screen.getByRole('button', { name: /^Like,/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(screen.getByRole('button', { name: /^Like,/ })).toHaveAttribute('aria-pressed', 'true');
    vi.mocked(data.toggleReactionKind).mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole('button', { name: /^Like,/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Like,/ })).toHaveAttribute('aria-pressed', 'false'));
  });
  it('retries a read failure and does not offer anonymous writes', async () => {
    vi.mocked(data.readReactions).mockRejectedValueOnce(new Error('offline'));
    render(<MusicReactions track={song} signedIn={false} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry reactions' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /^Like,/ })).not.toBeInTheDocument();
    expect(data.toggleReactionKind).not.toHaveBeenCalled();
  });
  it('ignores old identity reads and invalidates the mutation guard on unmount', async () => {
    const old = deferred<ReactionRecord[]>();
    vi.mocked(data.readReactions).mockReturnValueOnce(old.promise);
    const view = render(<MusicReactions track={song} signedIn />);
    owner.username = 'next';
    view.rerender(<MusicReactions track={song} signedIn />);
    await screen.findByRole('button', { name: /^Like,/ });
    await act(async () => old.resolve([reaction('like', 'next')]));
    expect(screen.getByRole('button', { name: /^Like,/ })).toHaveAttribute('aria-pressed', 'false');
    const pending = deferred<'like'>(); vi.mocked(data.toggleReactionKind).mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole('button', { name: /^Like,/ }));
    const guard = vi.mocked(data.toggleReactionKind).mock.calls[0][4]!;
    view.unmount(); expect(guard).toThrow('scope changed');
    await act(async () => pending.resolve('like'));
  });
});
describe('curator playlists and live bookmarks', () => {
  it('restores curator and open collection through Back/Forward without writes', async () => {
    vi.mocked(data.readUserPublicCollections).mockResolvedValue([{ groupId: target, name: 'Night drives', visibility: 'public', itemCount: 3, slug: 'night' }]);
    render(<MemoryRouter initialEntries={['/?scope=browse&curator=alice']}><Browser /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /Night drives/ }));
    expect(screen.getByTestId('url')).toHaveTextContent(`collection=${encodeURIComponent(target)}`);
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    expect(await screen.findByRole('button', { name: /Night drives/ })).toBeVisible();
    expect(screen.getByTestId('url')).toHaveTextContent('curator=alice');
    expect(screen.getByTestId('url')).not.toHaveTextContent('collection=');
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(screen.getByRole('button', { name: 'Save playlist' })).toBeVisible();
    expect(data.setPlaylistBookmarked).not.toHaveBeenCalled();
  });

  it('drops a late previous-curator list instead of mixing their playlists', async () => {
    const old = deferred<data.CollectionRecord[]>();
    vi.mocked(data.readUserPublicCollections).mockReturnValueOnce(old.promise).mockResolvedValueOnce([{ groupId: 'node/groups/users/bob/saved-bob', name: 'Bob’s mix', visibility: 'public', itemCount: 1, slug: 'bob' }]);
    render(<MemoryRouter initialEntries={['/?scope=browse&curator=alice']}><Browser /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Curator username'), { target: { value: 'bob' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    expect(await screen.findByRole('button', { name: /Bob’s mix/ })).toBeVisible();
    await act(async () => old.resolve([{ groupId: target, name: 'Old mix', visibility: 'public', itemCount: 1, slug: 'old' }]));
    expect(screen.queryByText('Old mix')).not.toBeInTheDocument();
  });

  it('browses exact usernames with URL state and only displays public collections', async () => {
    vi.mocked(data.readUserPublicCollections).mockResolvedValue([
      { groupId: target, name: 'Night drives', visibility: 'public', itemCount: 3, slug: 'night' },
      { groupId: 'private', name: 'Do not show', visibility: 'private', itemCount: 1, slug: 'private' },
    ]);
    render(<MemoryRouter initialEntries={['/?scope=browse']}><Browser signedIn={false} /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Curator username'), { target: { value: '@alice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Browse' }));
    const card = await screen.findByRole('button', { name: /Night drives/ });
    expect(data.readUserPublicCollections).toHaveBeenCalledWith('alice');
    expect(screen.queryByText('Do not show')).not.toBeInTheDocument();
    expect(card).toHaveTextContent('@alice');
    fireEvent.click(card);
    expect(screen.getByTestId('url')).toHaveTextContent(`collection=${encodeURIComponent(target)}`);
    expect(screen.getByText('Sign in to save this playlist.')).toBeInTheDocument();
    expect(data.setPlaylistBookmarked).not.toHaveBeenCalled();
  });
  it('uses the public group collection seam for group curators and supports retry', async () => {
    const group = 'node/groups/users/alice/band';
    vi.mocked(data.readGroupPublicCollections).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
    render(<MemoryRouter initialEntries={[`/?scope=browse&curator=${encodeURIComponent(group)}`]}><Browser /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry public playlists' }));
    expect(await screen.findByText('No public playlists here yet. Try another curator.')).toBeVisible();
    expect(data.readGroupPublicCollections).toHaveBeenCalledTimes(2);
    expect(data.readUserPublicCollections).not.toHaveBeenCalled();
  });
  it('saves a live target, recognizes return visits and keeps failures retryable', async () => {
    render(<MemoryRouter initialEntries={[`/?scope=browse&collection=${encodeURIComponent(target)}`]}><Browser /></MemoryRouter>);
    const save = screen.getByRole('button', { name: 'Save playlist' });
    await waitFor(() => expect(save).toBeEnabled());
    vi.mocked(data.setPlaylistBookmarked).mockRejectedValueOnce(new Error('offline'));
    fireEvent.click(save);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be saved');
    expect(save).toBeEnabled();
    vi.mocked(data.readPlaylistBookmarks).mockResolvedValue([{ collectionId: target }]);
    fireEvent.click(save);
    expect(await screen.findByRole('button', { name: 'Remove saved playlist' })).toBeEnabled();
    expect(data.setPlaylistBookmarked).toHaveBeenLastCalledWith(target, true, expect.any(Function));
  });
  it('keeps unreadable bookmarks removable without caching target names', async () => {
    vi.mocked(data.readPlaylistBookmarks).mockResolvedValue([{ collectionId: target }]);
    vi.mocked(data.readPlaylistBookmarkName).mockRejectedValue(new Error('403'));
    render(<MemoryRouter initialEntries={['/?scope=bookmarks']}><Browser /></MemoryRouter>);
    const row = (await screen.findByText('Unavailable playlist')).closest('li')!;
    fireEvent.click(within(row).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(data.setPlaylistBookmarked).toHaveBeenCalledWith(target, false, expect.any(Function)));
  });
  it('does not start old bookmark target reads after a session change', async () => {
    const old = deferred<data.PlaylistBookmark[]>();
    vi.mocked(data.readPlaylistBookmarks).mockReturnValueOnce(old.promise);
    const view = render(<MemoryRouter initialEntries={['/?scope=bookmarks']}><Browser /></MemoryRouter>);
    view.rerender(<MemoryRouter initialEntries={['/?scope=bookmarks']}><Browser session="next" /></MemoryRouter>);
    await act(async () => old.resolve([{ collectionId: target }]));
    expect(data.readPlaylistBookmarkName).not.toHaveBeenCalled();
  });
});
