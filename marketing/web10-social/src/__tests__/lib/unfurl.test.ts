import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isUnfurlCandidate,
  fetchUnfurl,
  normalizeUnfurlCard,
  UNFURL_PATH,
} from '@/lib/unfurl';

describe('isUnfurlCandidate', () => {
  it('accepts external http(s) links (the article + provider cases)', () => {
    expect(isUnfurlCandidate('https://paulgraham.com/greatwork.html')).toBe(true);
    expect(isUnfurlCandidate('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b')).toBe(true);
    expect(isUnfurlCandidate('https://soundcloud.com/artist/track')).toBe(true);
    expect(isUnfurlCandidate('https://coccus.bandcamp.com/album/x')).toBe(true);
    expect(isUnfurlCandidate('https://www.tiktok.com/@user/video/123')).toBe(true);
    expect(isUnfurlCandidate('https://www.instagram.com/reel/abc/')).toBe(true);
    expect(isUnfurlCandidate('http://example.com')).toBe(true);
  });

  it('excludes the locally-embedded providers (they never round-trip a server)', () => {
    expect(isUnfurlCandidate('https://youtu.be/dQw4w9WgXcQ')).toBe(false);
    expect(isUnfurlCandidate('https://www.youtube.com/watch?v=abc')).toBe(false);
    expect(isUnfurlCandidate('https://www.youtube.com/shorts/abc')).toBe(false);
    expect(isUnfurlCandidate('https://youtube-nocookie.com/embed/abc')).toBe(false);
    expect(isUnfurlCandidate('https://vimeo.com/347119365')).toBe(false);
    expect(isUnfurlCandidate('https://player.vimeo.com/video/1')).toBe(false);
  });

  it('excludes same-host links (the app would make the preview server fetch itself)', () => {
    // jsdom default origin: http://localhost:3000 → hostname "localhost"
    expect(isUnfurlCandidate('https://localhost/x')).toBe(false);
    expect(isUnfurlCandidate('https://LOCALHOST/x')).toBe(false);
    expect(isUnfurlCandidate('https://other.host/x')).toBe(true);
  });

  it('excludes non-http schemes, credentials, and unparseable input', () => {
    expect(isUnfurlCandidate('mailto:hi@x.com')).toBe(false);
    expect(isUnfurlCandidate('javascript:alert(1)')).toBe(false);
    expect(isUnfurlCandidate('data:text/html,x')).toBe(false);
    expect(isUnfurlCandidate('https://user:pass@example.com/x')).toBe(false);
    expect(isUnfurlCandidate('not a url')).toBe(false);
    expect(isUnfurlCandidate('')).toBe(false);
    expect(isUnfurlCandidate(null)).toBe(false);
    expect(isUnfurlCandidate(undefined)).toBe(false);
  });
});

describe('normalizeUnfurlCard', () => {
  it('passes a full card through (url/domain/title/description/image)', () => {
    const card = normalizeUnfurlCard({
      url: 'https://paulgraham.com/greatwork.html',
      domain: 'paulgraham.com',
      provider: 'generic',
      title: 'How to Do Great Work',
      description: 'A talk about doing great work.',
      image: 'https://paulgraham.com/img.png',
      embed: null,
    });
    expect(card).toMatchObject({
      url: 'https://paulgraham.com/greatwork.html',
      domain: 'paulgraham.com',
      provider: 'generic',
      title: 'How to Do Great Work',
      description: 'A talk about doing great work.',
      image: 'https://paulgraham.com/img.png',
      embed: null,
    });
  });

  it('keeps an embed only when its src is on the provider allowlist', () => {
    const good = normalizeUnfurlCard({
      url: 'https://open.spotify.com/track/x',
      domain: 'spotify.com',
      provider: 'spotify',
      title: 'Blinding Lights',
      image: null,
      embed: { src: 'https://open.spotify.com/embed/track/x', height: 152 },
    });
    expect(good?.embed?.src).toBe('https://open.spotify.com/embed/track/x');

    // An oEmbed provider pointing the iframe at a third party is refused
    // (the client half of the two-sided gate) — the card still renders,
    // without the iframe.
    const bad = normalizeUnfurlCard({
      url: 'https://open.spotify.com/track/x',
      domain: 'spotify.com',
      provider: 'spotify',
      title: 'Blinding Lights',
      description: 'The Weeknd',
      image: 'https://i.scdn.co/cover.png',
      embed: { src: 'https://evil.example.com/x', height: 152 },
    });
    expect(bad?.embed).toBeNull();
    expect(bad?.title).toBe('Blinding Lights');

    const unknownProvider = normalizeUnfurlCard({
      url: 'https://x.example.com/',
      domain: 'x.example.com',
      provider: 'mystery',
      title: 'T',
      description: 'D',
      embed: { src: 'https://mystery.example.com/embed', height: 152 },
    });
    expect(unknownProvider?.embed).toBeNull();
  });

  it('rejects relative / data: images and a missing url', () => {
    const withDesc = { url: 'https://x.example.com/', domain: 'x.example.com', provider: 'generic', title: 'T', description: 'D', embed: null };
    expect(normalizeUnfurlCard({ ...withDesc, image: '/relative.png' })).toMatchObject({ image: null });
    expect(normalizeUnfurlCard({ ...withDesc, image: 'data:image/png;base64,x' })).toMatchObject({ image: null });
    expect(normalizeUnfurlCard({ domain: 'x.example.com', provider: 'generic', title: 'T', embed: null })).toBeNull();
  });

  it('drops an empty card (nothing to render — the plain link wins)', () => {
    expect(normalizeUnfurlCard({ url: 'https://x.example.com/', domain: 'x.example.com', provider: 'generic', title: 'Only a title', description: null, image: null, embed: null })).toBeNull();
    expect(normalizeUnfurlCard({ url: 'https://x.example.com/', domain: 'x.example.com', provider: 'generic', title: null, description: null, image: null, embed: null })).toBeNull();
    expect(normalizeUnfurlCard(null)).toBeNull();
    expect(normalizeUnfurlCard('not an object')).toBeNull();
  });

  it('accepts title + description without an image (a text card)', () => {
    const card = normalizeUnfurlCard({
      url: 'https://paulgraham.com/greatwork.html',
      domain: 'paulgraham.com',
      provider: 'generic',
      title: 'How to Do Great Work',
      description: 'This is a talk…',
      image: null,
      embed: null,
    });
    expect(card).not.toBeNull();
    expect(card?.image).toBeNull();
  });

  it('bounds the embed height', () => {
    const tall = normalizeUnfurlCard({
      url: 'https://open.spotify.com/track/x', domain: 'spotify.com', provider: 'spotify', title: 'T',
      embed: { src: 'https://open.spotify.com/embed/track/x', height: 9999 },
    });
    expect(tall?.embed?.height).toBe(1200);
    const short = normalizeUnfurlCard({
      url: 'https://open.spotify.com/track/x', domain: 'spotify.com', provider: 'spotify', title: 'T',
      embed: { src: 'https://open.spotify.com/embed/track/x', height: 10 },
    });
    expect(short?.embed?.height).toBe(80);
  });
});

