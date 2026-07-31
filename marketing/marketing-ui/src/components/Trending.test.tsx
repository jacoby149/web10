import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendingCard, type FeedPost } from '@/components/FeedPreview';

// Lane D — coverage for the /trending page pieces (D-trending-*).
// TrendingCard rank tiers + engagement wiring, and the page's grid /
// empty / load-more / sidebar states over a mocked discovery API.
// D-trending-knobs: knob rack, presets, mix code, live re-ranking.

const basePost: FeedPost = {
  id: 'p1',
  name: 'Ada Lovelace',
  handle: '@ada',
  initial: 'A',
  avatarColor: 'bg-violet-500',
  time: '2h',
  content: 'first program',
  author: 'ada',
  likes: '10',
  comments: '2',
  reposts: '1',
  likesCount: 10,
  commentsCount: 2,
  repostsCount: 1,
  createdAt: '2026-07-23T00:00:00Z',
  engagementScore: 100,
  tags: ['math'],
};

const noop = () => {};

describe('TrendingCard rank badge', () => {
  it('marks #1 with a gold flame badge', () => {
    render(
      <TrendingCard post={basePost} rank={1} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const badge = screen.getByTestId('trending-rank');
    expect(badge).toHaveTextContent('#1');
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('number one'));
  });

  it('labels #2-3 as top three', () => {
    render(
      <TrendingCard post={{ ...basePost, id: 'p2' }} rank={3} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByTestId('trending-rank')).toHaveAttribute('aria-label', expect.stringContaining('top three'));
  });

  it('labels #4+ as plain trending', () => {
    render(
      <TrendingCard post={{ ...basePost, id: 'p4' }} rank={7} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const badge = screen.getByTestId('trending-rank');
    expect(badge).toHaveTextContent('#7');
    expect(badge.getAttribute('aria-label')).toBe('Rank 7, trending');
  });
});

describe('TrendingCard interactions', () => {
  it('fires like/repost handlers when interactive', () => {
    const onLike = vi.fn();
    const onRepost = vi.fn();
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={onLike} onComment={noop} onRepost={onRepost} />,
    );
    fireEvent.click(screen.getByLabelText(/Like,/));
    fireEvent.click(screen.getByLabelText(/Repost,/));
    expect(onLike).toHaveBeenCalledWith('p1');
    expect(onRepost).toHaveBeenCalledWith('p1');
  });

  it('renders read-only counts with no buttons when readOnly', () => {
    const onLike = vi.fn();
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} readOnly onLike={onLike} onComment={noop} onRepost={noop} />,
    );
    expect(screen.queryByRole('button', { name: /Like,/ })).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Like,/).tagName).toBe('SPAN');
  });

  it('does not change displayed counts on like/repost click', () => {
    const onLike = vi.fn();
    const onRepost = vi.fn();
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={onLike} onComment={noop} onRepost={onRepost} />,
    );
    const likeBtn = screen.getByLabelText(/Like, 10 likes/);
    const repostBtn = screen.getByLabelText(/Repost, 1 reposts/);
    fireEvent.click(likeBtn);
    fireEvent.click(repostBtn);
    expect(likeBtn).toHaveTextContent('10');
    expect(repostBtn).toHaveTextContent('1');
  });

  it('renders a share button', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByLabelText('Share')).toBeInTheDocument();
  });

  it('renders author name as a deep link to /u/:username', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const authorLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(authorLink).toHaveAttribute('href', expect.stringContaining('/u/'));
    expect(authorLink).toHaveAttribute('target', '_blank');
    expect(authorLink).toHaveAttribute('rel', 'noopener');
  });
});

describe('TrendingCard comment panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('opens inline comment panel on comment click', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.queryByTestId('comment-panel')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Comment,/));
    expect(screen.getByTestId('comment-panel')).toBeInTheDocument();
  });

  it('closes panel on second comment click', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const btn = screen.getByLabelText(/Comment,/);
    fireEvent.click(btn);
    expect(screen.getByTestId('comment-panel')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByTestId('comment-panel')).not.toBeInTheDocument();
  });

  it('shows empty state when no comments exist', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByLabelText(/Comment,/));
    await waitFor(() => expect(screen.getByTestId('comment-panel')).toBeInTheDocument());
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('shows comment textarea and send button', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByLabelText(/Comment,/));
    const panel = screen.getByTestId('comment-panel');
    expect(within(panel).getByPlaceholderText(/Add a comment/)).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Post comment' })).toBeInTheDocument();
  });
});

const jsonOk = (body: unknown) => ({
  ok: true,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(body),
});

