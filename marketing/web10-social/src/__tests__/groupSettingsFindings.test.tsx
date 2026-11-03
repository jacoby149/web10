import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';
import { StrictMode } from 'react';
import GroupEditMode from '@/components/Groups/ManageGroup/GroupEditMode';
import { getGroupMembers, slugTaken, writeGroupIdentity } from '@/data';

vi.mock('@/data', () => ({
  getGroupMembers: vi.fn(),
  slugTaken: vi.fn().mockResolvedValue(true),
  writeGroupIdentity: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => ({ readToken: () => ({ username: 'me' }) }) }));
vi.mock('@/data/posts', () => ({ uploadMedia: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function edit(isDraft = false, discoverable = false) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const view = render(<GroupEditMode groupId="api.localhost/groups/users/me/new-group-2"
    identity={{ name: 'New group', status: isDraft ? 'draft' : 'published' }}
    joinPolicy="open" discoverable={discoverable} isDraft={isDraft}
    onUploadingChange={vi.fn()} onSave={onSave} onCancel={vi.fn()} />);
  return { onSave, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.mocked(getGroupMembers).mockResolvedValue([]);
  vi.mocked(writeGroupIdentity).mockResolvedValue(undefined);
});
afterEach(() => vi.useRealTimers());

it('first Save retains Public selected before the initial private membership read completes', async () => {
  const members = deferred<Awaited<ReturnType<typeof getGroupMembers>>>();
  vi.mocked(getGroupMembers).mockReturnValue(members.promise);
  const { onSave } = edit();
  fireEvent.click(screen.getByTestId('group-edit-visibility-public'));
  await act(async () => { members.resolve([]); });
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'public', discoverable: false }));
});

it('does not save a guessed Private value while membership initialization is pending', () => {
  vi.mocked(getGroupMembers).mockReturnValue(new Promise(() => {}));
  const { onSave } = edit();
  fireEvent.click(screen.getByTestId('group-edit-save'));
  expect(onSave).not.toHaveBeenCalled();
});

it('failed initialization requires an explicit selection and preserves independent directory listing', async () => {
  vi.mocked(getGroupMembers).mockRejectedValue(new Error('offline'));
  const { onSave } = edit(false, true);
  await act(async () => {});
  expect(screen.getByTestId('group-edit-save')).toBeDisabled();
  expect(screen.getByRole('alert')).toHaveTextContent('Could not load visibility');
  fireEvent.click(screen.getByTestId('group-edit-visibility-private'));
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'private', discoverable: true }));
});

it('initializes untouched published visibility from the actual reader grant', async () => {
  vi.mocked(getGroupMembers).mockResolvedValue([{ member_key: 'authenticated', role: 'reader' }] as never);
  const { onSave } = edit();
  await act(async () => {});
  expect(screen.getByTestId('group-edit-visibility-signed_in')).toHaveAttribute('aria-pressed', 'true');
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ visibility: 'signed_in' }));
});

it('allocated drafts keep their actual ID slug and permit duplicate display names without an availability check', async () => {
  edit(true);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Existing Group Name' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(450); });
  expect(slugTaken).not.toHaveBeenCalled();
  expect(screen.queryByTestId('group-edit-slug-taken')).not.toBeInTheDocument();
  expect(screen.getByTestId('group-edit-slug')).toHaveTextContent('new-group-2');
});

it('Publish waits for an already-started draft autosave and does not start another one', async () => {
  const autosave = deferred<void>();
  vi.mocked(writeGroupIdentity).mockReturnValueOnce(autosave.promise);
  const { onSave } = edit(true);
  await act(async () => {});
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Requested Display Name' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  expect(writeGroupIdentity).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByTestId('group-edit-save'));
  expect(onSave).not.toHaveBeenCalled();
  await act(async () => { autosave.resolve(); });
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ face: expect.objectContaining({ name: 'Requested Display Name' }) }));
});

it('Publish cancels a pending autosave debounce', async () => {
  const { onSave } = edit(true);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Ready Now' } });
  const commit = deferred<void>();
  onSave.mockReturnValue(commit.promise);
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(writeGroupIdentity).not.toHaveBeenCalled();
  await act(async () => { commit.resolve(); });
});

it('remounted Publish waits for old started A and discards old queued B', async () => {
  const a = deferred<void>();
  const events: string[] = [];
  vi.mocked(writeGroupIdentity).mockImplementation(async (_id, face) => {
    if (face.name === 'A') await a.promise;
    events.push(`draft:${face.name}`);
  });
  const old = edit(true);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'A' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'B' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  old.unmount();
  const current = edit(true);
  current.onSave.mockImplementation(async () => { events.push('published'); });
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  expect(current.onSave).not.toHaveBeenCalled();
  await act(async () => { a.resolve(); });
  expect(events).toEqual(['draft:A', 'published']);
  expect(writeGroupIdentity).toHaveBeenCalledTimes(1);
});

it('draft Delete waits for started A and cancels queued B', async () => {
  const a = deferred<void>();
  const events: string[] = [];
  vi.mocked(writeGroupIdentity).mockImplementation(async (_id, face) => {
    if (face.name === 'A') await a.promise;
    events.push(`draft:${face.name}`);
  });
  const onDelete = vi.fn(async () => { events.push('deleted'); });
  render(<GroupEditMode groupId="delete-race" identity={{ status: 'draft' }}
    joinPolicy="open" discoverable={false} isDraft
    onUploadingChange={vi.fn()} onSave={vi.fn()} onCancel={vi.fn()} onDelete={onDelete} />);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'A' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'B' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-delete')); });
  expect(onDelete).not.toHaveBeenCalled();
  await act(async () => { a.resolve(); });
  expect(events).toEqual(['draft:A', 'deleted']);
});

it('StrictMode effect replay still permits later draft autosaves', async () => {
  vi.mocked(writeGroupIdentity).mockResolvedValue(undefined);
  render(<StrictMode><GroupEditMode groupId="strict-draft" identity={{ status: 'draft' }}
    joinPolicy="open" discoverable={false} isDraft
    onUploadingChange={vi.fn()} onSave={vi.fn()} onCancel={vi.fn()} /></StrictMode>);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'After replay' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  expect(writeGroupIdentity).toHaveBeenCalledWith('strict-draft', expect.objectContaining({ name: 'After replay' }));
});

it('a failed autosave does not poison the shared queue for a remounted Publish', async () => {
  vi.mocked(writeGroupIdentity).mockRejectedValueOnce(new Error('write failed'));
  const old = edit(true);
  fireEvent.change(screen.getByTestId('group-edit-name'), { target: { value: 'Failed save' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(650); });
  old.unmount();
  const current = edit(true);
  await act(async () => { fireEvent.click(screen.getByTestId('group-edit-save')); });
  expect(current.onSave).toHaveBeenCalledTimes(1);
});
