// The deterministic link embeds (the shared tail of web10-social's
// `src/lib/linkEmbeds.ts`, D99): a YouTube / Vimeo URL renders the provider's
// own player with NO round-trip (the url carries the id — the embed is a
// pure function of it). Every other external url is NOT embeddable here; it
// is the unfurl candidate's territory (`unfurl.ts` + `UnfurlLink.tsx` — the
// provider's oEmbed player or the Open Graph card, fetched server-side).
//
// Ported verbatim so the two apps' in-body link treatment cannot drift:
// the same id extraction, the same embed URLs (youtube-nocookie + the
// ytimg thumbnail), the same "external" fallback shape.

export type EmbedProvider = 'youtube' | 'vimeo' | 'external';

export interface EmbedInfo {
  provider: EmbedProvider;
  url: string;
  embedUrl: string;
  thumbnailUrl?: string;
  domain: string;
}

export interface ParsedLink {
  text: string;
  start: number;
  end: number;
  embed?: EmbedInfo;
}

// Match URLs in text — handles http(s), www. prefixed, but not bare words
const URL_RE = /(?<!\w)(?:https?:\/\/|www\.)[^\s<]+/gi;

export function cleanUrl(raw: string): string {
  let url = raw.replace(/[.,;:!?)>]+$/, '');
  url = url.replace(/[.,;:!?]+$/, '');
  if (url.startsWith('www.')) {
    url = 'https://' + url;
  }
  return url;
}

function isYouTube(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com' ||
           u.hostname === 'youtu.be' || u.hostname === 'youtube-nocookie.com' ||
           u.hostname === 'www.youtube-nocookie.com';
  } catch {
    return false;
  }
}

function isVimeo(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'vimeo.com' || u.hostname === 'www.vimeo.com';
  } catch {
    return false;
  }
}

function extractYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      return u.pathname.slice(1).split('?')[0] || null;
    }
    if (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') {
      if (u.pathname.startsWith('/shorts/')) {
        return u.pathname.split('/shorts/')[1]?.split('?')[0]?.split('/')[0] || null;
      }
      return u.searchParams.get('v') || null;
    }
    if (u.hostname === 'youtube-nocookie.com' || u.hostname === 'www.youtube-nocookie.com') {
      return u.pathname.split('/').slice(-1)[0]?.split('?')[0] || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function extractVimeoId(url: string): string | null {
  try {
    const u = new URL(url);
    const segments = u.pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      return segments[0] || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function domainFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function parseEmbed(url: string): EmbedInfo | null {
  if (isYouTube(url)) {
    const id = extractYouTubeId(url);
    if (!id) return null;
    return {
      provider: 'youtube',
      url,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      domain: 'youtube.com',
    };
  }

  if (isVimeo(url)) {
    const id = extractVimeoId(url);
    if (!id) return null;
    return {
      provider: 'vimeo',
      url,
      embedUrl: `https://player.vimeo.com/video/${id}`,
      thumbnailUrl: null,
      domain: 'vimeo.com',
    };
  }

  return {
    provider: 'external',
    url,
    embedUrl: url,
    domain: domainFromUrl(url),
  };
}

export function extractLinks(text: string): ParsedLink[] {
  if (!text) return [];
  const links: ParsedLink[] = [];
  let match;
  const re = new RegExp(URL_RE);
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const url = cleanUrl(raw);
    links.push({
      text: raw,
      start: match.index,
      end: match.index + raw.length,
      embed: parseEmbed(url),
    });
  }
  return links;
}

export function isEmbeddable(embed: EmbedInfo | null): embed is EmbedInfo & { provider: 'youtube' | 'vimeo' } {
  return embed !== null && (embed.provider === 'youtube' || embed.provider === 'vimeo');
}

/**
 * Does this (markdown) text carry any external http(s) link (a bare URL or a
 * markdown link's target)? The card's caption-mode switch: a text with an
 * external link renders the link RICH (the deterministic embed or the unfurl
 * card, in place of the link) and drops the caption's whole-text link-out
 * wrapper (an unfurl card / player must never nest inside an `<a>` —
 * interactive content in interactive content is invalid HTML). A text
 * without one keeps the wrapper (the plain caption IS the link-out).
 */
export function containsExternalLink(text: string | null | undefined): boolean {
  if (!text) return false;
  const re = new RegExp(URL_RE);
  let match;
  while ((match = re.exec(text)) !== null) {
    try {
      const u = new URL(cleanUrl(match[0]));
      if (u.protocol === 'http:' || u.protocol === 'https:') return true;
    } catch {
      // not a real url (a www.word the cleaner mangled) — keep scanning
    }
  }
  return false;
}
