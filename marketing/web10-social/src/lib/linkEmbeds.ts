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

function cleanUrl(raw: string): string {
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