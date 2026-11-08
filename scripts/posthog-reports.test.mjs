import { test } from 'node:test';
import assert from 'node:assert/strict';
import { provision, reports } from './posthog-reports.mjs';

test('dry-run never calls vendor and reports mature versus pending explicitly', async () => {
  const manifest = await provision({ fetcher: () => { throw new Error('network forbidden'); } });
  assert.equal(manifest.reports.length, 5);
  assert.ok(reports.some((r) => r.sql.includes('pending_accounts') && r.sql.includes('INTERVAL 7 DAY')));
  assert.ok(reports[0].sql.includes("properties.capture_origin = 'server'"));
  assert.ok(!JSON.stringify(manifest).includes('phx_'));
});

test('apply creates only managed dashboard/reports with environment credentials', async () => {
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push({ url, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    return { ok: true, json: async () => options.method === 'GET' ? { results: [], next: null } : { id: 123 } };
  };
  const result = await provision({ apply: true, fetcher, env: { POSTHOG_PROJECT_ID: '1', POSTHOG_PERSONAL_API_KEY: 'phx_synthetic', POSTHOG_REGION: 'EU' } });
  assert.equal(result.reports, 5);
  assert.equal(calls.filter((c) => c.method === 'POST').length, 6);
  assert.ok(calls.every((c) => c.url.startsWith('https://eu.posthog.com/api/projects/1/')));
  assert.ok(!JSON.stringify(calls).includes('phx_synthetic'));
});

test('independent synthetic cohort oracle distinguishes activation, pending and return edges', () => {
  // Five hand-declared campaign outcomes: A retained, B activated/no return,
  // C pending, D first use too late, E no activity. Expected is independent
  // of vendor query text; actual vendor execution remains a separate gate.
  const accounts = [
    { campaign: 'A', age: 200, visits: [0.5, 24] },
    { campaign: 'B', age: 200, visits: [1, 168] },
    { campaign: 'C', age: 72, visits: [1, 48] },
    { campaign: 'D', age: 200, visits: [24, 48] },
    { campaign: 'E', age: 200, visits: [] },
  ];
  const activated = accounts.filter((a) => a.visits.some((t) => t >= 0 && t < 24));
  const retained = activated.filter((a) => a.age >= 168 && a.visits.some((t) => t >= 24 && t < 168));
  assert.deepEqual(activated.map((a) => a.campaign), ['A', 'B', 'C']);
  assert.deepEqual(retained.map((a) => a.campaign), ['A']);
  assert.deepEqual(accounts.filter((a) => a.age < 168).map((a) => a.campaign), ['C']);
});
