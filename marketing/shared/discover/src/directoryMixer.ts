import { createFederatedTransport } from '../../../../sdk/src/federatedTransport';
import type { ServerAllocation } from './sourceAllocation';
import { normalizeFeedSource, type FeedSource } from './sourceModels';
import { withSourceBudget } from './sourceBudget';
import { peopleFaceSql, GROUP_FACE_SQL, facePrepare, reduceFaceRows } from './face';
import type { DiscoverPerson } from './PersonCard';
import type { DiscoverGroup, DiscoverGroupFace } from './GroupCard';

export type DirectorySort = 'popular' | 'newest';
export type DirectoryKind = 'profiles' | 'groups';
export type DirectoryPerson = DiscoverPerson & { provider: string; created_at?: string; bio?: string; follow_pending?: boolean; mutuals_pending?: boolean; source_origin?: string; source_key?: string };
export type DirectoryGroup = DiscoverGroup & { created_at?: string; slug?: string; permission_summary?: string; face?: DiscoverGroupFace; source_origin?: string; source_key?: string };
export type DirectoryRows = { people: DirectoryPerson[]; groups: DirectoryGroup[] };
export type DirectoryRead = (kind: DirectoryKind, sort: DirectorySort, limit: number, offset: number, signal: AbortSignal) => Promise<DirectoryRows>;

/** Sort the quota-selected cards, not an unbounded cross-node top-N. */
export function sortDirectory<T extends { created_at?: string; source_key?: string }>(rows: T[], sort: DirectorySort, audience: (row: T) => number): T[] {
  const time = (row: T) => row.created_at && Number.isFinite(Date.parse(row.created_at)) ? Date.parse(row.created_at) : 0;
  return [...rows].sort((a, b) => (sort === 'newest'
    ? time(b) - time(a) : audience(b) - audience(a))
    || (a.source_key ?? '').localeCompare(b.source_key ?? ''));
}

function safeUrl(value: unknown, origin: string, credential: string | null): string | undefined {
  if (typeof value !== 'string' || value.length > 8192) return;
  try {
    const url = new URL(value, origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    let decoded = url.href;
    if (credential) for (let i = 0; i < 8; i++) {
      if (decoded.includes(credential)) return;
      const next = decoded.replace(/%([0-9a-f]{2})/gi, (_, byte) => String.fromCharCode(parseInt(byte, 16)));
      if (next === decoded) return url.href;
      decoded = next;
    }
    return credential ? undefined : url.href;
  } catch { return; }
}

/** The transport destination comes only from the approved catalog, never rows. */
export async function readRemoteDirectory(transport: ReturnType<typeof createFederatedTransport>, kind: DirectoryKind, sort: DirectorySort, limit: number, offset: number, credential: string | null): Promise<DirectoryRows> {
  const origin = transport.origin, provider = new URL(origin).host;
  const result = await transport.post(kind === 'profiles' ? 'users/directory' : 'groups/directory', { limit, offset, sort }) as Record<string, unknown>;
  const rows = result?.[kind === 'profiles' ? 'users' : 'groups'];
  if (!Array.isArray(rows) || rows.length > limit || result.sort !== sort) throw Error('Invalid or unsupported directory sort');
  const text = (value: unknown) => typeof value === 'string' && value.length <= 4096 && (!credential || !value.includes(credential)) ? value : undefined;
  const count = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : 0;
  const created = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : undefined;
  const people: DirectoryPerson[] = [], groups: DirectoryGroup[] = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') throw Error('Invalid directory row');
    const date = created(row.created_at);
    // An older node must not silently pretend its popular page is a newest page.
    if (sort === 'newest' && !date) throw Error('Server does not support creation-date sorting');
    if (kind === 'profiles') {
      const username = text(row.username);
      if (!username || !/^[a-zA-Z0-9_.-]+$/.test(username)) throw Error('Invalid directory identity');
      people.push({ username, provider, created_at: date, followers_count: count(row.follower_count), display_name: text(row.profile?.display_name), bio: text(row.profile?.bio) });
    } else {
      const id = text(row.group_id);
      if (!id) throw Error('Invalid directory identity');
      groups.push({ group_id: id, name: text(row.name) ?? id, owner: text(row.owner) ?? '', join_policy: text(row.join_policy) ?? 'invite_only', member_count: count(row.member_count), created_at: date });
    }
  }
  // Optional faces are serving-node queries. Failure never drops directory rows.
  if (rows.length) try {
    const ids = people.map(person => `${provider}/groups/users/${person.username}/followers`);
    const scopes = kind === 'profiles' ? ids : groups.map(group => group.group_id);
    const sql = kind === 'profiles' ? peopleFaceSql(people.map(person => person.username)) : GROUP_FACE_SQL;
    const faces = await Promise.all(['avatar_ref', 'banner_ref'].map(async field => {
      const response = await transport.post('query', { sql, groups: scopes, prepare: { face: facePrepare(field, field === 'avatar_ref' ? 'avatar_url' : 'banner_url') } }) as { rows?: unknown };
      if (!Array.isArray(response?.rows) || response.rows.length > rows.length * 2) throw Error('Invalid face response');
      return response.rows;
    }));
    const byId = reduceFaceRows(faces.flat(), kind === 'profiles' ? 'author_key' : 'group_id');
    for (const person of people) {
      const face = byId.get(person.username);
      person.avatar_url = safeUrl(face?.avatar_url, origin, credential);
      person.banner_url = safeUrl(face?.banner_url, origin, credential);
    }
    for (const group of groups) {
      const face = byId.get(group.group_id);
      group.face = { name: text(face?.name), avatar_url: safeUrl(face?.avatar_url, origin, credential), banner_url: safeUrl(face?.banner_url, origin, credential) };
    }
  } catch { console.info('[directory-mixer] optional source faces unavailable'); }
  return { people, groups };
}

