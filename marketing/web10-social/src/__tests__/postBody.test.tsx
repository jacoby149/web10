import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@testing-library/jest-dom';
import { PostBody } from '@/components/Feed/PostBody';
import { MarkdownText } from '../../../shared/discover/src/MarkdownText';
import { fetchUnfurl } from '@/lib/unfurl';

// The unfurl seam: the same-origin card fetch (the preview server). Mocked so
// the component tests drive the RENDER decision, not the network — the
// network + parsing lives in previewUnfurl.test.ts (module) and
// previewServerUnfurl.test.ts (the real process).
vi.mock('@/lib/unfurl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/unfurl')>();
  return { ...actual, fetchUnfurl: vi.fn(async () => null) };
});
const fetchUnfurlMock = vi.mocked(fetchUnfurl);

const SPOTIFY_CARD = {
  url: 'https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b',
  domain: 'spotify.com',
  provider: 'spotify',
  title: 'Blinding Lights',
  description: 'The Weeknd · Blinding Lights',
  image: 'https://i.scdn.co/cover.png',
  embed: { src: 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b', height: 152, width: 456, allow: 'autoplay; encrypted-media' },
};

const ARTICLE_CARD = {
  url: 'https://paulgraham.com/greatwork.html',
  domain: 'paulgraham.com',
  provider: 'generic',
  title: 'How to Do Great Work',
  description: 'This is a talk I gave at the University of California, Santa Cruz, in 2009.',
  image: 'https://img.example.com/lede.png',
  embed: null,
};

beforeEach(() => {
  fetchUnfurlMock.mockClear();
  fetchUnfurlMock.mockImplementation(async () => null);
});

describe('PostBody (D85 read side)', () => {
  it('navigates post tags through the router instead of reloading the player', () => {
    function Location() { return <span data-testid="mention-route">{useLocation().pathname}</span>; }
    render(<MemoryRouter><PostBody text="For @nova" /><Location /></MemoryRouter>);
    fireEvent.click(screen.getByRole('link', { name: '@nova' }));
    expect(screen.getByTestId('mention-route')).toHaveTextContent('/u/nova');
  });

  it('uses the shared comment navigation callback without bubbling into the post', () => {
    const navigate = vi.fn(); const openPost = vi.fn();
    render(<div onClick={openPost}><MarkdownText text="For @nova" onMentionClick={navigate} /></div>);
    fireEvent.click(screen.getByRole('link', { name: '@nova' }));
    expect(navigate).toHaveBeenCalledWith('nova'); expect(openPost).not.toHaveBeenCalled();
  });
  it.each(['full', 'light'] as const)('renders typed people tags in %s posts without linking code or email', (density) => {
    const { container } = render(<PostBody text="Hi @nova. `@code` email@example.com" density={density} />);
    expect(container.querySelector('a[href="/u/nova"]')).toHaveTextContent('@nova');
    expect(container.querySelector('a[href="/u/code"]')).toBeNull();
    expect(container.querySelector('a[href="/u/example"]')).toBeNull();
  });

  it('renders typed and legacy comment tags as profile links, not external web10: links', () => {
    const { container } = render(<MarkdownText text="Hi @nova and @[alice](web10:alice)" />);
    expect(container.querySelector('a[href="/u/nova"]')).toHaveTextContent('@nova');
    expect(container.querySelector('a[href="/u/alice"]')).not.toHaveAttribute('target', '_blank');
  });
  it('renders bold as <strong>', () => {
    const { container } = render(<PostBody text="some **bold** text" density="full" />);
    expect(container.querySelector('strong')).toHaveTextContent('bold');
  });

  it('renders a heading in the display face (full density)', () => {
    const { container } = render(<PostBody text="## My headline" density="full" />);
    const h2 = container.querySelector('h2');
    expect(h2).toHaveTextContent('My headline');
    expect(h2?.className).toContain('font-display');
  });

  it('flattens headings to inline text in light density (a card is a teaser)', () => {
    const { container } = render(<PostBody text="## My headline" density="light" />);
    // No heading element — the text is inline.
    expect(container.querySelector('h2')).toBeNull();
    expect(container).toHaveTextContent('My headline');
  });

  it('renders a code block (full) and inline code (light)', () => {
    const code = '```\nconst x = 1;\n```';
    const full = render(<PostBody text={code} density="full" />);
    expect(full.container.querySelector('pre.post-body-pre')).toBeTruthy();
    const light = render(<PostBody text={code} density="light" />);
    // Light density flattens the block to inline code (no <pre>).
    expect(light.container.querySelector('pre')).toBeNull();
    expect(light.container).toHaveTextContent('const x = 1;');
  });

  it('auto-links a bare URL', () => {
    const { container } = render(<PostBody text="check https://web10.xyz out" density="full" />);
    const a = container.querySelector('a[href="https://web10.xyz"]');
    expect(a).toBeTruthy();
  });

  it('renders a web10: mention as a tappable handle', () => {
    const { container } = render(<PostBody text="hey @[nova](web10:nova) thanks" density="full" />);
    const mention = container.querySelector('[data-testid="post-body-mention"]');
    expect(mention).toBeTruthy();
    expect(mention).toHaveAttribute('href', '/u/nova');
    expect(mention).toHaveTextContent('@nova');
  });

  it('preserves line breaks (remark-breaks) so plain-text posts keep their shape', () => {
    const { container } = render(<PostBody text={'line one\nline two'} density="full" />);
    expect(container.querySelector('br')).toBeTruthy();
  });

  // The security line (the anti-test): the sanitizer strips <script>, on* handlers,
  // and javascript: URLs. react-markdown does not parse raw HTML by default, so
  // these arrive as inert text — assert nothing executable is produced.
  it('strips <script> (no script element, no handler)', () => {
    const { container } = render(
      <PostBody text={'hello <script>window.__pwned = true;</script> world'} density="full" />,
    );
    expect(container.querySelector('script')).toBeNull();
    expect((window as any).__pwned).toBeUndefined();
  });

  it('strips on* event handlers from an anchor', () => {
    const { container } = render(
      <PostBody text={'[click me](https://web10.xyz "x")'} density="full" />,
    );
    const a = container.querySelector('a');
    expect(a).toBeTruthy();
    // No on* attributes on the link.
    for (const attr of a!.attributes) {
      expect(attr.name.toLowerCase()).not.toMatch(/^on/);
    }
  });

  it('does not render a javascript: URL as a link', () => {
    const { container } = render(
      <PostBody text={'[bad](javascript:alert(1))'} density="full" />,
    );
    const a = container.querySelector('a');
    // Either no link, or the href is not a javascript: URL.
    expect(a?.getAttribute('href') || '').not.toMatch(/^javascript:/i);
  });
});

// ── The link unfurl (the read-side card / player, KB: link-unfurl.md) ──────
describe('PostBody — the link unfurl', () => {
  it('renders the spotify provider player WITHOUT a click (the chrome, then the iframe on view)', async () => {
    // Headroom past the 5s default: under CI runner load the fetch-unfurl
    // microtasks + the observer fire can exceed it (the 5.9.9 class).
    fetchUnfurlMock.mockImplementation(async () => SPOTIFY_CARD);
    const { container } = render(<PostBody text="New drop: https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b" density="full" />);
    // While loading: the plain link of today (the unfurl never blocks the text).
    expect(container.querySelector('a[href="https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"]')).toBeTruthy();
    // The provider-identity chrome arrives first (artwork + title + the
    // provider domain — no play button: there is nothing to press).
    const chrome = await screen.findByTestId('unfurl-player-chrome');
    expect(chrome.querySelector('button')).toBeNull();
    expect(screen.getByTestId('unfurl-player-provider')).toHaveTextContent('spotify.com');
    // The embed scrolls into view (the setup's controllable observer) → the
    // provider's iframe loads — no click involved.
    (globalThis as unknown as Record<string, () => void>).fireIntersectionObservers?.();
    const player = await screen.findByTestId('unfurl-player');
    const iframe = player.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toBe('https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b');
    expect(iframe?.getAttribute('allowfullscreen')).toBe('');
    expect(iframe?.getAttribute('style')).toContain('height: 152px');
    // No fake play button anywhere (the provider's player is not a web10
    // music post).
    expect(screen.queryByTestId('unfurl-player-placeholder')).toBeNull();
    expect(screen.queryByRole('button', { name: /Play from spotify\.com/ })).toBeNull();
  }, 15_000);

  it('shows the provider-identity chrome (the title + the provider domain, no play button) until the embed scrolls into view', async () => {
    // A never-firing IntersectionObserver: the chrome stays, the iframe waits.
    let fireIntersect: (() => void) | null = null;
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
          fireIntersect = () => cb([{ isIntersecting: true }]);
        }
        observe = vi.fn();
        unobserve = vi.fn();
        disconnect = vi.fn();
      },
    );
    fetchUnfurlMock.mockImplementation(async () => SPOTIFY_CARD);
    render(<PostBody text="New drop: https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b" density="full" />);
    const chrome = await screen.findByTestId('unfurl-player-chrome');
    // The provider identity is visible (never a native web10 music track).
    expect(screen.getByTestId('unfurl-player-title')).toHaveTextContent('Blinding Lights');
    expect(screen.getByTestId('unfurl-player-provider')).toHaveTextContent('spotify.com');
    // No play button in the chrome (there is nothing to press) and no iframe yet.
    expect(chrome.querySelector('button')).toBeNull();
    expect(screen.queryByTestId('unfurl-player')).toBeNull();
    // The scroll into view loads the provider's iframe (no click involved).
    fireIntersect?.();
    const player = await screen.findByTestId('unfurl-player');
    expect(player.querySelector('iframe')?.getAttribute('src')).toContain('open.spotify.com/embed');
    vi.unstubAllGlobals();
  });

  it('renders the article as a rich card (title + description + domain + image, the whole card is the link)', async () => {
    fetchUnfurlMock.mockImplementation(async () => ARTICLE_CARD);
    render(<PostBody text="Reading today: https://paulgraham.com/greatwork.html" density="full" />);
    const card = await screen.findByTestId('unfurl-card');
    expect(card.tagName).toBe('A');
    expect(card).toHaveAttribute('href', 'https://paulgraham.com/greatwork.html');
    expect(card).toHaveAttribute('target', '_blank');
    expect(screen.getByTestId('unfurl-card-title')).toHaveTextContent('How to Do Great Work');
    expect(screen.getByTestId('unfurl-card-description')).toHaveTextContent('a talk I gave at the University of California');
    expect(screen.getByTestId('unfurl-card-domain')).toHaveTextContent('paulgraham.com');
    const img = screen.getByTestId('unfurl-card-image');
    expect(img.getAttribute('src')).toBe('https://img.example.com/lede.png');
  });

  it('a link that does not unfurl (fetchUnfurl → null) stays the plain clickable link, exactly as today', async () => {
    fetchUnfurlMock.mockImplementation(async () => null);
    const { container } = render(<PostBody text="see https://nowhere.example.com/page" density="full" />);
    await waitFor(() => expect(fetchUnfurlMock).toHaveBeenCalledTimes(1));
    const a = container.querySelector('a[href="https://nowhere.example.com/page"]')!;
    expect(a).toBeTruthy();
    expect(a).toHaveClass('text-brand-300', 'underline');
    expect(a).toHaveAttribute('target', '_blank');
    expect(screen.queryByTestId('unfurl-card')).toBeNull();
    expect(screen.queryByTestId('unfurl-player-placeholder')).toBeNull();
  });

  it('light density never unfurls (a card is a teaser — the plain link stays, no fetch)', async () => {
    const { container } = render(<PostBody text="https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b" density="light" />);
    await waitFor(() => expect(fetchUnfurlMock).not.toHaveBeenCalled());
    expect(container.querySelector('a[href="https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b"]')).toBeTruthy();
  });

  it('the inline renderer (PostBodyInline captions) never unfurls', async () => {
    const { PostBodyInline } = await import('@/components/Feed/PostBody');
    const { container } = render(<PostBodyInline text="https://paulgraham.com/greatwork.html" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchUnfurlMock).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="https://paulgraham.com/greatwork.html"]')).toBeTruthy();
  });

  it('youtube is unchanged (the local embed, no unfurl fetch)', async () => {
    const { container } = render(<PostBody text="https://youtu.be/dQw4w9WgXcQ" density="full" />);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchUnfurlMock).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="youtube-embed-placeholder"]')).toBeTruthy();
  });
});
