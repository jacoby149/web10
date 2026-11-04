/* Research client: a domain bookmark is discovery, never a permission grant. */
export const FOLLOW_SERVICE = 'domain-demo-follows';

export function domainName(value) {
  const input = String(value).trim();
  if (!input || /[\s/:@?#\\]/u.test(input)) throw Error('Enter a domain, not a URL.');
  const domain = new URL(`https://${input}`).hostname.toLowerCase().replace(/\.$/, '');
  if (domain.length > 247 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(domain)
    || domain.split('.').some(x => x.length > 63 || x.startsWith('-') || x.endsWith('-'))
    || /^\d+$/.test(domain.split('.').at(-1))) throw Error('Invalid domain.');
  return domain;
}

export function accountPointer(answer, domain, providers) {
  if (answer?.Status !== 0 || !Array.isArray(answer.Answer) || answer.Answer.length > 64) throw Error('DNS lookup failed. Follow retained.');
  const claims = [];
  for (const row of answer.Answer) {
    if (row.type !== 16 || row.name?.toLowerCase() !== `web10.${domain}.`) continue;
    if (typeof row.data !== 'string' || row.data.length > 4096) throw Error('Invalid TXT record.');
    let value;
    try { value = JSON.parse(row.data); } catch { throw Error('Invalid TXT encoding.'); }
    if (typeof value !== 'string') throw Error('Invalid TXT record.');
    if (value.startsWith('web10.v')) claims.push(value);
  }
  if (claims.length !== 1) throw Error('Expected exactly one web10 TXT claim.');
  const match = /^web10\.v=1;provider=([^;\s]+);user=([a-z0-9](?:[a-z0-9-]{0,28}[a-z0-9])?)$/.exec(claims[0]);
  if (!match || !Object.hasOwn(providers, match[1]) || match[2] === 'anon') throw Error('Unknown or invalid demo target.');
  return { provider: match[1], user: match[2] };
}

export function domainClient({ home, resolver, providers, session, fetcher = fetch, log = console.info }) {
  const origin = value => {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw Error('Invalid configured node origin.');
    return url.origin;
  };
  const homeOrigin = origin(home);
  const targets = Object.fromEntries(Object.entries(providers).map(([key, value]) => [key, origin(value)]));
  const owned = () => {
    const ticket = session();
    if (!ticket?.token || !ticket.group || !ticket.valid()) throw Error('Sign in first.');
    return ticket;
  };
  const current = ticket => { if (!ticket.valid()) throw Error('Account changed. Request discarded.'); };
  async function json(url, body, seam) {
    log('[domain-demo] request started', { seam });
    const response = await fetcher(url, {
      method: body ? 'POST' : 'GET', credentials: 'omit', redirect: 'error',
      referrerPolicy: 'no-referrer', cache: 'no-store', signal: AbortSignal.timeout(10000),
      headers: body ? { 'Content-Type': 'application/json' } : { Accept: 'application/dns-json, application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    log('[domain-demo] request completed', { seam, status: response.status });
    if (!response.ok) throw Error(`Request denied or unavailable (${response.status}).`);
    const reader = response.body.getReader(); let bytes = 0, text = '';
    const decoder = new TextDecoder();
    try {
      while (true) {
        const part = await reader.read(); if (part.done) break;
        bytes += part.value.byteLength;
        if (bytes > 262144) { await reader.cancel(); throw Error('Response too large.'); }
        text += decoder.decode(part.value, { stream: true });
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(text + decoder.decode());
  }
  async function resolve(domain, ticket) {
    const query = new URL(resolver);
    query.searchParams.set('name', `web10.${domain}`); query.searchParams.set('type', 'TXT');
    const target = accountPointer(await json(query.href, undefined, 'dns'), domain, targets);
    current(ticket);
    const claimed = await json(`${targets[target.provider]}/v3/users/${encodeURIComponent(target.user)}/domain`, undefined, 'alias');
    current(ticket);
    if (claimed.domain !== domain || claimed.verified !== true) throw Error('Target account has not verified this domain.');
    return target;
  }
  async function follows(ticket = owned()) {
    const rows = await json(`${homeOrigin}/v3/read`, { token: ticket.token, service: FOLLOW_SERVICE, groups: [ticket.group] }, 'follow-list');
    current(ticket);
    if (!Array.isArray(rows) || rows.length > 100) throw Error('Invalid follow list.');
    return rows.map(row => {
      if (typeof row.doc_id !== 'string' || !row.body || Object.keys(row.body).join() !== 'domain') throw Error('Invalid follow record.');
      return { id: row.doc_id, domain: domainName(row.body.domain) };
    });
  }
  async function follow(value) {
    const ticket = owned(), domain = domainName(value);
    const existing = (await follows(ticket)).find(row => row.domain === domain);
    current(ticket);
    if (existing) return existing;
    await resolve(domain, ticket); current(ticket);
    const created = await json(`${homeOrigin}/v3/create`, {
      token: ticket.token, service: FOLLOW_SERVICE, groups: [ticket.group], body: { domain },
    }, 'follow-save');
    current(ticket);
    if (typeof created.doc_id !== 'string') throw Error('Follow was not confirmed.');
    return { id: created.doc_id, domain };
  }
  async function feed(value) {
    const ticket = owned(), domain = domainName(value), target = await resolve(domain, ticket);
    current(ticket);
    const posts = await json(`${targets[target.provider]}/v3/read`, {
      service: 'posts', groups: [`${target.provider}/groups/users/${target.user}/domain-demo-public`],
    }, 'public-posts');
    current(ticket);
    if (!Array.isArray(posts) || posts.length > 100 || posts.some(row => typeof row.doc_id !== 'string' || row.author_key !== target.user || typeof row.body?.text !== 'string')) throw Error('Invalid public posts.');
    return { domain, target, posts };
  }
  return { follows, follow, feed };
}
