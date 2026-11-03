import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { composerEditor, typeInComposer } from './helpers/tiptap';

const mocks = vi.hoisted(() => ({
  author: 'test/groups/users/alice/new-group-123',
  identity: vi.fn(),
  create: vi.fn(),
  settings: vi.fn(),
  faces: vi.fn(),
}));
vi.mock('@/data/actingIdentity', () => ({ getActingAuthor: () => mocks.author, actingPostGroups: vi.fn().mockResolvedValue(['team-target']) }));
vi.mock('@web10/discover/face', () => ({ GROUP_FACE_SQL: '', resolveFaceMedia: (...args: unknown[]) => mocks.faces(...args) }));
vi.mock('@/data', async (original) => ({
  ...await original<typeof import('@/data')>(),
  readGroupIdentity: (...args: unknown[]) => mocks.identity(...args),
  createPost: (...args: unknown[]) => mocks.create(...args),
  getDiscoverGroupId: () => 'discover',
  readProfile: vi.fn().mockResolvedValue(null),
  resolveMediaRefs: vi.fn().mockResolvedValue([]),
  getWapi: () => ({ readToken: () => ({ username: 'alice' }) }),
}));
vi.mock('@/data/settings', () => ({ readSettings: () => mocks.settings() }));
import PostComposer from '@/components/Feed/PostComposer';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.author = 'test/groups/users/alice/new-group-123';
  mocks.identity.mockResolvedValue({ name: 'The Team' });
  mocks.faces.mockResolvedValue(new Map());
  mocks.settings.mockResolvedValue({});
  mocks.create.mockResolvedValue({ _id: 'created' });
});

describe('Group composer', () => {
  it('never exposes the internal slug and shows the name before optional face resolution', async () => {
    mocks.faces.mockReturnValue(new Promise(() => {}));
    render(<PostComposer groups={[mocks.author]} />);
    expect(screen.getByTestId('composer-author-name')).toHaveTextContent('Loading group');
    expect(screen.queryByText(/new-group-123/)).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('composer-author-name')).toHaveTextContent('The Team'));
  });

  it('keeps explicit self targets restricted until Public is explicitly selected', async () => {
    render(<PostComposer groups={[mocks.author]} />);
    await typeInComposer('Group draft');
    expect(screen.getByLabelText('Post visibility')).toHaveValue('private');
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][1]).toEqual([mocks.author]);
    await typeInComposer('Public group draft');
    fireEvent.change(screen.getByLabelText('Post visibility'), { target: { value: 'public' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][1]).toEqual([mocks.author, 'discover']);
  });

  it('retains bulk-inserted rich content and identity after a failed publish for retry', async () => {
    mocks.create.mockRejectedValueOnce(new Error('permission denied'));
    render(<PostComposer groups={[mocks.author]} />);
    const editor = await composerEditor();
    const updates = vi.fn();
    editor.on('update', updates);
    await act(async () => { editor.commands.insertContent('<p>A <strong>bulk</strong> pasted draft</p><p>Second paragraph</p>'); });
    expect(updates).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('post-submit')).toBeEnabled());
    expect(editor.getText()).toContain('bulk pasted draft');
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(2));
    expect(mocks.create.mock.calls[1][0].text).toBe('A **bulk** pasted draft\n\nSecond paragraph');
    expect(mocks.create.mock.calls[1][3]).toBe(mocks.author);
  });

  it('removes Discover from restricted destinations without dropping the explicit self group', async () => {
    render(<PostComposer groups={[mocks.author, 'discover']} />);
    await typeInComposer('Restricted draft');
    fireEvent.change(screen.getByLabelText('Post visibility'), { target: { value: 'private' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    await waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0][1]).toEqual([mocks.author]);
    expect(mocks.create.mock.calls[0][0].visibility).toBe('private');
  });

  it('does not let a delayed personal setting overwrite an explicit audience choice', async () => {
    let resolveSettings!: (settings: { defaultVisibility: string }) => void;
    mocks.settings.mockReturnValue(new Promise((resolve) => { resolveSettings = resolve; }));
    render(<PostComposer />);
    fireEvent.change(screen.getByLabelText('Post visibility'), { target: { value: 'public' } });
    await act(async () => resolveSettings({ defaultVisibility: 'private' }));
    expect(screen.getByLabelText('Post visibility')).toHaveValue('public');
  });

  it('does not replace an empty explicit destination set with Discover', async () => {
    render(<PostComposer groups={[]} />);
    await typeInComposer('Keep this draft');
    fireEvent.change(screen.getByLabelText('Post visibility'), { target: { value: 'public' } });
    fireEvent.click(screen.getByTestId('post-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a destination');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByTestId('composer-textarea')).toHaveTextContent('Keep this draft');
  });
});
