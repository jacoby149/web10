import { getV3Client, readTokenCookie, Web10Error } from './v3';
import { API_ORIGIN } from '@/lib/origins';

export type FeedSource = { origin: string; weight: number };
export function normalizeFeedSource(value: string, home: string): string {
  const url = new URL(value);
  if (value.length > 512 || url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.origin !== home && (url.protocol !== 'https:' || !url.hostname.includes('.')))) throw Error('Enter an exact HTTPS server origin, without a path.');
  if (url.origin !== home && (url.hostname.length > 253 || url.hostname.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)))) throw Error('Invalid server hostname.');
  return url.origin;
}
export const homeFeedOrigin = () => new URL(getV3Client().state?.apiOrigin || API_ORIGIN).origin;
export const feedSourceScope = () => {
  const w = getV3Client();
  return JSON.stringify([w.state?.apiOrigin, w.state?.token ?? readTokenCookie()]);
};
function sources(value: unknown, home: string): FeedSource[] {
  if (!Array.isArray(value) || value.length > 32) throw Error('Invalid source catalog.');
  const seen = new Set<string>();
  return value.map(row => {
    if (!row || typeof row.origin !== 'string' || !Number.isInteger(row.weight) || row.weight < 0 || row.weight > 100) throw Error('Invalid source catalog.');
    const origin = normalizeFeedSource(row.origin, home);
    if (seen.has(origin)) throw Error('Duplicate server.');
    seen.add(origin);
    return { origin, weight: row.weight };
  });
}

/** Personal home-node preferences only; this module never contacts a saved origin. */
export function createFeedSourceStore(isCurrent = () => true) {
  const w = getV3Client(), token = w.readToken(), scope = feedSourceScope(), home = homeFeedOrigin();
  if (!token || token.username === 'anon' || !token.provider || !token.username) throw Error('Sign in to edit servers.');
  const group = `${token.provider}/groups/users/${token.username}/feed-sources`;
  const current = () => { if (!isCurrent() || getV3Client() !== w || feedSourceScope() !== scope) throw Error('Account changed. Source request discarded.'); };
  async function run<T>(action: string, fn: () => Promise<T>): Promise<T> {
    current(); console.log('[feed-sources] started', { action });
    const result = await fn();
    current(); console.log('[feed-sources] completed', { action });
    return result;
  }
  async function privateGroup(create: boolean): Promise<boolean> {
    let info;
    try { info = await run('group-check', () => w.getGroup(group)); }
    catch (error) {
      current();
      if (!(error instanceof Web10Error) || error.status !== 404) throw error;
      if (!create) return false;
      const result = await run('group-create', () => w.createGroup('feed-sources', 'closed', [
        { name: 'owner', permissions: { settings: ['readAll', 'create', 'updateOwn', 'deleteOwn'] } },
      ], [{ member_key: token!.username, role: 'owner' }], { discoverable: false, membership_visibility: 'hidden' }));
      if (result.group_id !== group) throw Error('Unexpected source group.');
      return privateGroup(false);
    }
    const members = await run('owner-check', () => w.getGroupMembers(group, { limit: 2 }));
    if (info.group_id !== group || info.join_policy !== 'closed' || info.discoverable !== false || info.membership_visibility !== 'hidden'
      || members.length !== 1 || members[0].member_key !== token!.username || members[0].role !== 'owner') throw Error('Source group is not owner-private.');
    return true;
  }
  async function document() {
    const rows = await run('catalog-read', () => w.read('settings', { groups: [group], limit: 2 }));
    if (rows.length > 1) throw Error('Duplicate source catalogs require review.');
    if (!rows.length) return null;
    const doc = await run('attachment-check', () => w.readById(rows[0].doc_id, 'settings'));
    if (doc.doc_id !== rows[0].doc_id || (doc as unknown as { service?: string }).service !== 'settings'
      || ![token!.username, `${token!.provider}/users/${token!.username}`].includes(doc.author_key)
       || doc.groups?.length !== 1 || doc.groups[0] !== group || doc.body.version !== 1) throw Error('Source document is not owner-private.');
    // Ordinary reads filter groups to readable carriers. An author update with
    // no new body fields returns complete attachments without replacing them.
    // This advances the version; it never publishes new preferences as a probe.
    const owned = await run('attachment-authority', () => w.update(doc.doc_id, {}));
    if (owned.doc_id !== doc.doc_id || (owned as unknown as { service?: string }).service !== 'settings'
      || owned.author_key !== doc.author_key || owned.groups?.length !== 1 || owned.groups[0] !== group
      || owned.body.version !== 1) throw Error('Source document is not owner-private.');
    return owned;
  }
  return {
    home, current,
    async read(): Promise<FeedSource[]> {
      if (!await privateGroup(false)) return [{ origin: home, weight: 100 }];
      const doc = await document();
      return doc ? sources(doc.body.sources, home) : [{ origin: home, weight: 100 }];
    },
    async write(value: FeedSource[]): Promise<FeedSource[]> {
      const clean = sources(value, home);
      if (!await privateGroup(true)) throw Error('Source group unavailable.');
      const doc = await document(), body = { version: 1, sources: clean };
      if (doc) await run('catalog-update', () => w.update(doc.doc_id, body));
      else await run('catalog-create', () => w.create('settings', body, { groups: [group] }));
      return clean;
    },
  };
}
