import { domainClient, domainName, FOLLOW_SERVICE } from './client.mjs';
const $ = id => document.getElementById(id);
const config = await (await fetch('/config.json', { cache: 'no-store' })).json();
const params = new URLSearchParams(location.search);
const creator = params.get('view') === 'creator';
const selected = config.cases.find(c => c.domain === params.get('domain')) || config.cases[0];
let epoch = 0, token = '', group = '', activeUser = '', busyEpoch = -1, pending = 0;
let saved = null;
$('domain').value = params.get('domain') || selected.domain;
$('identity').textContent = 'The address stays the same. The provider and username do not have to.';
for (const name of ['reader', 'creator']) $('' + name + '-link').href = `?view=${name}&domain=${encodeURIComponent($('domain').value)}`;
$('account').value = params.get('account') === 'b' ? 'b' : 'a';
for (const id of ['account', 'account-label']) $(id).hidden = !creator;
if (creator) { $('login-title').textContent = 'Connect your website'; $('content-title').textContent = 'Verified account hookup'; }

function state(kind, message) { $('status').dataset.state = kind; $('status').textContent = message; }
function clearFeed() { $('feed').replaceChildren(); $('identity').textContent = `${$('domain').value} · No current target loaded.`; }
function reset() {
  epoch++; busyEpoch = -1; token = ''; group = ''; activeUser = ''; saved = null;
  $('login').hidden = false; $('signed-in').hidden = true; $('signout').hidden = true;
  $('reader-actions').hidden = true; $('creator-actions').hidden = true;
  $('verified').textContent = ''; $('bookmark').textContent = ''; $('signout').textContent = 'Sign out'; clearFeed();
  const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = creator ? 'Publish the TXT pointer and verify it with this account. No private roles move with DNS.' : 'Sign in, then follow the website. Your subscription stays in your own web10 data.'; $('feed').append(empty);
}
function controls() {
  for (const id of ['signin', 'follow', 'refresh', 'verify', 'copy']) $(id).disabled = busyEpoch === epoch;
  if (saved) { $('follow').disabled = true; $('follow').textContent = 'Following this website'; }
  else $('follow').textContent = 'Follow website';
}
async function work(action) {
  if (busyEpoch === epoch) return;
  const generation = epoch; busyEpoch = generation; pending++; document.body.dataset.pending = String(pending); controls(); state('loading', 'Working with your node…');
  try { await action(() => generation === epoch); }
  catch (error) { if (generation === epoch) { clearFeed(); const message = error.name === 'TypeError' ? 'The node or DNS target is unavailable. Refresh to try again.' : error.message; state('error', `${message} ${creator ? 'No domain verification is assumed.' : 'Your saved follows are not erased.'}`); } }
  finally { pending--; document.body.dataset.pending = String(pending); if (busyEpoch === generation) { busyEpoch = -1; controls(); } }
}
async function post(origin, path, data) {
  console.info('[domain-demo] account request started', { path });
  const response = await fetch(origin + path, { method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  console.info('[domain-demo] account request completed', { path, status: response.status });
  const result = await response.json();
  if (!response.ok) throw Error(`Account request denied (${response.status}): ${result.error || 'check your account and DNS'}`);
  return result;
}
const client = domainClient({ home: config.home, resolver: new URL('/dns-query', location.origin).href, providers: config.providers,
  session: () => { const generation = epoch; return { token, group, valid: () => generation === epoch && !!token }; } });

async function refresh(valid) {
  clearFeed();
  const follows = await client.follows(); if (!valid()) return;
  saved = follows.find(row => row.domain === domainName($('domain').value)) || null;
  $('bookmark').textContent = saved ? `Saved website: ${saved.domain}` : 'No follow for this website yet.';
  $('bookmark').dataset.docId = saved?.id || ''; controls();
  if (!saved) { state('success', 'Ready. Follow the website, not a particular account.'); return; }
  const result = await client.feed(saved.domain); if (!valid()) return;
  $('identity').textContent = `${result.domain} → ${result.target.provider} / ${result.target.user}`;
  for (const row of result.posts) {
    const article = document.createElement('article'); article.dataset.docId = row.doc_id;
    const title = document.createElement('h3'); title.textContent = result.domain;
    const text = document.createElement('p'); text.textContent = row.body.text;
    article.append(title, text); $('feed').append(article);
  }
  if (!result.posts.length) { const empty = document.createElement('p'); empty.textContent = 'This account has no public posts yet.'; $('feed').append(empty); }
  state('success', 'Public feed refreshed. The saved website follow is unchanged.');
}
$('login').onsubmit = event => {
  event.preventDefault(); void work(async valid => {
    $('signout').hidden = false; $('signout').textContent = 'Cancel sign-in';
    const account = $('account').value;
    const origin = creator ? config.providers[`node-${account}.federation.test`] : config.home;
    const username = $('username').value.trim().toLowerCase();
    const result = await post(origin, '/v3/login', { username, password: $('password').value });
    $('password').value = ''; if (!valid()) return;
    if (typeof result.token !== 'string' || !result.token) throw Error('Login was not confirmed.');
    token = result.token; activeUser = username;
    if (!creator) {
      const created = await post(config.home, '/v3/groups/create', { token, name: 'domain-demo-follows', join_policy: 'closed', roles: [{ name: 'owner', permissions: { [FOLLOW_SERVICE]: ['create', 'readAll'] } }], members: [] });
      if (!valid()) return; group = created.group_id;
    }
    $('login').hidden = true; $('signed-in').hidden = false; $('signed-in').textContent = `Signed in as ${activeUser}`; $('signout').hidden = false; $('signout').textContent = 'Sign out';
    $('creator-actions').hidden = !creator; $('reader-actions').hidden = creator;
    if (creator) {
      $('txt').textContent = `web10.v=1;provider=node-${account}.federation.test;user=${activeUser}`;
      state('success', 'Publish the TXT value, then verify. DNS alone does not authenticate the account.');
    } else await refresh(valid);
  });
};
$('follow').onclick = () => void work(async valid => { await client.follow($('domain').value); if (valid()) await refresh(valid); });
$('refresh').onclick = () => void work(refresh);
$('verify').onclick = () => void work(async valid => {
  $('verified').textContent = '';
  const result = await post(config.providers[`node-${$('account').value}.federation.test`], '/v3/domains/verify', { token, domain: domainName($('domain').value) });
  if (!valid()) return;
  if (result.verified !== true || result.domain !== domainName($('domain').value) || result.provider !== `node-${$('account').value}.federation.test` || result.user !== activeUser) throw Error('Domain verification was not confirmed.');
  $('verified').textContent = 'Domain verified for this account.';
  clearFeed();
  const summary = document.createElement('p'); summary.textContent = `${result.domain} is verified for ${result.provider} / ${result.user}.`;
  const detail = document.createElement('p'); detail.className = 'muted'; detail.textContent = 'The node looked up DNS itself and matched the signed-in account. No private permissions are transferred.';
  $('feed').append(summary, detail); $('identity').textContent = `${result.domain} → ${result.provider} / ${result.user}`;
  state('success', 'Your website now points to this verified account.');
});
$('copy').onclick = () => void work(async valid => { await navigator.clipboard.writeText($('txt').textContent); if (valid()) state('success', 'TXT copied. Publish it at your DNS provider.'); });
$('signout').onclick = () => { reset(); state('success', 'Signed out. Your node still holds your follows.'); controls(); };
$('account').onchange = () => {
  const next = new URL(location.href); next.searchParams.set('account', $('account').value); location.assign(next);
};
$('domain').onchange = () => {
  try { const next = new URL(location.href); next.searchParams.set('domain', domainName($('domain').value)); location.assign(next); }
  catch (error) { state('error', error.message); }
};
reset(); controls(); state('success', 'Use the synthetic local account to begin. No production account is contacted.');