function makeDiscoveryPosts(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    author: `user${i}`,
    service: 'public_posts',
    post_id: `post-${i}`,
    body_text: `post number ${i}`,
    tags: i % 2 === 0 ? ['art'] : ['code'],
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
    engagement: { likes: 100 - i, comments: 5, reposts: 2 },
    engagement_score: 1000 - i * 10,
  }));
}

describe('Trending page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders a ranked grid and the Top 10 sidebar from the discovery API', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(20)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    expect(screen.getAllByTestId('trending-card')).toHaveLength(20);
    const sidebar = screen.getByTestId('trending-sidebar');
    expect(within(sidebar).getAllByTestId('trending-sidebar-entry')).toHaveLength(10);
  });

  it('shows Load more when a full page returns, and fetches the next page', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(20)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    const loadMore = await screen.findByTestId('trending-load-more');
    const discoverBodies = () =>
      vi.mocked(fetch).mock.calls
        .filter(c => String(c[0]).includes('/discover/posts'))
        .map(c => String(c[1]?.body));
    expect(discoverBodies()).toEqual([
      '{"query":{"sort":"trending","limit":20,"services":"public_posts"}}',
      '{"query":{"sort":"recent","limit":20,"services":"public_posts"}}',
    ]);
    fireEvent.click(loadMore);
    await waitFor(() =>
      expect(discoverBodies()).toContain('{"query":{"sort":"trending","limit":40,"services":"public_posts"}}'),
    );
  });

  it('renders the empty story beat when the network is quiet', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk([]) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-empty')).toBeInTheDocument());
    expect(screen.getByText('The network is quiet')).toBeInTheDocument();
    expect(screen.getByTestId('trending-empty-cta')).toHaveAttribute('href');
  });

  it('filters the grid by topic chip', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(20)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const codeChip = screen.getAllByTestId('trending-topic').find(el => el.textContent === '#code');
    expect(codeChip).toBeDefined();
    fireEvent.click(codeChip!);
    await waitFor(() => expect(screen.getAllByTestId('trending-card')).toHaveLength(10));
  });

  it('like/repost click does not change displayed counts (funnels to social)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(20)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const firstCard = screen.getAllByTestId('trending-card')[0];
    const likeBtn = within(firstCard).getByLabelText(/Like,/);
    const beforeText = likeBtn.textContent;
    fireEvent.click(likeBtn);
    expect(likeBtn.textContent).toBe(beforeText);
    expect(window.open).toHaveBeenCalledOnce();
  });
});

// ── D-trending-knobs: knob rack, presets, mix code, re-ranking ──────────────

describe('Knob rack renders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows the knob rack with 5 knobs and 3 presets after load', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(10)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('knob-rack')).toBeInTheDocument());
    expect(screen.getByTestId('knob-recency')).toBeInTheDocument();
    expect(screen.getByTestId('knob-likes')).toBeInTheDocument();
    expect(screen.getByTestId('knob-comments')).toBeInTheDocument();
    expect(screen.getByTestId('knob-time')).toBeInTheDocument();
    expect(screen.getByTestId('knob-character')).toBeInTheDocument();
    expect(screen.getByTestId('preset-newest')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-loved')).toBeInTheDocument();
    expect(screen.getByTestId('preset-balanced')).toBeInTheDocument();
  });
});

describe('Knob re-ranking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('twisting a knob reshuffles the grid with zero network requests', async () => {
    // Two posts close in age but very different in engagement. Balanced
    // default (recency + likes + comments weighted, p = -1 "Flat") should
    // still favor the high-engagement post. "Most loved · all time"
    // (likes only, half-life ∞) also favors it. "Newest" should flip to
    // the newer post.
    const now = Date.now();
    const posts = [
      {
        author: 'older',
        service: 'public_posts',
        post_id: 'older-post',
        body_text: 'older high-engagement',
        tags: ['test'],
        created_at: new Date(now - 2 * 3600_000).toISOString(), // 2h ago
        engagement: { likes: 9999, comments: 999, reposts: 999 },
        engagement_score: 99999,
      },
      {
        author: 'newer',
        service: 'public_posts',
        post_id: 'newer-post',
        body_text: 'newer low-engagement',
        tags: ['test'],
        created_at: new Date(now - 10 * 60_000).toISOString(), // 10m ago
        engagement: { likes: 1, comments: 0, reposts: 0 },
        engagement_score: 1,
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonOk(posts) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const initialCards = screen.getAllByTestId('trending-card');
    const initialOrder = initialCards.map(c => c.id);
    const fetchCount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/discover/posts'),
    ).length;
    // Click the "Newest" preset — should reorder to put the newer post first
    fireEvent.click(screen.getByTestId('preset-newest'));
    await waitFor(() => {
      const newCards = screen.getAllByTestId('trending-card');
      const newOrder = newCards.map(c => c.id);
      return expect(newOrder).not.toEqual(initialOrder);
    });
    // No new /discover/posts calls after the preset click
    expect(vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/discover/posts'),
    ).length).toBe(fetchCount);
  });
});

