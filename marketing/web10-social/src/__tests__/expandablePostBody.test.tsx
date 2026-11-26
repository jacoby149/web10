import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@testing-library/jest-dom';

// Mock lucide-react icons as simple span elements (any icon, no manual list).
import { lucideMock } from './helpers/lucideMock';
vi.mock('lucide-react', () => lucideMock);

// Mock the v3 client (the PostCard's authority read — the mutationAuthority
// pattern; the card's owner menu depends on it resolving).
const client = vi.hoisted(() => ({
  readToken: vi.fn(() => ({ username: 'reader', provider: 'node' })),
  getGroup: vi.fn(async () => ({ roles: [] })),
  getMyGroups: vi.fn(async () => []),
  readById: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  read: vi.fn(async () => []),
  query: vi.fn(async () => ({ rows: [], count: 0 })),
  readRefCounts: vi.fn(async () => ({})),
  contentViews: vi.fn(async () => ({})),
}));
vi.mock('@/data/v3', () => ({ getV3Client: () => client }));

// ── The height mock ─────────────────────────────────────────────────────────
// jsdom does no layout: scrollHeight/clientHeight are 0. The component's
// essay gate + resting overflow are height measurements, so the tests drive
// them through the Element prototypes (every element reports the same pair;
// the component only measures its own clamp node).
const heights = vi.hoisted(() => ({
  scroll: 0,
  client: 0,
  clampedScroll: undefined as number | undefined,
}));
beforeEach(() => {
  const origSH = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
  const origCH = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
  Object.defineProperty(Element.prototype, 'scrollHeight', {
    configurable: true,
    get() {
      if (this instanceof HTMLElement && this.style.display === '-webkit-box') {
        return heights.clampedScroll ?? heights.scroll;
      }
      return heights.scroll;
    },
  });
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get() {
      return heights.client;
    },
  });
  // The trigger budget (20 lines × 22.75px) + 8px tolerance — a fitting body.
  heights.scroll = 300;
  heights.client = 300;
  heights.clampedScroll = undefined;
  return () => {
    if (origSH) Object.defineProperty(Element.prototype, 'scrollHeight', origSH);
    if (origCH) Object.defineProperty(Element.prototype, 'clientHeight', origCH);
  };
});

import { ExpandablePostBody } from '@/components/Feed/ExpandablePostBody';
import { PostCard } from '@/components/Feed/FeedScreen';
import { PostDetail } from '@/components/Feed/PostDetail';
import type { PostRecord } from '@/data/types';

// An essay-length body (far past the 20-line trigger) — markdown with
// paragraphs so the PostBody's full scale (the p's leading) is what renders.
const ESSAY_TEXT = Array.from({ length: 30 }, (_, i) => `Paragraph ${i + 1} of a very long post, with enough prose that it wraps across many lines at every width the feed can be.`).join('\n\n');
const SHORT_TEXT = 'A perfectly ordinary post. Short, sweet, one idea.';

function renderExpandable(text: string, props: Record<string, unknown> = {}) {
  return render(<ExpandablePostBody text={text} density="full" {...props} />);
}

