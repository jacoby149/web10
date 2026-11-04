import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import '@testing-library/jest-dom';
import type { ShortPost } from '@/data';

const mocks = vi.hoisted(() => ({ readShortsFeed: vi.fn(), read: vi.fn() }));
vi.mock('@/data', () => ({
  readShortsFeed: mocks.readShortsFeed, getDiscoverGroupId: () => 'discover',
  getV3Client: () => ({ read: mocks.read }), readViewCounts: vi.fn().mockResolvedValue({}),
  toggleReactionKind: vi.fn(), trackVideoViewport: vi.fn(), extractUsername: (key: string) => key,
}));
vi.mock('@/data/wapi', () => ({ getWapi: () => ({ readToken: () => null }) }));
vi.mock('@/data/actingIdentity', () => ({
  useActingAuthor: () => undefined, getActingAuthor: () => undefined, matchesActingAuthor: () => false,
}));
vi.mock('@/lib/pwa', () => ({ isMobile: () => false, requestInstallPrompt: vi.fn() }));
vi.mock('@/components/Feed/VideoPlayer', () => ({
  VideoPlayer: ({ testId }: { testId: string }) => <video data-testid={testId} />,
  sourceFromMedia: () => ({ type: 'file' }),
}));
vi.mock('@/components/Feed/CommentThread', () => ({ CommentThread: () => null }));
vi.mock('@/components/Shorts/ShortsWall', () => ({ default: () => null }));

import ShortsScreen from '@/components/Shorts/ShortsScreen';