describe('Preset behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('Newest preset sorts newest first regardless of engagement', async () => {
    const posts = [
      {
        author: 'old',
        service: 'public_posts',
        post_id: 'old-post',
        body_text: 'old post',
        tags: ['test'],
        created_at: '2020-01-01T00:00:00Z',
        engagement: { likes: 9999, comments: 9999, reposts: 9999 },
        engagement_score: 99999,
      },
      {
        author: 'new',
        service: 'public_posts',
        post_id: 'new-post',
        body_text: 'new post',
        tags: ['test'],
        created_at: new Date().toISOString(),
        engagement: { likes: 0, comments: 0, reposts: 0 },
        engagement_score: 0,
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonOk(posts) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-newest'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('trending-card');
      expect(cards[0]).toHaveAttribute('id', 'trending-card-new-post');
    });
  });

  it('Most loved preset ignores age', async () => {
    const posts = [
      {
        author: 'new',
        service: 'public_posts',
        post_id: 'new-post',
        body_text: 'new post',
        tags: ['test'],
        created_at: new Date().toISOString(),
        engagement: { likes: 1, comments: 0, reposts: 0 },
        engagement_score: 1,
      },
      {
        author: 'old',
        service: 'public_posts',
        post_id: 'old-post',
        body_text: 'old post',
        tags: ['test'],
        created_at: '2020-01-01T00:00:00Z',
        engagement: { likes: 9999, comments: 0, reposts: 0 },
        engagement_score: 99999,
      },
    ];
    vi.mocked(fetch).mockResolvedValue(jsonOk(posts) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-most-loved'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('trending-card');
      expect(cards[0]).toHaveAttribute('id', 'trending-card-old-post');
    });
  });
});

describe('Mix code URL round-trip', () => {
  it('encodes and decodes a knob state', async () => {
    const { encodeMix, decodeMix } = await import('@/lib/powerMean');
    const state = { recency: 4, likes: 0, comments: 2, halfLife: 1, character: 3 };
    const code = encodeMix(state);
    expect(code).toMatch(/^\d{5}$/);
    const decoded = decodeMix(code);
    expect(decoded).toEqual(state);
  });
});

// ── D-video-autoplay-muted: video autoplay muted on /trending cards ──────────

describe('TrendingCard video media', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    // Mock IntersectionObserver
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    // Mock matchMedia (needed for prefers-reduced-motion check)
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('renders a video element for video posts', async () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'video-post',
      media: 'video',
      mediaRefs: ['ref-1'],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // Should show skeleton initially, then trending-media
    expect(screen.getByTestId('trending-media-skeleton')).toBeInTheDocument();
  });

  it('renders an image for image posts (unchanged)', async () => {
    const imagePost: FeedPost = {
      ...basePost,
      id: 'image-post',
      media: 'image',
      mediaRefs: ['ref-1'],
      firstAttachmentMime: 'image/jpeg',
      author: 'testuser',
    };
    render(
      <TrendingCard post={imagePost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByTestId('trending-media-skeleton')).toBeInTheDocument();
  });

  it('renders placeholder when no media refs for video', async () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'video-post',
      media: 'video',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // No media refs means MediaPlaceholder renders immediately
    expect(screen.queryByTestId('trending-media')).not.toBeInTheDocument();
    expect(screen.queryByTestId('trending-media-skeleton')).not.toBeInTheDocument();
  });
});

// ── D-trending-views: view toggle + YouTube view ─────────────────────────────

function makeDiscoveryPostsMedia(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    author: `user${i}`,
    service: 'public_posts',
    post_id: `post-media-${i}`,
    body_text: `media post number ${i}`,
    tags: i % 3 === 0 ? ['video'] : i % 3 === 1 ? ['image'] : ['text'],
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
    engagement: { likes: 50 - i, comments: 3, reposts: 1 },
    engagement_score: 500 - i * 5,
    media_refs: i % 3 !== 2 ? [`ref-${i}`] : undefined,
    first_attachment_mime: i % 3 === 0 ? 'video/mp4' : i % 3 === 1 ? 'image/jpeg' : undefined,
  }));
}