describe('ExpandablePostBody — the long-body clamp + See more/See less (D125)', () => {
  it('renders a fitting body exactly as before — no clamp style, no toggle', () => {
    renderExpandable(SHORT_TEXT);
    expect(screen.queryByTestId('post-body-toggle')).toBeNull();
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.display).not.toBe('-webkit-box');
    expect(screen.getByTestId('post-body')).toBeInTheDocument();
  });

  it('keeps an embed-height body unclamped (the unfurl card is not an essay)', () => {
    // A link post + a provider player card: the content's natural height
    // (~400px) is under the trigger budget (~455px + tolerance) — no clamp.
    heights.scroll = 400;
    heights.client = 400;
    renderExpandable('Listen: https://open.spotify.com/track/abc');
    expect(screen.queryByTestId('post-body-toggle')).toBeNull();
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.display).not.toBe('-webkit-box');
  });

  it('clamps an essay body to the line budget + shows "See more" (collapsed)', () => {
    heights.scroll = 900;
    heights.client = 137; // the clamped box's height (≈6 lines)
    const { container } = renderExpandable(ESSAY_TEXT, { collapsedLines: 6 });
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.display).toBe('-webkit-box');
    expect(body.style.webkitLineClamp).toBe('6');
    const toggle = screen.getByTestId('post-body-toggle');
    expect(toggle).toHaveTextContent('See more');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The fade scrim (the clamp's foot blends into the surface).
    expect(screen.getByTestId('post-body-toggle-fade')).toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('"See more" expands to the full body; the toggle flips to "See less"', () => {
    heights.scroll = 900;
    heights.client = 137;
    renderExpandable(ESSAY_TEXT, { collapsedLines: 6 });
    const toggle = screen.getByTestId('post-body-toggle');
    fireEvent.click(toggle);
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.display).not.toBe('-webkit-box');
    expect(toggle).toHaveTextContent('See less');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByTestId('post-body-toggle-fade')).toBeNull();
  });

  it('"See less" re-clamps to the budget (the per-post toggle round-trips)', () => {
    heights.scroll = 900;
    heights.client = 137;
    renderExpandable(ESSAY_TEXT, { collapsedLines: 6 });
    const toggle = screen.getByTestId('post-body-toggle');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See less');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See more');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.display).toBe('-webkit-box');
    expect(body.style.webkitLineClamp).toBe('6');
  });

  it('honors the detail surfaces\' bigger resting budget (12 lines)', () => {
    heights.scroll = 900;
    heights.client = 273; // ≈12 lines
    renderExpandable(ESSAY_TEXT, { collapsedLines: 12 });
    const body = screen.getByTestId('post-body-toggle-body');
    expect(body.style.webkitLineClamp).toBe('12');
    expect(screen.getByTestId('post-body-toggle')).toHaveTextContent('See more');
  });

  it('passes the density through to <PostBody> (light stays light)', () => {
    renderExpandable(ESSAY_TEXT, { density: 'light', collapsedLines: 6 });
    expect(screen.getByTestId('post-body')).toHaveAttribute('data-density', 'light');
  });

  it('exits the clamp when a resize makes the content fit the trigger again', () => {
    vi.useFakeTimers();
    try {
      heights.scroll = 900;
      heights.client = 137;
      renderExpandable(ESSAY_TEXT, { collapsedLines: 6 });
      expect(screen.getByTestId('post-body-toggle')).toHaveTextContent('See more');
      // The window widens: the same text now wraps to a height under the
      // trigger — the essay gate no longer holds (the clamp must come off).
      heights.scroll = 300;
      heights.client = 300;
      act(() => {
        fireEvent(window, new Event('resize'));
        vi.advanceTimersByTime(200); // the resize debounce
      });
      expect(screen.queryByTestId('post-body-toggle')).toBeNull();
      const body = screen.getByTestId('post-body-toggle-body');
      expect(body.style.display).not.toBe('-webkit-box');
    } finally {
      vi.useRealTimers();
    }
  });

  it('re-measures on resize while clamped (the toggle stays honest)', () => {
    vi.useFakeTimers();
    try {
      heights.scroll = 900;
      heights.client = 137;
      renderExpandable(ESSAY_TEXT, { collapsedLines: 6 });
      expect(screen.getByTestId('post-body-toggle')).toBeInTheDocument();
      // A drag-resize keeps the content over the trigger: the toggle stays.
      act(() => {
        fireEvent(window, new Event('resize'));
        vi.advanceTimersByTime(200);
      });
      expect(screen.getByTestId('post-body-toggle')).toHaveTextContent('See more');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('PostCard — the feed card\'s essay gate (D125)', () => {
  const CARD_POST: PostRecord = {
    _id: 'essay-post',
    title: 'Sharing to whoever listens',
    text: ESSAY_TEXT,
    created_at: '2026-11-25T10:00:00Z',
    visibility: 'public',
    author_username: 'nova',
    author_provider: 'web10',
  };
  function renderCard() {
    return render(
      <MemoryRouter>
        <PostCard
          post={CARD_POST}
          authorName="Nova"
          authorUsername="nova"
          mediaItems={[]}
          reactionCount={3}
          commentCount={1}
          liked={false}
          disliked={false}
          timestamp={CARD_POST.created_at}
          onToggleReaction={vi.fn()}
          onCommentCountChange={vi.fn()}
          signedIn
        />
      </MemoryRouter>,
    );
  }

  it('renders the signed-in feed when clamping hides the overflow from scrollHeight', () => {
    heights.scroll = 900;
    heights.clampedScroll = heights.client = 137;
    renderCard();
    const toggle = screen.getByTestId('post-card-see-more');
    expect(toggle).toHaveTextContent('See more');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See less');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See more');
  });

  it('stays mounted when resize crosses the essay threshold with clipped scrollHeight', () => {
    vi.useFakeTimers();
    try {
      heights.clampedScroll = 137;
      renderCard();
      const resize = (naturalHeight: number, visibleHeight: number) => {
        heights.scroll = naturalHeight;
        heights.client = visibleHeight;
        act(() => {
          fireEvent(window, new Event('resize'));
          vi.advanceTimersByTime(200);
        });
      };
      expect(screen.queryByTestId('post-card-see-more')).toBeNull();
      resize(900, 137);
      expect(screen.getByTestId('post-card-see-more')).toHaveTextContent('See more');
      resize(300, 137);
      expect(screen.queryByTestId('post-card-see-more')).toBeNull();
      expect(screen.getByTestId('post-card')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a fitting card body with no toggle (the pre-D125 shape)', () => {
    render(<MemoryRouter>
      <PostCard
        post={{ ...CARD_POST, text: SHORT_TEXT }}
        authorName="Nova"
        authorUsername="nova"
        mediaItems={[]}
        reactionCount={3}
        commentCount={1}
        liked={false}
        disliked={false}
        timestamp={CARD_POST.created_at}
        onToggleReaction={vi.fn()}
        onCommentCountChange={vi.fn()}
        signedIn
      />
    </MemoryRouter>);
    expect(screen.queryByTestId('post-card-see-more')).toBeNull();
    expect(screen.getByTestId('post-body')).toBeInTheDocument();
  });

  it('clamps an essay card to 6 lines + "See more"; the toggle round-trips', () => {
    heights.scroll = 900;
    heights.client = 137;
    renderCard();
    const toggle = screen.getByTestId('post-card-see-more');
    expect(toggle).toHaveTextContent('See more');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See less');
    const body = screen.getByTestId('post-card-see-more-body');
    expect(body.style.display).not.toBe('-webkit-box');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See more');
    expect(body.style.display).toBe('-webkit-box');
  });
});

describe('PostDetail — the detail surfaces\' essay gate (D125)', () => {
  const DETAIL_POST = {
    _id: 'detail-1',
    title: 'The long one',
    text: ESSAY_TEXT,
    created_at: new Date().toISOString(),
    visibility: 'public',
    author_username: 'alex',
    author_provider: 'web10',
  };
  function renderDetail() {
    return render(
      <PostDetail
        post={DETAIL_POST}
        authorName="Alex"
        liked={false}
        disliked={false}
        likeCount={1}
        dislikeCount={0}
        commentCount={0}
        reposted={false}
        repostCount={0}
        onToggleReaction={vi.fn()}
        onToggleRepost={vi.fn()}
        onShare={vi.fn()}
        onCommentCountChange={vi.fn()}
      />,
    );
  }

  it('shows a fitting body with no toggle (a normal post-detail is unchanged)', () => {
    render(<PostDetail
      post={{ ...DETAIL_POST, text: SHORT_TEXT }}
      authorName="Alex"
      liked={false}
      disliked={false}
      likeCount={1}
      dislikeCount={0}
      commentCount={0}
      reposted={false}
      repostCount={0}
      onToggleReaction={vi.fn()}
      onToggleRepost={vi.fn()}
      onShare={vi.fn()}
      onCommentCountChange={vi.fn()}
    />);
    expect(screen.queryByTestId('post-detail-see-more')).toBeNull();
    expect(screen.getByTestId('post-body')).toBeInTheDocument();
  });

  it('clamps an essay body to the detail\'s 12-line budget + "See more"', () => {
    heights.scroll = 900;
    heights.client = 273;
    renderDetail();
    const toggle = screen.getByTestId('post-detail-see-more');
    expect(toggle).toHaveTextContent('See more');
    const body = screen.getByTestId('post-detail-see-more-body');
    expect(body.style.webkitLineClamp).toBe('12');
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent('See less');
    expect(body.style.display).not.toBe('-webkit-box');
  });
});

afterEach(() => {
  cleanup();
});
