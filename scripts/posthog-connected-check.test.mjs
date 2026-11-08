import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectedCheck, manifest, requiredEnv, uuid5 } from './posthog-connected-check.mjs';

const ENV = {
  POSTHOG_API_ORIGIN: 'https://us.posthog.com',
  POSTHOG_PROJECT_ID: '4242',
  POSTHOG_PERSONAL_API_KEY: 'phx_synthetic_personal_key',
  WEB10_API_ORIGIN: 'https://api.dev.web10.app',
  WEB10_ADMIN_TOKEN: 'synthetic-admin-jwt-that-is-at-least-32-bytes-long',
};
const DISTINCT = 'w10_' + 'a'.repeat(64);
const EXPECTED_EVENT = '1c041647-2266-5ff4-8a8e-c46e7bea8192'; // uuid5(NAMESPACE_URL, DISTINCT + ':account_created'), pinned against python uuid

test('uuid5 matches an independent (python uuid) vector and is deterministic', () => {
  assert.equal(uuid5('web10'), 'f50eb4f3-ddbf-5db5-a0ce-87d6ad556fe2');
  assert.equal(uuid5(`${DISTINCT}:account_created`), EXPECTED_EVENT);
  assert.equal(uuid5('other'), uuid5('other'));
  assert.notEqual(uuid5('web10'), uuid5('web11'));
  assert.ok(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(uuid5('x')));
});

test('requiredEnv names exactly what is missing', () => {
  assert.deepEqual(Object.entries(requiredEnv({})).filter(([, why]) => why !== '').map(([key]) => key).sort(),
    ['POSTHOG_API_ORIGIN', 'POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID', 'WEB10_ADMIN_TOKEN', 'WEB10_API_ORIGIN'].sort());
  assert.deepEqual(Object.entries(requiredEnv(ENV)).filter(([, why]) => why !== ''), []);
  assert.ok(Object.entries(requiredEnv({ ...ENV, POSTHOG_API_ORIGIN: 'https://eu.i.posthog.com' })).filter(([, why]) => why !== '')[0][0] === 'POSTHOG_API_ORIGIN');
});

test('dry-run manifest is network-free and complete', () => {
  const dry = manifest({ ...ENV, P5_DEADLINE_MS: '60000' });
  assert.equal(dry.missing_env.length, 0);
  assert.equal(dry.network, 'node API + PostHog API only');
  assert.equal(dry.steps.length, 7);
  assert.ok(dry.reports.length === 5);
  assert.match(dry.preconditions[0], /POSTHOG_IDENTITY_SECRET/);
  const partial = manifest({});
  assert.equal(partial.missing_env.length, 5);
});

function syntheticNode(posthog) {
  const calls = [];
  const state = { properties: null, signupContext: null };
  const fetcher = async (url, init = {}) => {
    const response = async (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, body });
    if (url === 'https://api.dev.web10.app/telemetry') return response({ posthog_enabled: true, posthog_project_key: 'phc_synthetic_project', posthog_host: 'https://us.i.posthog.com', posthog_replay_enabled: false, posthog_identity_ready: true });
    if (url.endsWith('/analytics/context')) {
      state.properties = { utm_source: 'harness', utm_medium: 'connected-check', utm_campaign: body.campaign.utm_campaign, utm_content: 'harness' };
      return response({ ticket: 'synthetic-signed-ticket', properties: state.properties });
    }
    if (url.endsWith('/v3/signup')) { state.signupContext = body.analytics_context; return response({ username: body.username, status: 'created' }); }
    if (url.endsWith('/v3/login')) return response({ token: 'synthetic-login-jwt' });
    if (url.endsWith('/analytics/identity')) {
      // The account's stored first-touch labels are what the identity seam returns.
      assert.equal(body.token, 'synthetic-login-jwt');
      assert.equal(state.signupContext, 'synthetic-signed-ticket', 'signup did not carry the signed first-touch context');
      return response({ enabled: true, distinct_id: DISTINCT, acquisition: state.properties });
    }
    if (url.endsWith('/admin/analytics/health')) return response({ sent: 1, failed: 0, complete: true, checked_at: '2026-11-08T12:00:00Z' });
    if (url === 'https://us.posthog.com/api/projects/4242/query') return response(await posthog(body.query.query, state));
    throw new Error(`unexpected request: ${url}`);
  };
  return { fetcher, calls, state };
}

