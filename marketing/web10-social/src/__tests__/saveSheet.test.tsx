import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/lib/analytics', () => ({ trackEvent: vi.fn() }));

// The saved-collection seams under test — the data layer is mocked so the test
// exercises the sheet's behavior (list, checkmark, toggle, create), not the
// node. `vi.hoisted` because SaveSheet statically imports @/data, so the mock
// factory runs before any top-level const in this file would be initialized.
const {
  mockGetMyCollections,
  mockReadSavedPostIds,
  mockSavePostToCollection,
  mockRemovePostFromCollection,
  mockCreateCollection,
} = vi.hoisted(() => ({
  mockGetMyCollections: vi.fn(),
  mockReadSavedPostIds: vi.fn(),
  mockSavePostToCollection: vi.fn(),
  mockRemovePostFromCollection: vi.fn(),
  mockCreateCollection: vi.fn(),
}));

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    getMyCollections: mockGetMyCollections,
    readSavedPostIds: mockReadSavedPostIds,
    savePostToCollection: mockSavePostToCollection,
    removePostFromCollection: mockRemovePostFromCollection,
    createCollection: mockCreateCollection,
  };
});

import { SaveProvider, useSave } from '@/context/SaveContext';
import { SaveSheet } from '@/components/Feed/SaveSheet';
import type { PostRecord } from '@/data/types';

const POST: PostRecord = { _id: 'post-1', text: 'a post', created_at: 'x' } as PostRecord;

const COLLECTIONS = [
  { groupId: 'g1', name: 'Guitar Riffs', visibility: 'private', itemCount: 3, slug: 'guitar-riffs' },
  { groupId: 'g2', name: 'Tour Sets', visibility: 'public', itemCount: 1, slug: 'tour-sets' },
];

// A probe that opens the sheet through the context (the way a post surface's
// kebab does: `openSave(post)`).
function OpenProbe() {
  const { openSave } = useSave();
  return (
    <button type="button" data-testid="open-save" onClick={() => openSave(POST)}>
      open
    </button>
  );
}

function renderSheet() {
  return render(
    <SaveProvider>
      <SaveSheet />
      <OpenProbe />
    </SaveProvider>,
  );
}

describe('SaveSheet (D88) — the "Save to…" post action', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetMyCollections.mockResolvedValue([...COLLECTIONS]);
    // post-1 is already saved in g1, not in g2.
    mockReadSavedPostIds.mockImplementation(async (groupId: string) =>
      groupId === 'g1' ? new Set(['post-1']) : new Set<string>(),
    );
    mockSavePostToCollection.mockResolvedValue(true);
    mockRemovePostFromCollection.mockResolvedValue(undefined);
    mockCreateCollection.mockResolvedValue('g3');
  });

  it('is closed until a surface opens it', () => {
    renderSheet();
    expect(screen.queryByTestId('save-sheet')).not.toBeInTheDocument();
  });

  it('lists the user\u2019s collections with a checkmark on the ones already containing the post', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    const rows = await screen.findAllByTestId('save-collection-row');
    expect(rows.length).toBe(2);
    expect(screen.getByText('Guitar Riffs')).toBeInTheDocument();
    expect(screen.getByText('Tour Sets')).toBeInTheDocument();
    // The already-saved collection is pressed; the other is not.
    await waitFor(() => expect(rows[0]).toHaveAttribute('aria-pressed', 'true'));
    expect(rows[1]).toHaveAttribute('aria-pressed', 'false');
    // The header shows the saved count.
    expect(screen.getByTestId('save-sheet-saved-count')).toHaveTextContent('1');
  });

  it('tapping an unsaved collection saves the post into it (optimistic checkmark)', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    const rows = await screen.findAllByTestId('save-collection-row');
    // g2 (Tour Sets) is unsaved — tapping it saves.
    fireEvent.click(rows[1]);
    await waitFor(() => expect(mockSavePostToCollection).toHaveBeenCalledWith('g2', 'post-1'));
    await waitFor(() => expect(rows[1]).toHaveAttribute('aria-pressed', 'true'));
  });

  it('tapping a saved collection removes the post from it', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    const rows = await screen.findAllByTestId('save-collection-row');
    // g1 (Guitar Riffs) is saved — tapping it removes.
    fireEvent.click(rows[0]);
    await waitFor(() => expect(mockRemovePostFromCollection).toHaveBeenCalledWith('g1', 'post-1'));
    await waitFor(() => expect(rows[0]).toHaveAttribute('aria-pressed', 'false'));
  });

  it('rolls the checkmark back when the save fails', async () => {
    mockSavePostToCollection.mockRejectedValueOnce(new Error('nope'));
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    const rows = await screen.findAllByTestId('save-collection-row');
    fireEvent.click(rows[1]); // g2 unsaved → optimistic press
    await waitFor(() => expect(rows[1]).toHaveAttribute('aria-pressed', 'true'));
    // The write fails → the checkmark rolls back to off.
    await waitFor(() => expect(rows[1]).toHaveAttribute('aria-pressed', 'false'));
  });

  it('creates a new collection and saves the post into it', async () => {
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    await screen.findAllByTestId('save-collection-row');
    fireEvent.click(screen.getByTestId('save-new-collection'));
    fireEvent.change(screen.getByTestId('save-new-collection-input'), { target: { value: 'B-Sides' } });
    fireEvent.click(screen.getByTestId('save-new-collection-create'));
    await waitFor(() => expect(mockCreateCollection).toHaveBeenCalledWith('B-Sides', { visibility: 'private' }));
    // The new collection is created, then the post is saved into it.
    await waitFor(() => expect(mockSavePostToCollection).toHaveBeenCalledWith('g3', 'post-1'));
    // The new collection appears in the list, checked.
    expect(await screen.findByText('B-Sides')).toBeInTheDocument();
  });

  it('shows the empty state when the user has no collections', async () => {
    mockGetMyCollections.mockResolvedValue([]);
    renderSheet();
    fireEvent.click(screen.getByTestId('open-save'));
    expect(await screen.findByText(/No collections yet/)).toBeInTheDocument();
    expect(screen.getByTestId('save-new-collection')).toBeInTheDocument();
  });
});
