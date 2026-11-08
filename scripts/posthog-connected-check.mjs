#!/usr/bin/env node
// P5 connected acceptance: the real journey against a real node and a real
// PostHog project, end to end. Dry-run by default (manifest only, no network).
// HogQL runs through the Query API (POST /api/projects/:id/query, personal key
// with query read) — the web UI's /insights/query/ rejects personal keys (5.0.4).
// Live run requires operator-provided credentials in the environment; it never
// prints personal keys, auth tokens or passwords.
//
// Closes the two explicitly-unverified items from 5.0.0:
//   1. live HogQL execution of the five managed report definitions
//   2. fixture -> facts -> events -> reconciliation agreement on a deployed stack
//
// Env (live run):
//   POSTHOG_API_ORIGIN      e.g. https://us.posthog.com (region must match the project)
//   POSTHOG_PROJECT_ID      numeric project id
//   POSTHOG_PERSONAL_API_KEY  phx_... (env only, never chat)
//   WEB10_API_ORIGIN        e.g. https://api.dev.web10.app
//   WEB10_ADMIN_TOKEN       a node admin JWT (for /admin/analytics/health)
//   P5_DEADLINE_MS          optional poll deadline for outcome delivery (default 120000)
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { reports } from './posthog-reports.mjs';

const NAMESPACE_URL = '6ba7b811-9dad-11d1-80b4-00c04fd430c8';

// uuid5 (SHA-1 namespace) — the node derives the same value for
// `<distinct_id>:account_created`, so the harness can oracle it client-side.
export function uuid5(name, namespace = NAMESPACE_URL) {
  const bytes = createHash('sha1').update(Buffer.from(namespace.replace(/-/g, ''), 'hex')).update(name).digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function requiredEnv(env) {
  const needed = {
    POSTHOG_API_ORIGIN: /^https:\/\/(us|eu)\.posthog\.com$/.test(env.POSTHOG_API_ORIGIN ?? '') ? '' : 'set POSTHOG_API_ORIGIN (https://us.posthog.com or https://eu.posthog.com)',
    POSTHOG_PROJECT_ID: /^\d+$/.test(env.POSTHOG_PROJECT_ID ?? '') ? '' : 'set POSTHOG_PROJECT_ID (numeric)',
    POSTHOG_PERSONAL_API_KEY: (env.POSTHOG_PERSONAL_API_KEY ?? '').startsWith('phx_') ? '' : 'set POSTHOG_PERSONAL_API_KEY in the environment (never chat)',
    WEB10_API_ORIGIN: /^https?:\/\/[a-z0-9.-]+$/i.test(env.WEB10_API_ORIGIN ?? '') ? '' : 'set WEB10_API_ORIGIN (the deployed node API)',
    WEB10_ADMIN_TOKEN: typeof env.WEB10_ADMIN_TOKEN === 'string' && env.WEB10_ADMIN_TOKEN.length >= 32 ? '' : 'set WEB10_ADMIN_TOKEN (a node admin JWT)',
  };
  return needed;
}

/** No network: what the live run will do, and what it needs. */
export function manifest(env = {}) {
  const missing = Object.entries(requiredEnv(env)).filter(([, why]) => why !== '');
  return {
    name: 'web10 P5 connected acceptance',
    managed: 'web10-p5-connected-v1',
    missing_env: missing.map(([key]) => key),
    preconditions: [
      'node deployed with 5.0.0+ (POSTHOG_IDENTITY_SECRET provisioned — the 5.0.1 gate blocks enablement without it)',
      'Node Config: public phc_ ingest key + matching region + Use PostHog enabled',
      'reconciliation worker running (30s cadence) on the API',
    ],
    steps: [
      '1. telemetry preflight: enabled, valid public key, identity secret ready',
      '2. first-touch: POST /analytics/context signs the campaign ticket',
      '3. canonical signup: POST /v3/signup stores the immutable analytics context in the users row',
      '4. identity: POST /v3/login then POST /analytics/identity returns the w10_ pseudonym',
      '5. reconciliation: POST /admin/analytics/health shows a timestamped pass',
      '6. outcome: live HogQL finds account_created with the client-oracle UUID for the distinct_id',
      '7. reports: all five managed report definitions execute live HogQL without error',
    ],
    reports: reports.map((report) => report.name),
    qa_exclusion: 'the synthetic account username is reported for the operator exclusion list; it is not deleted by this check',
    network: missing.length ? 'none (dry run)' : 'node API + PostHog API only',
  };
}

// The Query API (docs: posthog.com/docs/sql → "Query API"): personal API key
// auth, POST /api/projects/:id/query, { query: { kind: 'HogQLQuery', ... } }.
// (The web UI's /insights/query/ endpoint rejects personal API keys.)
function rowObject(row, columns) {
  if (Array.isArray(row)) row = Object.fromEntries((columns ?? []).map((c, i) => [c, row[i]]));
  const flat = {};
  for (const [key, value] of Object.entries(row ?? {})) {
    flat[key] = value;
    flat[key.replace(/\./g, '_')] = value; // properties.capture_origin and friends
  }
  return flat;
}

function hogql(fetcher, host, projectId, key, query) {
  return fetcher(`${host}/api/projects/${projectId}/query`, {
    method: 'POST',
    redirect: 'error',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query }, name: 'p5-connected-check' }),
  }).then(async (response) => {
    if (!response.ok) throw new Error(`HogQL query failed (${response.status})`);
    const body = await response.json();
    const rows = Array.isArray(body.results) ? body.results : [];
    return rows.map((row) => rowObject(row, body.columns));
  });
}