describe('Trending view toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the view toggle with Grid and YouTube buttons after load', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(10)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    expect(screen.getByTestId('view-toggle-grid')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-youtube')).toBeInTheDocument();
  });

  it('shows the grid view by default (no ?view= param)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(10)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('trending-youtube-grid')).not.toBeInTheDocument();
  });

  it('switches to YouTube view when clicking the YouTube button', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPostsMedia(6)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
  });

  it('switches back to grid view when clicking the Grid button', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPostsMedia(6)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-grid'));
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
  });

  it('YouTube view shows only media posts (video + image, not text-only)', async () => {
    // 6 posts: 2 video, 2 image, 2 text-only
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPostsMedia(6)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
    // Should show 4 media cards (2 video + 2 image), not 6
    expect(screen.getAllByTestId('youtube-card')).toHaveLength(4);
  });

  it('YouTube view shows empty state when no media posts exist', async () => {
    const textOnlyPosts = Array.from({ length: 5 }, (_, i) => ({
      author: `user${i}`,
      service: 'public_posts',
      post_id: `text-only-${i}`,
      body_text: `text post ${i}`,
      tags: ['text'],
      created_at: new Date().toISOString(),
      engagement: { likes: 10, comments: 1, reposts: 0 },
      engagement_score: 100,
    }));
    vi.mocked(fetch).mockResolvedValue(jsonOk(textOnlyPosts) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByText('No media posts yet')).toBeInTheDocument());
  });
});

describe('YouTubeCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('renders a YouTubeCard with 16:9 thumbnail area for a video post', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-video',
      media: 'video',
      mediaRefs: ['ref-1'],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} rank={1} />);
    expect(screen.getByTestId('youtube-card')).toBeInTheDocument();
    expect(screen.getByTestId('trending-media-skeleton')).toBeInTheDocument();
  });

  it('renders a YouTubeCard with content as title and author link', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const imagePost: FeedPost = {
      ...basePost,
      id: 'yt-image',
      media: 'image',
      mediaRefs: ['ref-1'],
      firstAttachmentMime: 'image/jpeg',
      author: 'testuser',
    };
    render(<YouTubeCard post={imagePost} />);
    expect(screen.getByTestId('youtube-card')).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText('2h')).toBeInTheDocument();
  });
});

// ── D-deep-links marketing retarget: deep link URLs ─────────────────────────

describe('TrendingCard deep links', () => {
  it('author link points to /u/:username', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const authorLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(authorLink.getAttribute('href')).toMatch(/\/u\/ada$/);
  });

  it('post content links to /u/:username/p/:postId', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const contentLink = screen.getByRole('link', { name: /first program/ });
    expect(contentLink.getAttribute('href')).toMatch(/\/u\/ada\/p\/p1$/);
  });

  it('tag badges link to /discover?tag=', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const tagLink = screen.getByText('#math');
    expect(tagLink.tagName).toBe('A');
    expect(tagLink.getAttribute('href')).toMatch(/\/discover\?tag=math$/);
  });

  it('falls back to SOCIAL_ORIGIN when author is missing', () => {
    render(
      <TrendingCard post={{ ...basePost, author: undefined }} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const authorLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(authorLink.getAttribute('href')).toMatch(/social\.web10\.app$/);
  });
});

describe('YouTubeCard deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it('wraps the card in a link to /u/:username/p/:postId', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-video',
      media: 'video',
      mediaRefs: ['ref-1'],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} rank={1} />);
    const card = screen.getByTestId('youtube-card');
    expect(card.tagName).toBe('A');
    expect(card.getAttribute('href')).toMatch(/\/u\/testuser\/p\/yt-video$/);
    expect(card.getAttribute('target')).toBe('_blank');
  });

  it('falls back to SOCIAL_ORIGIN when author is missing', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const post: FeedPost = {
      ...basePost,
      author: undefined,
    };
    render(<YouTubeCard post={post} />);
    const card = screen.getByTestId('youtube-card');
    expect(card.getAttribute('href')).toMatch(/social\.web10\.app$/);
  });
});

describe('InlineCommentPanel deep links', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('comment entries link to /u/:username/p/:postId?comment=:id', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        {
          _id: 'comment-123',
          payload: { action: 'comment', text: 'great post!', author_username: 'replybot' },
          author: 'replybot',
          created_at: new Date().toISOString(),
        },
      ]),
    } as unknown as Response);
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByLabelText(/Comment,/));
    await waitFor(() => expect(screen.getByTestId('comment-panel')).toBeInTheDocument());
    const commentEntry = await screen.findByTestId('comment-entry');
    expect(commentEntry.tagName).toBe('A');
    const href = commentEntry.getAttribute('href');
    expect(href).toMatch(/\/u\/ada\/p\/p1\?comment=comment-123$/);
  });

  it('comment compose button opens post permalink', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByLabelText(/Comment,/));
    const panel = screen.getByTestId('comment-panel');
    const sendBtn = within(panel).getByRole('button', { name: 'Post comment' });
    fireEvent.click(sendBtn);
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/\/u\/ada\/p\/p1$/),
      '_blank',
    );
  });
});