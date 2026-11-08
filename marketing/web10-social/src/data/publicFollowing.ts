import type { V3Document } from './v3';

export type PublicFollow = { domain: string } | { provider: string; user: string };
type Target = { provider: string; user: string };
export interface PublicFollowingPreview {
  posts: { key: string; provider: string; document: V3Document }[];
  unavailable: ({ kind: 'follow'; index: number } | { kind: 'node'; provider: string })[];
  truncated: string[];
}

const USER = /^(?!anon$)[a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?$/;
function domainName(value: string): string {
  if (typeof value !== 'string' || /[\s/:@?#\\%]/u.test(value)) throw Error('Invalid domain');
  const domain = new URL(`https://${value}`).hostname.toLowerCase().replace(/\.$/, '');
  if (domain.length > 247 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)
    || domain.split('.').some(x => x.length > 63 || x.startsWith('-') || x.endsWith('-'))
    || /^\d+$/.test(domain.split('.').slice(-1)[0])) throw Error('Invalid domain');
  return domain;
}
function httpsOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid node origin');
  return url.origin;
}

/** Public-only first-page seam; deliberately does not instantiate the cookie-aware SDK. */
export function createPublicFollowingReader(config: {
  providers: Record<string, string>; resolver: string; fetcher?: typeof fetch; now?: () => number;
}) {
  const providers = new Map(Object.entries(config.providers).map(([provider, origin]) => [domainName(provider), httpsOrigin(origin)]));
  if (providers.size > 64) throw Error('Too many configured nodes');
  const resolver = new URL(config.resolver);
  if (resolver.protocol !== 'https:' || resolver.username || resolver.password || resolver.hash) throw Error('Invalid resolver');
  const fetcher = config.fetcher ?? fetch;
  const now = config.now ?? Date.now;
  const cache = new Map<string, { target: Target; expires: number }>();
  const pending = new Map<string, Promise<Target>>();
  let active = 0;
  const waiting: (() => void)[] = [];
  async function json(url: string, body?: object, current = () => {}): Promise<unknown> {
    if (active >= 4) {
      if (waiting.length >= 64) throw Error('Public read queue full');
      await new Promise<void>(resolve => waiting.push(resolve));
    } else active++;
    console.log('[public-following] request started', { kind: body ? 'posts' : 'discovery' });
    try {
      current();
      const response = await fetcher(url, {
        method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error',
        referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(10000),
        headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/dns-json, application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      console.log('[public-following] response received', { status: response.status });
      if (!response.ok || !response.body) { await response.body?.cancel(); throw Error('Public read unavailable'); }
      const reader = response.body.getReader();
      let bytes = 0, text = '';
      const decoder = new TextDecoder();
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.byteLength;
          if (bytes > 262144) { await reader.cancel(); throw Error('Public response too large'); }
          text += decoder.decode(part.value, { stream: true });
        }
      } finally { await reader.cancel(); reader.releaseLock(); }
      return JSON.parse(text + decoder.decode());
    } finally {
      const next = waiting.shift();
      if (next) next(); else active--;
      console.log('[public-following] request finished');
    }
  }
  function target(provider: string, user: string): Target {
    if (!providers.has(provider) || typeof user !== 'string' || !USER.test(user)) throw Error('Unknown public target');
    return { provider, user };
  }
  async function resolveDomain(domain: string, current: () => void): Promise<Target> {
    const cached = cache.get(domain);
    if (cached && cached.expires > now()) return cached.target;
    cache.delete(domain);
    const existing = pending.get(domain);
    if (existing) return existing;
    const work = (async () => {
      const started = now();
      const url = new URL(resolver);
      url.searchParams.set('name', `web10.${domain}`); url.searchParams.set('type', 'TXT');
      const answer = await json(url.href, undefined, current) as { Status?: number; Answer?: { type: number; name: string; data: string; TTL: number }[] };
      current();
      if (answer?.Status !== 0 || !Array.isArray(answer.Answer) || answer.Answer.length > 64) throw Error('DNS unavailable');
      const claims: { value: string; ttl: number }[] = [];
      for (const row of answer.Answer) {
        if (row.type !== 16 || typeof row.name !== 'string' || row.name.toLowerCase().replace(/\.$/, '') !== `web10.${domain}`) continue;
        if (typeof row.data !== 'string' || row.data.length > 4096) throw Error('Invalid TXT');
        // DoH JSON represents a TXT RR as one or more quoted character strings.
        const chunks = row.data.match(/"(?:[^"\\]|\\.)*"/g);
        if (!chunks || !/^(?:"(?:[^"\\]|\\.)*"\s*)+$/.test(row.data)) throw Error('Invalid TXT encoding');
        const value = chunks.map(chunk => JSON.parse(chunk) as string).join('');
        if (value.startsWith('web10.v')) claims.push({ value, ttl: row.TTL });
      }
      if (claims.length !== 1) throw Error('Ambiguous or absent TXT claim');
      const match = /^web10\.v=1;provider=([^;\s]+);user=([^;\s]+)$/.exec(claims[0].value);
      if (!match) throw Error('Unsupported TXT claim');
      const found = target(match[1], match[2]);
      const alias = await json(`${providers.get(found.provider)}/v3/users/${encodeURIComponent(found.user)}/domain`, undefined, current) as { domain?: string; verified?: boolean };
      current();
      if (alias?.domain !== domain || alias.verified !== true) throw Error('Unverified destination alias');
      const ttl = claims[0].ttl;
      if (Number.isFinite(ttl) && ttl > 0) {
        if (cache.size >= 128) cache.delete(cache.keys().next().value!);
        cache.set(domain, { target: found, expires: started + Math.min(ttl, 60) * 1000 });
      }
      return found;
    })();
    pending.set(domain, work);
    try { return await work; } finally { pending.delete(domain); }
  }
  async function map<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
      while (index < items.length) { const i = index++; results[i] = await fn(items[i], i); }
    }));
    return results;
  }
  return {
    async read(follows: readonly PublicFollow[], isCurrent: () => boolean, limit = 20): Promise<PublicFollowingPreview> {
      if (follows.length > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 50) throw Error('Invalid preview bounds');
      const current = () => { if (!isCurrent()) throw Error('Public following request superseded'); };
      current();
      const unavailable: PublicFollowingPreview['unavailable'] = [];
      const targets = await map([...follows], async (follow, index) => {
        current();
        try { return 'domain' in follow ? await resolveDomain(domainName(follow.domain), current) : target(follow.provider, follow.user); }
        catch { unavailable.push({ kind: 'follow', index }); return null; }
      });
      current();
      const byNode = new Map<string, Set<string>>();
      for (const t of targets) {
        if (!t) continue;
        if (!byNode.has(t.provider)) byNode.set(t.provider, new Set());
        byNode.get(t.provider)!.add(t.user);
      }
      const truncated: string[] = [];
      const pages = await map([...byNode], async ([provider, users]) => {
        current();
        try {
          const docs = await json(`${providers.get(provider)}/v3/read`, {
            service: 'posts', groups: [...users].map(user => `${provider}/groups/users/${user}/followers`), limit,
          }, current);
          current();
          if (!Array.isArray(docs) || docs.length > limit) throw Error('Invalid public page');
          if (docs.length === limit) truncated.push(provider);
          return docs.map((doc: V3Document) => {
            const prefix = `${provider}/users/`;
            const user = typeof doc?.author_key === 'string' ? (doc.author_key.startsWith(prefix) ? doc.author_key.slice(prefix.length) : doc.author_key) : '';
            if (!users.has(user) || typeof doc.doc_id !== 'string' || !doc.doc_id || doc.doc_id.length > 256
              || !doc.body || typeof doc.body !== 'object' || Array.isArray(doc.body)
              || !Number.isFinite(Date.parse(doc.created_at))) throw Error('Invalid public document');
            return { key: JSON.stringify([provider, doc.author_key, doc.doc_id]), provider, document: doc };
          }).filter(row => !row.document.tags?.some(tag => tag === 'ad' || tag === 'product'));
        } catch { unavailable.push({ kind: 'node', provider }); return []; }
      });
      current();
      const unique = new Map(pages.flat().map(row => [row.key, row]));
      const posts = [...unique.values()].sort((a, b) => Date.parse(b.document.created_at) - Date.parse(a.document.created_at)
        || a.key.localeCompare(b.key)).slice(0, limit);
      console.log('[public-following] preview completed', { nodes: byNode.size, posts: posts.length, unavailable: unavailable.length });
      return { posts, unavailable, truncated };
    },
  };
}
