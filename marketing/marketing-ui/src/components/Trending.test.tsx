import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendingCard, parseCreatedAt, type FeedPost } from '@/components/FeedPreview';

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
    const badge = screen.getByTestId('discover-rank-badge');
    expect(badge).toHaveTextContent('#1');
    expect(badge).toHaveAttribute('aria-label', expect.stringContaining('number one'));
  });

  it('labels #2-3 as top three', () => {
    render(
      <TrendingCard post={{ ...basePost, id: 'p2' }} rank={3} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByTestId('discover-rank-badge')).toHaveAttribute('aria-label', expect.stringContaining('top three'));
  });

  it('labels #4+ as plain trending', () => {
    render(
      <TrendingCard post={{ ...basePost, id: 'p4' }} rank={7} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const badge = screen.getByTestId('discover-rank-badge');
    expect(badge).toHaveTextContent('#7');
    expect(badge.getAttribute('aria-label')).toBe('Rank 7');
  });
});

describe('TrendingCard interactions', () => {
  it('renders the like as a display-only count (remote mode: anon can\'t like)', () => {
    const onLike = vi.fn();
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={onLike} onComment={noop} onRepost={noop} />,
    );
    // Remote mode: the like is a display span (a count), not a tappable button.
    expect(screen.getByLabelText('10 likes')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Like,/ })).not.toBeInTheDocument();
    // Tapping the display like does nothing (no handler — anon can't like).
    fireEvent.click(screen.getByLabelText('10 likes'));
    expect(onLike).not.toHaveBeenCalled();
  });

  it('renders the comment as a tappable button (opens the thread)', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByTestId('comment-button')).toBeInTheDocument();
  });

  it('does not change displayed counts on like tap (display-only)', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const like = screen.getByLabelText('10 likes');
    fireEvent.click(like);
    expect(like).toHaveTextContent('10');
  });

  it('renders a share signal', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByLabelText('Share')).toBeInTheDocument();
  });

  it('renders author name as a deep link to /u/:username', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // Remote mode: the author (avatar + name) links to the profile on social.
    const authorLinks = screen.getAllByRole('link', { name: /Ada Lovelace/ });
    expect(authorLinks.length).toBeGreaterThan(0);
    for (const link of authorLinks) {
      expect(link).toHaveAttribute('href', expect.stringContaining('/u/'));
      expect(link).toHaveAttribute('target', '_blank');
    }
  });
});

describe('TrendingCard comment thread', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('opens the shared comment thread on comment click', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('comment-button'));
    expect(screen.getByTestId('comment-thread')).toBeInTheDocument();
  });

  it('closes the thread on second comment click', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const btn = screen.getByTestId('comment-button');
    fireEvent.click(btn);
    expect(screen.getByTestId('comment-thread')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByTestId('comment-thread')).not.toBeInTheDocument();
  });

  it('remote mode: the compose is a link-out to the post permalink (anon can\'t write)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByTestId('comment-button'));
    const link = await screen.findByTestId('comment-remote-link');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', expect.stringMatching(/\/u\/ada\/p\/p1$/));
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows existing comments (read side is identical on both apps)', async () => {
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
    fireEvent.click(screen.getByTestId('comment-button'));
    await waitFor(() => expect(screen.getByText('great post!')).toBeInTheDocument());
  });
});

