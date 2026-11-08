import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { manifest, preflight, requiredEnv, run } from './contact-delivery-preflight.mjs';

const ENV = { WEB10_API_ORIGIN: 'https://api.example.com', WEB10_ADMIN_TOKEN: 'synthetic-private-admin-token-123456789' };
const READY = { available: true, gmail_available: true, gmail_connected: true,
  sendgrid_configured: false, twilio_configured: false, email_provider: 'gmail' };
const networkForbidden = async () => { throw new Error('network must not run'); };
const response = body => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });

test('default and explicit dry-run never make network requests, even with complete credentials', async () => {
  for (const args of [[], ['--dry-run']]) {
    const result = await run({ args, env: ENV, fetcher: networkForbidden });
    assert.equal(result.mode, 'dry-run');
    assert.equal(result.network, 'none');
    assert.equal(result.live_delivery, 'not run');
    assert.equal(JSON.stringify(result).includes(ENV.WEB10_ADMIN_TOKEN), false);
  }
  assert.deepEqual(manifest({}).missing_env, ['WEB10_API_ORIGIN', 'WEB10_ADMIN_TOKEN']);
});

test('rejects insecure or ambiguous API destinations before sending any token', async () => {
  for (const origin of ['http://api.example.com', 'https://user:pass@api.example.com',
    'https://api.example.com/path', 'https://api.example.com?token=secret', 'https://api.example.com#fragment',
    'https://api.example.com/.', 'https://api.example.com\\other']) {
    assert.ok(requiredEnv({ ...ENV, WEB10_API_ORIGIN: origin }).includes('WEB10_API_ORIGIN'));
    await assert.rejects(preflight({ env: { ...ENV, WEB10_API_ORIGIN: origin }, fetcher: networkForbidden }),
      /^Error: CONTACT_PREFLIGHT_MISSING_ENV$/);
  }
  await assert.rejects(preflight({ env: { ...ENV, NODE_TLS_REJECT_UNAUTHORIZED: '0' }, fetcher: networkForbidden }),
    /TLS_REQUIRED/);
});

test('uses one fixed status action with no redirects/cookies and returns only safe allowlisted fields', async () => {
  const calls = [];
  const result = await preflight({ env: ENV, fetcher: async (url, init) => {
    calls.push(url);
    assert.equal(url, 'https://api.example.com/admin/contact/status');
    assert.equal(init.redirect, 'error'); assert.equal(init.credentials, 'omit');
    assert.equal(init.method, 'POST'); assert.ok(init.signal instanceof AbortSignal);
    assert.deepEqual(JSON.parse(init.body), { token: ENV.WEB10_ADMIN_TOKEN });
    return response({ ...READY, gmail_sender: 'private-inbox@example.com', secret: ENV.WEB10_ADMIN_TOKEN });
  } });
  assert.equal(calls.length, 1);
  assert.equal(result.reported_configuration_ready, true);
  assert.equal(result.live_delivery, 'not run'); assert.equal(result.password_reset, 'not run');
  assert.deepEqual(result.status, READY);
  assert.equal(JSON.stringify(result).includes('private-inbox'), false);
  assert.equal(JSON.stringify(result).includes(ENV.WEB10_ADMIN_TOKEN), false);
});

test('names configuration blockers without claiming runtime failure or live acceptance', async () => {
  for (const [status, expected] of [
    [{ ...READY, available: false, gmail_available: false, gmail_connected: false },
      ['private_state_or_authenticator_setup_missing', 'gmail_oauth_prerequisites_missing', 'gmail_not_connected']],
    [{ ...READY, email_provider: 'legacy' }, ['new_email_provider_not_selected']],
    [{ ...READY, email_provider: 'sendgrid' }, ['sendgrid_not_configured']],
  ]) {
    const result = await preflight({ env: ENV, fetcher: async () => response(status) });
    assert.deepEqual(result.blockers, expected);
    assert.equal(result.reported_configuration_ready, false);
  }
  const result = await preflight({ env: ENV, fetcher: async () => response({ ...READY,
    email_provider: 'sendgrid', sendgrid_configured: true }) });
  assert.equal(result.reported_configuration_ready, true);
  assert.equal(result.status.twilio_configured, false, 'SMS is optional');
});

test('denied/redirect/body/transport failures never relay private response or error fields', async () => {
  for (const fetcher of [
    async () => new Response('private-response-sentinel', { status: 403 }),
    async () => new Response('private-redirect-sentinel', { status: 302, headers: { Location: 'https://elsewhere.example' } }),
    async () => { throw Object.assign(new Error('private-error-sentinel'), { token: ENV.WEB10_ADMIN_TOKEN }); },
    async () => response({ ...READY, available: 'true' }),
    async () => response({ ...READY, email_provider: 'untrusted-private-provider' }),
    async () => response({ ...READY, extra: 'x'.repeat(65536) }),
  ]) {
    await assert.rejects(preflight({ env: ENV, fetcher }), error => {
      assert.equal(error.message, 'CONTACT_PREFLIGHT_STATUS_UNAVAILABLE');
      assert.equal(error.token, undefined); assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('unknown, send or reset flags fail without network or side effects', async () => {
  for (const args of [['--run'], ['--send'], ['--reset'], ['--preflight', '--send']]) {
    await assert.rejects(run({ args, env: ENV, fetcher: networkForbidden }), /CONTACT_PREFLIGHT_USAGE/);
  }
});

test('CLI defaults to a credential-free manifest and fails safely on missing preflight environment', () => {
  const script = new URL('./contact-delivery-preflight.mjs', import.meta.url);
  const env = { ...process.env, WEB10_API_ORIGIN: '', WEB10_ADMIN_TOKEN: '' };
  const dry = spawnSync(process.execPath, [script.pathname], { env, encoding: 'utf8' });
  assert.equal(dry.status, 0);
  assert.equal(JSON.parse(dry.stdout).network, 'none');
  const checked = spawnSync(process.execPath, [script.pathname, '--preflight'], { env, encoding: 'utf8' });
  assert.equal(checked.status, 1);
  assert.equal(checked.stderr.trim(), 'CONTACT_PREFLIGHT_MISSING_ENV');
});
