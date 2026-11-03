import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FeedScreen from '@/components/Feed/FeedScreen';
import * as data from '@/data';

const state = vi.hoisted(() => ({ identity: 'A' }));
vi.mock('@/data/actingIdentity', () => ({
  useActingAuthor: () => state.identity, getActingAuthor: () => state.identity,
  matchesActingAuthor: () => false,
}));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => ({ username: 'human', provider: 'node' }) }) }));
vi.mock('@/data', async (original) => ({
  ...await original<Record<string, unknown>>(),
  readFeedPage: vi.fn(), readFeedReactions: vi.fn(), toggleReactionKind: vi.fn(),
  readSettings: vi.fn().mockResolvedValue({}), saveSettings: vi.fn().mockResolvedValue({}),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const post = { _id: 'post', text: 'First post', author_username: 'author', created_at: '2026-11-01' };
const page = { posts: [post], has_more: true, next_cursor: { created_at: 'next' } };
const reactions = { liked: {}, disliked: {}, reposted: {} };
const view = () => <MemoryRouter><FeedScreen /></MemoryRouter>;
let onIntersect: (() => void) | undefined;
function intersect() {
  onIntersect?.();
}

beforeEach(() => {
  vi.clearAllMocks();
  state.identity = 'A';
  onIntersect = undefined;
  vi.stubGlobal('IntersectionObserver', class {
    callback: IntersectionObserverCallback;
    constructor(callback: IntersectionObserverCallback) { this.callback = callback; }
    observe() { onIntersect = () => this.callback([{ isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver); }
    disconnect() { onIntersect = undefined; }
    unobserve() {}
  });
  vi.mocked(data.readFeedPage).mockResolvedValue(page);
  vi.mocked(data.readFeedReactions).mockResolvedValue(reactions);
});

it('does not restore the old identity reaction when a pending write fails', async () => {
  const pending = deferred<null>();
  vi.mocked(data.toggleReactionKind).mockReturnValueOnce(pending.promise);
  vi.mocked(data.readFeedReactions).mockResolvedValueOnce({ ...reactions, liked: { post: true } });
  const { rerender } = render(view());
  await waitFor(() => expect(screen.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(screen.getByTestId('like-button'));
  state.identity = 'B';
  rerender(view());
  await waitFor(() => expect(data.readFeedPage).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false'));
  await act(async () => pending.reject(new Error('revoked')));
  expect(screen.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false');
});

it('keeps loaded posts when optional own-reaction loading fails', async () => {
  vi.mocked(data.readFeedReactions).mockRejectedValueOnce(new Error('membership unavailable'));
  render(view());
  await screen.findByTestId('post-card');
  expect(screen.getByText('First post')).toBeInTheDocument();
  expect(screen.queryByText(/Your feed will appear here/)).not.toBeInTheDocument();
});

it('shows a retryable load error instead of claiming the feed is empty', async () => {
  vi.mocked(data.readFeedPage).mockRejectedValueOnce(new Error('query unavailable'));
  render(view());
  await screen.findByRole('alert');
  expect(screen.queryByText(/Your feed will appear here/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByTestId('post-card');
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('discards a pending page from the previous identity', async () => {
  const pending = deferred<typeof page>();
  const { rerender } = render(view());
  await screen.findByTestId('post-card');
  vi.mocked(data.readFeedPage).mockReturnValueOnce(pending.promise);
  act(intersect);
  await waitFor(() => expect(data.readFeedPage).toHaveBeenCalledTimes(2));
  state.identity = 'B';
  rerender(view());
  await waitFor(() => expect(data.readFeedPage).toHaveBeenCalledTimes(3));
  await screen.findByTestId('post-card');
  await act(async () => pending.resolve({ ...page, posts: [{ ...post, _id: 'stale', text: 'Stale page' }] }));
  expect(screen.queryByText('Stale page')).not.toBeInTheDocument();
});

it('discards pending pagination reaction results after switching identity', async () => {
  const pending = deferred<typeof reactions>();
  const { rerender } = render(view());
  await screen.findByTestId('post-card');
  vi.mocked(data.readFeedPage).mockResolvedValueOnce({ ...page, posts: [{ ...post, _id: 'second' }] });
  vi.mocked(data.readFeedReactions).mockReturnValueOnce(pending.promise);
  act(intersect);
  await waitFor(() => expect(data.readFeedReactions).toHaveBeenCalledTimes(2));
  state.identity = 'B';
  rerender(view());
  await waitFor(() => expect(data.readFeedReactions).toHaveBeenCalledTimes(3));
  await act(async () => pending.resolve({ ...reactions, liked: { post: true } }));
  expect(screen.getByTestId('like-button')).toHaveAttribute('aria-pressed', 'false');
});
