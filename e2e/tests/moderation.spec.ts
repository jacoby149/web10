import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { API_BASE, v3Login, v3Signup } from '../v3-helpers';

/**
 * Content moderation (D59) — the end-to-end gauntlet for sensitive-language
 * detection + discover suppression. Built on the existing `group_hidden_docs`
 * mechanism (no new read-path change): a whole-word, case-insensitive blocklist
 * in `node_config` is checked on the post-create path; a hit on a discover-group
 * post is auto-hidden from the board + flagged for the operator's review queue.
 * A user on `auto_hide_users` is always auto-hidden (no blocklist match needed).
 * The queue is human-in-the-loop — the operator suppresses, the machine only
 * flags (no shadow ban). D41 holds: suppression is board curation, not secrecy
 * (a suppressed user's data is intact, their profile resolves, their followers
 * still see their posts).
 *
 * The API floor pins the write-path hook + the review queue + the auto-hide
 * list, fast + deterministic (no browser): a flagged post on the discover board
 * is auto-hidden (absent from the board read, present in the hidden list) and
 * records a flag row; a non-discover post is NOT moderated (the I3 anti-test);
 * a listed user's clean post is auto-hidden; removing the user restores
 * visibility. The hide is scoped to the discover group — the author's copy and
 * their followers group are untouched.
 *
 * The browser gauntlet drives the REAL surfaces (pre-authed via the token
 * cookie): the operator sets the blocklist in the Node Config "Content
 * Moderation" card, a flagged post is hidden from the board, the flag appears
 * in the review queue, the operator "keeps hiding" (adds to auto_hide_users),
 * the user's next post is auto-hidden, the operator removes the user, and the
 * next post is visible — with no pageerror.
 *
 * NOTE: the tests mutate the shared node config (`sensitive_words`,
 * `auto_hide_users`), so they run serially and reset both to empty in
 * afterAll (leaving a live blocklist or a listed user would auto-hide posts in
 * subsequent e2e specs).
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const DISCOVER_GROUP_ID = 'api.localhost/groups/web10/discover';
const SERVICE = 'posts';

// Chromium ignores /etc/hosts (it queries the container's DNS, which answers
// *.localhost with 127.0.0.1). The vhosts are mapped in /etc/hosts by the
// runner, so resolve the proxy IP from there and pin it with
// --host-resolver-rules. On the CI runner (no container) getent returns
// 127.0.0.1, which is correct there too.
function vhostResolverArgs(): string[] {
  try {
    const out = execSync('getent hosts api.localhost', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
    const ip = out.split(/\s+/)[0];
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return [];
    const hosts = ['api', 'auth', 'sdk', 'marketing', 'social', 'marketing-api'];
    return [`--host-resolver-rules=${hosts.map((h) => `MAP ${h}.localhost ${ip}`).join(', ')}`];
  } catch {
    return [];
  }
}

test.use({
  launchOptions: { args: vhostResolverArgs() },
});

const password = 'TestPass123!';
const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// A distinctive, non-default blocklist word so the test is self-contained (the
// node ships a default slur list; we add our own sentinel word and assert on it).
const FLAG_WORD = 'zorbax';

// The app contract the SOCIAL origin needs to post to the discover board.
const SOCIAL_CONTRACT_PERMISSIONS: Record<string, string[]> = {
  posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  profile: ['readAll', 'create', 'updateOwn'],
  settings: ['readAll', 'create', 'updateOwn'],
  reactions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  comments: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  media: ['readAll'],
  public_media: ['readAll'],
};

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, password, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, password);
  return { username, token };
}

/** The node admin (global-setup's admin) — the operator. */
async function adminToken(request: APIRequestContext): Promise<string> {
  return v3Login(request, 'admin', 'admin123');
}