describe('TrendingCard featured layout', () => {
  it('featured card never carries a col-span class (one-column grid void regression)', () => {
    // Regression pin (31.07 hotfix): sm:col-span-2 inside grid-cols-1 forced
    // an implicit 0px track — every second card rendered invisible and each
    // visible card stretched to the crushed neighbor's height.
    render(
      <TrendingCard post={basePost} rank={1} featured maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    expect(screen.getByTestId('trending-card').className).not.toMatch(/col-span/);
  });
});

const jsonOk = (body: unknown) => ({
  ok: true,
  headers: new Headers({ 'content-type': 'application/json' }),
  json: () => Promise.resolve(body),
});

// ── v3 discover-group docs (the shape /v3/read returns) ─────────────────────
//
// The component's fetchDiscoverFeed reads the node-default discover group
// through the normal /v3/read path as anon: one posts read + the server-side
// engagement-count shape for reactions + comments (count: true → a
// {ref_value: count} map, GROUP BY ref_value through the engine). The mock
// returns the right shape per service.

function v3Post(i: number, overrides: Record<string, unknown> = {}) {
  return {
    doc_id: `post-${i}`,
    author_key: `user${i}`,
    body: { text: `post number ${i}` },
    tags: i % 2 === 0 ? ['art'] : ['code'],
    created_at: new Date(Date.now() - i * 3600_000).toISOString(),
    ref_value: '',
    service: 'posts',
    ...overrides,
  };
}

function makeV3Posts(n: number) {
  return Array.from({ length: n }, (_, i) => v3Post(i));
}

function makeV3PostsMedia(n: number) {
  return Array.from({ length: n }, (_, i) =>
    v3Post(i, {
      doc_id: `post-media-${i}`,
      body: { text: `media post number ${i}`, media_refs: i % 3 !== 2 ? [`ref-${i}`] : undefined },
      tags: i % 3 === 0 ? ['video'] : i % 3 === 1 ? ['image'] : ['text'],
    }),
  );
}

// Posts whose media_refs arrive PRE-RESOLVED from the v3 read (objects with
// mime_type + read_url) and NO video/image tag — media detection must come
// from the resolved mime_type, not tags.
function makeV3PostsResolvedMedia(n: number) {
  return Array.from({ length: n }, (_, i) =>
    v3Post(i, {
      doc_id: `post-rm-${i}`,
      body: {
        text: `resolved media post ${i}`,
        media_refs: i % 2 === 0
          ? [{ doc_id: `ref-${i}`, object_key: `user${i}/a.mp4`, mime_type: 'video/mp4', read_url: `https://cdn.example.com/v${i}.mp4?sig=x` }]
          : [{ doc_id: `ref-${i}`, object_key: `user${i}/a.jpg`, mime_type: 'image/jpeg', read_url: `https://cdn.example.com/i${i}.jpg?sig=x` }],
      },
      tags: ['untagged'],
    }),
  );
}

// Mock the discover feed fetch. The component reads posts (no count) + the
// server-side engagement-count shape for reactions + comments (count: true →
// a {ref_value: count} map). The mock returns the right shape per service
// (reactions/comments default to {} → zero engagement).
function mockDiscoverFeed(posts: unknown[] = makeV3Posts(20), reactions: Record<string, number> = {}, comments: Record<string, number> = {}) {
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (body?.service === 'posts') return jsonOk(posts);
    if (body?.service === 'reactions') return jsonOk(reactions);
    if (body?.service === 'comments') return jsonOk(comments);
    return jsonOk({});
  });
}

// ── parseCreatedAt: the v3 read returns naive UTC 'YYYY-MM-DD HH:MM:SS' ──────
//
// Regression pin: the v3 rewire switched /trending from the v1 /discover/posts
// endpoint (ISO created_at) to the raw /v3/read group read, which serializes
// created_at as str(datetime) — a naive UTC wall-clock with a SPACE separator.
// Browsers parse the space form as LOCAL time, so for west-of-UTC clocks a
// recent post lands in the future and renders a negative "time ago".
// parseCreatedAt must normalize the naive form to explicit UTC.

describe('parseCreatedAt (naive UTC from the v3 read)', () => {
  it('treats a naive space-separated timestamp as UTC (lands in the past)', () => {
    const twoHoursAgoUtc = new Date(Date.now() - 2 * 3600_000);
    const naive = twoHoursAgoUtc.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    const ms = parseCreatedAt(naive);
    expect(ms).toBeLessThan(Date.now());
    expect(Math.abs(ms - twoHoursAgoUtc.getTime())).toBeLessThan(1000);
  });

  it('handles fractional seconds', () => {
    const d = new Date(Date.now() - 3600_000);
    const naive = d.toISOString().replace('T', ' ').replace('Z', '');
    expect(Math.abs(parseCreatedAt(naive) - d.getTime())).toBeLessThan(10);
  });

  it('parses ISO strings (T / Z) as-is', () => {
    const iso = new Date(Date.now() - 3600_000).toISOString();
    expect(parseCreatedAt(iso)).toBe(new Date(iso).getTime());
  });

  it('never returns a future instant for a just-made naive timestamp', () => {
    const justNowUtc = new Date(Date.now() - 5_000);
    const naive = justNowUtc.toISOString().replace('T', ' ').replace('Z', '').split('.')[0];
    expect(parseCreatedAt(naive)).toBeLessThanOrEqual(Date.now());
  });
});

