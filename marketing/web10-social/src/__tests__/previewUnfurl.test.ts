// The link-unfurl server logic (preview/unfurl.mjs) — the real module, driven
// through its injected seams (doFetch + lookup), so the SSRF guard, the
// provider dispatch, the oEmbed/page parsing, and the cache are all tested
// against the code that ships, not a copy of it. The HTTP route itself
// (server.mjs) is tested in previewServerUnfurl.test.ts (real process, real
// transport — the SSRF replay gate: the exploit url is handed over the wire
// and denied before any fetch).
import { describe, it, expect } from 'vitest';
import {
  createUnfurlService,
  isPrivateIPv4,
  isPrivateIPv6,
  extractMetaTags,
  firstParagraph,
  firstProseBlock,
  firstImage,
  providerForHost,
  displayDomain,
  unescapeEntities,
} from '../../preview/unfurl.mjs';

// ── the fake network ───────────────────────────────────────────────────────

// A world where `host` resolves to the given public ip.
function publicLookup(host: string, ip = '93.184.215.14') {
  return async (h: string) => {
    if (h === host) return [{ address: ip, family: 4 }];
    if (h.endsWith('.example.com') || h === 'example.com') return [{ address: '93.184.215.14', family: 4 }];
    throw Object.assign(new Error('ENOTFOUND ' + h), { code: 'ENOTFOUND' });
  };
}

