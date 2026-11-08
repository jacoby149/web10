// Link unfurling on the marketing surfaces (D99 + D100): a pasted link in a
// post body renders the provider's embedded player or the rich preview card,
// not a bare underlined URL — the same treatment the social app's feed gives
// its post bodies. The marketing site asks the SOCIAL app's preview server
// cross-origin (`${SOCIAL_ORIGIN}/preview/unfurl` — CORS `*`); the fetch here
// is mocked (the server's own suite owns the endpoint's behavior, including
// the SSRF guard).
//
// The floor: every unfurl failure (network, ok:false, no card) degrades to
// the plain link — an unfurl failure is never a rendering failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TrendingCard, type FeedPost } from '@/components/FeedPreview';
import { __resetUnfurlCacheForTests } from '@web10/discover';
import { SOCIAL_ORIGIN } from '@/lib/origins';

const UNFURL = `${SOCIAL_ORIGIN}/preview/unfurl`;

// The unfurl mock: route the GET /preview/unfurl to a canned card (per test),
// and record every call. All other urls reject (the board reads are not the
// subject here — the post arrives pre-mapped).
function mockUnfurl(cardOrBody: ((target: string) => unknown) | unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.startsWith(UNFURL)) {
      calls.push(u);
      const target = new URL(u, 'http://x').searchParams.get('url') || '';
      const body = typeof cardOrBody === 'function' ? cardOrBody(target) : cardOrBody;
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'Content-Type': 'application/json' }),
        json: async () => body,
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch in unfurl test: ${u}`);
  }));
  return calls;
}

const spotifyCard = (url: string) => ({
  ok: true,
  card: {
    url,
    domain: 'spotify.com',
    provider: 'spotify',
    title: 'Blinding Lights',
    description: 'The Weeknd · Blinding Lights',
    image: 'https://i.scdn.co/image/abc123',
    embed: { src: 'https://open.spotify.com/embed/track/xyz', height: 152, width: null, allow: 'autoplay; encrypted-media' },
  },
});

const articleCard = (url: string) => ({
  ok: true,
  card: {
    url,
    domain: 'paulgraham.com',
    provider: 'generic',
    title: 'How to Do Great Work',
    description: 'The most important skill is not intelligence but…',
    image: 'https://paulgraham.com/img/gw.jpg',
    embed: null,
  },
});

const basePost: FeedPost = {
  id: 'p1',
  name: 'New Music',
  handle: '@new_music',
  initial: 'N',
  avatarColor: 'bg-amber-500',
  time: '1h',
  content: '',
  title: 'Blinding Lights — The Weeknd',
  author: 'new_music',
  likes: '0',
  comments: '0',
  reposts: '0',
  likesCount: 0,
  commentsCount: 0,
  repostsCount: 0,
  createdAt: '2026-11-01T12:00:00Z',
  engagementScore: 0,
  tags: [],
};

const noop = () => {};

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  __resetUnfurlCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('TrendingCard unfurl (the marketing /trending board, D99 + D100)', () => {
  it('renders the provider player for a Spotify link WITHOUT a click (the provider-identity chrome, then the iframe)', async () => {
    const calls = mockUnfurl(spotifyCard('https://open.spotify.com/track/xyz'));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'Fresh drop: https://open.spotify.com/track/xyz The Weeknd' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    // The card is fetched once, from the social app's preview server.
    await waitFor(() => {
      expect(calls.length).toBe(1);
      expect(calls[0]).toBe(`${UNFURL}?url=${encodeURIComponent('https://open.spotify.com/track/xyz')}`);
    });

    // No click: jsdom has no IntersectionObserver, so the in-view gate is
    // immediate — the provider's iframe loads on its own.
    const player = await screen.findByTestId('unfurl-player');
    const iframe = player.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('src', 'https://open.spotify.com/embed/track/xyz');
    expect(iframe).toHaveAttribute('allow', 'autoplay; encrypted-media');
    // No fake play button (the provider's player is not a web10 music post):
    // the pre-load chrome (provider-identity) carries no button at all.
    expect(screen.queryByTestId('unfurl-player-placeholder')).toBeNull();
    expect(player.closest('button')).toBeNull();
  });

  it('keeps the provider identity visible in the pre-load chrome (a never-firing IntersectionObserver)', async () => {
    let fireIntersect: (() => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fireIntersect = () => cb([{ isIntersecting: true }]);
        }
        observe = () => {};
        unobserve = () => {};
        disconnect = () => {};
      },
    );
    mockUnfurl(spotifyCard('https://open.spotify.com/track/xyz'));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'Fresh drop: https://open.spotify.com/track/xyz The Weeknd' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    // The chrome: the title + the provider domain, NO play button, NO iframe
    // (the gate is the scroll, not a click).
    const chrome = await screen.findByTestId('unfurl-player-chrome');
    expect(screen.getByTestId('unfurl-player-title')).toHaveTextContent('Blinding Lights');
    expect(screen.getByTestId('unfurl-player-subtitle')).toHaveTextContent('The Weeknd');
    expect(screen.getByTestId('unfurl-player-provider')).toHaveTextContent('spotify.com');
    expect(chrome.querySelector('button')).toBeNull();
    expect(screen.queryByTestId('unfurl-player')).toBeNull();

    // The scroll into view loads the provider's iframe.
    fireIntersect?.();
    const iframe = (await screen.findByTestId('unfurl-player')).querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toHaveAttribute('src', 'https://open.spotify.com/embed/track/xyz');
    vi.unstubAllGlobals();
  });

  it('renders the rich preview card for an article link (the whole card is the link)', async () => {
    mockUnfurl(articleCard('https://paulgraham.com/greatwork.html'));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'https://paulgraham.com/greatwork.html Paul Graham, July 2023' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    const card = await screen.findByTestId('unfurl-card');
    expect(card.tagName).toBe('A');
    expect(card).toHaveAttribute('href', 'https://paulgraham.com/greatwork.html');
    expect(card).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('unfurl-card-domain')).toHaveTextContent('paulgraham.com');
    expect(screen.getByTestId('unfurl-card-title')).toHaveTextContent('How to Do Great Work');
    expect(screen.getByTestId('unfurl-card-description')).toHaveTextContent('not intelligence');
    expect(screen.getByTestId('unfurl-card-image')).toHaveAttribute('src', 'https://paulgraham.com/img/gw.jpg');
  });

  it('keeps the plain link when the unfurl fails (ok:false — the no-metadata verdict)', async () => {
    mockUnfurl({ ok: false, reason: 'no_metadata' });
    render(
      <TrendingCard
        post={{ ...basePost, content: 'Check: https://walled.example/page' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    // The plain underlined link (the pre-unfurl rendering) — no card, no player.
    await waitFor(() => {
      expect(screen.getByText('https://walled.example/page')).toBeInTheDocument();
    });
    const link = screen.getByText('https://walled.example/page');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://walled.example/page');
    expect(link).toHaveClass('text-brand-300', 'underline');
    expect(screen.queryByTestId('unfurl-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('unfurl-player-placeholder')).not.toBeInTheDocument();
  });

  it('keeps the plain link when the fetch rejects (network failure is not a rendering failure)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'Check: https://walled.example/page2' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );
    await waitFor(() => {
      expect(screen.getByText('https://walled.example/page2')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('unfurl-card')).not.toBeInTheDocument();
  });

  it('renders the deterministic YouTube player with NO unfurl round-trip', async () => {
    const calls = mockUnfurl(spotifyCard(''));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ a classic' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    const placeholder = await screen.findByTestId('youtube-embed-placeholder');
    expect(placeholder).toBeInTheDocument();
    // The YouTube id is deterministic — the preview server is never asked.
    expect(calls.length).toBe(0);
    const thumb = placeholder.querySelector('img') as HTMLImageElement;
    expect(thumb).toHaveAttribute('src', 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg');
  });

  it('moves the post link-out to the title when the caption unfurls (no nested <a>)', async () => {
    mockUnfurl(spotifyCard('https://open.spotify.com/track/xyz'));
    render(
      <TrendingCard
        post={{ ...basePost, content: 'Fresh drop: https://open.spotify.com/track/xyz' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    // The caption's own words are NOT inside the post-permalink <a> anymore
    // (the card must never nest in the link-out): the embed sits in the
    // plain <p>, not in a link. (jsdom has no IntersectionObserver, so the
    // provider iframe loads immediately — no click.)
    const player = await screen.findByTestId('unfurl-player');
    expect(player.closest('a')).toBeNull();

    // The title carries the link-out to the post on web10 social.
    const title = screen.getByTestId('discover-card-title');
    const titleLink = title.querySelector('a') as HTMLAnchorElement;
    expect(titleLink).not.toBeNull();
    expect(titleLink).toHaveAttribute('href', `${SOCIAL_ORIGIN}/u/new_music/p/p1`);
    expect(titleLink).toHaveAttribute('target', '_blank');
  });

  it('keeps the caption link-out wrapper when the post has no external link (chrome unchanged)', () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called'); }));
    render(
      <TrendingCard post={{ ...basePost, content: 'first program' }} rank={1} maxScore={1} onLike={noop} onComment={noop} onRepost={noop} />,
    );
    // Today's chrome: the caption text IS the link-out to the post.
    const contentLink = screen.getByRole('link', { name: /first program/ });
    expect(contentLink).toHaveAttribute('href', `${SOCIAL_ORIGIN}/u/new_music/p/p1`);
    // No title link-out (the wrapper owns it) — and no unfurl traffic.
    expect(screen.getByTestId('discover-card-title').querySelector('a')).toBeNull();
  });

  it('renders the plain link when the card embeds a foreign host (the two-sided gate, client half)', async () => {
    // The server allowlists per-provider; this card's embed points anywhere
    // else → the client drops the iframe and renders the rich card instead.
    mockUnfurl({
      ok: true,
      card: {
        url: 'https://soundcloud.com/x/y',
        domain: 'soundcloud.com',
        provider: 'soundcloud',
        title: 'Track',
        description: 'Artist',
        image: null,
        embed: { src: 'https://evil.example.com/embed', height: 152 },
      },
    });
    render(
      <TrendingCard
        post={{ ...basePost, content: 'https://soundcloud.com/x/y' }}
        rank={1}
        maxScore={1}
        onLike={noop} onComment={noop} onRepost={noop}
      />,
    );

    const card = await screen.findByTestId('unfurl-card');
    expect(card).toHaveAttribute('href', 'https://soundcloud.com/x/y');
    // The foreign iframe never mounts.
    expect(card.querySelector('iframe')).toBeNull();
    expect(screen.queryByTestId('unfurl-player')).not.toBeInTheDocument();
  });
});

describe('GroupDetail unfurl (the group page\u2019s posts)', () => {
  it('unfurls a post body\u2019s link on the group page', async () => {
    const groupId = 'api.web10.app/groups/creator/music';
    const groupData = {
      group_id: groupId,
      name: 'music',
      owner: 'creator',
      slug: 'music',
      join_policy: 'open',
      discoverable: true,
      member_count: 3,
      permission_summary: 'open',
      is_member: false,
      posts_state: 'ok',
      posts: [
        {
          doc_id: 'post-1',
          author_key: 'api.web10.app/users/creator',
          body: { text: 'Blinding Lights — The Weeknd\nhttps://open.spotify.com/track/xyz' },
          created_at: '2026-11-01T12:00:00Z',
        },
      ],
    };
    const unfurlCalls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      const u = String(url);
      if (u.startsWith(UNFURL)) {
        unfurlCalls.push(u);
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'Content-Type': 'application/json' }),
          json: async () => spotifyCard('https://open.spotify.com/track/xyz'),
        } as unknown as Response;
      }
      if (u.includes('/v3/groups/detail')) {
        return { ok: true, status: 200, json: async () => groupData } as unknown as Response;
      }
      // The face read: anon, public — answer empty (the page degrades fine).
      if (u.includes('/v3/read')) {
        return { ok: true, status: 200, json: async () => [] } as unknown as Response;
      }
      throw new Error(`unexpected fetch: ${u}`);
    }));

    const { default: GroupDetail } = await import('@/pages/GroupDetail');
    render(
      <MemoryRouter initialEntries={['/groups/' + encodeURIComponent(groupId)]}>
        <Routes>
          <Route path="/groups/:id" element={<GroupDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    // The post list renders (the author row: `@creator` — also the header's
    // owner line, hence findAll).
    await screen.findAllByText('@creator');
    // …and the link unfurls into the provider player. jsdom has no
    // IntersectionObserver, so the in-view gate is immediate — the provider's
    // iframe loads WITHOUT a click (08.11.2026 pass).
    const player = await screen.findByTestId('unfurl-player');
    const iframe = player.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('open.spotify.com/embed');
    expect(screen.queryByTestId('unfurl-player-placeholder')).toBeNull(); // no fake play button
    // The unfurl went to the social app's preview server, not the node.
    expect(unfurlCalls.length).toBe(1);
    expect(unfurlCalls[0]).toBe(`${UNFURL}?url=${encodeURIComponent('https://open.spotify.com/track/xyz')}`);
  });
});
