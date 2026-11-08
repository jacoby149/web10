#!/usr/bin/env node
// Provision vendor reports, not an in-house dashboard. Dry-run by default.
// Personal API key is read from the environment only; never print it.
import { pathToFileURL } from 'node:url';

const acquisition = `SELECT distinct_id, min(timestamp) AS signed_up,
argMin(toString(properties.utm_campaign), timestamp) AS campaign,
argMin(toString(properties.utm_content), timestamp) AS placement
FROM events WHERE event = 'account_created' AND properties.capture_origin = 'server'
AND timestamp >= now() - INTERVAL 90 DAY GROUP BY distinct_id`;

export const reports = [
  { name: 'Confirmed new accounts by campaign', sql: `SELECT campaign, placement, count() AS new_accounts FROM (${acquisition}) GROUP BY campaign, placement ORDER BY new_accounts DESC` },
  { name: 'Activation and mature week-one return', sql: `WITH acquisitions AS (${acquisition}),
activity AS (SELECT distinct_id, groupArray(timestamp) AS visits FROM events WHERE event = 'product_session'
AND timestamp >= now() - INTERVAL 90 DAY GROUP BY distinct_id)
SELECT campaign, placement, count() AS new_accounts,
countIf(arrayExists(t -> t >= signed_up AND t < signed_up + INTERVAL 24 HOUR, visits)) AS activated,
countIf(now() >= signed_up + INTERVAL 7 DAY) AS mature_accounts,
countIf(now() >= signed_up + INTERVAL 7 DAY AND arrayExists(t -> t >= signed_up AND t < signed_up + INTERVAL 24 HOUR, visits)) AS mature_activated,
countIf(now() < signed_up + INTERVAL 7 DAY) AS pending_accounts,
countIf(now() >= signed_up + INTERVAL 7 DAY
AND arrayExists(t -> t >= signed_up AND t < signed_up + INTERVAL 24 HOUR, visits)
AND arrayExists(t -> t >= signed_up + INTERVAL 24 HOUR AND t < signed_up + INTERVAL 7 DAY, visits)) AS week_one_returning,
if(mature_activated = 0, NULL, week_one_returning / mature_activated) AS return_rate_of_mature_activated
FROM acquisitions LEFT JOIN activity USING distinct_id GROUP BY campaign, placement` },
  { name: 'Signed-in foreground activity', sql: `SELECT toDate(timestamp) AS day, uniqExact(distinct_id) AS active_accounts
FROM events WHERE event = 'product_session' AND startsWith(distinct_id, 'w10_')
AND timestamp >= now() - INTERVAL 90 DAY GROUP BY day ORDER BY day` },
  { name: 'Anonymous campaign landings (not unique people)', sql: `SELECT toString(properties.utm_campaign) AS campaign,
toString(properties.utm_content) AS placement, count() AS pageviews, uniqExact(properties.$session_id) AS observed_sessions
FROM events WHERE event = '$pageview' AND properties.app = 'marketing-ui'
AND timestamp >= now() - INTERVAL 30 DAY GROUP BY campaign, placement ORDER BY pageviews DESC` },
  { name: 'Collection freshness and outcome completeness', sql: `SELECT event, max(timestamp) AS latest_event,
count() AS event_rows, uniqExact(distinct_id) AS distinct_ids,
countIf(properties.measurement_incomplete = true) AS incomplete_rows
FROM events WHERE event IN ('account_created', 'product_session', '$pageview')
AND timestamp >= now() - INTERVAL 7 DAY GROUP BY event` },
];

export async function provision({ apply = false, fetcher = fetch, env = process.env } = {}) {
  const manifest = { name: 'web10 — Acquisition & Retention', managed: 'web10-posthog-v1', reports,
    definitions: {
      activation: 'Signed-in foreground social session within [0h,24h) after canonical signup; not verified content viewing.',
      return: 'Activated account with a foreground session at age [24h,168h); only >=168h cohorts are final.',
      anonymous: 'Anonymous landings stay separate; no unsafe anonymous/account aliasing across domains.',
      costs: 'Actual spend and cohort allocation must be supplied; no invented cost or zero-dollar acquisition claims.',
    } };
  if (!apply) return manifest;
  const host = env.POSTHOG_REGION === 'EU' ? 'https://eu.posthog.com' : 'https://us.posthog.com';
  const project = env.POSTHOG_PROJECT_ID;
  const key = env.POSTHOG_PERSONAL_API_KEY;
  if (!/^\d+$/.test(project ?? '') || !key?.startsWith('phx_')) throw new Error('Set project ID and personal API key in the environment');
  async function api(route, method = 'GET', body) {
    const response = await fetcher(`${host}/api/projects/${project}/${route}`, {
      method, redirect: 'error', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw new Error(`PostHog API request failed (${response.status})`);
    return response.json();
  }
  async function all(route) {
    const items = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const page = await api(`${route}?limit=100&offset=${offset}`);
      items.push(...page.results);
      if (!page.next) return items;
    }
    throw new Error('Vendor pagination exceeds safe limit');
  }
  const dashboards = await all('dashboards/');
  const dashboard = dashboards.find((d) => d.description === manifest.managed) ?? await api('dashboards/', 'POST', { name: manifest.name, description: manifest.managed });
  const existing = await all('insights/');
  for (const report of reports) {
    const saved = existing.find((i) => i.name === report.name && i.description === manifest.managed);
    const body = { name: report.name, description: manifest.managed, saved: true, dashboards: [dashboard.id],
      query: { kind: 'DataTableNode', source: { kind: 'HogQLQuery', query: report.sql } } };
    await api(saved ? `insights/${saved.id}/` : 'insights/', saved ? 'PATCH' : 'POST', body);
  }
  return { dashboard_id: dashboard.id, reports: reports.length, live_query_validation: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await provision({ apply: process.argv.includes('--apply') }), null, 2)); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
