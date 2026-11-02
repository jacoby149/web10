import { test, type BrowserContext, type Page } from '../../../e2e/node_modules/@playwright/test';
import { randomBytes } from 'node:crypto';
import { allowedApiOrigin, allowedTarget, blockPeerConnections, configuration, definitions, feedNetworkReady, hosts, journal, networkStage, queryBudget, summarize, validMarker, writeResult } from './metrics.mjs';
import { runInteroperability } from './interop.mjs';

const social = 'http://social.localhost';
const discover = 'api.localhost/groups/web10/discover';
const check = (condition: unknown) => { if (!condition) throw new Error('Correctness'); };
const card = (page: Page, text: string) => page.getByTestId('post-card').filter({ hasText: text });

test('isolated connected social correctness and Following readiness', async ({ browser, request }) => {
  const config = configuration();
  const log = journal(config.results);
  let current: any;
  let blocked = 0;
  let peerAttempts = 0;
  const pending = new Map<any, { row: any; stage: string }>();
  const contexts: BrowserContext[] = [];
  const account = () => ({ username: `eval-${randomBytes(9).toString('hex')}`, password: randomBytes(24).toString('hex'), token: '' });
  const creator = account(), reader = account(), outsider = account();
  const readerQueries = queryBudget();
  const followers = `api.localhost/groups/users/${creator.username}/followers`;
  const text = 'Synthetic connected evaluation public post';
  const comment = 'Synthetic connected evaluation comment';
  const expectedTexts = [text, ...Array.from({ length: 19 }, (_, i) => `Synthetic follower post ${String(i).padStart(2, '0')}`)];

  async function marker(host = 'api.localhost') {
    check(hosts.includes(host));
    const response = await request.get('http://127.0.0.1/__experiment', {
      headers: { Host: host, Origin: social }, maxRedirects: 0, maxRetries: 0, timeout: 10_000,
    });
    check(validMarker(response.status(), await response.json()));
  }
  async function api(path: string, data: object, status = 200, origin = social) {
    check(allowedApiOrigin(origin));
    check(/^\/(v3\/[a-z/-]+|setup(?:\/configure)?|config(?:\/update)?)$/.test(path));
    if (path === '/v3/query' && (data as { token?: string }).token === reader.token) {
      check(current?.phase !== 'measurement');
      await readerQueries.drain();
      readerQueries.record();
    }
    if (['/setup/configure', '/v3/signup', '/v3/login', '/config/update'].includes(path)) await marker();
    if (current) current.requests++;
    const counts = current?.network[networkStage(`http://api.localhost${path}`)!];
    if (counts) counts.pending++;
    let responded = false;
    try {
      const response = await request.post(`http://127.0.0.1${path}`, {
        data: JSON.stringify(data), headers: { Host: 'api.localhost', Origin: origin, 'Content-Type': 'application/json' },
        maxRedirects: 0, maxRetries: 0, timeout: 20_000,
      });
      responded = true;
      if (response.status() !== status) {
        if (counts) counts.http_failure++;
        throw Object.assign(new Error('HTTP'), { status: response.status() });
      }
      if (counts) counts[status === 403 ? 'expected_denial' : 'success']++;
      return await response.json();
    } catch (error) { if (counts && !responded) counts.network_failure++; throw error; }
    finally { if (counts) counts.pending--; }
  }
  async function poll(predicate: () => Promise<boolean>, timeout = 30_000) {
    const deadline = performance.now() + timeout;
    do {
      if (current) current.polls++;
      if (await predicate()) return;
      await new Promise(r => setTimeout(r, 200));
    } while (performance.now() < deadline);
    throw Object.assign(new Error('Readiness'), { name: 'TimeoutError' });
  }
  async function op(name: string, phase: string, action: () => Promise<any>, options = {}) {
    await readerQueries.drain();
    return log.run(name, phase, async (row: any) => {
      current = row;
      try {
        const value = await action();
        await poll(async () => pending.size === 0);
        if (phase === 'measurement') check(feedNetworkReady(row.network, row.expected_posts > 0));
        check(blocked === 0 && peerAttempts === 0); return value;
      } finally { row.blocked_external = blocked; row.peer_attempts = peerAttempts; current = undefined; }
    }, options);
  }
  async function guardedPage(user: typeof creator) {
    const context = await browser.newContext({ serviceWorkers: 'block' });
    contexts.push(context);
    await context.exposeBinding('__web10EvalPeerAttempt', () => { peerAttempts++; });
    await context.addInitScript(blockPeerConnections);
    context.on('request', req => {
      if (user === reader && req.method() === 'POST' && networkStage(req.url()) === 'query') readerQueries.record();
      if (current) current.requests++;
      const stage = networkStage(req.url(), req.method());
      if (stage !== null) {
        if (current) current.network[stage].pending++;
        pending.set(req, { row: current, stage });
      }
    });
    async function settled(req: any, failed: boolean) {
      const entry = pending.get(req);
      if (!entry) return;
      if (!entry.row) { pending.delete(req); return; }
      const counts = entry.row.network[entry.stage];
      try {
        if (failed) counts.network_failure++;
        else {
          const response = await req.response();
          if (response && response.status() >= 200 && response.status() < 300) counts.success++;
          else counts.http_failure++;
        }
      } catch { counts.network_failure++; }
      finally { counts.pending--; pending.delete(req); }
    }
    context.on('requestfinished', req => { void settled(req, false); });
    context.on('requestfailed', req => { void settled(req, true); });
    await context.route('**/*', async route => {
      const req = route.request();
      if (!allowedTarget(req.url())) { blocked++; await route.abort('blockedbyclient'); return; }
      if (req.method() !== 'GET' && /\/(?:v3\/(?:login|signup)|setup\/configure)$/.test(new URL(req.url()).pathname)) {
        try { await marker(new URL(req.url()).hostname === 'auth.localhost' ? 'auth.localhost' : 'api.localhost'); }
        catch { blocked++; await route.abort('blockedbyclient'); return; }
      }
      await route.continue();
    });
    await context.routeWebSocket('**/*', socket => {
      if (!allowedTarget(socket.url(), true)) { blocked++; socket.close(); }
      else socket.connectToServer();
    });
    return context.newPage();
  }
  async function signIn(page: Page, user: typeof creator) {
    await marker();
    await page.goto(social);
    const popupPromise = page.waitForEvent('popup');
    await page.getByTestId('sign-in-button-desktop').click();
    const popup = await popupPromise;
    await popup.waitForURL('http://auth.localhost/**');
    check(new URL(popup.url()).origin === 'http://auth.localhost');
    check(await popup.locator('#provider').inputValue() === 'api.localhost');
    await popup.locator('#username').fill(user.username);
    await popup.locator('#password').fill(user.password);
    await popup.getByTestId('login-submit').click();
    await popup.getByTestId('consent-req-0').waitFor({ state: 'visible' });
    const closed = popup.waitForEvent('close');
    await popup.getByTestId('consent-approve-all').click();
    await closed;
    await page.getByTestId('new-post-fab').waitFor({ state: 'visible' });
    await page.goto(`${social}/feed?tab=following`);
  }
  async function feed(page: Page, texts: string[]) {
    if (current) current.expected_posts = texts.length;
    await poll(async () => {
      if (await page.getByTestId('feed-skeleton').count()) return false;
      if (await page.getByTestId('post-card').count() !== texts.length) return false;
      if (!texts.length) return page.getByTestId('feed-empty').isVisible();
      for (const t of texts) if (await card(page, t).count() !== 1) return false;
      return true;
    });
    check(new URL(page.url()).pathname === '/feed' && new URL(page.url()).searchParams.get('tab') === 'following');
    if (current?.phase === 'measurement') await poll(async () => pending.size === 0 && feedNetworkReady(current.network, texts.length > 0));
  }
  const read = (token: string, service: string, extra: object) => api('/v3/read', { token, service, limit: 100, ...extra });
  async function membership(present: boolean) {
    await poll(async () => {
      const members = await api('/v3/groups/members/list', { token: creator.token, group_id: followers });
      return members.some((m: any) => m.member_key === reader.username || m.member_key === `api.localhost/${reader.username}`) === present;
    });
  }
  async function engagement(page: Page, postId: string, commentCount = 1) {
    await poll(async () => {
      const reactions = await read(creator.token, 'reactions', { groups: [discover], ref: postId });
      const comments = await read(creator.token, 'comments', { groups: [discover], ref: postId });
      return reactions.length === 1 && reactions[0].body.type === 'like' &&
        reactions[0].body.target_id === postId && reactions[0].author_key === reader.username &&
        comments.length === commentCount && (commentCount === 0 || (comments[0].body.text === comment &&
        comments[0].body.post_id === postId && comments[0].author_key === reader.username));
    });
    await poll(async () => (await card(page, text).getByTestId('like-button').textContent())?.trim() === '1' &&
      (await card(page, text).getByTestId('comment-button').textContent())?.trim() === (commentCount ? '1' : '') &&
      await card(page, text).getByTestId('like-button').getAttribute('aria-pressed') === 'true');
  }
  async function samples(page: Page, texts: string[]) {
    for (let i = 0; i < config.warmups + config.repetitions; i++) {
      await op(`following.reload-${texts.length ? 'nonempty' : 'empty'}`, 'measurement', async () => {
        await page.reload(); await feed(page, texts);
        if (texts.length) await poll(async () => (await card(page, text).getByTestId('like-button').textContent())?.trim() === '1' &&
          (await card(page, text).getByTestId('comment-button').textContent())?.trim() === '1');
      }, { warmup: i < config.warmups, trial: i < config.warmups ? i + 1 : i - config.warmups + 1, expected_posts: texts.length });
    }
  }
  try {
    await op('isolation.markers', 'setup', async () => { for (const host of hosts) await marker(host); });
    await op('node.setup', 'setup', async () => {
      const state = await api('/setup', {});
      check(state.configured === false && state.has_admin === false);
      // Exact SetupRequest schema; require_contact and telemetry belong to ConfigUpdate instead.
      await api('/setup/configure', { provider: 'api.localhost', admin_username: creator.username,
        admin_password: creator.password, beta_required: false, verify_required: false, pay_required: false,
        cors_service_managers: 'auth.localhost', s3_endpoint: 'http://minio:9000',
        s3_access_key: 'disposable', s3_secret_key: 'disposable-minio-only' });
      creator.token = (await api('/v3/login', { username: creator.username, password: creator.password })).token;
      check(typeof creator.token === 'string' && creator.token.length > 10);
      await api('/config/update', { token: { token: creator.token }, update: { require_contact: false,
        beta_required: false, verify_required: false, pay_required: false, ga4_measurement_id: '', hotjar_site_id: '' } });
      const cfg = await api('/config', { token: creator.token });
      for (const flag of ['require_contact', 'beta_required', 'verify_required', 'pay_required']) check(cfg[flag] === false);
      check(!cfg.ga4_measurement_id && !cfg.hotjar_site_id && cfg.provider === 'api.localhost');
    });
    for (const [i, user] of [reader, outsider].entries()) await op(`account.signup-login-${i}`, 'setup', async () => {
      await api('/v3/signup', { username: user.username, password: user.password });
      user.token = (await api('/v3/login', { username: user.username, password: user.password })).token;
      check(typeof user.token === 'string' && user.token.length > 10);
    });
    for (const [i, user] of [creator, reader, outsider].entries()) await op(`account.p2p-off-${i}`, 'setup', async () => {
      // Exact app roles/default profile grant. Bootstrap settings only; revoke before real social consent.
      const group = await api('/v3/groups/create', { token: user.token, name: 'followers', join_policy: 'open',
        tags: ['web10-social-followers'], roles: [
          { name: 'owner', permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'],
            group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] } },
          { name: 'member', permissions: { posts: ['readAll'] } },
          { name: 'reader', permissions: { profile: ['readAll'] } },
        ], members: [{ member_key: user.username, role: 'owner' }, { member_key: 'anyone', role: 'reader' }] });
      const auth = 'http://auth.localhost';
      await api('/v3/app-contracts/add', { token: user.token, allowed_origin: auth, permissions: { settings: ['create', 'readAll'] } }, 200, auth);
      try {
        const created = await api('/v3/create', { token: user.token, service: 'settings', groups: [group.group_id],
          body: { p2pEnabled: false, defaultVisibility: 'public' } }, 200, auth);
        await poll(async () => {
          const docs = await api('/v3/read', { token: user.token, service: 'settings', groups: [group.group_id] }, 200, auth);
          return docs.length === 1 && docs[0].doc_id === created.doc_id && docs[0].body.p2pEnabled === false && docs[0].body.defaultVisibility === 'public';
        });
      } finally { await api('/v3/app-contracts/revoke', { token: user.token, allowed_origin: auth }, 200, auth); }
    });
    const cp = await guardedPage(creator), rp = await guardedPage(reader);
    await op('creator.popup-login-consent', 'preauth', () => signIn(cp, creator));
    await op('reader.popup-login-consent', 'preauth', () => signIn(rp, reader));
    await op('outsider.popup-login-consent', 'preauth', async () => {
      const page = await guardedPage(outsider); await signIn(page, outsider);
      await poll(async () => {
        const docs = await read(outsider.token, 'profile', {
          groups: [`api.localhost/groups/users/${outsider.username}/followers`],
        });
        return docs.length === 1 && docs[0].author_key === outsider.username &&
          docs[0].body.display_name === outsider.username && typeof docs[0].doc_id === 'string';
      });
      await page.context().close();
    });
    await op('following.empty', 'correctness', () => feed(rp, []));
    let postId = '';
    await op('creator.compose-public', 'correctness', async () => {
      await cp.getByTestId('new-post-fab').click();
      await cp.getByTestId('composer-textarea').fill(text);
      check((await cp.getByTestId('visibility-selector').textContent())?.toLowerCase().includes('public'));
      await cp.getByTestId('post-submit').click();
      await feed(cp, [text]);
      await poll(async () => {
        const docs = await read(creator.token, 'posts', { groups: [discover] });
        const matches = docs.filter((d: any) => d.body.text === text && d.author_key === creator.username);
        if (matches.length !== 1) return false;
        postId = matches[0].doc_id; return true;
      });
      const doc = await read(creator.token, 'posts', { doc_id: postId });
      check(doc.doc_id === postId && doc.body.text === text && doc.author_key === creator.username);
      await cp.context().close();
    });
    await op('reader.follow', 'correctness', async () => {
      await rp.goto(`${social}/u/${creator.username}`);
      await poll(async () => (await rp.getByTestId('follow-button').textContent())?.trim() === 'Follow');
      await rp.getByTestId('follow-button').click();
      await membership(true);
      await rp.goto(`${social}/feed?tab=following`); await feed(rp, [text]);
    });
    await op('following.persist', 'correctness', async () => { await rp.reload(); await feed(rp, [text]); });
    await op('reader.like', 'correctness', async () => {
      await card(rp, text).getByTestId('like-button').click();
      await engagement(rp, postId, 0);
    });
    await op('reader.comment', 'correctness', async () => {
      const c = card(rp, text);
      await c.getByTestId('comment-button').click();
      await c.getByTestId('comment-input').fill(comment);
      await c.getByTestId('comment-send').click();
      await poll(async () => await c.getByTestId('comment-thread').locator('li').filter({ hasText: comment }).count() === 1);
      await engagement(rp, postId);
    });
    await op('engagement.persist', 'correctness', async () => { await rp.reload(); await feed(rp, [text]); await engagement(rp, postId); });
    await op('reader.unfollow-public-exclusion', 'correctness', async () => {
      await rp.goto(`${social}/u/${creator.username}`);
      await poll(async () => (await rp.getByTestId('follow-button').textContent())?.trim() === 'Following');
      await rp.getByTestId('follow-button').click(); await membership(false);
      await rp.goto(`${social}/feed?tab=following`); await feed(rp, []);
      // Public discover access remains valid. Feed exclusion is NOT private denial.
      const docs = await read(reader.token, 'posts', { groups: [discover] });
      check(docs.some((d: any) => d.doc_id === postId && d.body.text === text));
    });
    await op('private.join-revoke-denial', 'correctness', async () => {
      const group = await api('/v3/groups/create', { token: creator.token, name: 'evaluation-private', join_policy: 'open',
        roles: [{ name: 'owner', permissions: { '*': ['readAll', 'create'], group: ['assignRoles', 'revokeRoles'] } },
          { name: 'member', permissions: { posts: ['readAll'] } }], members: [{ member_key: creator.username, role: 'owner' }] });
      const groups = [group.group_id];
      const secret = await api('/v3/create', { token: creator.token, service: 'posts', groups, body: { text: 'Synthetic private record' } });
      async function denied(token: string) {
        await api('/v3/read', { token, service: 'posts', groups }, 403);
        await api('/v3/query', { token, groups, sql: 'SELECT doc_id FROM posts' }, 403);
      }
      await denied(reader.token); await denied(outsider.token);
      await api('/v3/groups/join', { token: reader.token, group_id: group.group_id });
      await poll(async () => (await read(reader.token, 'posts', { groups })).some((d: any) => d.doc_id === secret.doc_id));
      const rows = await api('/v3/query', { token: reader.token, groups, sql: 'SELECT doc_id FROM posts' });
      check(rows.count === 1 && rows.rows.length === 1 && rows.rows[0].doc_id === secret.doc_id);
      await api('/v3/groups/members/remove', { token: creator.token, group_id: group.group_id, member_key: reader.username });
      await poll(async () => {
        const members = await api('/v3/groups/members/list', { token: creator.token, group_id: group.group_id });
        return !members.some((m: any) => m.member_key === reader.username || m.member_key === `api.localhost/${reader.username}`);
      });
      await denied(reader.token);
    });
    await samples(rp, []);
    // Provision exactly 20 total creator posts, no synthetic SQL or fake auth.
    await op('following.provision', 'setup', async () => {
      for (const t of expectedTexts.slice(1)) await api('/v3/create', { token: creator.token, service: 'posts', groups: [followers],
        body: { text: t, date: new Date().toISOString() } });
      await poll(async () => {
        const docs = await read(creator.token, 'posts', { groups: [followers] });
        return docs.length === 20 && expectedTexts.every(t => docs.some((d: any) => d.body.text === t));
      });
      await rp.goto(`${social}/u/${creator.username}`);
      await poll(async () => (await rp.getByTestId('follow-button').textContent())?.trim() === 'Follow');
      await rp.getByTestId('follow-button').click(); await membership(true);
      await rp.goto(`${social}/feed?tab=following`); await feed(rp, expectedTexts);
    });
    await samples(rp, expectedTexts);
    await runInteroperability({ api, poll, op, accounts: { creator, reader, outsider }, followers });
  } catch (error) {
    await log.run('scenario.failure', 'correctness', async () => { throw error; }).catch(() => {});
    throw new Error('SocialEvaluationFailed');
  } finally {
    try { for (const context of contexts) await context.close(); }
    finally {
      await log.run('isolation.external-attempts', 'correctness', async (row: any) => {
        row.blocked_external = blocked; row.peer_attempts = peerAttempts; check(blocked === 0 && peerAttempts === 0);
      })
        .catch(() => {});
      try { writeResult(config.results, 'operations.json', { metadata: { ...definitions, accounts: 3, creator_bootstrap_admin: true,
        repetitions: config.repetitions, warmups: config.warmups, expected_nonempty_posts: 20,
        settings_bootstrap_origin: 'http://auth.localhost', settings_bootstrap_grant_revoked_before_login: true },
        records: log.records, summary: summarize(log.records, config.repetitions) }); }
      finally { log.close(); }
    }
  }
});
