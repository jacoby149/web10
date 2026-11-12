import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import PostComposer from '@/components/Feed/PostComposer';
import { selectActingAuthor } from '@/data/actingIdentity';

const client = vi.hoisted(() => ({
  readToken: vi.fn(() => ({ username: 'alice', provider: 'node' })),
  update: vi.fn(), query: vi.fn(async () => ({ rows: [] })),
  documentAttachment: vi.fn(async (_docId: string, _groupId: string, opts?: { attached?: boolean }) => ({ attached: opts?.attached ?? false })),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => client }));
vi.mock('@/data', async (original) => ({
  ...await original<typeof import('@/data')>(),
  readProfile: vi.fn(async () => ({ display_name: 'Alice' })),
  resolveMediaRefs: vi.fn(async () => []),
  getDiscoverGroupId: () => 'node/groups/web10/discover',
}));
vi.mock('@/data/groups', () => ({ readGroupIdentity: vi.fn(async () => ({ name: 'Team' })) }));
vi.mock('@/data/settings', () => ({ readSettings: vi.fn(async () => ({})) }));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: client.readToken }) }));

const group = 'node/groups/team';
const post = {
  _id: 'existing', author_key: group, posted_by: 'bob',
  created_at: '2026-11-01',
  title: 'Original title', text: 'Original text', media_refs: ['unresolved-original-media'],
  ad_target: 'original-ad', visibility: 'public' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  selectActingAuthor('node/groups/unrelated');
  client.update.mockResolvedValue({ doc_id: post._id, author_key: group, posted_by: 'bob', body: post });
  client.documentAttachment.mockImplementation(async (_docId, _groupId, opts) => ({ attached: opts?.attached ?? false }));
});

it('shared composer updates the original group post through real updatePost without replacing attachments', async () => {
  const saved = vi.fn();
  render(<PostComposer editingPost={post} onPostCreated={saved} />);
  fireEvent.change(await screen.findByTestId('composer-title'), { target: { value: 'Edited title' } });
  fireEvent.click(screen.getByTestId('post-submit'));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(client.update).toHaveBeenCalledWith('existing', { title: 'Edited title', text: 'Original text', mention_usernames: [], hashtags: [] }, {
    author_as: group, ad_preference: { mode: 'pinned', target: 'original-ad' },
  });
  expect(post.title).toBe('Original title');
  expect(post.posted_by).toBe('bob');
});

it('failed group update preserves the original and edited draft for retry', async () => {
  client.update.mockRejectedValueOnce(new Error('Not authorized'));
  const saved = vi.fn();
  render(<PostComposer editingPost={post} onPostCreated={saved} />);
  fireEvent.change(await screen.findByTestId('composer-title'), { target: { value: 'Retry title' } });
  fireEvent.click(screen.getByTestId('post-submit'));
  expect(await screen.findByText('Not authorized')).toBeInTheDocument();
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByTestId('composer-title')).toHaveValue('Retry title');
  expect(post.title).toBe('Original title');
  fireEvent.click(screen.getByTestId('post-submit'));
  await waitFor(() => expect(saved).toHaveBeenCalledOnce());
  expect(client.update.mock.calls[1]).toEqual(client.update.mock.calls[0]);
  expect(client.update.mock.calls[1][2]).not.toHaveProperty('groups');
});

it('audience action uses the original group, not navigation, and never saves draft content', async () => {
  render(<PostComposer editingPost={post} />);
  fireEvent.change(await screen.findByTestId('composer-title'), { target: { value: 'Unsaved draft' } });
  fireEvent.click(await screen.findByText('Add to Discover'));
  await screen.findByText('Remove from Discover');
  expect(client.documentAttachment.mock.calls[1][0]).toBe('existing');
  expect(client.documentAttachment.mock.calls[1][2]).toEqual({ author_as: group, attached: true });
  expect(client.update).not.toHaveBeenCalled();
  expect(screen.getByTestId('composer-title')).toHaveValue('Unsaved draft');
});
