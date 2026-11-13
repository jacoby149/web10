import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import HashtagScreen from '@/components/Discover/HashtagScreen';
import { ComposerProvider, useComposer } from '@/context/ComposerContext';
import { readHashtagBoard } from '@/data/hashtags';
import { readFeedReactions } from '@/data/feed';
import { toggleReactionKind } from '@/data';
import type { PostRecord } from '@/data/types';

const state = vi.hoisted(() => ({ token: { username: 'alice', provider: 'web10.app' } as object | null }));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => state.token }) }));
vi.mock('@/data/actingIdentity', () => ({ useActingAuthor: () => null, getActingAuthor: () => null, matchesActingAuthor: () => false }));
vi.mock('@/data/hashtags', () => ({ readHashtagBoard: vi.fn() }));
vi.mock('@/data/feed', () => ({ readFeedReactions: vi.fn() }));
vi.mock('@/data', () => ({ toggleReactionKind: vi.fn() }));
// The screen's card wiring; PostBody integration is driven separately through
// the actual renderer in hashtags.test.tsx and the real-browser harness.
vi.mock('@/components/Feed/FeedScreen', () => ({ PostCard: (props: any) => <article data-testid="wired-card"><span>{props.post.text}</span><span>{props.reactionCount} likes</span><span>{props.liked ? 'liked' : 'not-liked'}</span><span>{props.mediaItems.length} media</span><button onClick={() => props.onToggleReaction('like')}>Like</button></article> }));

const post = (id: string): PostRecord => ({ _id: id, author_key: 'bob', author_username: 'bob', text: id, created_at: '2026-11-12', likes: 2 });
const page = (posts: PostRecord[], has_more = false) => ({ posts, has_more, next_cursor: has_more ? { created_at: '2026-11-12', author_key: 'bob', doc_id: 'p' } : null });
function ComposerState() { const value = useComposer(); return <output>{value.composerOpen ? value.draftText : 'closed'}</output>; }
function setup(path = '/tag/walking', onLogin = vi.fn()) {
  return render(<MemoryRouter initialEntries={[path]}><ComposerProvider><Link to="/tag/night">Next topic</Link><Routes><Route path="/tag/:hashtag" element={<HashtagScreen onLogin={onLogin} />} /></Routes><ComposerState /></ComposerProvider></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks(); state.token = { username: 'alice', provider: 'web10.app' };
  vi.mocked(readHashtagBoard).mockResolvedValue(page([]));
  vi.mocked(readFeedReactions).mockResolvedValue({ liked: {}, disliked: {}, reposted: {} });
  vi.mocked(toggleReactionKind).mockResolvedValue(null);
});

describe('hashtag route and board lifecycle', () => {
  it('restores/canonicalizes a mixed-case direct link and seeds the empty CTA', async () => {
    setup('/tag/Walking');
    fireEvent.click(await screen.findByRole('button', { name: 'Post with #walking' }));
    expect(screen.getByRole('status')).toHaveTextContent('#walking');
    expect(readHashtagBoard).toHaveBeenCalledWith('walking', expect.objectContaining({ cursor: null }));
  });
  it('rejects an invalid route with no read', () => {
    setup('/tag/not-a-tag');
    expect(screen.getByTestId('hashtag-invalid')).toBeInTheDocument();
    expect(readHashtagBoard).not.toHaveBeenCalled();
  });
  it('shows loading, then a retryable failure, then recovers', async () => {
    let reject!: (reason: unknown) => void;
    vi.mocked(readHashtagBoard).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    setup(); expect(screen.getByTestId('hashtag-loading')).toBeInTheDocument();
    await act(async () => reject(new Error('offline')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t load');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTestId('hashtag-empty')).toBeInTheDocument();
  });
  it('pages using the returned cursor, deduplicates rows and seeds own reaction fills', async () => {
    vi.mocked(readHashtagBoard).mockResolvedValueOnce(page([post('p')], true)).mockResolvedValueOnce(page([post('p'), post('q')]));
    vi.mocked(readFeedReactions).mockResolvedValue({ liked: { p: true }, disliked: {}, reposted: {} });
    setup(); await waitFor(() => expect(screen.getByTestId('wired-card')).toHaveTextContent('liked'));
    fireEvent.click(screen.getByRole('button', { name: 'Load more posts' }));
    await waitFor(() => expect(screen.getAllByTestId('wired-card')).toHaveLength(2));
    expect(readHashtagBoard).toHaveBeenLastCalledWith('walking', expect.objectContaining({ cursor: { created_at: '2026-11-12', author_key: 'bob', doc_id: 'p' } }));
  });
  it('does not let a previous topic finish into the new URL', async () => {
    let release!: (result: any) => void;
    vi.mocked(readHashtagBoard).mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    setup(); fireEvent.click(screen.getByRole('link', { name: 'Next topic' }));
    expect(await screen.findByRole('heading', { name: 'Nothing under #night yet' })).toBeInTheDocument();
    await act(async () => release(page([post('stale')])));
    expect(screen.queryByTestId('wired-card')).not.toBeInTheDocument();
  });
  it('keeps anonymous reads public and routes the CTA to login, not a draft', async () => {
    state.token = null; const login = vi.fn(); setup('/tag/walking', login);
    fireEvent.click(await screen.findByRole('button', { name: 'Log in to post' }));
    expect(login).toHaveBeenCalledOnce();
    expect(readFeedReactions).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('closed');
  });
  it('optimistically toggles and restores counts/fills on a rejected mutation', async () => {
    vi.mocked(readHashtagBoard).mockResolvedValue(page([post('p')]));
    let reject!: (failure: unknown) => void;
    vi.mocked(toggleReactionKind).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    setup(); await screen.findByTestId('wired-card');
    await waitFor(() => expect(screen.queryByTestId('hashtag-loading')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Like' }));
    expect(screen.getByTestId('wired-card')).toHaveTextContent('3 likes');
    await act(async () => reject(new Error('denied')));
    expect(screen.getByTestId('wired-card')).toHaveTextContent('2 likes');
    expect(screen.getByTestId('wired-card')).toHaveTextContent('not-liked');
  });
});
