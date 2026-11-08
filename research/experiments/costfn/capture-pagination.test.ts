import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { paginationCapture } from './capture-pagination';

test('actual app cursor builder is pinned, exclusive and chronological', () => {
  const value = paginationCapture();
  expect(value.sql).toContain('toUnixTimestamp64Milli(p.created_at) < __CURSOR_MS__');
  expect(value.sql).toContain('LIMIT 21');
  expect(value).toEqual(JSON.parse(readFileSync(new URL('./evidence/core-feed-next-page-v2.json', import.meta.url), 'utf8')));
});
