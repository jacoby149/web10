// ── link unfurling (KB: web10-v3/social/link-unfurl.md) ─────────────────────
// A post body containing an external URL renders a rich card / provider
// player instead of a bare link. The SPA cannot fetch the linked page (CORS),
// so the fetch is server-side — the SOCIAL APP'S OWN preview server
// (`preview/unfurl.mjs`, same-origin behind nginx at /preview/unfurl, D60:
// the node stays generic and never learns "Spotify" / "article preview").
// This module is the client's seam: one same-origin GET per unique URL,
// single-flight dedupe, a session cache, and a hard fallback — when the
// unfurl fails for ANY reason, the link renders as the plain link of today.
// Unfurling never blocks posting or rendering (the fetch is read-side only).

export interface UnfurlEmbed {
  /** The provider's iframe src (allowlisted per-provider on both sides). */
  src: string;
  height: number;
  width?: number;
  allow?: string;
}

export interface UnfurlCard {
  /** The link the user pasted (the card's href — the click always leaves). */
  url: string;
  /** Display domain (the card's site row + the favicon). */
  domain: string;
  /** 'generic' | 'spotify' | 'soundcloud' | 'tiktok' | 'instagram' | 'bandcamp'. */
  provider: string;
  title: string | null;
  description: string | null;
  image: string | null;
  embed: UnfurlEmbed | null;
}

/** The same-origin unfurl endpoint (nginx → the social app's preview server). */
export const UNFURL_PATH = '/preview/unfurl';

