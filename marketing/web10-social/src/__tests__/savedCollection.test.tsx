import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

// The saved-collection seams under test — the data layer is mocked so the test
// exercises the screen's behavior (render, owner edit, dead-ref degrade, the
// I3 403), not the node.
const {
  mockReadCollection,
  mockRemovePostFromCollection,
  mockSetCollectionVisibility,
  mockRenameCollection,
  mockDeleteCollection,
} = vi.hoisted(() => ({
  mockReadCollection: vi.fn(),
  mockRemovePostFromCollection: vi.fn(),
  mockSetCollectionVisibility: vi.fn(),
  mockRenameCollection: vi.fn(),
  mockDeleteCollection: vi.fn(),
}));

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readCollection: mockReadCollection,
    removePostFromCollection: mockRemovePostFromCollection,
    setCollectionVisibility: mockSetCollectionVisibility,
    renameCollection: mockRenameCollection,
    deleteCollection: mockDeleteCollection,
  };
});

// The token: the owner is 'testuser' (the profile username in the route).
vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({
      provider: 'test.localhost',
      username: 'testuser',
    }),
  }),
}));

globalThis.fetch = vi.fn();

import SavedCollectionScreen from '@/components/Bio/SavedCollectionScreen';
import { getWapi } from '@/data/wapi';

const GROUP_ID = 'test.localhost/groups/users/testuser/saved-guitar-riffs';

function renderCollection(entry = `/u/testuser/saved/${encodeURIComponent(GROUP_ID)}`, username = 'testuser') {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/u/:username/saved/:collectionId" element={<SavedCollectionScreen username={username} provider="test.localhost" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('SavedCollectionScreen (D88) — the collection detail view', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: () => [] });
    // Re-establish the token (clearAllMocks wipes the factory's implementation).
    vi.mocked(getWapi).mockReturnValue({
      readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
    } as unknown as ReturnType<typeof getWapi>);
    mockRemovePostFromCollection.mockResolvedValue(undefined);
    mockSetCollectionVisibility.mockResolvedValue(undefined);
    mockRenameCollection.mockResolvedValue(undefined);
    mockDeleteCollection.mockResolvedValue(undefined);
  });

  it('renders the saved posts as the wall (the profile\u2019s 9:16 grid)', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
        { _id: 's2', postId: 'p2', savedAt: 'x', unavailable: false, post: { _id: 'p2', text: 'another riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    const cells = await screen.findAllByTestId('saved-post-cell');
    expect(cells.length).toBe(2);
    expect(screen.getByTestId('saved-collection-name')).toHaveTextContent('Guitar Riffs');
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
  });

  it('a dead ref degrades to an unavailable tile (never a hard fail)', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'dead', savedAt: 'x', unavailable: true, post: null },
      ],
      mediaMap: {},
    });
    renderCollection();
    expect(await screen.findByTestId('saved-unavailable')).toBeInTheDocument();
    expect(screen.getByText('No longer available')).toBeInTheDocument();
  });

  it('the owner sees the per-item remove + the visibility toggle + the kebab', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findByTestId('saved-post-cell');
    // The owner affordances are present.
    expect(screen.getByTestId('saved-post-remove')).toBeInTheDocument();
    expect(screen.getByTestId('saved-collection-visibility')).toBeInTheDocument();
    expect(screen.getByTestId('saved-collection-menu-button')).toBeInTheDocument();
  });

  it('the owner\u2019s remove drops the tile (optimistic) + calls the seam', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
        { _id: 's2', postId: 'p2', savedAt: 'x', unavailable: false, post: { _id: 'p2', text: 'another', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findAllByTestId('saved-post-cell');
    fireEvent.click(screen.getAllByTestId('saved-post-remove')[0]);
    await waitFor(() => expect(mockRemovePostFromCollection).toHaveBeenCalledWith(GROUP_ID, 'p1'));
    // The removed tile is gone (one left).
    await waitFor(() => expect(screen.getAllByTestId('saved-post-cell')).toHaveLength(1));
  });

  it('the owner\u2019s visibility toggle flips private \u21c4 public (the D58 role-grant)', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findByTestId('saved-post-cell');
    // Private → public.
    fireEvent.click(screen.getByTestId('saved-collection-visibility'));
    await waitFor(() => expect(mockSetCollectionVisibility).toHaveBeenCalledWith(GROUP_ID, 'public'));
    await waitFor(() => expect(screen.getByText(/· Public/)).toBeInTheDocument());
    // Public → private.
    fireEvent.click(screen.getByTestId('saved-collection-visibility'));
    await waitFor(() => expect(mockSetCollectionVisibility).toHaveBeenCalledWith(GROUP_ID, 'private'));
    await waitFor(() => expect(screen.getByText(/· Private/)).toBeInTheDocument());
  });

  it('the owner\u2019s kebab offers rename + delete', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findByTestId('saved-post-cell');
    fireEvent.click(screen.getByTestId('saved-collection-menu-button'));
    expect(await screen.findByTestId('saved-collection-rename')).toBeInTheDocument();
    expect(screen.getByTestId('saved-collection-delete')).toBeInTheDocument();
  });

  it('the owner\u2019s rename writes the new name', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findByTestId('saved-post-cell');
    fireEvent.click(screen.getByTestId('saved-collection-menu-button'));
    fireEvent.click(await screen.findByTestId('saved-collection-rename'));
    fireEvent.change(screen.getByTestId('saved-collection-rename-input'), { target: { value: 'New Name' } });
    fireEvent.click(screen.getByTestId('saved-collection-rename-save'));
    await waitFor(() => expect(mockRenameCollection).toHaveBeenCalledWith(GROUP_ID, 'New Name'));
  });

  it('the owner\u2019s delete (confirm) deletes the collection', async () => {
    mockReadCollection.mockResolvedValue({
      face: { name: 'Guitar Riffs', visibility: 'private' },
      posts: [
        { _id: 's1', postId: 'p1', savedAt: 'x', unavailable: false, post: { _id: 'p1', text: 'a riff', created_at: 'x' } },
      ],
      mediaMap: {},
    });
    renderCollection();
    await screen.findByTestId('saved-post-cell');
    fireEvent.click(screen.getByTestId('saved-collection-menu-button'));
    fireEvent.click(await screen.findByTestId('saved-collection-delete'));
    fireEvent.click(await screen.findByTestId('saved-collection-delete-confirm'));
    await waitFor(() => expect(mockDeleteCollection).toHaveBeenCalledWith(GROUP_ID));
  });

  it('a non-owner reading a PRIVATE collection gets the error state (I3 403)', async () => {
    // The read throws (the node 403s a non-owner's read of a private collection).
    mockReadCollection.mockRejectedValue(new Error('403'));
    // Render as a visitor (a different username than the token's owner).
    renderCollection(`/u/otheruser/saved/${encodeURIComponent(GROUP_ID)}`, 'otheruser');
    expect(await screen.findByTestId('saved-collection-error')).toBeInTheDocument();
    // The owner affordances are absent for a visitor.
    expect(screen.queryByTestId('saved-collection-visibility')).not.toBeInTheDocument();
    expect(screen.queryByTestId('saved-post-remove')).not.toBeInTheDocument();
  });
});
