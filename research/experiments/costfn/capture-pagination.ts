/** Actual Newest cursor builder, offline only; separate from frozen wire history. */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export function paginationCapture(source = readFileSync(new URL('../../../marketing/web10-social/src/data/feed.ts', import.meta.url), 'utf8')) {
  const extract = (name: string) => {
    const start = source.search(new RegExp(`^(?:export )?function ${name}\\(`, 'm'));
    const end = source.slice(start).match(/^}[ \t]*$/m);
    if (start < 0 || !end) throw new Error(`Missing trusted builder ${name}`);
    return source.slice(start, start + end.index! + end[0].length).replace(/^export /, '');
  };
  const code = ['powerMeanScoreSql', 'buildFeedQuery'].map(extract).join('\n');
  const sample = '2026-01-01T00:00:19.123Z';
  const rawSql: string = new Function(new Bun.Transpiler({ loader: 'ts' }).transformSync(code)
    + `; return buildFeedQuery(null, {created_at: ${JSON.stringify(sample)}}, 20);`)();
  const fragment = ` < ${Date.parse(sample)}`;
  if (!rawSql.includes(fragment)) throw new Error('Cursor builder changed; inspect before capture');
  const sql = rawSql.replace(fragment, ' < __CURSOR_MS__');
  const sha = (s: string) => createHash('sha256').update(s).digest('hex');
  return { kind: 'OFFLINE_NEWEST_CURSOR_BUILDER', feed_sha256: sha(source),
    capture_sha256: sha(readFileSync(new URL(import.meta.url), 'utf8')), sql };
}

if (import.meta.main) {
  if (!process.argv[2]) throw new Error('output path required');
  writeFileSync(process.argv[2], JSON.stringify(paginationCapture(), null, 2) + '\n', { flag: 'wx' });
}