describe('Trending page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders a ranked grid and the Top 10 sidebar from the discovery API', async () => {
    mockDiscoverFeed();
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    expect(screen.getAllByTestId('trending-card')).toHaveLength(20);
    const sidebar = screen.getByTestId('trending-sidebar');
    expect(within(sidebar).getAllByTestId('trending-sidebar-entry')).toHaveLength(10);
  });

  it('shows Load more when a full page returns, and fetches the next page', async () => {
    mockDiscoverFeed();
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    const loadMore = await screen.findByTestId('trending-load-more');
    // The component reads the discover group via /v3/read (anon). Load more
    // re-reads with a higher page limit → more /v3/read calls.
    const readCalls = () =>
      vi.mocked(fetch).mock.calls.filter(c => String(c[0]).includes('/v3/read')).length;
    const initialCalls = readCalls();
    expect(initialCalls).toBeGreaterThan(0);
    fireEvent.click(loadMore);
    await waitFor(() => expect(readCalls()).toBeGreaterThan(initialCalls));
  });

  it('renders the empty story beat when the network is quiet', async () => {
    mockDiscoverFeed([]);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-empty')).toBeInTheDocument());
    expect(screen.getByText('The network is quiet')).toBeInTheDocument();
    expect(screen.getByTestId('trending-empty-cta')).toHaveAttribute('href');
  });

  it('filters the grid by topic chip', async () => {
    mockDiscoverFeed();
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const codeChip = screen.getAllByTestId('trending-topic').find(el => el.textContent === '#code');
    expect(codeChip).toBeDefined();
    fireEvent.click(codeChip!);
    await waitFor(() => expect(screen.getAllByTestId('trending-card')).toHaveLength(10));
  });

  it('like is display-only in remote mode (anon can\'t like; no count change)', async () => {
    mockDiscoverFeed();
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const firstCard = screen.getAllByTestId('trending-card')[0];
    // Remote mode: the like is a display span (a count), not a tappable button.
    const like = within(firstCard).getByLabelText(/likes$/);
    const beforeText = like.textContent;
    fireEvent.click(like);
    expect(like.textContent).toBe(beforeText);
    // No interactive like → no window.open (the anon visitor can't like).
    expect(window.open).not.toHaveBeenCalled();
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

  it('shows the knob rack with 3 knobs and 3 presets after load', async () => {
    mockDiscoverFeed(makeV3Posts(10));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('knob-rack')).toBeInTheDocument());
    expect(screen.getByTestId('knob-recency')).toBeInTheDocument();
    expect(screen.getByTestId('knob-likes')).toBeInTheDocument();
    expect(screen.getByTestId('knob-comments')).toBeInTheDocument();
    // The Character knob (the power-mean exponent) is gone — parity with the
    // social app; the exponent is fixed at the middle (p = 0).
    expect(screen.queryByTestId('knob-character')).not.toBeInTheDocument();
    // The Time knob (the recency half-life) is gone too — the half-life is
    // fixed at the middle (1 day).
    expect(screen.queryByTestId('knob-time')).not.toBeInTheDocument();
    expect(screen.getByTestId('preset-most-recent')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-liked')).toBeInTheDocument();
    expect(screen.getByTestId('preset-most-commented')).toBeInTheDocument();
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
    // default (recency + likes + comments weighted) should favor the
    // high-engagement post; "Newest" flips to the newer post.
    const now = Date.now();
    const posts = [
      v3Post(0, { doc_id: 'older-post', author_key: 'older', body: { text: 'older high-engagement' }, tags: ['test'], created_at: new Date(now - 2 * 3600_000).toISOString() }),
      v3Post(1, { doc_id: 'newer-post', author_key: 'newer', body: { text: 'newer low-engagement' }, tags: ['test'], created_at: new Date(now - 10 * 60_000).toISOString() }),
    ];
    // The older post has 5 reactions (high engagement); the newer post has 1.
    const reactions: Record<string, number> = { 'older-post': 5, 'newer-post': 1 };
    mockDiscoverFeed(posts, reactions);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    const initialCards = screen.getAllByTestId('trending-card');
    const initialOrder = initialCards.map(c => c.id);
    const fetchCount = vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/v3/read'),
    ).length;
    // Click the "Newest" preset — should reorder to put the newer post first
    fireEvent.click(screen.getByTestId('preset-most-recent'));
    await waitFor(() => {
      const newCards = screen.getAllByTestId('trending-card');
      const newOrder = newCards.map(c => c.id);
      return expect(newOrder).not.toEqual(initialOrder);
    });
    // No new /v3/read calls after the preset click (client-side re-rank)
    expect(vi.mocked(fetch).mock.calls.filter(
      c => String(c[0]).includes('/v3/read'),
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

  it('Most recent preset sorts newest first regardless of engagement', async () => {
    const posts = [
      v3Post(0, { doc_id: 'old-post', author_key: 'old', body: { text: 'old post' }, tags: ['test'], created_at: '2020-01-01T00:00:00Z' }),
      v3Post(1, { doc_id: 'new-post', author_key: 'new', body: { text: 'new post' }, tags: ['test'], created_at: new Date().toISOString() }),
    ];
    // The old post has 5 reactions (high engagement); the new post has none.
    const reactions: Record<string, number> = { 'old-post': 5 };
    mockDiscoverFeed(posts, reactions);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-most-recent'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('trending-card');
      expect(cards[0]).toHaveAttribute('id', 'trending-card-new-post');
    });
  });

  it('Most liked preset ignores age', async () => {
    const posts = [
      v3Post(0, { doc_id: 'new-post', author_key: 'new', body: { text: 'new post' }, tags: ['test'], created_at: new Date().toISOString() }),
      v3Post(1, { doc_id: 'old-post', author_key: 'old', body: { text: 'old post' }, tags: ['test'], created_at: '2020-01-01T00:00:00Z' }),
    ];
    // The old post has 5 reactions (high engagement); the new post has 1.
    const reactions: Record<string, number> = { 'old-post': 5, 'new-post': 1 };
    mockDiscoverFeed(posts, reactions);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('preset-most-liked'));
    await waitFor(() => {
      const cards = screen.getAllByTestId('trending-card');
      expect(cards[0]).toHaveAttribute('id', 'trending-card-old-post');
    });
  });

  it('a single preset click keeps its chip lit (survives the hashchange round-trip)', async () => {
    // Regression pin (trending-sort-double-click): a preset click calls
    // writeMixToHash, which sets window.location.hash and fires hashchange.
    // The hashchange listener re-reads the mix and used to return
    // `preset: null` (it never matched the decoded state back to a preset),
    // so setActivePreset(null) clobbered the just-clicked chip's highlight —
    // the user had to click TWICE for the chip to light up. readMixFromHash
    // now matches the decoded state to its preset, so the highlight survives.
    window.location.hash = '';
    mockDiscoverFeed();
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('knob-rack')).toBeInTheDocument());

    // Balanced is the default — lit before any click.
    expect(screen.getByTestId('preset-balanced').classList).toContain('border-brand');

    // SINGLE click on "Newest".
    fireEvent.click(screen.getByTestId('preset-most-recent'));
    // Wait for the chip to light, then let the async hashchange round-trip
    // settle and assert the highlight PERSISTS (this is the part that used
    // to be clobbered — the chip went dark ~100ms after the click).
    await waitFor(() => expect(screen.getByTestId('preset-most-recent').classList).toContain('border-brand'));
    await waitFor(() => expect(screen.getByTestId('preset-balanced').classList).not.toContain('border-brand'));
    // Give the hashchange event time to fire and (pre-fix) clobber the state.
    await new Promise((r) => setTimeout(r, 150));
    await waitFor(() => expect(screen.getByTestId('preset-most-recent').classList).toContain('border-brand'));
    expect(screen.getByTestId('preset-balanced').classList).not.toContain('border-brand');
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

  it('renders a video element for video posts (resolved ref → shared VideoPlayer)', async () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'video-post',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x' }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // The shared discover card renders the video through the shared VideoPlayer.
    expect(screen.getByTestId('discover-media-video')).toBeInTheDocument();
    expect(document.querySelector('video')).not.toBeNull();
  });

  it('caps a portrait (9:16) video to a square-ish frame (the card-grid case — the rack is not buried)', () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'portrait-post',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x', width: 720, height: 1280 }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // The trending grid is a card wall — a full-width 9:16 box is ~1.78× the
    // card tall and buries the control rack at its bottom. The card caps the
    // portrait frame (maxWidth) + centers it (mx-auto) in a black letterbox.
    // (Non-transcoded → the file path's InlineVideo; the frame IS the
    // discover-media-video element.)
    const frame = document.querySelector('[data-testid="discover-media-video"]') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.maxWidth).toBe('min(50vh, 100%)');
    expect(frame.className).toMatch(/mx-auto/);
  });

  it('leaves a landscape video full-width in the card (no cap — only portrait is too tall)', () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'landscape-post',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x', width: 1280, height: 720 }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const frame = document.querySelector('[data-testid="discover-media-video"]') as HTMLElement;
    expect(frame).toBeTruthy();
    expect(frame.style.maxWidth).toBe('');
    expect(frame.className).not.toMatch(/mx-auto/);
  });

  it('renders an image for image posts (resolved ref → <img>)', async () => {
    const imagePost: FeedPost = {
      ...basePost,
      id: 'image-post',
      media: 'image',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.jpg', mime_type: 'image/jpeg', read_url: 'https://cdn.example.com/a.jpg?sig=x' }],
      firstAttachmentMime: 'image/jpeg',
      author: 'testuser',
    };
    render(
      <TrendingCard post={imagePost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // An image post renders an <img> (no video element).
    expect(document.querySelector('video')).toBeNull();
    expect(document.querySelector('img')).not.toBeNull();
  });

  it('renders a placeholder when no media refs for video', async () => {
    const videoPost: FeedPost = {
      ...basePost,
      id: 'video-post',
      media: 'video',
    };
    render(
      <TrendingCard post={videoPost} rank={2} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // No media refs → the shared card renders a video placeholder (no media element).
    expect(screen.queryByTestId('discover-media-video')).not.toBeInTheDocument();
    expect(document.querySelector('video')).toBeNull();
  });
});

// ── D-trending-video-thumb: resolved-ref thumbnail + reduced-motion play badge ──
//
// The v3 read serves media_refs pre-resolved with a fresh presigned
// thumbnail_url alongside read_url. The card must use that thumbnail as the
// video poster (normal path) and the <img> source (reduced-motion path) —
// without it the reduced-motion image pointed at the MP4 and rendered a dark
// void, and the reduced-motion play badge was a dead <div> that did nothing.

describe('TrendingMedia resolved-ref thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('IntersectionObserver', class {
      observe = vi.fn();
      disconnect = vi.fn();
    });
    // Normal motion (autoplay path) — the poster assertion.
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

  it('uses the resolved thumbnail_url as the video poster (no presign round-trip)', async () => {
    const readUrl = 'https://cdn.example.com/a.mp4?sig=x';
    const thumbUrl = 'https://cdn.example.com/a-poster.jpg?sig=y';
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-thumb',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: readUrl, thumbnail_url: thumbUrl }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<TrendingCard post={videoPost} rank={1} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />);
    await waitFor(() => expect(screen.getByTestId('discover-media-video')).toBeInTheDocument());
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBe(readUrl);
    expect(video.getAttribute('poster')).toBe(thumbUrl);
    // The resolved path must not hit the network for a presign / thumbnail.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ── The greyed-out-tile fix: a transcoded video plays the node's HLS (H.264/
// AAC) via hls.js, NOT the raw source file (HEVC/AV1 — undecodable in mobile
// Chrome). The shared discover card picks the HLS path on status 'done' +
// manifest_url (sourceFromMedia), the same rule the social app's Discover uses.
describe('TrendingMedia transcoded HLS (the greyed-out-tile fix)', () => {
  class FakeHls {
    static instances: FakeHls[] = [];
    loadSource = vi.fn();
    attachMedia = vi.fn();
    destroy = vi.fn();
    on = vi.fn();
    currentLevel = -1;
    levels = [];
    constructor() { FakeHls.instances.push(this); }
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
    vi.stubGlobal('IntersectionObserver', class { observe = vi.fn(); disconnect = vi.fn(); });
    FakeHls.instances = [];
    (FakeHls as unknown as { isSupported: () => boolean }).isSupported = () => true;
    (FakeHls as unknown as { Events: Record<string, string> }).Events = { ERROR: 'error', MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched' };
    (window as unknown as { Hls: unknown }).Hls = FakeHls as unknown;
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({ matches: false, media: '', onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() }),
    });
  });

  it('a transcoded video plays the HLS manifest (not the raw HEVC file)', async () => {
    const readUrl = 'https://cdn.example.com/a.mp4?sig=x'; // the raw source (HEVC)
    const thumbUrl = 'https://cdn.example.com/a-poster.jpg?sig=y';
    const videoPost: FeedPost = {
      ...basePost,
      id: 'hls-post',
      media: 'video',
      mediaRefs: [{
        doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4',
        read_url: readUrl, thumbnail_url: thumbUrl,
        transcoding_settings: { enabled: true, status: 'done', manifest_url: '/v3/media/hls/manifest?doc_id=ref-1&sig=z', variants: [{ width: 1280, height: 720 }] },
      }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<TrendingCard post={videoPost} rank={1} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />);
    // The shared card plays the transcoded HLS (hls.js attached)…
    await waitFor(() => expect(FakeHls.instances.length).toBeGreaterThan(0));
    expect(FakeHls.instances[0].loadSource).toHaveBeenCalledWith(expect.stringContaining('/v3/media/hls/manifest'));
    // …and the raw source file (read_url) is NOT the video's src (that's the bug).
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video.getAttribute('src')).not.toBe(readUrl);
  });
});

