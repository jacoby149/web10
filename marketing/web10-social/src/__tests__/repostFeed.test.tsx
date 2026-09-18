import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

vi.mock('@/data', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    readFeedPage: vi.fn().mockResolvedValue({ posts: [], has_more: false, next_cursor: null }),
    readFeedReactions: vi.fn().mockResolvedValue({ liked: {}, disliked: {}, reposted: {} }),
    toggleReactionKind: vi.fn().mockResolvedValue('like'),
    toggleRepost: vi.fn().mockResolvedValue(true),
    readPostById: vi.fn().mockResolvedValue(null),
    resolveMediaRefs: vi.fn().mockResolvedValue([]),
    readSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    saveSettings: vi.fn().mockResolvedValue({ defaultVisibility: 'public' }),
    updatePost: vi.fn(),
    deletePost: vi.fn(),
    movePostVisibility: vi.fn(),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

// The ORIGINAL post that a repost references.
const ORIGINAL = {
  _id: 'orig-1',
  text: 'The original post text everyone is amplifying.',
  created_at: '2026-09-17T09:00:00Z',
  author_username: 'alice',
  author_provider: 'test.localhost',
  profile: { display_name: 'Alice' },
  media_refs: [{ doc_id: 'm1', mime_type: 'image/png', read_url: 'https://cdn/x.png', thumbnail_url: 'https://cdn/x.png' }],
};

// A REPOST post in the feed: it carries repost_of + the reposter's comment.
const REPOST_POST = {
  _id: 'rp-1',
  text: 'This is why I repost it — great insight.',
  created_at: '2026-09-17T10:00:00Z',
  author_username: 'testuser',
  author_provider: 'test.localhost',
  profile: { display_name: 'Test User' },
  repost_of: 'orig-1',
  media_refs: [],
};

describe('FeedScreen — the repost card (reposts.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a "reposted" badge + the embedded original post + the reposter comment', async () => {
    const { readFeedPage, readPostById, resolveMediaRefs } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [REPOST_POST],
      has_more: false,
      next_cursor: null,
    });
    vi.mocked(readPostById).mockResolvedValueOnce(ORIGINAL as any);
    vi.mocked(resolveMediaRefs).mockResolvedValueOnce([
      { _id: 'm1', url: 'https://cdn/x.png', mime_type: 'image/png', thumbnail_url: 'https://cdn/x.png', width: 800, height: 600, created_at: '2026-09-17T09:00:00Z' },
    ]);

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    // The "reposted" badge on the reposter's card.
    expect(await screen.findByTestId('repost-badge')).toHaveTextContent('reposted');

    // The reposter's comment (the quote) renders on the card.
    expect(screen.getByText('This is why I repost it — great insight.')).toBeInTheDocument();

    // The embedded original post loads (readPostById is called with the repost_of id).
    expect(readPostById).toHaveBeenCalledWith('orig-1');
    const embed = await screen.findByTestId('repost-embed');
    expect(embed).toHaveTextContent('Alice');
    expect(embed).toHaveTextContent('The original post text everyone is amplifying.');
  });

  it('a repost the reader cannot read degrades to "Original post unavailable"', async () => {
    const { readFeedPage, readPostById } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [REPOST_POST],
      has_more: false,
      next_cursor: null,
    });
    vi.mocked(readPostById).mockResolvedValueOnce(null); // I3: reader can't read the original

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    expect(await screen.findByTestId('repost-embed-unavailable')).toHaveTextContent('Original post unavailable');
  });

  it('a normal (non-repost) post has no repost badge or embed', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [{ ...REPOST_POST, _id: 'p-normal', repost_of: undefined, text: 'A normal post' }],
      has_more: false,
      next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    await screen.findByText('A normal post');
    expect(screen.queryByTestId('repost-badge')).toBeNull();
    expect(screen.queryByTestId('repost-embed')).toBeNull();
    expect(screen.queryByTestId('repost-embed-unavailable')).toBeNull();
  });

  it('the embed renders the original creator pinned ad (D55) but NOT a node ad', async () => {
    const { readFeedPage, readPostById, resolveMediaRefs } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [REPOST_POST],
      has_more: false,
      next_cursor: null,
    });
    // The original carries BOTH a creator-pinned ad (D55) and a node ad (D57) —
    // the embed shows only the creator's, never the node's (no double-ads).
    vi.mocked(readPostById).mockResolvedValueOnce({
      ...ORIGINAL,
      ad: {
        _id: 'ad-orig', text: 'Original creator pinned ad',
        offer: { link: 'https://creator.example', cta: 'Get it', disclosure: 'I may earn a commission.' },
        status: 'active', author_username: 'alice', variant: 'creator',
      },
      node_ad: {
        _id: 'node-orig', text: 'Original node ad',
        offer: { link: 'https://node.example', cta: 'Learn more', disclosure: 'Sponsored by this node.' },
        status: 'active', author_username: 'nodeops', variant: 'node',
      },
    } as any);
    vi.mocked(resolveMediaRefs).mockResolvedValueOnce([]);

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    await screen.findByTestId('repost-embed');
    // The creator's pinned ad renders inside the embed.
    const adBlock = screen.getByTestId('repost-embed-ad');
    expect(adBlock).toBeInTheDocument();
    expect(adBlock).toHaveTextContent('Original creator pinned ad');
    // The node ad is NOT rendered in the embed (the repost post's own node ad,
    // if any, covers the node's inventory — two ads in a compact embed is too much).
    expect(screen.queryByText('Original node ad')).toBeNull();
  });
});
