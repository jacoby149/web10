import { expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ProfileFeed } from '@/components/Bio/ProfileFeed';

const state = vi.hoisted(() => ({ identity: 'A', provider: 'node', reject: (_error: Error) => {} }));
vi.mock('@/data/actingIdentity', () => ({
  useActingAuthor: () => state.identity,
  matchesActingAuthor: (key: string, _username: string, identity: string) => key === identity,
}));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => ({ username: 'human', provider: state.provider }) }) }));
vi.mock('@/context/RepostContext', () => ({ useRepost: () => ({ setRepostingTo: vi.fn() }) }));
vi.mock('@/context/ComposerContext', () => ({ useComposer: () => ({ openComposer: vi.fn() }) }));
vi.mock('@/components/Feed/FeedScreen', () => ({ PostCard: (props: { liked: boolean; onToggleReaction: (kind: 'like') => void }) =>
  <button aria-pressed={props.liked} onClick={() => props.onToggleReaction('like')}>Like</button> }));
vi.mock('@/data', () => ({
  countComments: vi.fn().mockResolvedValue(0),
  readReactions: vi.fn(async () => [{ author_key: state.identity, type: 'like' }]),
  toggleReactionKind: vi.fn(() => new Promise((_resolve, reject) => { state.reject = reject; })),
  readRepostCounts: vi.fn().mockResolvedValue({}), readMyRepostedIds: vi.fn().mockResolvedValue(new Set()),
  readViewCounts: vi.fn().mockResolvedValue({}), getDiscoverGroupId: () => 'discover',
}));

it.each(['identity', 'account'] as const)('ignores a stale profile reaction failure across an %s generation', async (change) => {
  state.identity = 'A'; state.provider = 'node';
  const props = { posts: [{ _id: 'post', created_at: '2026-11-01' }], mediaMap: {}, authorName: 'Author' };
  const { rerender } = render(<ProfileFeed {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true'));
  fireEvent.click(screen.getByRole('button', { name: 'Like' }));
  if (change === 'identity') state.identity = 'B'; else state.provider = 'other-node';
  rerender(<ProfileFeed {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'true'));
  // The old snapshot was liked=true. Make the new identity's independent choice false.
  const { readReactions } = await import('@/data');
  vi.mocked(readReactions).mockResolvedValueOnce([]);
  if (change === 'identity') state.identity = 'A'; else state.provider = 'node';
  rerender(<ProfileFeed {...props} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false'));
  await act(async () => state.reject(new Error('revoked')));
  expect(screen.getByRole('button', { name: 'Like' })).toHaveAttribute('aria-pressed', 'false');
});