// ── D-trending-views: view toggle + YouTube view ─────────────────────────────

describe('Trending view toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders the view toggle with Grid and YouTube buttons after load', async () => {
    mockDiscoverFeed(makeV3Posts(10));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    expect(screen.getByTestId('view-toggle-grid')).toBeInTheDocument();
    expect(screen.getByTestId('view-toggle-youtube')).toBeInTheDocument();
  });

  it('shows the grid view by default (no ?view= param)', async () => {
    mockDiscoverFeed(makeV3Posts(10));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    expect(screen.queryByTestId('trending-youtube-grid')).not.toBeInTheDocument();
  });

  it('switches to YouTube view when clicking the YouTube button', async () => {
    mockDiscoverFeed(makeV3PostsMedia(6));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
  });

  it('switches back to grid view when clicking the Grid button', async () => {
    mockDiscoverFeed(makeV3PostsMedia(6));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-grid'));
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
  });

  it('YouTube view shows videos only (competing with YouTube — no photos)', async () => {
    // 6 posts: 2 video, 2 image, 2 text-only
    mockDiscoverFeed(makeV3PostsMedia(6));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
    // Videos only: 2 video cards (the 2 image + 2 text-only are excluded).
    expect(screen.getAllByTestId('youtube-card')).toHaveLength(2);
  });

  it('YouTube view shows video posts with resolved media refs (mime from the read, no tag needed)', async () => {
    // Regression pin: the v3 read serves media_refs pre-resolved (objects with
    // mime_type). Video detection must come from the resolved mime_type, not
    // tags — these posts have no video tag.
    mockDiscoverFeed(makeV3PostsResolvedMedia(4));
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-view-toggle')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('view-toggle-youtube'));
    await waitFor(() => expect(screen.getByTestId('trending-youtube-grid')).toBeInTheDocument());
    // 2 of the 4 are videos (resolved mime_type video/mp4) → 2 cards.
    expect(screen.getAllByTestId('youtube-card')).toHaveLength(2);
  });

  it('YouTube view shows empty state when no media posts exist', async () => {
    const textOnlyPosts = Array.from({ length: 5 }, (_, i) =>
      v3Post(i, { doc_id: `text-only-${i}`, body: { text: `text post ${i}` }, tags: ['text'], created_at: new Date().toISOString() }),
    );
    mockDiscoverFeed(textOnlyPosts);
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

  it('renders the shared discover card for a video post (16:9 media)', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-video',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x' }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} rank={1} />);
    expect(screen.getByTestId('youtube-card')).toBeInTheDocument();
    // The shared card renders the video through the shared VideoPlayer.
    expect(screen.getByTestId('discover-media-video')).toBeInTheDocument();
  });

  it('renders the shared discover card with the display name + post text', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-text',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x' }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} />);
    expect(screen.getByTestId('youtube-card')).toBeInTheDocument();
    // The display name (post.name) is shown…
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    // …and the post text is the content.
    expect(screen.getByText('first program')).toBeInTheDocument();
  });

  it('uses the resolved read_url directly (no presign round-trip)', async () => {
    // Regression pin: the v3 read serves media_refs pre-resolved with a fresh
    // presigned read_url. The shared card renders it directly instead of
    // calling the (owner-scoped, token-gated) presign endpoints.
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const readUrl = 'https://cdn.example.com/a.mp4?sig=x';
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-resolved',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: readUrl }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} rank={1} />);
    await waitFor(() => expect(screen.getByTestId('discover-media-video')).toBeInTheDocument());
    const video = document.querySelector('video') as HTMLVideoElement;
    expect(video).not.toBeNull();
    expect(video.getAttribute('src')).toBe(readUrl);
    // The resolved path must not hit the network for a presign.
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ── D-deep-links marketing retarget: deep link URLs ─────────────────────────

describe('TrendingCard deep links', () => {
  it('author link points to /u/:username', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // Remote mode: the author (avatar + name) links to the profile on social.
    const authorLinks = screen.getAllByRole('link', { name: /Ada Lovelace/ });
    expect(authorLinks.length).toBeGreaterThan(0);
    expect(authorLinks[0].getAttribute('href')).toMatch(/\/u\/ada$/);
  });

  it('post content links to /u/:username/p/:postId (remote mode: click → social)', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const contentLink = screen.getByRole('link', { name: /first program/ });
    expect(contentLink.getAttribute('href')).toMatch(/\/u\/ada\/p\/p1$/);
  });

  it('tag badges are display-only (the shared card does not link tags)', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const tag = screen.getByText('#math');
    // The shared discover card renders tags as plain spans (parity with the
    // social app's Discover) — not links.
    expect(tag.tagName).toBe('SPAN');
  });

  it('author falls back to the handle-derived username when author is missing', () => {
    render(
      <TrendingCard post={{ ...basePost, author: undefined }} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // The card derives the author from the handle (@ada → ada).
    const authorLinks = screen.getAllByRole('link', { name: /Ada Lovelace/ });
    expect(authorLinks[0].getAttribute('href')).toMatch(/\/u\/ada$/);
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

  it('the post text links to /u/:username/p/:postId (remote mode: click → social)', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const videoPost: FeedPost = {
      ...basePost,
      id: 'yt-video',
      media: 'video',
      mediaRefs: [{ doc_id: 'ref-1', object_key: 'u/a.mp4', mime_type: 'video/mp4', read_url: 'https://cdn.example.com/a.mp4?sig=x' }],
      firstAttachmentMime: 'video/mp4',
      author: 'testuser',
    };
    render(<YouTubeCard post={videoPost} rank={1} />);
    // The shared card is an <article>; the post text is the link-out to social.
    expect(screen.getByTestId('youtube-card').tagName).toBe('ARTICLE');
    const contentLink = screen.getByRole('link', { name: /first program/ });
    expect(contentLink.getAttribute('href')).toMatch(/\/u\/testuser\/p\/yt-video$/);
    expect(contentLink.getAttribute('target')).toBe('_blank');
  });

  it('author falls back to the handle-derived username when author is missing', async () => {
    const { YouTubeCard } = await import('@/components/FeedPreview');
    const post: FeedPost = {
      ...basePost,
      author: undefined,
    };
    render(<YouTubeCard post={post} />);
    const authorLinks = screen.getAllByRole('link', { name: /Ada Lovelace/ });
    expect(authorLinks[0].getAttribute('href')).toMatch(/\/u\/ada$/);
  });
});

describe('Comment thread deep links (remote mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
  });

  it('shows existing comments (read side is identical on both apps)', async () => {
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
    fireEvent.click(screen.getByTestId('comment-button'));
    await waitFor(() => expect(screen.getByText('great post!')).toBeInTheDocument());
  });

  it('remote compose is a link-out to the post permalink (anon can\'t write)', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    fireEvent.click(screen.getByTestId('comment-button'));
    const link = await screen.findByTestId('comment-remote-link');
    expect(link.getAttribute('href')).toMatch(/\/u\/ada\/p\/p1$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

// ── M1: the People + Groups subtabs ─────────────────────────────────────────

describe('TrendingPeople (M1)', () => {
  it('renders the people grid from the D0 read', async () => {
    const { TrendingPeople } = await import('@/components/TrendingPeople');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        users: [
          { username: 'nova', follower_count: 128, profile: { display_name: 'Nova' } },
          { username: 'kai', follower_count: 512, profile: { display_name: 'Kai' } },
        ],
        limit: 24,
        offset: 0,
      }),
    } as unknown as Response);
    render(<TrendingPeople />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-people-grid')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('trending-person-card')).toHaveLength(2);
    expect(screen.getByText('Nova')).toBeInTheDocument();
    expect(screen.getByText('Kai')).toBeInTheDocument();
  });

  it('shows the quiet state when the D0 read returns no users', async () => {
    const { TrendingPeople } = await import('@/components/TrendingPeople');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: [], limit: 24, offset: 0 }),
    } as unknown as Response);
    render(<TrendingPeople />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-people-empty')).toBeInTheDocument();
    });
  });

  it('shows the error state when the D0 read fails', async () => {
    const { TrendingPeople } = await import('@/components/TrendingPeople');
    // A network error (fetch throws) triggers the error state. A non-ok
    // response is treated as an empty list (the component degrades gracefully).
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    render(<TrendingPeople />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-people-error')).toBeInTheDocument();
    });
  });
});

