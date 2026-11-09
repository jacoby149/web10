/** Offline wire-builder capture from app + SDK source. No HTTP or app edits. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = new URL('../../../', import.meta.url);
const paths = {
  feed: 'marketing/web10-social/src/data/feed.ts',
  sdk: 'sdk/src/v3.ts',
  posts: 'marketing/web10-social/src/data/posts.ts',
  types: 'marketing/web10-social/src/data/types.ts',
};
const hash = (text: string) => createHash('sha256').update(text).digest('hex');

function declaration(source: string, name: string): string {
  const start = source.search(new RegExp(`^(?:export )?(?:async )?function ${name}\\(`, 'm'));
  const closing = start < 0 ? null : source.slice(start).match(/^}[ \t]*$/m);
  if (start < 0 || !closing) throw new Error(`Missing source function: ${name}`);
  // A multiline parameter/return type can also close at column zero (`}>` or
  // `}): ...`); only the standalone brace ends these source declarations.
  return source.slice(start, start + closing.index! + closing[0].length).replace(/^export /, '');
}

function method(source: string, name: string): string {
  const start = source.indexOf(`    async ${name}(`);
  const end = source.indexOf('\n    },', start);
  if (start < 0 || end < start) throw new Error(`Missing SDK method: ${name}`);
  return source.slice(start, end + 7);
}

export async function capture(rowCount = 21, options: { createdAfterMs?: number } = {}) {
  const source = Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, readFileSync(new URL(path, root), 'utf8')]));
  const requests: { path: string; payload: Record<string, any> }[] = [];
  let queryCount = 0;
  const transpiler = new Bun.Transpiler({ loader: 'ts' });
  const sdkCode = `function makeSDK() { return { ${method(source.sdk, 'query')} ${method(source.sdk, 'contentViews')} }; }`;
  // Execute trusted repository builders with a fake transport, never downloaded
  // code or dataset strings. This validates wire construction, not live behavior.
  const sdk = new Function('state', 'readTokenCookie', 'authPost', 'apiOrigin',
    transpiler.transformSync(sdkCode) + '; return makeSDK();')(
      { token: '__TOKEN__' }, () => { throw new Error('Unexpected cookie dependency'); },
      async (url: string, payload: Record<string, any>) => {
        const path = new URL(url).pathname;
        requests.push({ path, payload: structuredClone(payload) });
        if (path === '/v3/query' && queryCount++ === 0) {
          return { rows: Array.from({ length: rowCount }, (_, i) => ({
            doc_id: `__POST_${i}__`, author_key: 'c42-c000000', body: { text: 'synthetic' },
            created_at: '2026-01-01T00:00:00Z', tags: [], profile_body: null,
          })) };
        }
        return path === '/v3/query' ? { rows: [] } : {};
      }, 'http://capture.invalid');
  const appCode = ['powerMeanScoreSql', 'buildFeedQuery', 'fromFeedQueryRow', 'readFeedEngagementCounts', 'readFeedPage']
    .map(name => declaration(source.feed, name)).join('\n') + '\n' + declaration(source.posts, 'resolvePostAuthors') + '\n' +
    ['extractUsername', 'extractProvider', 'leafValue', 'numValue', 'parseProductFields',
      'fromV3DocToPost', 'fromV3FeedPost', 'dropAdPosts'].map(name => declaration(source.types, name)).join('\n');
  const app = new Function('getV3Client', 'getFeedGroups', 'getDiscoverGroupId',
    'knobStateToSort', 'resolveFaceMedia', 'GROUP_FACE_SQL', 'console',
     transpiler.transformSync(appCode) + `; return readFeedPage({ limit: 20, ...${JSON.stringify(options)} });`)(
      () => sdk, async () => ['__FEED_GROUPS__'], () => '__DISCOVER__',
      () => { throw new Error('Tuned ranking is outside this capture'); },
      () => { throw new Error('Group-author enrichment is outside this capture'); }, '',
      { log() {}, warn() {} });
  const result = await app;
  const quoted = Array.from({ length: rowCount }, (_, i) => `'__POST_${i}__'`).join(', ');
  for (const request of requests.slice(1)) {
    if (typeof request.payload.sql === 'string') {
      if (!request.payload.sql.includes(quoted)) throw new Error('Follow-up IDs no longer match captured rows');
      request.payload.sql = request.payload.sql.replace(quoted, '__POST_IDS__');
    }
    if (request.payload.doc_ids) request.payload.doc_ids = ['__POST_IDS__'];
  }
  if (requests.length !== (rowCount ? 4 : 1)) throw new Error('Core request topology changed; review before experiments');
  return {
    format: 'web10-core-feed-wire-v1', capture_kind: 'OFFLINE_BUILDERS_FAKE_TRANSPORT',
    sources: Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, { path, sha256: hash(source[key]) }])),
    capture_sha256: hash(readFileSync(fileURLToPath(import.meta.url), 'utf8')),
    preset: 'Newest', cursor: null, display_limit: 20, returned_rows_before_slice: rowCount,
    displayed_rows: result.posts.length,
    sequencing: 'Await main query, then reaction query + comment query + contentViews concurrently',
    origin_header_captured: false,
    exclusions: ['group discovery/session setup', 'browser rendering', 'transport retries', 'media byte delivery',
      'tuned ranking', 'group-author face enrichment', 'populated profile/media/ad conversion branches'],
    requests,
  };
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('usage: bun capture-feed.ts /new/output.json');
  const result = await capture();
  writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  console.log(`[capture] ${result.requests.length} core API requests, no network traffic`);
}
