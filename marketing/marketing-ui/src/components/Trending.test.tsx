import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TrendingCard, type FeedPost } from '@/components/FeedPreview';

// Lane D — coverage for the /trending page pieces (D-trending-*).
// TrendingCard rank tiers + engagement wiring, and the page's grid /
// empty / load-more / sidebar states over a mocked discovery API.

const basePost: FeedPost = {
  id: 'p1',
  name: 'Ada Lovelace',
  handle: '@ada',
  initial: 'A',
  avatarColor: 'bg-violet-500',
  time: '2h',
  content: 'first program',
  likes: '10',
  comments: '2',
  reposts: '1',
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

  it('renders author name as a link to social origin', () => {
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    const authorLink = screen.getByRole('link', { name: 'Ada Lovelace' });
    expect(authorLink).toHaveAttribute('href', expect.stringContaining('social.web10'));
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
    created_at: '2026-07-23T00:00:00Z',
    engagement: { likes: 100 - i, comments: 5, reposts: 2 },
    engagement_score: 1000 - i * 10,
  }));
}

describe('Trending page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('open', vi.fn());
    // jsdom has no layout; stub the scroll the sidebar triggers.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders a ranked grid and the Top 10 sidebar from the discovery API', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonOk(makeDiscoveryPosts(20)) as unknown as Response);
    const { default: Trending } = await import('@/pages/Trending');
    render(<Trending />);
    await waitFor(() => expect(screen.getByTestId('trending-grid')).toBeInTheDocument());
    expect(screen.getAllByTestId('trending-card')).toHaveLength(20);
    // Top 10 sidebar shows exactly ten entries.
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
    expect(discoverBodies()).toEqual(['{"query":{"sort":"trending","limit":20}}']);
    fireEvent.click(loadMore);
    await waitFor(() =>
      expect(discoverBodies()).toContain('{"query":{"sort":"trending","limit":40}}'),
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
    // 10 of the 20 posts carry the 'code' tag (odd indices).
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