const short: ShortPost = {
  post: { _id: 's1', title: 'Tonight at the club',
    text: 'A **classic film**, with *something extra*.\n\n## Watch with us\n\n- Bring a friend\n- [Visit the club](https://example.com/movies)\n\nThe complete final paragraph.',
    author_key: 'node.test/groups/users/owner/new-group-5', author_username: 'new-group-5',
    group_identity: { name: 'Century Club Movies' }, created_at: '2026-11-04T12:00:00Z', likes: 12, impressions: 42 },
  media: { _id: 'video-1', url: 'https://example.com/short.mp4', mime_type: 'video/mp4', width: 720, height: 1280, created_at: '2026-11-04T12:00:00Z' },
};
function History() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><output data-testid="location">{location.pathname}{location.search}</output>
    <button onClick={() => navigate(-1)}>History back</button><button onClick={() => navigate(1)}>History forward</button>
    <button onClick={() => navigate('/shorts/s2?description=1')}>Next short</button></>;
}
function show(route = '/shorts/s1?q=classic&from=video') {
  return render(<MemoryRouter initialEntries={[route]}><History /><Routes>
    <Route path="/shorts/:postId" element={<ShortsScreen />} />
  </Routes></MemoryRouter>);
}
const dialog = () => screen.findByRole('dialog');
async function open() {
  const trigger = await screen.findByRole('button', { name: 'View description' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, panel: await dialog() };
}

describe('Shorts expandable description', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readShortsFeed.mockResolvedValue([{ ...short, post: { ...short.post } }]);
    mocks.read.mockResolvedValue([]);
    HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('opens from the caption into full formatted content and a usable link, without replacing the video', async () => {
    show();
    await screen.findByTestId('short-video-0');
    const video = screen.getByTestId('short-video-0');
    const { trigger, panel } = await open();
    expect(trigger).not.toHaveTextContent('**');
    expect(trigger).toHaveTextContent('A classic film, with something extra.');
    expect(within(panel).getByRole('heading', { name: 'Tonight at the club' })).toBeInTheDocument();
    expect(within(panel).getByText('classic film').tagName).toBe('STRONG');
    expect(within(panel).getByText('something extra').tagName).toBe('EM');
    expect(within(panel).getByRole('heading', { name: 'Watch with us' })).toBeInTheDocument();
    expect(within(panel).getByText('The complete final paragraph.')).toBeInTheDocument();
    expect(within(panel).getByRole('link', { name: 'Visit the club' })).toHaveAttribute('href', 'https://example.com/movies');
    expect(within(panel).getByRole('link', { name: 'Visit the club' })).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(panel).getByRole('link', { name: 'Century Club Movies' })).toHaveAttribute('href', `/groups/${encodeURIComponent(short.post.author_key!)}`);
    expect(screen.getByTestId('location')).toHaveTextContent('/shorts/s1?q=classic&from=video&description=1');
    expect(screen.getByTestId('short-video-0')).toBe(video);
    expect(mocks.readShortsFeed).toHaveBeenCalledTimes(1);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it('restores the expanded description from a direct URL', async () => {
    show('/shorts/s1?description=1');
    expect(await dialog()).toHaveTextContent('The complete final paragraph.');
  });

  it('supports browser back/forward without re-reading the shorts', async () => {
    show();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'History back' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'History forward' }));
    expect(await dialog()).toHaveTextContent('The complete final paragraph.');
    expect(mocks.readShortsFeed).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'Escape', 'backdrop'])('dismisses via %s, preserving other URL state and restoring focus', async (method) => {
    show();
    const { trigger } = await open();
    if (method === 'close') fireEvent.click(screen.getByRole('button', { name: 'Close description' }));
    else if (method === 'Escape') fireEvent.keyDown(document, { key: 'Escape' });
    else fireEvent.click(screen.getByTestId('short-description-backdrop'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('location')).toHaveTextContent('/shorts/s1?q=classic&from=video');
    expect(trigger).toHaveFocus();
  });

  it('contains focus and lets description keys scroll text rather than swipe the feed', async () => {
    show();
    const { panel } = await open();
    const close = within(panel).getByRole('button', { name: 'Close description' });
    expect(close).toHaveFocus();
    const links = within(panel).getAllByRole('link');
    await userEvent.tab({ shift: true });
    expect(links[links.length - 1]).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockClear();
    fireEvent.keyDown(panel, { key: 'ArrowDown' });
    fireEvent.keyDown(panel, { key: 'PageDown' });
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
    expect(screen.getByTestId('shorts-container')).toHaveAttribute('inert');
  });

  it('retains the shared renderer denial of unsafe links and executable markup', async () => {
    mocks.readShortsFeed.mockResolvedValue([{ ...short, post: { ...short.post,
      text: '[bad](javascript:alert(1))\n\n<script>window.bad = true</script>\n\n[Good](https://example.com)',
    } }]);
    show('/shorts/s1?description=1');
    const panel = await dialog();
    expect(panel.querySelector('script')).toBeNull();
    expect(panel.querySelector('a[href^="javascript:"]')).toBeNull();
    expect(within(panel).getByRole('link', { name: 'Good' })).toHaveAttribute('href', 'https://example.com');
  });

  it.each([undefined, 'https://example.com/missing.jpg'])('uses an initial for a missing/failed picture (%s), never an empty image', async (avatar) => {
    mocks.readShortsFeed.mockResolvedValue([{ ...short, post: { ...short.post, avatar_url: avatar } }]);
    show('/shorts/s1?description=1');
    const panel = await dialog();
    const image = panel.querySelector('img');
    if (avatar) fireEvent.error(image!);
    expect(panel.querySelector('img')).toBeNull();
    expect(within(panel).getByText('C')).toBeInTheDocument();
  });

  it.each(['title-only', 'empty'])('handles a %s description without inventing a body', async (mode) => {
    mocks.readShortsFeed.mockResolvedValue([{ ...short, post: { ...short.post, text: undefined,
      title: mode === 'title-only' ? 'A title without a caption' : undefined,
    } }]);
    show('/shorts/s1?description=1');
    const panel = await dialog();
    expect(within(panel).getByRole('heading', { name: mode === 'title-only' ? 'A title without a caption' : 'Description' })).toBeInTheDocument();
    expect(panel).toHaveTextContent('No description added.');
  });

  it.each(['title-only', 'caption-only'])('opens via the %s trigger and autolinks bare URLs', async (mode) => {
    mocks.readShortsFeed.mockResolvedValue([{ ...short, post: { ...short.post,
      title: mode === 'title-only' ? 'Just a title' : undefined,
      text: mode === 'caption-only' ? 'Find us at https://example.com/schedule' : undefined,
    } }]);
    show('/shorts/s1');
    const { panel } = await open();
    if (mode === 'title-only') expect(panel).toHaveTextContent('Just a title');
    else expect(within(panel).getByRole('link', { name: 'https://example.com/schedule' })).toHaveAttribute('href', 'https://example.com/schedule');
  });

  it('binds an expanded description to the short in the URL, not a previous slide', async () => {
    mocks.readShortsFeed.mockResolvedValue([short, { ...short, post: { ...short.post, _id: 's2', title: 'Second short', text: 'Second description' } }]);
    show('/shorts/s1?description=1');
    await dialog();
    fireEvent.click(screen.getByRole('button', { name: 'Next short' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveTextContent('Second description'));
    expect(screen.getByRole('dialog')).not.toHaveTextContent('The complete final paragraph.');
    expect(mocks.readShortsFeed).toHaveBeenCalledTimes(1);
  });
});
