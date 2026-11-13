import { getV3Client, type V3Client } from './v3';
import { getDiscoverGroupId } from './groups';
import { HASHTAG_VALID } from '@web10/discover/hashtags';

export interface HashtagSuggestion { hashtag: string; postCount: number }

/** Aggregate the board's index, not the machine's tags or a loaded feed sample. */
export function hashtagSearchSql(query: string): string {
  if (!/^[a-z0-9_]{0,30}$/.test(query)) throw new Error('Invalid hashtag search');
  return `SELECT hashtag, uniqExact(tuple(author_key, doc_id)) AS post_count FROM (` +
    `SELECT author_key, doc_id, arrayJoin(JSONExtract(body, 'hashtags', 'Array(String)')) AS hashtag ` +
    `FROM posts WHERE not has(tags, 'ad') AND not has(tags, 'product')) ` +
    `WHERE match(hashtag, '^[a-z0-9_]{1,30}$')` +
    (query ? ` AND position(hashtag, '${query}') > 0` : '') +
    ` GROUP BY hashtag ORDER BY ` +
    (query ? `if(hashtag = '${query}', 0, if(startsWith(hashtag, '${query}'), 1, 2)), ` : '') +
    `post_count DESC, hashtag ASC LIMIT 8`;
}

const TTL = 60_000;
const MAX_QUERIES = 64;
interface Entry { expires: number; promise: Promise<HashtagSuggestion[]> }
interface Cache { scope: string; entries: Map<string, Entry> }
const caches = new WeakMap<V3Client, Cache>();
const scopeOf = (w: V3Client, group: string) => JSON.stringify([w.state?.apiOrigin, w.state?.token, w.readToken(), group]);

/** Identical requests share work; cancelled consumers never cancel another picker. */
export async function searchHashtags(query: string, signal: AbortSignal): Promise<HashtagSuggestion[]> {
  const q = query.toLowerCase();
  const sql = hashtagSearchSql(q);
  if (signal.aborted) return [];
  const w = getV3Client();
  const group = getDiscoverGroupId();
  const scope = scopeOf(w, group);
  let cache = caches.get(w);
  if (!cache || cache.scope !== scope) {
    cache = { scope, entries: new Map() };
    caches.set(w, cache);
  }
  let entry = cache.entries.get(q);
  if (!entry || entry.expires <= Date.now()) {
    const owner = cache;
    console.info('[hashtags] suggestions read started');
    const promise = w.query(sql, { groups: [group] }).then(({ rows }) => {
      const suggestions = rows.flatMap(row => {
        const hashtag = String(row.hashtag ?? '');
        const postCount = Number(row.post_count);
        return HASHTAG_VALID.test(hashtag) && Number.isSafeInteger(postCount) && postCount > 0
          ? [{ hashtag, postCount }] : [];
      }).slice(0, 8);
      console.info('[hashtags] suggestions read completed', { matches: suggestions.length });
      return suggestions;
    }).catch(error => {
      if (owner.entries.get(q)?.promise === promise) owner.entries.delete(q);
      console.warn('[hashtags] suggestions read unavailable; draft retained');
      throw error;
    });
    entry = { expires: Date.now() + TTL, promise };
    cache.entries.delete(q);
    cache.entries.set(q, entry);
    if (cache.entries.size > MAX_QUERIES) cache.entries.delete(cache.entries.keys().next().value!);
  } else {
    cache.entries.delete(q); cache.entries.set(q, entry);
    console.info('[hashtags] suggestions cache hit');
  }
  const rows = await entry.promise;
  // Transport may ignore cancellation; neither cached nor late reads cross scopes.
  if (signal.aborted || getV3Client() !== w || scopeOf(w, getDiscoverGroupId()) !== scope) return [];
  return rows;
}

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
export const hashtagPostCount = (count: number) => `${compact.format(count)} ${count === 1 ? 'post' : 'posts'}`;
