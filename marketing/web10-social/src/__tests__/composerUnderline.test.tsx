import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    createPost: vi.fn().mockResolvedValue({ _id: 'p1' }),
    createRepost: vi.fn().mockResolvedValue({ _id: 'rp1' }),
    readMyAds: vi.fn().mockResolvedValue({ ads: [], albums: [] }),
    readProfile: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    fanOutToFollowers: vi.fn().mockResolvedValue(undefined),
    uploadMedia: vi.fn(),
  };
});

vi.mock('@/data/settings', () => ({
  readSettings: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
  resetWapi: vi.fn(),
}));

/**
 * The native Cmd/Ctrl+U underline is suppressed in the composer (D85,
 * rich-text.md "the toolbar is the only formatting surface"). The browser
 * underlines a contenteditable selection in place, but the write side (turndown)
 * has no rule for `<u>` and markdown has no underline — so the mark would
 * vanish on save: the editor would show underlined text that posts as plain.
 * These tests pin that the editor never offers a format it cannot persist.
 */
describe('PostComposer — native Cmd/Ctrl+U underline is suppressed (D85)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function dispatchKey(key: string, opts: KeyboardEventInit = {}) {
    const el = await screen.findByTestId('composer-textarea');
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
    el.dispatchEvent(event);
    return event;
  }

  it('suppresses the native underline on Cmd+U (metaKey)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const event = await dispatchKey('u', { metaKey: true });
    // The native in-place underline is cancelled — the editor must not show a
    // format the write side cannot persist.
    expect(event.defaultPrevented).toBe(true);
  });

  it('suppresses the native underline on Ctrl+U (ctrlKey)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const event = await dispatchKey('u', { ctrlKey: true });
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not suppress a plain "u" keypress (only the modifier combo)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const event = await dispatchKey('u');
    expect(event.defaultPrevented).toBe(false);
  });
});
