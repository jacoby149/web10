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
  it('fires like/comment/repost handlers when interactive', () => {
    const onLike = vi.fn();
    const onComment = vi.fn();
    const onRepost = vi.fn();
    render(
      <TrendingCard post={basePost} rank={5} maxScore={100} onLike={onLike} onComment={onComment} onRepost={onRepost} />,
    );
    fireEvent.click(screen.getByLabelText(/Like,/));
    fireEvent.click(screen.getByLabelText(/Comment,/));
    fireEvent.click(screen.getByLabelText(/Repost,/));
    expect(onLike).toHaveBeenCalledWith('p1');
    expect(onComment).toHaveBeenCalledWith('p1');
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
});
