import { test, expect, beforeAll, afterAll } from 'bun:test';
import { capture } from './capture-feed';
import { readFileSync } from 'node:fs';

const originalFetch = globalThis.fetch;
beforeAll(() => { globalThis.fetch = (() => { throw new Error('Network is forbidden in setup capture'); }) as typeof fetch; });
afterAll(() => { globalThis.fetch = originalFetch; });

test('nonempty current app/SDK builders produce three queries and contentViews without HTTP', async () => {
  const plan = await capture();
  expect(plan.requests.map(r => r.path)).toEqual(['/v3/query', '/v3/query', '/v3/query', '/v3/contentViews']);
  expect(plan.displayed_rows).toBe(20);
  expect(plan.returned_rows_before_slice).toBe(21);
  expect(plan.requests[0].payload.content_service).toBe('posts');
  expect(plan.requests[0].payload.prepare.media).toBe(true);
  expect(plan.requests[0].payload.prepare.ads).toBe(true);
  expect(plan.requests[0].payload.prepare.face.bodyField).toBe('profile_body');
  expect(plan.requests[0].payload.sql).toContain('LIMIT 21');
  for (const service of ['reactions', 'comments', 'profile']) expect(plan.requests[0].payload.sql).toContain(service);
  expect(plan.requests[1].payload.sql).toContain('__POST_IDS__');
  expect(plan.requests[2].payload.sql).toContain('__POST_IDS__');
  expect(plan.requests[3].payload.doc_ids).toEqual(['__POST_IDS__']);
  expect(plan.requests.every(r => r.payload.token === '__TOKEN__')).toBe(true);
  expect(plan.origin_header_captured).toBe(false);
});

test('empty feed is not falsely counted as a four-request load', async () => {
  const plan = await capture(0);
  expect(plan.requests).toHaveLength(1);
  expect(plan.displayed_rows).toBe(0);
});

test('wire capture is reproducible and explicitly not live-system proof', async () => {
  const fresh = await capture();
  expect(fresh).toEqual(await capture());
  expect(fresh).toEqual(JSON.parse(readFileSync(new URL('./evidence/core-feed-wire-v4.json', import.meta.url), 'utf8')));
  // Source refresh must not silently change the historical single-node workload.
  const previous = JSON.parse(readFileSync(new URL('./evidence/core-feed-wire-v3.json', import.meta.url), 'utf8'));
  expect(fresh.requests).toEqual(previous.requests);
  expect(fresh.capture_kind).toBe('OFFLINE_BUILDERS_FAKE_TRANSPORT');
});