// The per-provider iframe host allowlist (the client half of the two-sided
// embed gate — the server allowlists in unfurl.mjs; a card whose embed src
// points anywhere else is rendered as a rich card instead of an iframe).
const EMBED_HOSTS: Record<string, string[]> = {
  spotify: ['open.spotify.com'],
  soundcloud: ['w.soundcloud.com', 'soundcloud.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  bandcamp: ['bandcamp.com', 'www.bandcamp.com'],
};

/**
 * Would this href be unfurled? http(s) external links only: the app's own
 * origin (a same-host link would make the preview server fetch itself) and
 * the locally-embedded providers (YouTube / Vimeo have their own
 * deterministic embeds — no server round-trip) are excluded. Anything that
 * cannot be parsed is excluded too (plain link, as today).
 */
export function isUnfurlCandidate(href: string | null | undefined): boolean {
  if (!href) return false;
  if (!/^https?:\/\//i.test(href)) return false;
  let u: URL;
  try {
    u = new URL(href, typeof window !== 'undefined' ? window.location.href : 'http://localhost/');
  } catch {
    return false;
  }
  if (u.username !== '' || u.password !== '') return false;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') return false;
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return false;
  if (typeof window !== 'undefined' && host === window.location.hostname.toLowerCase()) return false;
  return true;
}

function absoluteHttpUrl(s: unknown): string | null {
  if (typeof s !== 'string' || !s) return null;
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
}

// A card is only worth rendering when it carries something: an embed, an
// image with context, or a title + description. Otherwise the plain link
// stays (an empty card is worse than a link).
export function normalizeUnfurlCard(data: unknown): UnfurlCard | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  const url = absoluteHttpUrl(d.url);
  if (!url) return null;
  const domain = typeof d.domain === 'string' && d.domain ? d.domain : null;
  const title = typeof d.title === 'string' && d.title.trim() ? d.title.trim() : null;
  const description = typeof d.description === 'string' && d.description.trim() ? d.description.trim() : null;
  const image = absoluteHttpUrl(d.image);

  let embed: UnfurlEmbed | null = null;
  if (d.embed && typeof d.embed === 'object') {
    const e = d.embed as Record<string, unknown>;
    const src = absoluteHttpUrl(e.src);
    const height = typeof e.height === 'number' && Number.isFinite(e.height) ? Math.min(Math.max(Math.round(e.height), 80), 1200) : null;
    const width = typeof e.width === 'number' && Number.isFinite(e.width) && e.width > 0 ? Math.round(e.width) : undefined;
    if (src && height) {
      const host = new URL(src).hostname.toLowerCase();
      const provider = typeof d.provider === 'string' ? d.provider : 'generic';
      const allow = EMBED_HOSTS[provider];
      if (allow && allow.includes(host)) {
        embed = { src, height, width, allow: typeof e.allow === 'string' ? e.allow : undefined };
      }
    }
  }

  if (!embed && !image && !(title && description)) return null;
  if (!domain && !embed && !image) return null; // nothing displayable at all

  return {
    url,
    domain: domain || new URL(url).hostname.replace(/^www\./, ''),
    provider: typeof d.provider === 'string' ? d.provider : 'generic',
    title,
    description,
    image,
    embed,
  };
}

// The session cache: URL (fragment-stripped) → the in-flight promise. ONLY a
// settled, successful card is pinned; a failure (network, blocked, no
// metadata) is dropped, so the next mount retries — the server's own
// positive/negative TTL is the real cache, the session cache just stops the
// feed from firing N fetches for N posts with the same link.
const sessionCache = new Map<string, Promise<UnfurlCard | null>>();

/**
 * Fetch the unfurl for `url`. Resolves to the card, or `null` (render the
 * plain link). Never rejects — every failure mode (network, timeout,
// non-JSON, unfetchable, blocked) degrades to the plain link.
 */
export function fetchUnfurl(url: string): Promise<UnfurlCard | null> {
  if (!isUnfurlCandidate(url)) return Promise.resolve(null);
  const key = url.split('#')[0];
  const pending = sessionCache.get(key);
  if (pending) return pending;

  const attempt = (async (): Promise<UnfurlCard | null> => {
    console.log('[unfurl]', 'request start', { domain: safeHost(key) });
    const t0 = Date.now();
    let res: Response;
    try {
      res = await fetch(`${UNFURL_PATH}?url=${encodeURIComponent(key)}`, {
        headers: { Accept: 'application/json' },
        signal: typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(10_000) : undefined,
      });
    } catch (err) {
      // A network-level failure (the preview server is absent — e.g. a plain
      // vite dev server — or the fetch was aborted). Do NOT cache: the next
      // mount retries (the server may have come up).
      console.log('[unfurl]', 'request failed (network)', { domain: safeHost(key), ms: Date.now() - t0, err: String(err) });
      return null;
    }
    if (!res.ok) {
      // 400/403/429 — a stable verdict (invalid / SSRF-blocked / rate
      // limited). Cache it: the plain link is the answer this session.
      console.log('[unfurl]', `request ${res.status}`, { domain: safeHost(key), ms: Date.now() - t0 });
      return null;
    }
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      console.log('[unfurl]', 'request non-json (fell through to the SPA?)', { domain: safeHost(key), contentType, ms: Date.now() - t0 });
      return null;
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch (err) {
      console.log('[unfurl]', 'request bad json', { domain: safeHost(key), err: String(err) });
      return null;
    }
    // The endpoint's envelope is { ok: true, card } — an ok:false body is the
    // server's deterministic "no card" verdict (the plain link stays).
    if (!data || typeof data !== 'object' || (data as { ok?: unknown }).ok !== true) {
      console.log('[unfurl]', 'request ok:false', { domain: safeHost(key), reason: (data as { reason?: unknown })?.reason, ms: Date.now() - t0 });
      return null;
    }
    const card = normalizeUnfurlCard((data as { card?: unknown }).card);
    console.log('[unfurl]', card ? 'request ok' : 'request no-card', {
      domain: safeHost(key),
      provider: card?.provider ?? (data as { provider?: string })?.provider ?? 'unknown',
      embed: Boolean(card?.embed),
      ms: Date.now() - t0,
    });
    return card;
  })();

  sessionCache.set(key, attempt);
  attempt.then(
    (card) => {
      if (!card) sessionCache.delete(key); // failures re-try on the next mount
    },
    () => {
      sessionCache.delete(key); // the attempt never rejects — belt and braces
    },
  );
  return attempt;
}

function safeHost(key: string): string {
  try {
    return new URL(key).hostname;
  } catch {
    return key.slice(0, 40);
  }
}