describe('TrendingGroups (M1)', () => {
  it('renders the groups grid from the D53 read', async () => {
    const { TrendingGroups } = await import('@/components/TrendingGroups');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        groups: [
          { group_id: 'web10/groups/users/nova/synthwave', name: 'synthwave', owner: 'nova', slug: 'synthwave', join_policy: 'open', member_count: 128, permission_summary: 'member: readAll' },
          { group_id: 'web10/groups/users/kai/lofi', name: 'lofi', owner: 'kai', slug: 'lofi', join_policy: 'request', member_count: 512, permission_summary: 'member: readAll' },
        ],
        limit: 24,
        offset: 0,
      }),
    } as unknown as Response);
    render(<TrendingGroups />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-groups-grid')).toBeInTheDocument();
    });
    expect(screen.getAllByTestId('trending-group-card')).toHaveLength(2);
    const names = screen.getAllByTestId('trending-group-name');
    expect(names[0]).toHaveTextContent('Synthwave');
    expect(names[1]).toHaveTextContent('Lofi');
  });

  it('shows the empty state when the D53 read returns no groups', async () => {
    const { TrendingGroups } = await import('@/components/TrendingGroups');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: [], limit: 24, offset: 0 }),
    } as unknown as Response);
    render(<TrendingGroups />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-groups-empty')).toBeInTheDocument();
    });
  });
});

