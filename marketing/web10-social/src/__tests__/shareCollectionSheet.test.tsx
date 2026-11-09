import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock lucide-react icons (Proxy fabricates any icon — never list them by hand)
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

import ShareCollectionSheet from '@/components/shared/ShareCollectionSheet';

const URL = 'https://social.test/u/nova/saved/nova%2Fgroups%2Fusers%2Fnova%2Fsaved-jazz';

function renderSheet(over: Partial<Parameters<typeof ShareCollectionSheet>[0]> = {}) {
  const props = {
    name: 'Jazz Nights',
    url: URL,
    visibility: 'public' as const,
    canMakePublic: false,
    onShared: vi.fn(),
    onClose: vi.fn(),
    testId: 'sc',
    ...over,
  };
  render(<ShareCollectionSheet {...props} />);
  return props;
}

beforeEach(() => {
  // jsdom has no clipboard API — the sheet's fallback path needs it.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ShareCollectionSheet — the shared playlist link dialog', () => {
  it.each(['private', 'public'] as const)('keeps the portaled %s collection under its own replay boundary', (visibility) => {
    renderSheet({ visibility });
    expect(!!screen.getByTestId('sc-url').closest('[data-replay-private]')).toBe(visibility !== 'public');
    expect(!!screen.getByRole('heading', { name: 'Share “Jazz Nights”' }).closest('[data-replay-private]')).toBe(visibility !== 'public');
  });

  it('a public playlist shows the canonical URL and a copy path (no navigator.share in jsdom)', async () => {
    const props = renderSheet();
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAccessibleName('Share “Jazz Nights”');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Anyone with the link can listen.')).toBeInTheDocument();
    expect(screen.getByTestId('sc-url')).toHaveTextContent(URL);
    // jsdom has no navigator.share → the primary action is the clipboard path.
    expect(screen.getByRole('button', { name: 'Copy link' })).toBeInTheDocument();
    expect(screen.queryByTestId('sc-copy-anyway')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL);
    expect(await screen.findByTestId('sc-status')).toHaveTextContent('Link copied.');
    expect(props.onShared).toHaveBeenCalledWith('copied');
    // The sheet stays open (the user may want to copy again / close).
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a private playlist warns and offers "Make public & share" to the owner', async () => {
    const onMakePublic = vi.fn().mockResolvedValue(undefined);
    renderSheet({ visibility: 'private', canMakePublic: true, onMakePublic });

    expect(screen.getByText(/This playlist is private/)).toBeInTheDocument();
    const makePublic = screen.getByTestId('sc-make-public-share');
    expect(makePublic).toHaveTextContent('Make public & share');
    expect(screen.getByTestId('sc-copy-anyway')).toBeInTheDocument();

    fireEvent.click(makePublic);
    // The visibility flip happens BEFORE the link goes out.
    await waitFor(() => expect(onMakePublic).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL));
    expect(await screen.findByTestId('sc-status')).toHaveTextContent('Playlist is public — link copied.');
  });

  it('a failed make-public keeps the sheet open with a retryable error and copies nothing', async () => {
    renderSheet({ visibility: 'private', canMakePublic: true, onMakePublic: vi.fn().mockRejectedValue(new Error('denied')) });
    fireEvent.click(screen.getByTestId('sc-make-public-share'));
    expect(await screen.findByTestId('sc-status')).toHaveTextContent('Could not make the playlist public.');
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('a non-owner of a private playlist gets no make-public action (an honest copy instead)', async () => {
    renderSheet({ visibility: 'private', canMakePublic: false });
    expect(screen.queryByTestId('sc-make-public-share')).not.toBeInTheDocument();
    // The link still copies (the recipient will get the 403 page — the sheet
    // already said so above the URL).
    fireEvent.click(screen.getByTestId('sc-share'));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(URL));
  });

  it('Escape closes the sheet', () => {
    const props = renderSheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('a backdrop click closes the sheet', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByTestId('sc-backdrop'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it('the close button closes the sheet', () => {
    const props = renderSheet();
    fireEvent.click(screen.getByTestId('sc-close'));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
