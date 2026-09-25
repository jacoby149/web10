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
    countReactions: vi.fn().mockResolvedValue(0),
    readReactions: vi.fn().mockResolvedValue([]),
  };
});

vi.mock('@/data/wapi', () => ({
  getWapi: vi.fn().mockReturnValue({
    readToken: vi.fn().mockReturnValue({ provider: 'test.localhost', username: 'testuser' }),
  }),
}));

const POST_AD = {
  _id: 'ad-1',
  text: 'Everything I use, linked.',
  created_at: '2026-09-23T12:00:00Z',
  offer: {
    kind: 'none',
    partner: '',
    link: 'https://amzn.to/abc',
    cta: 'Check it out',
    disclosure: 'I may earn a commission.',
  },
  status: 'active' as const,
  author_username: 'alice',
  variant: 'creator' as const,
  format: 'post' as const,
  media_refs: [],
};

const INLINE_AD = {
  _id: 'ad-inline-1',
  text: 'The compact inline ad.',
  offer: { link: 'https://amzn.to/xyz', cta: 'Get it', disclosure: 'I may earn a commission.' },
  status: 'active' as const,
  author_username: 'alice',
  variant: 'creator' as const,
  format: 'inline' as const,
  media_refs: [],
};

const BASE_POST = {
  _id: 'p1',
  text: 'A regular post with an ad attached.',
  created_at: '2026-09-23T11:00:00Z',
  author_username: 'bob',
  author_provider: 'test.localhost',
  profile: { display_name: 'Bob' },
  media_refs: [],
};

describe('FeedScreen — the post-format ad renders as its own card, next in line (ad-improvements.md)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('a post-format ad attached to a post renders as a standalone card AFTER that post (not inside it)', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [{ ...BASE_POST, ad: POST_AD }],
      has_more: false,
      next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    const postCard = await screen.findByTestId('post-card');
    const adCard = screen.getByTestId('post-ad-card');

    // The ad is its own standalone card (the feed-card article chrome).
    expect(adCard.tagName).toBe('ARTICLE');
    expect(adCard.getAttribute('data-ad-standalone')).toBe('true');
    // It is NOT nested inside the post it's attached to.
    expect(postCard.contains(adCard)).toBe(false);
    // It sits next in line — directly after the post in the stream.
    expect(postCard.nextElementSibling).toBe(adCard);
    // The ad dressing is intact: badge + author + CTA + disclosure.
    expect(screen.getByTestId('post-ad-badge')).toHaveTextContent('Ad');
    expect(screen.getByTestId('post-ad-author')).toHaveTextContent('@alice');
    expect(screen.getByTestId('post-ad-cta')).toHaveTextContent('Check it out');
    expect(screen.getByTestId('post-ad-disclosure')).toHaveTextContent('I may earn a commission.');
  });

  it('an inline ad stays in the post card (the compact AdBlock), not a standalone card', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [{ ...BASE_POST, ad: INLINE_AD }],
      has_more: false,
      next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    const postCard = await screen.findByTestId('post-card');
    // The compact AdBlock renders inside the post card.
    const adBlock = screen.getByTestId('ad-block');
    expect(postCard.contains(adBlock)).toBe(true);
    // No standalone post-ad card.
    expect(screen.queryByTestId('post-ad-card')).toBeNull();
  });

  it('a post with BOTH a creator post ad and a node post ad shows two standalone cards, in order', async () => {
    const { readFeedPage } = await import('@/data');
    const nodePostAd = {
      ...POST_AD,
      _id: 'node-1',
      text: 'Try the new workflow tool.',
      author_username: 'nodeops',
      variant: 'node' as const,
      offer: { kind: 'direct', partner: 'WorkflowCo', link: 'https://workflowco.com?ref=node', cta: 'Learn more', disclosure: 'Sponsored by this node.' },
    };
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [{ ...BASE_POST, ad: POST_AD, node_ad: nodePostAd }],
      has_more: false,
      next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    const postCard = await screen.findByTestId('post-card');
    const adCards = screen.getAllByTestId('post-ad-card');
    expect(adCards).toHaveLength(2);
    // Both standalone, both after the post, in attachment order (creator, node).
    expect(adCards[0].getAttribute('data-ad-standalone')).toBe('true');
    expect(adCards[1].getAttribute('data-ad-standalone')).toBe('true');
    expect(postCard.nextElementSibling).toBe(adCards[0]);
    expect(adCards[0].nextElementSibling).toBe(adCards[1]);
    expect(adCards[0].getAttribute('data-ad-variant')).toBe('creator');
    expect(adCards[1].getAttribute('data-ad-variant')).toBe('node');
  });

  it('a post-format ad on the SECOND post renders after that post (the stream order holds)', async () => {
    const { readFeedPage } = await import('@/data');
    vi.mocked(readFeedPage).mockResolvedValueOnce({
      posts: [
        { ...BASE_POST, _id: 'p1', text: 'First post, no ad.' },
        { ...BASE_POST, _id: 'p2', text: 'Second post, with a post ad.', ad: POST_AD },
      ],
      has_more: false,
      next_cursor: null,
    });

    const { default: FeedScreen } = await import('@/components/Feed/FeedScreen');
    render(
      <MemoryRouter>
        <FeedScreen />
      </MemoryRouter>,
    );

    const postCards = await screen.findAllByTestId('post-card');
    expect(postCards).toHaveLength(2);
    const adCard = screen.getByTestId('post-ad-card');
    // After the second post, not the first.
    expect(postCards[0].nextElementSibling).toBe(postCards[1]);
    expect(postCards[1].nextElementSibling).toBe(adCard);
  });
});