describe('Trending subtab row (M1)', () => {
  it('renders the Posts | People | Groups tabs with Posts active by default', async () => {
    const { default: Trending } = await import('@/pages/Trending');
    // Mock the posts feed read (the existing /v3/read call).
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    } as unknown as Response);
    render(<Trending />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-tab-row')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trending-tab-posts')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('trending-tab-people')).toHaveAttribute('aria-selected', 'false');
    expect(screen.getByTestId('trending-tab-groups')).toHaveAttribute('aria-selected', 'false');
  });

  it('switches to the People subtab on click', async () => {
    const { default: Trending } = await import('@/pages/Trending');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ users: [], limit: 24, offset: 0 }),
    } as unknown as Response);
    render(<Trending />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-tab-row')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('trending-tab-people'));
    await waitFor(() => {
      expect(screen.getByTestId('trending-people-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trending-tab-people')).toHaveAttribute('aria-selected', 'true');
  });

  it('switches to the Groups subtab on click', async () => {
    const { default: Trending } = await import('@/pages/Trending');
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ groups: [], limit: 24, offset: 0 }),
    } as unknown as Response);
    render(<Trending />);
    await waitFor(() => {
      expect(screen.getByTestId('trending-tab-row')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('trending-tab-groups'));
    await waitFor(() => {
      expect(screen.getByTestId('trending-groups-view')).toBeInTheDocument();
    });
    expect(screen.getByTestId('trending-tab-groups')).toHaveAttribute('aria-selected', 'true');
  });
});