import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Session health (verifySession) — the dirty-node seatbelt.
 *
 * Seeds each bad node state against a REAL node and asserts the verdict the
 * oracle returns (the API floor), then drives the app through the one recovery
 * that needs no popup (the followers-group heal) and asserts the guard healed
 * the state (the browser gauntlet). This is the test that catches a broken
 * node state before the operator does — the fresh-node e2e can't see it.
 *
 * The load-bearing rule under test: a DECISIVE negative (contract missing,
 * group broken, token dead) drives an action; an UNREADABLE store would be
 * `inconclusive` (no action) — a deploy window must not look like a missing
 * contract. The token-expired and user-not-found states need the node's
 * private key to seed, so they're pinned by the API unit tests instead.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const SOCIAL_ORIGIN = `http://social.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

const FOLLOWER_ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: ['posts'], permissions: ['readAll'] },
];

const SOCIAL_SERVICES = ['posts', 'media', 'public_media', 'profile', 'settings', 'comments', 'reactions', 'contacts', 'staging_posts'];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

const followersGroupId = (username: string) => `${PROVIDER}/groups/users/${username}/followers`;

function v3Post(request: APIRequestContext, url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return request.post(url, {
    data: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

async function signupAndLogin(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  let signupOk = false;
  for (let attempt = 0; attempt < 5 && !signupOk; attempt++) {
    const res = await v3Post(request, `${API_BASE}/v3/signup`, { username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) });
    if (res.ok()) signupOk = true;
    else await new Promise((r) => setTimeout(r, 500));
  }
  expect(signupOk, `signup failed for ${username}`).toBeTruthy();
  let token = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await v3Post(request, `${API_BASE}/v3/login`, { username, password });
    if (res.ok()) {
      token = (await res.json()).token as string;
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  expect(token, `login failed after retries for ${username}`).toBeTruthy();
  return { username, token };
}

async function addAppContract(request: APIRequestContext, token: string, permissions: Record<string, string[]>) {
  const res = await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: SOCIAL_ORIGIN,
    permissions,
  });
  expect(res.ok(), `add app contract failed (${res.status})`).toBeTruthy();
}

async function createFollowersGroup(request: APIRequestContext, token: string, username: string): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name: 'followers',
    join_policy: 'open',
    roles: FOLLOWER_ROLES,
    members: [{ member_key: username, role: 'owner' }],
  });
  expect(res.ok(), `create followers group failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

const settle = (ms = 1000) => new Promise((r) => setTimeout(r, ms));

function setTokenCookie(context: any, domain: string, token: string) {
  return context.addCookies([{ name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false }]);
}

/** Call the oracle the way the app's guard does (with the social Origin). */
async function verify(request: APIRequestContext, token: string | null, services: string[] = SOCIAL_SERVICES) {
  const body: Record<string, unknown> = { services };
  if (token) body.token = token;
  const res = await v3Post(request, `${API_BASE}/v3/session/verify`, body, { Origin: SOCIAL_ORIGIN });
  expect(res.ok(), `verify failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
  return res.json() as Promise<any>;
}

// ---------------------------------------------------------------------------
// API floor — seed each bad state, assert the verdict the oracle returns
// ---------------------------------------------------------------------------