export function createDirectoryReader(options: {
  sources: FeedSource[]; home: string; credential: string | null; kind: DirectoryKind; sort: DirectorySort;
  isCurrent: () => boolean; homeRead?: DirectoryRead;
}) {
  if (options.sources.length > 32) throw Error('Too many directory sources');
  const owner = new AbortController();
  const current = () => !owner.signal.aborted && options.isCurrent();
  const states = options.sources.map(source => {
    if (!Number.isInteger(source.weight) || source.weight < 0 || source.weight > 100) throw Error('Invalid source weight');
    return { ...source, origin: normalizeFeedSource(source.origin, options.home), offset: 0, ended: false, credit: 0, transport: undefined as ReturnType<typeof createFederatedTransport> | undefined };
  });
  if (new Set(states.map(row => row.origin)).size !== states.length) throw Error('Duplicate directory sources');
  const errors: Record<string, string> = {};
  let pending = false;
  async function next(budget = 20) {
    if (pending || !current()) throw Error('Directory paging scope ended or busy');
    if (!Number.isInteger(budget) || budget < 1 || budget > 100) throw Error('Invalid directory page budget');
    pending = true;
    // Same smooth weighted quotas as the post mixer: weight 1 is not a mute.
    const allocations: ServerAllocation[] = states.map(state => ({ origin: state.origin, weight: state.ended ? 0 : state.weight, count: 0 }));
    const total = allocations.reduce((sum, row) => sum + row.weight, 0);
    for (let seat = 0; seat < budget && total > 0; seat++) {
      let winner = -1;
      for (let i = 0; i < states.length; i++) {
        if (!allocations[i].weight) { states[i].credit = 0; continue; }
        states[i].credit += allocations[i].weight;
        if (winner < 0 || states[i].credit > states[winner].credit) winner = i;
      }
      states[winner].credit -= total;
      allocations[winner].count++;
    }
    try {
      const results = await Promise.all(states.map(async (state, i): Promise<DirectoryRows> => {
        const limit = allocations[i].count;
        if (!limit || state.ended) return { people: [], groups: [] };
        return withSourceBudget(async () => {
          if (!current()) throw Error('Directory scope ended');
          console.info('[directory-mixer] source read started', { kind: options.kind, limit, offset: state.offset });
          try {
            let result: DirectoryRows;
            if (state.origin === options.home && options.homeRead) result = await options.homeRead(options.kind, options.sort, limit, state.offset, owner.signal);
            else {
              state.transport ??= createFederatedTransport({ approvedOrigin: state.origin, credential: options.credential, signal: owner.signal, isCurrent: current });
              result = await readRemoteDirectory(state.transport, options.kind, options.sort, limit, state.offset, options.credential);
            }
            if (!current()) throw Error('Directory scope ended');
            const items = options.kind === 'profiles' ? result.people : result.groups;
            if (items.length > limit) throw Error('Oversized directory page');
            const qualify = <T extends { username?: string; group_id?: string }>(row: T) => ({ ...row, source_origin: state.origin, source_key: JSON.stringify([state.origin, row.username ?? row.group_id]) });
            state.offset += items.length;
            state.ended = items.length < limit;
            delete errors[state.origin];
            console.info('[directory-mixer] source read completed', { count: items.length });
            return { people: result.people.map(qualify), groups: result.groups.map(qualify) };
          } catch {
            if (!current()) throw Error('Directory scope ended');
            errors[state.origin] = 'Directory unavailable or unsupported. Retry source reads.';
            console.info('[directory-mixer] source read failed; offset retained');
            return { people: [], groups: [] };
          }
        }, current, owner.signal).catch(() => {
          if (!current()) throw Error('Directory scope ended');
          errors[state.origin] = 'Source request budget unavailable. Retry source reads.';
          return { people: [], groups: [] };
        });
      }));
      if (!current()) throw Error('Directory scope ended');
      return { people: sortDirectory(results.flatMap(row => row.people), options.sort, row => row.followers_count),
        groups: sortDirectory(results.flatMap(row => row.groups), options.sort, row => row.member_count),
        hasMore: states.some(row => row.weight > 0 && !row.ended), errors: { ...errors }, allocations };
    } finally { pending = false; }
  }
  return { next, dispose: () => { owner.abort(); states.forEach(row => row.transport?.dispose()); } };
}
