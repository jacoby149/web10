import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PostCard } from '@/components/Feed/FeedScreen';
import { readMutationAuthority, useMutationAuthority } from '@/data/mutationAuthority';
import { selectActingAuthor } from '@/data/actingIdentity';
import { deleteComment, readThreadComments, updateComment } from '@/data/comments';

const client = vi.hoisted(() => ({
  readToken: vi.fn(() => ({ username: 'alice', provider: 'node' })),
  getGroup: vi.fn(), readById: vi.fn(), update: vi.fn(), delete: vi.fn(),
  read: vi.fn(), query: vi.fn(), readRefCounts: vi.fn(),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => client }));
const group = 'node/groups/team';
function grants(permissions: Record<string, string[]>) {
  return { my_role: 'operator', roles: [{ name: 'operator', permissions }] };
}
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  client.getGroup.mockResolvedValue(grants({}));
  client.query.mockResolvedValue({ rows: [], count: 0 });
  client.read.mockResolvedValue([]);
  client.readRefCounts.mockResolvedValue({});
  client.readById.mockResolvedValue({ doc_id: 'comment', author_key: group, body: { text: 'old' } });
  client.update.mockResolvedValue({ doc_id: 'comment', author_key: group, body: { text: 'new' } });
});

it('keeps personal mutations while a group is selected, without granting foreign personal authority', async () => {
  selectActingAuthor(group);
  expect(await readMutationAuthority('alice', 'posts')).toEqual({ canEdit: true, canDelete: true });
  expect(await readMutationAuthority('node/alice', 'comments')).toEqual({ canEdit: true, canDelete: true });
  expect(await readMutationAuthority('bob', 'posts')).toEqual({ canEdit: false, canDelete: false });
  expect(client.getGroup).not.toHaveBeenCalled();
});

it.each([
  ['alice', { posts: ['create'] }, true, true],
  [group, { posts: ['create'] }, false, false],
  [group, { posts: ['updateOwn'] }, true, false],
  [group, { posts: ['deleteOwn'] }, false, true],
])('renders card controls by document authority: %s %j', async (author, permissions, edit, remove) => {
  selectActingAuthor('node/groups/other');
  client.getGroup.mockResolvedValue(grants(permissions));
  render(<MemoryRouter><PostCard
    post={{ _id: 'p', author_key: author, author_username: author, text: 'post', created_at: '2026-11-01' }}
    authorName="Author" mediaItems={[]} reactionCount={0} commentCount={0}
    liked={false} disliked={false} timestamp="2026-11-01"
    onToggleReaction={vi.fn()} onCommentCountChange={vi.fn()} signedIn isOwnPost
  /></MemoryRouter>);
  if (!edit && !remove) {
    await waitFor(() => expect(client.getGroup).toHaveBeenCalled());
    expect(screen.queryByTestId('post-options-button')).not.toBeInTheDocument();
    return;
  }
  fireEvent.click(await screen.findByTestId('post-options-button'));
  await waitFor(() => expect(!!screen.queryByTestId('post-option-edit')).toBe(edit));
  await waitFor(() => expect(!!screen.queryByTestId('post-option-delete')).toBe(remove));
});

it.each([
  [{ posts: ['create'] }, false, false],
  [{ comments: ['updateOwn', 'deleteOwn'] }, false, false],
  [{ posts: ['updateOwn'] }, true, false],
  [{ posts: ['deleteOwn'] }, false, true],
  [{ '*': ['updateOwn', 'deleteOwn'] }, true, true],
])('uses actual author and exact service/operation grants: %j', async (permissions, canEdit, canDelete) => {
  selectActingAuthor('node/groups/other');
  client.getGroup.mockResolvedValue(grants(permissions));
  expect(await readMutationAuthority(group, 'posts')).toEqual({ canEdit, canDelete });
  expect(client.getGroup).toHaveBeenCalledWith(group);
});

it('denies failed or revoked membership without treating the selected group as proof', async () => {
  selectActingAuthor(group);
  client.getGroup.mockResolvedValue({ ...grants({ '*': ['updateOwn', 'deleteOwn'] }), my_role: '' });
  expect(await readMutationAuthority(group, 'posts')).toEqual({ canEdit: false, canDelete: false });
  client.getGroup.mockRejectedValue(new Error('revoked'));
  expect(await readMutationAuthority(group, 'posts')).toEqual({ canEdit: false, canDelete: false });
});

it('refreshes group grants and ignores a pending result for a previous author', async () => {
  let resolve!: (value: unknown) => void;
  client.getGroup.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const { result, rerender } = renderHook(({ author }) => useMutationAuthority(author, 'posts'), { initialProps: { author: group } });
  rerender({ author: 'node/groups/other' });
  await waitFor(() => expect(client.getGroup).toHaveBeenCalledTimes(2));
  await act(async () => resolve(grants({ posts: ['updateOwn', 'deleteOwn'] })));
  expect(result.current).toEqual({ canEdit: false, canDelete: false });
  client.getGroup.mockResolvedValue(grants({ posts: ['deleteOwn'] }));
  act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(result.current.canDelete).toBe(true));
});

it('enriches comment mutations separately from selected reaction identity', async () => {
  selectActingAuthor('node/groups/other');
  client.getGroup.mockResolvedValue(grants({ comments: ['deleteOwn'] }));
  client.read.mockResolvedValueOnce([
    { doc_id: 'personal', author_key: 'alice', body: { text: 'mine' } },
    { doc_id: 'group', author_key: group, posted_by: 'bob', body: { text: 'ours' } },
  ]);
  const { comments } = await readThreadComments('post', ['board']);
  expect(comments[0]).toMatchObject({ canEdit: true, canDelete: true });
  expect(comments[1]).toMatchObject({ canEdit: false, canDelete: true });
});

it('rechecks live comment authority and sends the document author, never the selected identity', async () => {
  selectActingAuthor('node/groups/other');
  client.getGroup.mockResolvedValue(grants({ comments: ['updateOwn'] }));
  await updateComment('comment', { text: 'new' });
  expect(client.update).toHaveBeenCalledWith('comment', { text: 'new' }, { author_as: group });
  await expect(deleteComment('comment')).rejects.toThrow('Not authorized');
  expect(client.delete).not.toHaveBeenCalled();
  client.getGroup.mockResolvedValue(grants({ comments: ['deleteOwn'] }));
  await deleteComment('comment');
  expect(client.delete).toHaveBeenCalledWith('comment', { author_as: group });
  await expect(updateComment('comment', { text: 'denied' })).rejects.toThrow('Not authorized');
});