export async function connectedCheck({ env = {}, fetcher = fetch, now = () => new Date().toISOString(), deadlineMs = Number(env.P5_DEADLINE_MS) || 120000 } = {}) {
  const missing = Object.entries(requiredEnv(env)).filter(([, why]) => why !== '');
  if (missing.length) throw new Error(`P5 connected check cannot run: ${missing.map(([key, why]) => `${key}: ${why}`).join(' · ')}`);
  const api = env.WEB10_API_ORIGIN.replace(/\/$/, '');
  const post = (path, body) => fetcher(`${api}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const receipt = { scope: 'P5 connected acceptance against a deployed node + live PostHog project. Credentials and auth tokens are never included.', at: now(), steps: {} };

  const telemetryResponse = await fetcher(`${api}/telemetry`);
  if (!telemetryResponse.ok) throw new Error(`node telemetry endpoint unreachable (${telemetryResponse.status})`);
  const telemetry = await telemetryResponse.json();
  receipt.steps.telemetry = { enabled: telemetry.posthog_enabled === true, identity_ready: telemetry.posthog_identity_ready === true };
  if (telemetry.posthog_enabled !== true) throw new Error('PostHog is not enabled in Node Config — set the public phc_ key, matching region and Use PostHog');
  if (telemetry.posthog_identity_ready !== true) throw new Error('POSTHOG_IDENTITY_SECRET is not provisioned on the API — the 5.0.1 gate blocks account analytics without it; this is expected pre-deployment');

  const stamp = Date.now().toString(36);
  const campaign = { utm_source: 'harness', utm_medium: 'connected-check', utm_campaign: `p5-${stamp}`, utm_content: 'harness' };
  const contextResponse = await post('/analytics/context', { campaign });
  if (!contextResponse.ok) throw new Error(`/analytics/context failed (${contextResponse.status})`);
  const context = await contextResponse.json();
  if (typeof context.ticket !== 'string' || context.properties?.utm_campaign !== campaign.utm_campaign) throw new Error('first-touch ticket did not round-trip the campaign labels');
  receipt.steps.first_touch = { ticket_present: true, properties: context.properties };

  const username = `p5check_${stamp}${Math.random().toString(36).slice(2, 8)}`;
  const password = `p5-${stamp}-x7f`;
  const signupResponse = await post('/v3/signup', { username, password, analytics_context: context.ticket });
  if (signupResponse.status !== 200) throw new Error(`canonical signup failed (${signupResponse.status})`);
  const loginResponse = await post('/v3/login', { username, password, site: new URL(api).hostname });
  if (!loginResponse.ok) throw new Error(`login failed (${loginResponse.status})`);
  const login = await loginResponse.json();
  const token = login.token ?? login;
  const identityResponse = await post('/analytics/identity', { token });
  if (!identityResponse.ok) throw new Error(`/analytics/identity failed (${identityResponse.status})`);
  const identity = await identityResponse.json();
  if (!identity.enabled || !/^w10_[a-f0-9]{64}$/.test(identity.distinct_id ?? '')) throw new Error('identity endpoint did not return a verified w10_ pseudonym');
  if (identity.acquisition?.utm_campaign !== campaign.utm_campaign) throw new Error('identity acquisition labels do not match the signed first touch');
  receipt.steps.identity = { distinct_id: identity.distinct_id, acquisition: identity.acquisition };

  const expectedEventId = uuid5(`${identity.distinct_id}:account_created`);
  const deadline = Date.now() + deadlineMs;
  let outcome = null;
  while (Date.now() < deadline) {
    const healthResponse = await post('/admin/analytics/health', { token });
    if (healthResponse.ok) receipt.steps.health = await healthResponse.json();
    const rows = await hogql(fetcher, env.POSTHOG_API_ORIGIN.replace(/\/$/, ''), env.POSTHOG_PROJECT_ID, env.POSTHOG_PERSONAL_API_KEY,
      `SELECT uuid, event, properties.capture_origin, properties.attribution_status, properties.utm_campaign, toString(timestamp) AS at FROM events WHERE event = 'account_created' AND distinct_id = '${identity.distinct_id}'`);
    if (rows.length) { outcome = rows[0]; break; }
    receipt.steps.outcome_polls = (receipt.steps.outcome_polls ?? 0) + 1;
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  if (!outcome) throw new Error(`account_created did not arrive in PostHog within ${deadlineMs}ms — check the reconciliation worker and /admin/analytics/health`);
  const agreement = outcome.uuid === expectedEventId
    && outcome.properties_capture_origin === 'server'
    && outcome.properties_attribution_status === 'attributed'
    && outcome.properties_utm_campaign === campaign.utm_campaign;
  receipt.steps.outcome = { uuid: outcome.uuid, oracle_uuid: expectedEventId, agreement, raw_fields: { capture_origin: outcome.properties_capture_origin, attribution_status: outcome.properties_attribution_status, utm_campaign: outcome.properties_utm_campaign, at: outcome.at } };
  if (!agreement) throw new Error('outcome event disagrees with the independent oracle (UUID/provenance/attribution)');

  const reportRuns = [];
  for (const report of reports) {
    try {
      const rows = await hogql(fetcher, env.POSTHOG_API_ORIGIN.replace(/\/$/, ''), env.POSTHOG_PROJECT_ID, env.POSTHOG_PERSONAL_API_KEY, report.sql);
      reportRuns.push({ name: report.name, executed: true, rows: rows.length });
    } catch (error) {
      reportRuns.push({ name: report.name, executed: false, error: error.message });
    }
  }
  receipt.steps.reports = reportRuns;
  receipt.qa_exclusion_username = username;
  receipt.complete = reportRuns.every((run) => run.executed);
  if (!receipt.complete) throw new Error('live HogQL execution failed for: ' + reportRuns.filter((run) => !run.executed).map((run) => run.name).join(', '));
  return receipt;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.includes('--run')) console.log(JSON.stringify(await connectedCheck({ env: process.env }), null, 2));
    else console.log(JSON.stringify(manifest(process.env), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