function fetchWorld(routes: Array<{ match: string | RegExp; status?: number; contentType?: string; body?: string; headers?: Record<string, string> }>) {
  const calls: string[] = [];
  const doFetch = async (url: URL | string, opts?: { redirect?: string; headers?: Record<string, string>; signal?: AbortSignal }) => {
    const u = String(url);
    calls.push(u);
    if (opts?.signal?.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    for (const route of routes) {
      // String patterns are regex sources (^…$ anchored); both forms test.
      const hit = (route.match instanceof RegExp ? route.match : new RegExp(route.match)).test(u);
      if (!hit) continue;
      const body = route.body ?? '';
      const headers = new Map(Object.entries(route.headers ?? { 'content-type': route.contentType ?? 'text/html; charset=utf-8' }));
      return {
        status: route.status ?? 200,
        headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
        // A null body + text() is the seam the module's 2xx reader uses when
        // res.body is absent; keep both honest.
        body: null,
        text: async () => body,
      };
    }
    throw Object.assign(new Error('no route for ' + u), { code: 'ENOROUTE' });
  };
  return { calls, doFetch };
}

// ── the SSRF guard (the security seam — replayed, denied) ─────────────────

describe('SSRF guard', () => {
  const svc = createUnfurlService({ doFetch: fetchWorld([]).doFetch, lookup: publicLookup('x.example.com') });

  it.each([
    ['the loopback ip literal', 'http://127.0.0.1:8080/admin'],
    ['a loopback v6 literal', 'http://[::1]/admin'],
    ['the private v4 range', 'http://10.0.0.1/'],
    ['the private v4 range (172.16/12)', 'http://172.16.0.1/'],
    ['the private v4 range (192.168/16)', 'http://192.168.1.1/'],
    ['the cloud-metadata link-local', 'http://169.254.169.254/latest/meta-data/'],
    ['the cgnat range', 'http://100.64.0.1/'],
    ['the "this" network', 'http://0.0.0.0/'],
    ['the test-net range', 'http://198.51.100.7/'],
    ['localhost by name', 'http://localhost/'],
    ['a .localhost name', 'http://api.localhost/'],
    ['a single-label docker service name', 'http://api/'],
    ['an mDNS name', 'http://target.local/'],
    ['a credentials-carrying url', 'http://user:pass@example.com/'],
  ])('refuses %s with a blocked verdict (no fetch leaves the box)', async (_name, url) => {
    const world = fetchWorld([]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('example.com') });
    const result = await service.unfurl(url);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('blocked');
    expect(world.calls).toEqual([]); // the refusal is BEFORE any fetch
  });

  it.each([
    ['a non-http(s) scheme', 'ftp://example.com/file'],
    ['a data: url', 'data:text/html,<script>alert(1)</script>'],
    ['garbage', 'not a url'],
    ['an empty string', ''],
  ])('refuses %s as invalid', async (_name, url) => {
    const result = await svc.unfurl(url);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('invalid_url');
  });

  it('refuses a host whose ANY resolved address is private (the rebinding path)', async () => {
    const lookup = async (h: string) => {
      if (h === 'binder.example.com') return [{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }];
      throw new Error('ENOTFOUND');
    };
    const world = fetchWorld([]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup });
    const result = await service.unfurl('https://binder.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    expect(world.calls).toEqual([]);
  });

  it('refuses a redirect that lands on a private address (the classic SSRF escape)', async () => {
    const lookup = async (h: string) => {
      if (h === 'redirector.example.com') return [{ address: '8.8.8.8', family: 4 }];
      throw new Error('ENOTFOUND');
    };
    const world = fetchWorld([
      {
        match: '^https://redirector\\.example\\.com/go$',
        status: 302,
        headers: { location: 'http://127.0.0.1:8080/steal', 'content-type': 'text/html' },
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup });
    const result = await service.unfurl('https://redirector.example.com/go');
    expect(result).toMatchObject({ ok: false, reason: 'blocked' });
    // The first hop was fetched; the private hop was never fetched.
    expect(world.calls).toEqual(['https://redirector.example.com/go']);
  });

  it('caps the redirect chain (a loop is not a fetch loop)', async () => {
    const lookup = async (h: string) => (h === 'loop.example.com' ? [{ address: '8.8.8.8', family: 4 }] : Promise.reject(new Error('ENOTFOUND')));
    const world = fetchWorld([
      { match: '^https://loop\\.example\\.com/\\?h=', status: 302, headers: { location: 'https://loop.example.com/?h=more', 'content-type': 'text/html' } },
      { match: '^https://loop\\.example\\.com/$', status: 302, headers: { location: 'https://loop.example.com/?h=more', 'content-type': 'text/html' } },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup });
    const result = await service.unfurl('https://loop.example.com/');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unavailable');
    expect(world.calls.length).toBeLessThanOrEqual(7); // 5 hops + slack, never unbounded
  });

  it('a DNS failure is "unavailable" (the plain link), not "blocked"', async () => {
    const lookup = async () => {
      throw Object.assign(new Error('ENOTFOUND ghost.example.com'), { code: 'ENOTFOUND' });
    };
    const service = createUnfurlService({ doFetch: fetchWorld([]).doFetch, lookup });
    const result = await service.unfurl('https://ghost.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });
});

// ── the generic page path (articles, the Reading Links case) ──────────────

describe('generic unfurl (the Open Graph page)', () => {
  function articleWorld(extraHead = '') {
    return fetchWorld([
      {
        match: '^https://paulgraham\\.com/greatwork\\.html$',
        body:
          `<html><head><title>How to Do Great Work</title>${extraHead}</head>` +
          '<body><p>short</p><img src="https://ad.example.com/1x1.gif"><img src="https://img.example.com/lede.png">' +
          '<p>This is a talk I gave at the University of California, Santa Cruz, in 2009. It is about doing great work, and how to recognize it when you see it.</p></body></html>',
      },
    ]);
  }

  it('falls back to <title> + the first real paragraph when the page has no og tags (paulgraham.com, the verified case)', async () => {
    const world = articleWorld();
    const lookup = publicLookup('paulgraham.com');
    const service = createUnfurlService({ doFetch: world.doFetch, lookup });
    const result = await service.unfurl('https://paulgraham.com/greatwork.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('generic');
    expect(result.card.domain).toBe('paulgraham.com');
    expect(result.card.title).toBe('How to Do Great Work');
    expect(result.card.description).toContain('a talk I gave at the University of California');
    // The 1x1 gif is skipped; the lede image wins.
    expect(result.card.image).toBe('https://img.example.com/lede.png');
    expect(result.card.embed).toBeNull();
  });

  it('prefers og: tags over the fallbacks, with entities unescaped', async () => {
    const world = articleWorld(
      '<meta property="og:title" content="How to Do Great Work &amp; More"/>' +
        '<meta property="og:description" content="The og description &#8212; wins"/>' +
        '<meta property="og:image" content="https://og.example.com/hero.png"/>',
    );
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('paulgraham.com') });
    const result = await service.unfurl('https://paulgraham.com/greatwork.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title).toBe('How to Do Great Work & More');
    expect(result.card.description).toBe('The og description — wins');
    expect(result.card.image).toBe('https://og.example.com/hero.png');
  });

  it('resolves a relative og:image against the page url', async () => {
    const world = articleWorld('<meta property="og:image" content="/img/hero.png"/>');
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('paulgraham.com') });
    const result = await service.unfurl('https://paulgraham.com/greatwork.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.image).toBe('https://paulgraham.com/img/hero.png');
  });

  it('a legacy page with no <p> and no meta description still unfurls (the title + the opening prose, the paulgraham.com shape)', async () => {
    const world = fetchWorld([
      {
        match: '^https://legacy\\.example\\.com/article$',
        body:
          '<html><head><title>Great Work</title></head><body><font size="2">July 2023<br /><br />' +
          'If you collected lists of techniques for doing great work in a lot of different fields, ' +
          'what would the intersection look like? I decided to find out by making it.</font></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('legacy.example.com') });
    const result = await service.unfurl('https://legacy.example.com/article');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title).toBe('Great Work');
    expect(result.card.description).toBe('If you collected lists of techniques for doing great work in a lot of different fields, what would the intersection look like?');
  });

  it('truncates long titles/descriptions', async () => {
    const world = articleWorld('<meta property="og:title" content="' + 'x'.repeat(300) + '"/>');
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('paulgraham.com') });
    const result = await service.unfurl('https://paulgraham.com/greatwork.html');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title!.length).toBeLessThanOrEqual(121);
    expect(result.card.title!.endsWith('…')).toBe(true);
  });

  it('a title-only page (no description, no image) does not unfurl (the plain link stays)', async () => {
    const world = fetchWorld([
      {
        match: '^https://bare\\.example\\.com/x$',
        body: '<html><head><title>Just A Title</title></head><body><p>tiny</p></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('bare.example.com') });
    const result = await service.unfurl('https://bare.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'no_metadata' });
  });

  it('a non-html 200 (a pdf, a zip) does not unfurl', async () => {
    const world = fetchWorld([
      { match: '^https://files\\.example\\.com/doc\\.pdf$', contentType: 'application/pdf', body: '%' },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('files.example.com') });
    const result = await service.unfurl('https://files.example.com/doc.pdf');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('a 404 target does not unfurl', async () => {
    const world = fetchWorld([{ match: '^https://gone\\.example\\.com/x$', status: 404, body: '' }]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('gone.example.com') });
    const result = await service.unfurl('https://gone.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('an aborted fetch (the timeout) does not unfurl', async () => {
    const doFetch = async (_url: URL, opts?: { signal?: AbortSignal }) => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    };
    const service = createUnfurlService({ doFetch, lookup: publicLookup('slow.example.com') });
    const result = await service.unfurl('https://slow.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('a truncated body keeps the HEAD it read (the og tags are the first bytes — a big page still unfurls)', async () => {
    const head = '<html><head><meta property="og:title" content="Big Page"/><meta name="description" content="The head lands before the cap even on a huge document, with enough words."></head><body>';
    const service = createUnfurlService({
      doFetch: async () => {
        // Emulate a stream that exceeds MAX_PAGE_BYTES in one chunk (the
        // og head comes first, the 800KB of junk after).
        const big = head + 'a'.repeat(800 * 1024) + '</body></html>';
        return {
          status: 200,
          headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
          body: (async function* () {
            yield new TextEncoder().encode(big);
          })(),
          text: async () => big,
        };
      },
      lookup: publicLookup('big.example.com'),
    });
    const result = await service.unfurl('https://big.example.com/x');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.card.title).toBe('Big Page');
  });

  it('a body that truncates to nothing (a binary masquerading as html) does not unfurl', async () => {
    const service = createUnfurlService({
      doFetch: async () => ({
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
        body: null,
        text: async () => '',
      }),
      lookup: publicLookup('empty.example.com'),
    });
    const result = await service.unfurl('https://empty.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('a bot-challenge wall ("Client Challenge") is refused as no_metadata — never a wall card', async () => {
    const service = createUnfurlService({
      doFetch: async () => ({
        status: 200,
        headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) },
        body: null,
        text: async () =>
          '<html><head><title>Client Challenge</title><meta name="description" content="JavaScript is disabled in your browser. Please enable JavaScript to proceed."><meta property="og:image" content="https://x.example.com/_fs-ch-1T1wmsGaOgGaSxcX/assets/errorIcon.svg"></head><body><img src="/_fs-ch-1T1wmsGaOgGaSxcX/assets/errorIcon.svg"></body></html>',
      }),
      lookup: publicLookup('wall.example.com'),
    });
    const result = await service.unfurl('https://wall.example.com/x');
    expect(result).toMatchObject({ ok: false, reason: 'no_metadata' });
  });

  it('follows a redirect chain (http → https) and reads the final page', async () => {
    const world = fetchWorld([
      { match: '^http://moved\\.example\\.com/x$', status: 301, headers: { location: 'https://moved.example.com/x', 'content-type': 'text/html' } },
      { match: '^https://moved\\.example\\.com/x$', body: '<html><head><meta property="og:title" content="Moved"/ ><meta name="description" content="I moved homes, with words to say."></head><body></body></html>' },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('moved.example.com') });
    const result = await service.unfurl('http://moved.example.com/x');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title).toBe('Moved');
    expect(world.calls).toHaveLength(2);
  });
});

// ── the provider oEmbeds (the New Music + Shorts cases) ───────────────────

describe('provider oEmbeds', () => {
  it('Spotify: the oEmbed answer becomes a player card (iframe + artwork + title)', async () => {
    const world = fetchWorld([
      {
        match: '^https://open\\.spotify\\.com/oembed\\?url=',
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Blinding Lights',
          thumbnail_url: 'https://i.scdn.co/image/cover.png',
          iframe_url: 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b?utm_source=oembed',
          width: 456,
          height: 152,
          type: 'rich',
        }),
      },
    ]);
    const lookup = publicLookup('open.spotify.com');
    const service = createUnfurlService({ doFetch: world.doFetch, lookup });
    const result = await service.unfurl('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('spotify');
    expect(result.card.domain).toBe('spotify.com'); // the brand domain, not open.spotify.com
    expect(result.card.title).toBe('Blinding Lights');
    expect(result.card.image).toBe('https://i.scdn.co/image/cover.png');
    expect(result.card.embed?.src).toContain('open.spotify.com/embed/track/');
    expect(result.card.embed?.height).toBe(152);
    expect(world.calls).toHaveLength(1); // the oEmbed endpoint, not the track page
  });

  it('Spotify: an oEmbed with author_name carries the artist into the description (the "Blinding Lights — The Weeknd" case)', async () => {
    const world = fetchWorld([
      {
        match: '^https://open\\.spotify\\.com/oembed\\?url=',
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Blinding Lights',
          author_name: 'The Weeknd',
          thumbnail_url: 'https://i.scdn.co/image/cover.png',
          iframe_url: 'https://open.spotify.com/embed/track/0VjIjW4GlUZAMYd2vXMi3b',
          height: 152,
        }),
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('open.spotify.com') });
    const result = await service.unfurl('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.description).toContain('The Weeknd');
    expect(result.card.description).toContain('Blinding Lights');
  });

  it('Spotify: when the oEmbed fails, the track page (og tags) is the fallback', async () => {
    const world = fetchWorld([
      { match: '^https://open\\.spotify\\.com/oembed\\?url=', status: 500, body: 'oops' },
      {
        match: '^https://open\\.spotify\\.com/track/0VjIjW4GlUZAMYd2vXMi3b$',
        body:
          '<html><head><meta property="og:title" content="Blinding Lights - The Weeknd | Spotify"/>' +
          '<meta property="og:description" content="Play Blinding Lights by The Weeknd on Spotify"/></head><body></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('open.spotify.com') });
    const result = await service.unfurl('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title).toBe('Blinding Lights - The Weeknd | Spotify');
    expect(result.card.embed).toBeNull();
  });

  it('Spotify: an oEmbed iframe_url that escapes the provider is dropped (the server half of the two-sided embed gate)', async () => {
    const world = fetchWorld([
      {
        match: '^https://open\\.spotify\\.com/oembed\\?url=',
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Blinding Lights',
          thumbnail_url: 'https://i.scdn.co/image/cover.png',
          iframe_url: 'https://evil.example.com/phish',
          height: 152,
        }),
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('open.spotify.com') });
    const result = await service.unfurl('https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b');
    // The oEmbed's embed is REFUSED (the src escaped the provider) — but the
    // oEmbed still carried a title + artwork, so the card ships WITHOUT the
    // iframe: the plain link with a picture, never a foreign embed.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.card.embed).toBeNull();
      expect(result.card.title).toBe('Blinding Lights');
      expect(result.card.image).toBe('https://i.scdn.co/image/cover.png');
    }
  });

  it('SoundCloud: the oEmbed html (no iframe_url) is parsed; the player + author + artwork land', async () => {
    const world = fetchWorld([
      {
        match: '^https://soundcloud\\.com/oembed\\?url=',
        contentType: 'application/json',
        body: JSON.stringify({
          title: 'Blinding Lights by The Weeknd',
          author_name: 'The Weeknd',
          thumbnail_url: 'https://i1.sndcdn.com/artworks-ri09KHvmlBeV-0-t500x500.jpg',
          html:
            '<iframe width="100%" height="400" src="https://w.soundcloud.com/player/?visual=true&amp;url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F718846078&amp;show_artwork=true"></iframe>',
          height: 400,
        }),
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('soundcloud.com') });
    const result = await service.unfurl('https://soundcloud.com/theweeknd/blinding-lights');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('soundcloud');
    expect(result.card.embed?.src).toBe('https://w.soundcloud.com/player/?visual=true&url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F718846078&show_artwork=true');
    expect(result.card.embed?.height).toBe(320); // the 400 is capped
    expect(result.card.image).toBe('https://i1.sndcdn.com/artworks-ri09KHvmlBeV-0-t500x500.jpg');
  });

  it('TikTok: the oEmbed player lands with autoplay/muted stripped (the click-to-load pattern)', async () => {
    const world = fetchWorld([
      {
        match: '^https://www\\.tiktok\\.com/oembed\\?url=',
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'video',
          width: '325',
          height: '578',
          html: '<iframe height="578" width="325" src="https://www.tiktok.com/player/v1/7250605659302058253?embed_from=oembed&music_info=1&description=1&autoplay=1&muted=1"></iframe>',
        }),
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('www.tiktok.com') });
    const result = await service.unfurl('https://www.tiktok.com/@user/video/7250605659302058253');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('tiktok');
    const src = result.card.embed?.src ?? '';
    expect(src).toContain('www.tiktok.com/player/v1/7250605659302058253');
    expect(src).not.toContain('autoplay=');
    expect(src).not.toContain('muted=');
    expect(result.card.embed?.width).toBe(325);
    expect(result.card.embed?.height).toBe(578);
  });

  it('an oEmbed for a NON-provider url never fires (a random site is not sent to spotify)', async () => {
    const world = fetchWorld([
      { match: '^https://random\\.example\\.com/x$', body: '<html><head><meta property="og:title" content="R"/><meta name="description" content="A random page with enough words to count."></head><body></body></html>' },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('random.example.com') });
    const result = await service.unfurl('https://random.example.com/x');
    expect(result.ok).toBe(true);
    expect(world.calls.every((c) => c.startsWith('https://random.example.com'))).toBe(true);
  });
});

// ── bandcamp + instagram (the page-path providers) ────────────────────────

describe('bandcamp + instagram pages', () => {
  it('Bandcamp: the twitter:player card becomes an embedded player (album art + title)', async () => {
    const world = fetchWorld([
      {
        match: '^https://coccus\\.bandcamp\\.com/album/cant-feel-my-face$',
        body:
          '<html><head>' +
          '<meta property="og:title" content="Can&#39;t Feel My Face (The Unreal Remixes), by The Weeknd"/>' +
          '<meta property="og:type" content="album"/>' +
          '<meta property="og:description" content="5 track album"/>' +
          '<meta property="og:image" content="https://f4.bcbits.com/img/a3373828791_5.jpg"/>' +
          '<meta name="twitter:card" content="player"/>' +
          '<meta property="twitter:player" content="https://bandcamp.com/EmbeddedPlayer/v=2/album=1670014164/size=large/linkcol=0084B4/notracklist=true/twittercard=true/"/>' +
          '<meta property="og:video:height" content="120"/>' +
          '</head><body></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('coccus.bandcamp.com') });
    const result = await service.unfurl('https://coccus.bandcamp.com/album/cant-feel-my-face');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('bandcamp');
    expect(result.card.title).toBe("Can't Feel My Face (The Unreal Remixes), by The Weeknd");
    expect(result.card.image).toBe('https://f4.bcbits.com/img/a3373828791_5.jpg');
    expect(result.card.embed?.src).toContain('bandcamp.com/EmbeddedPlayer/');
    expect(result.card.embed?.height).toBe(120);
  });

  it('Bandcamp: a page without the player card renders the rich card (artwork + title)', async () => {
    const world = fetchWorld([
      {
        match: '^https://refracta\\.bandcamp\\.com/track/refracta-the-weeknd-dub$',
        body:
          '<html><head>' +
          '<meta property="og:title" content="REFRACTA // THE WEEKND DUB, by REFRACTA"/>' +
          '<meta property="og:description" content="A dub remix"/>' +
          '<meta property="og:image" content="https://f4.bcbits.com/img/cover.jpg"/>' +
          '<meta name="twitter:card" content="summary"/>' +
          '</head><body></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('refracta.bandcamp.com') });
    const result = await service.unfurl('https://refracta.bandcamp.com/track/refracta-the-weeknd-dub');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.embed).toBeNull();
    expect(result.card.image).toBe('https://f4.bcbits.com/img/cover.jpg');
  });

  it('Instagram: the crawler-UA reel shell (og:image + the meta description) renders a card with the handle as title', async () => {
    const world = fetchWorld([
      {
        match: '^https://www\\.instagram\\.com/reel/DR5lfWujVO2/',
        body:
          '<html><head>' +
          '<meta property="og:type" content="article"/>' +
          '<meta property="og:site_name" content="Instagram"/>' +
          '<meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg"/>' +
          '<meta property="og:url" content="https://www.instagram.com/itsnaglis/reel/DR5lfWujVO2/"/>' +
          '<meta name="description" content="4,190 likes, 99 comments - itsnaglis on December 5, 2025: Tiktok vs Instagram"/>' +
          '</head><body></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('www.instagram.com') });
    const result = await service.unfurl('https://www.instagram.com/reel/DR5lfWujVO2/');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.provider).toBe('instagram');
    expect(result.card.title).toBe('Instagram'); // no handle segment in the fetched url
    expect(result.card.image).toBe('https://scontent.cdninstagram.com/thumb.jpg');
    expect(result.card.description).toContain('itsnaglis');
  });

  it('Instagram: the canonical /u/handle/reel shape titles the card with the handle', async () => {
    const world = fetchWorld([
      {
        match: '^https://www\\.instagram\\.com/itsnaglis/reel/DR5lfWujVO2/',
        body:
          '<html><head>' +
          '<meta property="og:image" content="https://scontent.cdninstagram.com/thumb.jpg"/>' +
          '<meta property="og:url" content="https://www.instagram.com/itsnaglis/reel/DR5lfWujVO2/"/>' +
          '<meta name="description" content="4,190 likes - itsnaglis on December 5, 2025"/>' +
          '</head><body></body></html>',
      },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('www.instagram.com') });
    const result = await service.unfurl('https://www.instagram.com/itsnaglis/reel/DR5lfWujVO2/');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.title).toBe('@itsnaglis · Instagram');
  });
});

describe('the UA posture (the verified provider matrix)', () => {
  function uaCapturingWorld(pageBody: string, urlMatch: string) {
    const uas: string[] = [];
    const doFetch = async (_url: URL, opts?: { headers?: Record<string, string> }) => {
      uas.push(opts?.headers?.['User-Agent'] || '');
      return { status: 200, headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'text/html' : null) }, body: null, text: async () => pageBody };
    };
    return { uas, doFetch, match: urlMatch };
  }
  const PAGE = '<html><head><meta property="og:title" content="P"/><meta name="description" content="A description long enough to pass the card bar, with words."></head><body></body></html>';

  it('a generic page wears the browser UA (the Bandcamp client-challenge lesson)', async () => {
    const w = uaCapturingWorld(PAGE, 'x');
    const service = createUnfurlService({ doFetch: w.doFetch, lookup: publicLookup('ua.example.com') });
    await service.unfurl('https://ua.example.com/x');
    expect(w.uas[0]).toContain('Chrome');
    expect(w.uas[0]).not.toContain('Googlebot');
  });

  it('instagram wears the crawler UA (the bot-only reels shell)', async () => {
    const w = uaCapturingWorld(PAGE, 'x');
    const service = createUnfurlService({ doFetch: w.doFetch, lookup: publicLookup('www.instagram.com') });
    await service.unfurl('https://www.instagram.com/reel/x/');
    expect(w.uas[0]).toContain('Googlebot');
  });

  it('the oEmbed endpoints wear the browser UA (the endpoints are UA-agnostic; the wall is on the pages)', async () => {
    const w = uaCapturingWorld(PAGE, 'x');
    const service = createUnfurlService({ doFetch: w.doFetch, lookup: publicLookup('open.spotify.com') });
    await service.unfurl('https://open.spotify.com/track/x');
    expect(w.uas[0]).toContain('Chrome');
  });
});

// ── the cache (the "not re-fetched on every view" requirement) ────────────

describe('the cache', () => {
  it('a successful card is not re-fetched on the second view', async () => {
    const world = fetchWorld([
      { match: '^https://cached\\.example\\.com/x$', body: '<html><head><meta property="og:title" content="C"/><meta name="description" content="A cached description long enough to pass the card bar."></head><body></body></html>' },
    ]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('cached.example.com'), now: () => 0 });
    await service.unfurl('https://cached.example.com/x');
    const second = await service.unfurl('https://cached.example.com/x#frag');
    expect(world.calls).toHaveLength(1);
    expect(second.ok).toBe(true);
  });

  it('a failure is negative-cached (the target is not hammered)', async () => {
    const world = fetchWorld([{ match: '^https://down\\.example\\.com/x$', status: 503, body: '' }]);
    const service = createUnfurlService({ doFetch: world.doFetch, lookup: publicLookup('down.example.com'), now: () => 0 });
    await service.unfurl('https://down.example.com/x');
    await service.unfurl('https://down.example.com/x');
    expect(world.calls).toHaveLength(1);
  });

  it('the negative cache expires (the target gets one more chance)', async () => {
    let clock = 0;
    const calls: number[] = [];
    const doFetch = async (url: URL | string) => {
      calls.push(clock);
      return {
        status: 503,
        headers: { get: () => null },
        body: null,
        text: async () => '',
      };
    };
    const service = createUnfurlService({ doFetch, lookup: publicLookup('flaky.example.com'), now: () => clock });
    await service.unfurl('https://flaky.example.com/x'); // t=0 → fetch
    clock = 9 * 60 * 1000; // within the 10-minute negative TTL
    await service.unfurl('https://flaky.example.com/x'); // cached — no fetch
    clock = 11 * 60 * 1000; // past it
    await service.unfurl('https://flaky.example.com/x'); // re-fetched
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBe(11 * 60 * 1000);
  });

  it('a blocked verdict is cached long (re-asking 127.0.0.1 never re-resolves)', async () => {
    let lookups = 0;
    const service = createUnfurlService({
      doFetch: fetchWorld([]).doFetch,
      lookup: async () => {
        lookups += 1;
        return [{ address: '127.0.0.1', family: 4 }];
      },
      now: () => 0,
    });
    await service.unfurl('http://127.0.0.1/x');
    await service.unfurl('http://127.0.0.1/x');
    expect(lookups).toBe(0); // an ip literal is judged before dns
  });
});

// ── the pure helpers (the extraction table, pinned) ───────────────────────

describe('the extraction helpers', () => {
  it('extractMetaTags: property + name + unquoted attrs, first wins', () => {
    const html =
      '<meta property="og:title" content="A"><meta name="og:title" content="B">' +
      '<meta name=description content="unquoted"><meta itemprop="og:image" content="not a meta key">' +
      '<meta content="first" property="og:description"><meta content="second" property="og:description">';
    const meta = extractMetaTags(html);
    expect(meta['og:title']).toBe('A');
    expect(meta['description']).toBe('unquoted');
    expect(meta['og:description']).toBe('first');
  });

  it('firstParagraph skips the short boilerplate <p>', () => {
    const html = '<p>ok</p><p style="x">Another short one.</p><p>The lede: enough words in this paragraph to qualify as a real description for the card.</p>';
    expect(firstParagraph(html)).toBe('The lede: enough words in this paragraph to qualify as a real description for the card.');
  });

  it('firstProseBlock: the legacy no-<p> page (paulgraham.com, the verified case) — the title echo + the date stamp drop, the lede sentences stay whole', () => {
    const html =
      '<html><head><title>How to Do Great Work</title></head><body>' +
      '<font size="2" face="verdana">How to Do Great Work</font><br /><br /><font size="2" face="verdana">July 2023<br /><br />' +
      'If you collected lists of techniques for doing great work in a lot\n' +
      'of different fields, what would the intersection look like? I decided\n' +
      'to find out by making it.<br /><br />Partly my goal was to create a guide.</font></body></html>';
    expect(firstProseBlock(html, 'How to Do Great Work')).toBe(
      'If you collected lists of techniques for doing great work in a lot of different fields, what would the intersection look like?',
    );
  });

  it('firstProseBlock: a title-only page has no lede (null, not the title)', () => {
    expect(firstProseBlock('<html><body><h1>Only A Title</h1></body></html>', 'Only A Title')).toBeNull();
  });

  it('firstImage skips gifs + pixel patterns, resolves relatives', () => {
    const html = '<img src="a.gif"><img src="/x/1x1.png"><img src="lede.jpg">';
    expect(firstImage(html, 'https://s.example.com/p')).toBe('https://s.example.com/lede.jpg');
    expect(firstImage('<img src="data:image/png;base64,xx">', 'https://s.example.com/p')).toBeNull();
  });

  it('providerForHost routes the provider shapes', () => {
    expect(providerForHost('open.spotify.com')).toBe('spotify');
    expect(providerForHost('WWW.Spotify.com')).toBe('spotify');
    expect(providerForHost('soundcloud.com')).toBe('soundcloud');
    expect(providerForHost('www.tiktok.com')).toBe('tiktok');
    expect(providerForHost('instagr.am')).toBe('instagram');
    expect(providerForHost('coccus.bandcamp.com')).toBe('bandcamp');
    expect(providerForHost('paulgraham.com')).toBe('generic');
  });

  it('displayDomain brands the provider hosts', () => {
    expect(displayDomain('spotify', 'https://open.spotify.com/track/x')).toBe('spotify.com');
    expect(displayDomain('generic', 'https://www.paulgraham.com/x')).toBe('paulgraham.com');
  });

  it('unescapeEntities handles named + numeric + hex', () => {
    expect(unescapeEntities('a &amp; b &lt;c&gt; &#39;d&#39; &#x27;e&#x27; &nbsp;f &unknown; g')).toBe("a & b <c> 'd' 'e'  f &unknown; g");
  });

  it('the private-range tables (the pin)', () => {
    expect(isPrivateIPv4('127.5.5.5')).toBe(true);
    expect(isPrivateIPv4('1.1.1.1')).toBe(false);
    expect(isPrivateIPv6('::ffff:192.168.0.1')).toBe(true);
    expect(isPrivateIPv6('2606:4700::1111')).toBe(false);
  });
});