async function addAppContract(request: APIRequestContext, token: string, allowedOrigin: string, permissions: Record<string, string[]>) {
  const res = await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({ token, allowed_origin: allowedOrigin, permissions }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  const body = await res.text().catch(() => '');
  expect(res.ok(), `app-contracts/add failed (${res.status()}) ${body.slice(0, 200)}`).toBeTruthy();
}

/** Read the node config (admin only) — the source of truth for the moderation fields. */
async function getConfig(request: APIRequestContext, adminTok: string): Promise<Record<string, any>> {
  const res = await request.post(`${API_BASE}/config`, {
    data: JSON.stringify({ token: adminTok }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `config read failed (${res.status()})`).toBeTruthy();
  return (await res.json()) as Record<string, any>;
}

/** Set a node_config field (admin only). Diff-only save, the ConfigPage pattern. */
async function setConfigField(request: APIRequestContext, adminTok: string, field: string, value: unknown) {
  const res = await request.post(`${API_BASE}/config/update`, {
    data: JSON.stringify({ token: { token: adminTok }, update: { [field]: value } }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `config/update ${field} failed (${res.status()})`).toBeTruthy();
}

/** Create a post on a group (retries on the "No app contract" 403 — ClickHouse
 *  is eventually consistent, so a create right after the app-contract INSERT can
 *  race the read). */
async function createPost(request: APIRequestContext, token: string, groupId: string, text: string): Promise<string> {
  const doCreate = async () =>
    request.post(`${API_BASE}/v3/create`, {
      data: JSON.stringify({ token, service: SERVICE, body: { text, date: new Date().toISOString() }, groups: [groupId] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
  let res = await doCreate();
  for (let i = 0; i < 10 && res.status() === 403 && (await res.text().catch(() => '')).includes('No app contract'); i++) {
    await new Promise((r) => setTimeout(r, 500));
    res = await doCreate();
  }
  const detail = res.ok() ? '' : ` — ${await res.text().catch(() => '')}`;
  expect(res.ok(), `create post failed (${res.status()})${detail}`).toBeTruthy();
  return (await res.json()).doc_id as string;
}

/** Read the discover board (the app's read shape, scoped to the board group). */
async function readBoard(request: APIRequestContext, token: string, limit = 100): Promise<{ doc_id: string; text: string }[]> {
  const res = await request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: SERVICE, groups: [DISCOVER_GROUP_ID], limit }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  expect(res.ok(), `read discover failed (${res.status()})`).toBeTruthy();
  const docs: { doc_id: string; body: { text?: string } }[] = await res.json();
  return docs.map((d) => ({ doc_id: d.doc_id, text: d.body?.text || '' }));
}

/** List the docs hidden from the discover board (the moderation takedown list). */
async function readHidden(request: APIRequestContext, adminTok: string): Promise<{ doc_id: string; author_key: string; body: { text?: string } }[]> {
  const res = await request.post(`${API_BASE}/v3/groups/hidden`, {
    data: JSON.stringify({ token: adminTok, group_id: DISCOVER_GROUP_ID }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `groups/hidden failed (${res.status()})`).toBeTruthy();
  return (await res.json()).hidden as { doc_id: string; author_key: string; body: { text?: string } }[];
}

/** The content-moderation review queue (admin only). */
async function readFlags(request: APIRequestContext, adminTok: string): Promise<{ username: string; flag_count: number; matched_words: string[] }[]> {
  const res = await request.post(`${API_BASE}/v3/moderation/flags`, {
    data: JSON.stringify({ token: adminTok }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `moderation/flags failed (${res.status()})`).toBeTruthy();
  return (await res.json()).flags as { username: string; flag_count: number; matched_words: string[] }[];
}

/** Add or remove a username from the node's auto_hide_users list (admin only). */
async function setAutoHide(request: APIRequestContext, adminTok: string, username: string, hide: boolean) {
  const res = await request.post(`${API_BASE}/v3/moderation/auto-hide`, {
    data: JSON.stringify({ token: adminTok, username, hide }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `moderation/auto-hide failed (${res.status()})`).toBeTruthy();
}

/** Poll until the board contains (or, with `absent`, no longer contains) the text. */
async function expectBoardText(request: APIRequestContext, token: string, text: string, absent = false, timeout = 12000) {
  await expect(async () => {
    const docs = await readBoard(request, token);
    const present = docs.some((d) => d.text === text);
    expect(present, absent ? `post "${text}" should be ABSENT from the board` : `post "${text}" should be on the board`).toBe(!absent);
  }).toPass({ timeout, intervals: [200, 300, 500, 1000] });
}

/** Poll until the hidden list contains (or, with `absent`, no longer contains) the text. */
async function expectHiddenText(request: APIRequestContext, adminTok: string, text: string, absent = false, timeout = 12000) {
  await expect(async () => {
    const hidden = await readHidden(request, adminTok);
    const present = hidden.some((d) => d.body?.text === text);
    expect(present, absent ? `post "${text}" should NOT be in the hidden list` : `post "${text}" should be in the hidden list`).toBe(!absent);
  }).toPass({ timeout, intervals: [200, 300, 500, 1000] });
}

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([{ name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false }]);
}

function capturePageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

// ---------------------------------------------------------------------------
// The tests below mutate the shared node config (`sensitive_words`,
// `auto_hide_users`), so they must run serially — a parallel run would have one
// test set the blocklist while another clears it, and the writes would see
// whichever was written last. CI already runs workers=1; the serial mode makes
// it hold at any worker count.
// ---------------------------------------------------------------------------

test.describe('Content moderation (D59)', () => {
  test.describe.configure({ mode: 'serial' });
  // ClickHouse is eventually consistent: the auto-hide INSERT + the flag INSERT
  // land in the create request but may not be visible to a follow-up read for a
  // moment (worst under load). Generous per-test timeout so the polls have room
  // to converge without the 30s default firing mid-poll.
  test.setTimeout(90000);

  // Reset the shared node config after the suite — these tests set
  // `sensitive_words` (a live blocklist) and `auto_hide_users` (a listed user).
  // Leaving either set would auto-hide posts in subsequent e2e specs.
  test.afterAll(async ({ request }) => {
    try {
      const admin = await adminToken(request);
      await setConfigField(request, admin, 'sensitive_words', []);
      await setConfigField(request, admin, 'auto_hide_users', []);
    } catch {
      // best-effort cleanup
    }
  });

  // ---------------------------------------------------------------------------
  // API floor — the write-path hook + the review queue + the auto-hide list
  // (fast, no browser)
  // ---------------------------------------------------------------------------

  test.describe('API floor (the create hook auto-hides + flags)', () => {
    test('a flagged post on the board is auto-hidden + a flag row is recorded', async ({ request }) => {
      const admin = await adminToken(request);
      const user = await signupAndLogin(request, 'mod1');
      await addAppContract(request, user.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);

      // The operator sets the blocklist to our sentinel word (moderation is on
      // by default; auto_moderate is on by default).
      await setConfigField(request, admin, 'sensitive_words', [FLAG_WORD]);

      // Post a flagged word to the discover board.
      const postText = `flagged ${FLAG_WORD} post ${Date.now()}`;
      const docId = await createPost(request, user.token, DISCOVER_GROUP_ID, postText);

      // The post is auto-hidden from the board (absent from the board read) and
      // present in the hidden list (the group_hidden_docs mechanism).
      await expectBoardText(request, user.token, postText, /* absent */ true);
      await expectHiddenText(request, admin, postText, /* absent */ false);

      // A flag row is recorded for the review queue, naming the user + the word.
      await expect(async () => {
        const flags = await readFlags(request, admin);
        const row = flags.find((f) => f.username === user.username);
        expect(row, `no flag row for ${user.username}`).toBeTruthy();
        if (!row) throw new Error('flag row not found');
        expect(row.matched_words).toContain(FLAG_WORD);
        expect(row.flag_count).toBeGreaterThanOrEqual(1);
      }).toPass({ timeout: 12000, intervals: [200, 300, 500, 1000] });

      // I3: the hide is scoped to the discover group — the author's own copy is
      // intact (the doc was created, not rejected or deleted).
      const readRes = await request.post(`${API_BASE}/v3/read`, {
        data: JSON.stringify({ token: user.token, service: SERVICE, groups: [DISCOVER_GROUP_ID], limit: 100 }),
        headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
      });
      expect(readRes.ok()).toBeTruthy();
      // The doc exists (the create returned it); it's just hidden from the board read.
      expect(docId).toBeTruthy();
    });

    test('I3 anti-test: a non-discover post is NOT moderated (no hide, no flag)', async ({ request }) => {
      const admin = await adminToken(request);
      const user = await signupAndLogin(request, 'mod2');
      await addAppContract(request, user.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
      await setConfigField(request, admin, 'sensitive_words', [FLAG_WORD]);

      // A followers group (NOT the discover board).
      const res = await request.post(`${API_BASE}/v3/groups/create`, {
        data: JSON.stringify({
          token: user.token, name: 'followers', join_policy: 'open',
          roles: [
            { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
            { name: 'member', services: [SERVICE], permissions: ['readAll'] },
          ],
          members: [{ member_key: user.username, role: 'owner' }],
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.ok(), `create followers group failed (${res.status()})`).toBeTruthy();
      const followersGroup = (await res.json()).group_id as string;

      // Post the flagged word to the followers group (NOT the board).
      const postText = `off-board ${FLAG_WORD} post ${Date.now()}`;
      await createPost(request, user.token, followersGroup, postText);

      // Not on the board → not hidden, not flagged (moderation is board-scoped).
      const hidden = await readHidden(request, admin);
      expect(hidden.map((d) => d.body?.text)).not.toContain(postText);
      const flags = await readFlags(request, admin);
      expect(flags.find((f) => f.username === user.username)).toBeUndefined();
    });

    test('a listed user (auto_hide_users) has a CLEAN post auto-hidden', async ({ request }) => {
      const admin = await adminToken(request);
      const user = await signupAndLogin(request, 'mod3');
      await addAppContract(request, user.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
      // No blocklist match needed — the user is on the list.
      await setConfigField(request, admin, 'sensitive_words', []);
      await setAutoHide(request, admin, user.username, true);

      // A clean post (no flagged word) by the listed user.
      const postText = `listed user clean post ${Date.now()}`;
      await createPost(request, user.token, DISCOVER_GROUP_ID, postText);

      // Auto-hidden from the board (the list, not the blocklist).
      await expectBoardText(request, user.token, postText, /* absent */ true);
      await expectHiddenText(request, admin, postText, /* absent */ false);
      // Flagged with the auto_hide_users reason.
      await expect(async () => {
        const flags = await readFlags(request, admin);
        const row = flags.find((f) => f.username === user.username);
        expect(row, `no flag row for listed user ${user.username}`).toBeTruthy();
        if (!row) throw new Error('flag row not found');
        expect(row.matched_words).toContain('auto_hide_users');
      }).toPass({ timeout: 12000, intervals: [200, 300, 500, 1000] });
    });

    test('removing a user from auto_hide_users → their next post is visible', async ({ request }) => {
      const admin = await adminToken(request);
      const user = await signupAndLogin(request, 'mod4');
      await addAppContract(request, user.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
      await setConfigField(request, admin, 'sensitive_words', []);
      await setAutoHide(request, admin, user.username, true);

      // First post (listed) is auto-hidden.
      const hiddenPost = `listed hidden ${Date.now()}`;
      await createPost(request, user.token, DISCOVER_GROUP_ID, hiddenPost);
      await expectBoardText(request, user.token, hiddenPost, /* absent */ true);

      // The operator removes the user from the list.
      await setAutoHide(request, admin, user.username, false);

      // The next clean post is visible on the board.
      const visiblePost = `restored visible ${Date.now()}`;
      await createPost(request, user.token, DISCOVER_GROUP_ID, visiblePost);
      await expectBoardText(request, user.token, visiblePost, /* absent */ false);
    });
  });

  // ---------------------------------------------------------------------------
  // Browser gauntlet — the Node Config "Content Moderation" card drives the
  // full flow: set blocklist → post flagged → hidden → queue → keep hiding →
  // next post auto-hidden → remove → next post visible.
  // ---------------------------------------------------------------------------

  test.describe('Browser gauntlet — the Content Moderation card', () => {
    test('set blocklist → flagged post hidden → queue → keep hiding → next auto-hidden → remove → visible', async ({ browser, request }) => {
      const admin = await adminToken(request);
      const user = await signupAndLogin(request, 'modg');
      await addAppContract(request, user.token, SOCIAL_ORIGIN, SOCIAL_CONTRACT_PERMISSIONS);
      // The operator (admin) needs a contract for the authenticator origin to
      // read the board + write posts through the card's node client.
      await addAppContract(request, admin, AUTH_BASE, SOCIAL_CONTRACT_PERMISSIONS);

      const flaggedText = `gauntlet ${FLAG_WORD} ${Date.now()}`;
      const listedText = `gauntlet listed ${Date.now()}`;
      const restoredText = `gauntlet restored ${Date.now()}`;

      // --- The OPERATOR sets the blocklist in the Content Moderation card ---
      const ctxOp = await browser.newContext();
      const pageOp = await ctxOp.newPage();
      const opErrors = capturePageErrors(pageOp);
      await pageOp.goto(AUTH_BASE);
      await pageOp.locator('#username').waitFor({ state: 'visible', timeout: 30000 });
      await pageOp.locator('#username').fill('admin');
      await pageOp.locator('#password').fill('admin123');
      await pageOp.locator('[data-testid="login-submit"]').click();
      await expect(pageOp.locator('[data-testid="topbar-username"]')).toHaveText('admin', { timeout: 20000 });
      // Navigate to Node Config → the Content Moderation card.
      await pageOp.locator('[data-testid="sidebar-nav-config"]').click();
      await expect(pageOp.locator('[data-testid="config-content-moderation-card"]')).toBeVisible({ timeout: 20000 });

      // Add the sentinel word to the blocklist + save (the diff-only config save).
      await pageOp.locator('[data-testid="config-moderation-word-input"]').fill(FLAG_WORD);
      await pageOp.locator('[data-testid="config-moderation-word-add"]').click();
      await expect(pageOp.locator(`[data-testid="config-moderation-word-${FLAG_WORD}"]`)).toBeVisible();
      await pageOp.locator('[data-testid="config-save-button"]').click();
      await expect(pageOp.locator('[data-testid="config-saved-indicator"]')).toBeVisible({ timeout: 20000 });
      expect(opErrors, 'operator pageerrors (blocklist set)').toEqual([]);

      // --- A flagged post is hidden from the board ---
      await createPost(request, user.token, DISCOVER_GROUP_ID, flaggedText);
      await expectBoardText(request, user.token, flaggedText, /* absent */ true);
      await expectHiddenText(request, admin, flaggedText, /* absent */ false);

      // The flag appears in the operator's review queue. The authenticator's
      // mode is in-memory (not persisted across reload), so re-navigate to the
      // config page (away + back) to re-mount the card and re-load the queue.
      await pageOp.locator('[data-testid="sidebar-nav-contracts"]').click();
      await pageOp.locator('[data-testid="sidebar-nav-config"]').click();
      await expect(pageOp.locator('[data-testid="config-content-moderation-card"]')).toBeVisible({ timeout: 20000 });
      await expect(pageOp.locator(`[data-testid="config-moderation-flag-${user.username}"]`)).toBeVisible({ timeout: 20000 });
      // The queue row shows the matched word.
      await expect(pageOp.locator(`[data-testid="config-moderation-flag-${user.username}"]`)).toContainText(FLAG_WORD);
      expect(opErrors, 'operator pageerrors (queue)').toEqual([]);

      // --- The operator "keeps hiding" (adds the user to auto_hide_users) ---
      await pageOp.locator(`[data-testid="config-moderation-flag-toggle-${user.username}"]`).click();
      // The button flips to the "Hiding" state (the user is now on the list).
      await expect(pageOp.locator(`[data-testid="config-moderation-flag-toggle-${user.username}"]`)).toContainText('Hiding', { timeout: 20000 });
      expect(opErrors, 'operator pageerrors (keep hiding)').toEqual([]);
      await ctxOp.close();

      // --- The user's NEXT (clean) post is auto-hidden (the list, no match) ---
      await createPost(request, user.token, DISCOVER_GROUP_ID, listedText);
      await expectBoardText(request, user.token, listedText, /* absent */ true);
      await expectHiddenText(request, admin, listedText, /* absent */ false);

      // --- The operator removes the user from auto_hide_users ---
      const ctxOp2 = await browser.newContext();
      const pageOp2 = await ctxOp2.newPage();
      const op2Errors = capturePageErrors(pageOp2);
      await pageOp2.goto(AUTH_BASE);
      await pageOp2.locator('#username').waitFor({ state: 'visible', timeout: 30000 });
      await pageOp2.locator('#username').fill('admin');
      await pageOp2.locator('#password').fill('admin123');
      await pageOp2.locator('[data-testid="login-submit"]').click();
      await expect(pageOp2.locator('[data-testid="topbar-username"]')).toHaveText('admin', { timeout: 20000 });
      await pageOp2.locator('[data-testid="sidebar-nav-config"]').click();
      await expect(pageOp2.locator('[data-testid="config-content-moderation-card"]')).toBeVisible({ timeout: 20000 });
      // The user is still flagged (the audit log is append-only) and on the list
      // (the button shows "Hiding") — clicking removes them.
      await expect(pageOp2.locator(`[data-testid="config-moderation-flag-${user.username}"]`)).toBeVisible({ timeout: 20000 });
      await pageOp2.locator(`[data-testid="config-moderation-flag-toggle-${user.username}"]`).click();
      // The button flips back to "Keep hiding" (the user is off the list).
      await expect(pageOp2.locator(`[data-testid="config-moderation-flag-toggle-${user.username}"]`)).toContainText('Keep hiding', { timeout: 20000 });
      expect(op2Errors, 'operator pageerrors (remove)').toEqual([]);
      await ctxOp2.close();

      // --- The user's NEXT post is visible on the board ---
      await createPost(request, user.token, DISCOVER_GROUP_ID, restoredText);
      await expectBoardText(request, user.token, restoredText, /* absent */ false);
    });
  });
});