test.describe('Session verify — API floor (real node, seeded states)', () => {
  test('a healthy session is ok with no actions', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'svok');
    await addAppContract(request, token, Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, SOCIAL_OPERATIONS])));
    await createFollowersGroup(request, token, username);
    await settle();

    const verdict = await verify(request, token);
    expect(verdict.status).toBe('ok');
    expect(verdict.token).toBe('valid');
    expect(verdict.user).toBe('exists');
    expect(verdict.contract.state).toBe('granted');
    expect(verdict.groups.followers).toBe('ok');
    expect(verdict.actions).toEqual([]);
  });

  test('a missing contract is degraded + reauth (the decisive negative)', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'svmiss');
    // NO app contract — but the followers group is healthy, so the ONLY
    // decisive problem is the missing contract.
    await createFollowersGroup(request, token, username);
    await settle();

    const verdict = await verify(request, token);
    expect(verdict.status).toBe('degraded');
    expect(verdict.contract.state).toBe('missing');
    expect(verdict.contract.missing_services).toEqual(SOCIAL_SERVICES);
    expect(verdict.groups.followers).toBe('ok'); // the group is fine
    expect(verdict.actions).toEqual(['reauth']);
  });

  test('a partial contract names the missing services + reauth', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'svpart');
    // Grant only posts — the rest of the social services are missing.
    await addAppContract(request, token, { posts: SOCIAL_OPERATIONS });
    await createFollowersGroup(request, token, username);
    await settle();

    const verdict = await verify(request, token);
    expect(verdict.status).toBe('degraded');
    expect(verdict.contract.state).toBe('partial');
    expect(verdict.contract.missing_services).not.toContain('posts');
    expect(verdict.contract.missing_services).toContain('profile');
    expect(verdict.actions).toEqual(['reauth']);
  });

  test('a followers group the user is not in is degraded + heal (not_member)', async ({ request }) => {
    // The phantom-member state: the group exists at the user's derived ID but
    // the user is NOT a member. Seed it: create the group as the user (so it's
    // at their ID and they're the owner), then remove their membership.
    const { username, token } = await signupAndLogin(request, 'svheal');
    await addAppContract(request, token, Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, SOCIAL_OPERATIONS])));
    await createFollowersGroup(request, token, username);
    // Remove the user's (owner's) membership — the group still exists, the user is gone.
    await v3Post(request, `${API_BASE}/v3/groups/members/remove`, {
      token,
      group_id: followersGroupId(username),
      member_key: username,
    });
    await settle();

    const verdict = await verify(request, token);
    expect(verdict.status).toBe('degraded');
    expect(verdict.groups.followers).toBe('not_member');
    expect(verdict.contract.state).toBe('granted'); // the contract is fine
    expect(verdict.actions).toEqual(['heal_followers_group']);
  });

  test('a missing followers group is degraded + heal (missing)', async ({ request }) => {
    // No followers group at all — the user never created one.
    const { username, token } = await signupAndLogin(request, 'svmissing');
    await addAppContract(request, token, Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, SOCIAL_OPERATIONS])));
    await settle();

    const verdict = await verify(request, token);
    expect(verdict.status).toBe('degraded');
    expect(verdict.groups.followers).toBe('missing');
    expect(verdict.actions).toEqual(['heal_followers_group']);
  });

  test('a malformed token is invalid + reauth', async ({ request }) => {
    await signupAndLogin(request, 'svmalformed'); // ensure the node is up
    const verdict = await verify(request, 'not-a-real-jwt');
    expect(verdict.status).toBe('invalid');
    expect(verdict.token).toBe('invalid');
    expect(verdict.actions).toEqual(['reauth']);
  });

  test('no token is invalid (missing) + reauth', async ({ request }) => {
    await signupAndLogin(request, 'svnotoken');
    const verdict = await verify(request, null);
    expect(verdict.status).toBe('invalid');
    expect(verdict.token).toBe('missing');
    expect(verdict.actions).toEqual(['reauth']);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the guard heals a broken followers group (no popup)
// ---------------------------------------------------------------------------

test.describe('Session guard — browser gauntlet (heal the broken group)', () => {
  test('a followers group the user is not in gets healed on mount', async ({ page, context, request }) => {
    const { username, token } = await signupAndLogin(request, 'svbrowser');
    await addAppContract(request, token, Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, SOCIAL_OPERATIONS])));

    // Seed the phantom state: create the followers group at the user's derived
    // ID but WITHOUT the user as a member. Do it by creating the group as the
    // user (which makes them the owner/member), then tombstone their
    // membership so the group exists but the user isn't in it.
    const groupId = followersGroupId(username);
    await createFollowersGroup(request, token, username);
    // Remove the user's membership (the group still exists; the user is gone).
    await v3Post(request, `${API_BASE}/v3/groups/members/remove`, {
      token,
      group_id: groupId,
      member_key: username,
    });
    await settle();

    // Confirm the seeded state: the group exists but the user is not a member.
    const preVerdict = await verify(request, token);
    expect(preVerdict.groups.followers).toBe('not_member');

    // Pre-auth the app and load the profile. The guard runs on mount, sees
    // not_member, and heals (join).
    await setTokenCookie(context, 'social.localhost', token);
    await setTokenCookie(context, 'auth.localhost', token);
    await page.goto(`${SOCIAL_BASE}/u/${username}`);
    await page.waitForLoadState('networkidle');

    // The guard healed the group — poll the membership until it's true (the
    // heal is async; the guard's join lands a beat after mount).
    await expect
      .poll(
        async () => {
          const v = await verify(request, token);
          return v.groups.followers;
        },
        { timeout: 15000 },
      )
      .toBe('ok');

    // After the heal, a fresh load renders the profile (the group read works).
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(username)).toBeVisible({ timeout: 15000 });
  });
});
