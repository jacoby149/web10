import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { paginationCapture } from './capture-pagination';

test('actual app cursor builder is pinned, exclusive and chronological', () => {
  const value = paginationCapture();
  expect(value.sql).toContain('toUnixTimestamp64Milli(p.created_at) < __CURSOR_MS__');
  expect(value.sql).toContain('LIMIT 21');
  expect(value).toEqual(JSON.parse(readFileSync(new URL('./evidence/core-feed-next-page-v3.json', import.meta.url), 'utf8')));
});

test('exported and local builder declarations capture the same SQL', () => {
  const source = readFileSync(new URL('../../../marketing/web10-social/src/data/feed.ts', import.meta.url), 'utf8');
  expect(source).toContain('export function buildFeedQuery(');
  const local = source.replace('export function buildFeedQuery(', 'function buildFeedQuery(');
  expect(paginationCapture(source).sql).toBe(paginationCapture(local).sql);
  expect(() => paginationCapture(source.replace('export function buildFeedQuery(', 'function missingBuilder(')))
    .toThrow('Missing trusted builder buildFeedQuery');
});