describe('fetchUnfurl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // The session cache is module state — flush it between tests.
    vi.resetModules();
  });

  function mockFetch(response: { status?: number; body?: unknown; contentType?: string; throws?: boolean }) {
    return vi.fn().mockImplementation(async () => {
      if (response.throws) throw new Error('network down');
      return {
        ok: (response.status ?? 200) < 400,
        status: response.status ?? 200,
        headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? response.contentType ?? 'application/json' : null) },
        json: async () => response.body,
      } as unknown as Response;
    });
  }

  it('never fetches a non-candidate (youtube stays local)', async () => {
    const fetchMock = mockFetch({ body: { ok: true, card: {} } });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    const card = await fu('https://youtu.be/dQw4w9WgXcQ');
    expect(card).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns the card on a 200 + ok', async () => {
    const card = {
      url: 'https://paulgraham.com/greatwork.html',
      domain: 'paulgraham.com',
      provider: 'generic',
      title: 'How to Do Great Work',
      description: 'A talk',
      image: null,
      embed: null,
    };
    vi.stubGlobal('fetch', mockFetch({ body: { ok: true, card } }));
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    expect(await fu('https://paulgraham.com/greatwork.html')).toMatchObject({ title: 'How to Do Great Work', domain: 'paulgraham.com' });
    // The request is the exact same-origin endpoint with the url encoded.
    const calledUrl = (vi.mocked(fetch).mock.calls[0][0] as string);
    expect(calledUrl).toBe(`${UNFURL_PATH}?url=${encodeURIComponent('https://paulgraham.com/greatwork.html')}`);
  });

  it('pins the success in the session cache (no second fetch)', async () => {
    const fetchMock = mockFetch({ body: { ok: true, card: { url: 'https://x.example.com/', domain: 'x.example.com', provider: 'generic', title: 'T', description: 'D', image: null, embed: null } } });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    await fu('https://x.example.com/a');
    await fu('https://x.example.com/a#frag');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['ok:false (no metadata)', { body: { ok: false, reason: 'no_metadata' } }],
    ['a 400 (invalid url)', { status: 400, body: { ok: false, reason: 'invalid_url' } }],
    ['a 403 (SSRF-blocked)', { status: 403, body: { ok: false, reason: 'blocked' } }],
    ['a 429 (rate limited)', { status: 429, body: { ok: false, reason: 'rate_limited' } }],
    ['a 500', { status: 500, body: { ok: false, reason: 'unavailable' } }],
    ['non-JSON (the SPA fell through)', { contentType: 'text/html', body: '<html/>' }],
    ['bad JSON body', { body: '{not json' }],
  ])('degrades to the plain link (null) on %s', async (_name, response) => {
    vi.stubGlobal('fetch', mockFetch(response));
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    expect(await fu('https://x.example.com/fail')).toBeNull();
  });

  it('degrades to the plain link on a network error — and RETRIES on the next mount (failures are not pinned)', async () => {
    const fetchMock = mockFetch({ throws: true });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    expect(await fu('https://x.example.com/down')).toBeNull();
    expect(await fu('https://x.example.com/down')).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // the retry is the point
  });

  it('dedupes concurrent mounts of the same link (single-flight)', async () => {
    let resolveFetch: ((r: unknown) => void) | null = null;
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { fetchUnfurl: fu } = await import('@/lib/unfurl');
    const pa = fu('https://dup.example.com/');
    const pb = fu('https://dup.example.com/'); // in flight — must NOT re-fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFetch!({
      ok: true,
      status: 200,
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : null) },
      json: async () => ({ ok: false, reason: 'no_metadata' }),
    });
    const [a, b] = await Promise.all([pa, pb]);
    expect(a).toBeNull();
    expect(b).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
