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

// The D85 title treatment (rich-text.md "The composer title treatment"): the
// title is a headline you are writing, not a form field — the display face
// (Space Grotesk), the `bg-elevated` box killed (it sits on the composer
// surface), a violet caret (the brand moment), and a dimmed display-face
// placeholder. These tests pin the treatment so a future restyle that reverts
// the title to a gray form field goes red.
describe('PostComposer — the title treatment (D85, rich-text.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('the title is a headline, not a form field — display face, no box, violet caret', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const title = await screen.findByTestId('composer-title');
    // The display face (Space Grotesk) at the headline size, tight tracking.
    expect(title).toHaveClass('font-display', 'text-2xl', 'tracking-tight');
    // The brand caret (the "oooh I'm typing a title" moment).
    expect(title).toHaveClass('caret-brand-400');
    // The box is killed: no `bg-elevated` fill, no rounded corners — it sits
    // on the composer surface like text on a page.
    expect(title).toHaveClass('bg-transparent', 'rounded-none');
    expect(title).not.toHaveClass('bg-elevated');
  });

  it('the title placeholder is in the display face (a headline waiting to be written)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const title = await screen.findByTestId('composer-title');
    expect(title).toHaveAttribute('placeholder', 'Add a title (optional)…');
    expect(title).toHaveClass('placeholder:font-display');
  });

  it('the caption carries the violet caret too (the caret is a brand moment on title AND body)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const caption = await screen.findByTestId('composer-textarea');
    expect(caption).toHaveClass('caret-brand-400');
  });

  it('the caption sits on the surface, not in a gray form box (the stage, not a form)', async () => {
    const { default: PostComposer } = await import('@/components/Feed/PostComposer');
    render(<PostComposer />);
    const caption = await screen.findByTestId('composer-textarea');
    // The D85 composer pass: the caption is on the surface (bg-transparent),
    // not a bg-elevated form field — Facebook's "What's on your mind" is on
    // the surface, not in a gray box.
    expect(caption).toHaveClass('bg-transparent');
    expect(caption).not.toHaveClass('bg-elevated');
  });
});