test('happy path: canonical journey agrees with the independent UUID oracle, and no credential leaks into the receipt', async () => {
  const node = syntheticNode((query, state) => {
    if (query.includes('account_created')) return { results: [[EXPECTED_EVENT, 'account_created', 'server', 'attributed', state.properties.utm_campaign, '2026-11-08 12:00:00']], columns: ['uuid', 'event', 'capture_origin', 'attribution_status', 'utm_campaign', 'at'] };
    return { results: [[state.properties.utm_campaign, 1]], columns: ['campaign', 'new_accounts'] };
  });
  const fetcher = node.fetcher;
  const receipt = await connectedCheck({ env: ENV, fetcher, now: () => '2026-11-08T12:00:00Z' });
  assert.equal(receipt.complete, true);
  assert.equal(receipt.steps.identity.distinct_id, DISTINCT);
  assert.equal(receipt.steps.outcome.oracle_uuid, EXPECTED_EVENT);
  assert.equal(receipt.steps.outcome.agreement, true);
  assert.equal(receipt.steps.reports.length, 5);
  assert.ok(receipt.steps.reports.every((run) => run.executed));
  const healthCall = node.calls.find((call) => call.url.endsWith('/admin/analytics/health'));
  assert.equal(healthCall.body.token, ENV.WEB10_ADMIN_TOKEN, 'admin health must use the operator admin token, not the journey account token');
  assert.notEqual(healthCall.body.token, 'synthetic-login-jwt');
  const serialized = JSON.stringify(receipt);
  assert.ok(!serialized.includes('phx_synthetic_personal_key'), 'personal key leaked into the receipt');
  assert.ok(!serialized.includes('synthetic-login-jwt'), 'auth token leaked into the receipt');
  assert.ok(!serialized.includes('-x7f'), 'password suffix leaked into the receipt');
  assert.match(serialized, /p5check-/, 'QA exclusion username is reported');
});

test('missing canonical outcome fails with the reconciliation pointer, not a silent pass', async () => {
  const { fetcher } = syntheticNode(() => ({ results: [], columns: ['uuid'] }));
  await assert.rejects(
    connectedCheck({ env: ENV, fetcher, now: () => '2026-11-08T12:00:00Z', deadlineMs: 1 }),
    /account_created did not arrive.*admin\/analytics\/health/);
});

test('identity secret not provisioned fails before any signup', async () => {
  const fetcher = async (url) => {
    if (url === 'https://api.dev.web10.app/telemetry') return { ok: true, status: 200, json: async () => ({ posthog_enabled: true, posthog_identity_ready: false }) };
    throw new Error(`unexpected request: ${url}`);
  };
  await assert.rejects(connectedCheck({ env: ENV, fetcher }), /POSTHOG_IDENTITY_SECRET/);
});

test('report HogQL failure marks the receipt incomplete and names the report', async () => {
  const { fetcher } = syntheticNode((query, state) => {
    if (query.includes('account_created')) return { results: [[EXPECTED_EVENT, 'account_created', 'server', 'attributed', state.properties.utm_campaign, 'x']], columns: ['uuid', 'event', 'capture_origin', 'attribution_status', 'utm_campaign', 'at'] };
    // 'Signed-in foreground activity' carries uniqExact(distinct_id) AS active_accounts
    if (query.includes('uniqExact(distinct_id) AS active_accounts')) throw new Error('HogQL query failed (500)');
    return { results: [[{}]], columns: ['x'] };
  });
  await assert.rejects(
    connectedCheck({ env: ENV, fetcher, now: () => '2026-11-08T12:00:00Z' }),
    /live HogQL execution failed for: Signed-in foreground activity/);
});
