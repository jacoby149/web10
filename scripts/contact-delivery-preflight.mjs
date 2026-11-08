#!/usr/bin/env node
// D105 release acceptance, first bite: no network by default; --preflight makes
// exactly one admin status read. Never connects a provider or sends/reset accounts.
import { pathToFileURL } from 'node:url';

const FLAGS = ['available', 'gmail_available', 'gmail_connected', 'sendgrid_configured', 'twilio_configured'];
const PROVIDERS = ['legacy', 'gmail', 'sendgrid'];

function apiOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash
      || url.origin !== value.replace(/\/$/, '')) return null;
    return url.origin;
  } catch { return null; }
}

export function requiredEnv(env = {}) {
  const missing = [];
  if (!apiOrigin(env.WEB10_API_ORIGIN)) missing.push('WEB10_API_ORIGIN');
  if (typeof env.WEB10_ADMIN_TOKEN !== 'string' || env.WEB10_ADMIN_TOKEN.length < 32
    || /\s/.test(env.WEB10_ADMIN_TOKEN)) missing.push('WEB10_ADMIN_TOKEN');
  return missing;
}

export function manifest(env = {}) {
  return {
    scope: 'contact delivery release acceptance — configuration preflight only',
    mode: 'dry-run', network: 'none', missing_env: requiredEnv(env),
    preflight: 'Explicit --preflight reads POST /admin/contact/status on the operator-supplied HTTPS API only.',
    prerequisites: [
      'Persistent CONTACT_DELIVERY_KEY, separate private conditional state bucket and fixed HTTPS CONTACT_AUTH_URL.',
      'Matching authenticator SDK API origin; suppress OAuth callback query strings in every proxy/access log.',
      'Gmail: operator-owned Google client, Gmail API, exact callback and required production OAuth approval.',
      'SendGrid: verified sender/domain and restricted Mail Send key; Twilio Verify credentials only if SMS is wanted.',
    ],
    remaining_acceptance: [
      'With explicit approval, use a dedicated existing QA account and deliver real Gmail and SendGrid reset emails.',
      'Confirm the link in the matching authenticator; reset password, verify new-password login and old-password denial.',
      'Verify wrong/expired/replayed links, resend isolation, reconnect/revocation, quota/outage and optional SMS.',
      'Obtain independent/model-diverse sign-off and normal green checks before approved rollout.',
    ],
    live_delivery: 'not run', account_changes: 'none',
  };
}

async function readStatus(response) {
  const reader = response.body?.getReader();
  if (!reader) throw new Error();
  try {
    const chunks = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error();
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!body || typeof body !== 'object' || Array.isArray(body)
      || !PROVIDERS.includes(body.email_provider) || FLAGS.some(key => typeof body[key] !== 'boolean')) throw new Error();
    // The admin response also has sender addresses. Do not retain them or any
    // unexpected fields/credentials in the receipt, logs or thrown exceptions.
    return Object.fromEntries(['email_provider', ...FLAGS].map(key => [key, body[key]]));
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export async function preflight({ env = {}, fetcher = fetch } = {}) {
  if (requiredEnv(env).length) throw new Error('CONTACT_PREFLIGHT_MISSING_ENV');
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error('CONTACT_PREFLIGHT_TLS_REQUIRED');
  let status;
  try {
    const response = await fetcher(`${apiOrigin(env.WEB10_API_ORIGIN)}/admin/contact/status`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: env.WEB10_ADMIN_TOKEN }),
      credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error();
    }
    status = await readStatus(response);
  } catch {
    // Never relay provider/body/request/error strings, causes or attached fields.
    throw new Error('CONTACT_PREFLIGHT_STATUS_UNAVAILABLE');
  }
  const blockers = [];
  if (!status.available) blockers.push('private_state_or_authenticator_setup_missing');
  if (status.email_provider === 'legacy') blockers.push('new_email_provider_not_selected');
  if (status.email_provider === 'gmail') {
    if (!status.gmail_available) blockers.push('gmail_oauth_prerequisites_missing');
    if (!status.gmail_connected) blockers.push('gmail_not_connected');
  }
  if (status.email_provider === 'sendgrid' && !status.sendgrid_configured) blockers.push('sendgrid_not_configured');
  return {
    scope: 'API-reported configuration only — not storage/provider/inbox verification',
    mode: 'preflight', status, blockers, reported_configuration_ready: blockers.length === 0,
    live_delivery: 'not run', password_reset: 'not run', account_changes: 'none',
  };
}

export async function run({ args = [], env = {}, fetcher = fetch } = {}) {
  if (args.length > 1 || args.some(arg => !['--dry-run', '--preflight'].includes(arg))) {
    throw new Error('CONTACT_PREFLIGHT_USAGE: use --dry-run or --preflight; no send/reset mode exists');
  }
  return args[0] === '--preflight' ? preflight({ env, fetcher }) : manifest(env);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const receipt = await run({ args: process.argv.slice(2), env: process.env });
    console.log(JSON.stringify(receipt, null, 2));
    if (receipt.mode === 'preflight' && !receipt.reported_configuration_ready) process.exitCode = 1;
  } catch (error) {
    // run/preflight expose only fixed local error codes, not dependency errors.
    console.error(error.message);
    process.exitCode = 1;
  }
}
