import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Groups demo — the platform unit test for the group primitive.
 *
 * Groups are policy containers: they define who sees what, not where data
 * lives. This spec hardens the three join policies (open / request /
 * invite_only) and the member-management surface (invite, remove, leave) at
 * the API floor, then drives the demo UI (browser gauntlet) to prove the
 * wiring. The API tests are the load-bearing part: they need two users, so
 * they exercise the join-policy state machine the single-user demos never
 * touch.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// Owner gets full management perms (assignRoles/revokeRoles/deleteGroup) so
// the join-policy + member-management tests can drive the state machine.
const ROLES = [
  { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  { name: 'member', services: ['posts'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
];

async function signupFreshUser(request: APIRequestContext, prefix: string): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await request.post(`${API_BASE}/v3/signup`, {
    data: JSON.stringify({ username, password, phone: '+1555' + Math.floor(Math.random() * 10000000) }),
    headers: { 'Content-Type': 'application/json' },
  });
  const res = await request.post(`${API_BASE}/v3/login`, {
    data: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok()).toBeTruthy();
  const token = (await res.json()).token as string;
  return { username, token };
}

async function v3Post(request: APIRequestContext, action: string, body: Record<string, any>): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await request.post(`${API_BASE}/v3/${action}`, {
    data: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  const text = await res.text().catch(() => '');
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: res.ok(), status: res.status(), body: parsed };
}

/** Create a group with the standard roles; the creator is the owner. Returns the group_id. */
async function createGroup(request: APIRequestContext, token: string, creator: string, name: string, joinPolicy: string): Promise<string> {
  const res = await v3Post(request, 'groups/create', {
    token, name, join_policy: joinPolicy, roles: ROLES,
    members: [{ member_key: creator, role: 'owner' }],
  });
  expect(res.ok, `create group "${name}" failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return res.body.group_id as string;
}

/** Create a group with an explicit discoverable flag (D53). */
async function createGroupDiscoverable(request: APIRequestContext, token: string, creator: string, name: string, joinPolicy: string, discoverable: boolean): Promise<string> {
  const res = await v3Post(request, 'groups/create', {
    token, name, join_policy: joinPolicy, roles: ROLES,
    members: [{ member_key: creator, role: 'owner' }],
    discoverable,
  });
  expect(res.ok, `create group "${name}" failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return res.body.group_id as string;
}

/** GET a v3 endpoint with query params (the directory + detail are public GETs). */
async function v3Get(request: APIRequestContext, action: string, params: Record<string, string> = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const qs = new URLSearchParams(params).toString();
  const res = await request.get(`${API_BASE}/v3/${action}${qs ? `?${qs}` : ''}`);
  const text = await res.text().catch(() => '');
  let parsed: any = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  return { ok: res.ok(), status: res.status(), body: parsed };
}

/** Member keys of a group, as seen by a member (the owner). */
async function memberKeys(request: APIRequestContext, token: string, groupId: string): Promise<string[]> {
  const res = await v3Post(request, 'groups/members/list', { token, group_id: groupId });
  expect(res.ok, `members/list failed (${res.status}): ${JSON.stringify(res.body)}`).toBeTruthy();
  return (res.body as any[]).map((m) => m.member_key as string).sort();
}

// ---------------------------------------------------------------------------
// API floor — group lifecycle
// ---------------------------------------------------------------------------

test.describe('Groups — API floor', () => {
  test('lifecycle: create with roles, list, get, members', async ({ request }) => {
    const a = await signupFreshUser(request, 'grplc');
    const groupId = await createGroup(request, a.token, a.username, `lc-${a.username}`, 'open');

    // list — the creator's group appears
    const list = await v3Post(request, 'groups/list', { token: a.token });
    expect(list.ok).toBeTruthy();
    const mine = (list.body as any[]).find((g) => g.group_id === groupId);
    expect(mine, 'created group missing from groups/list').toBeTruthy();
    expect(mine.join_policy).toBe('open');
    expect(mine.my_role).toBe('owner');

    // get — roles + join policy round-trip
    const get = await v3Post(request, 'groups/get', { token: a.token, group_id: groupId });
    expect(get.ok).toBeTruthy();
    expect(get.body.join_policy).toBe('open');
    expect(get.body.roles).toEqual(ROLES);

    // members — the creator is the owner
    const members = await memberKeys(request, a.token, groupId);
    expect(members).toEqual([a.username]);
  });

  test('join policy: open — join is instant', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpopen');
    const b = await signupFreshUser(request, 'grpopenb');
    const groupId = await createGroup(request, a.token, a.username, `open-${a.username}`, 'open');

    const join = await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(join.ok, `open join failed: ${JSON.stringify(join.body)}`).toBeTruthy();
    expect(join.body.role).toBe('member');

    const members = await memberKeys(request, a.token, groupId);
    expect(members).toContain(a.username);
    expect(members).toContain(b.username);
  });

  test('join policy: request — pending, then owner approves', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpreq');
    const b = await signupFreshUser(request, 'grpreqb');
    const groupId = await createGroup(request, a.token, a.username, `req-${a.username}`, 'request');

    // B requests — not yet a member
    const join = await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(join.ok).toBeTruthy();
    expect(join.body.status).toBe('pending');
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);

    // Owner sees the pending request
    const reqs = await v3Post(request, 'groups/requests/join/list', { token: a.token, group_id: groupId });
    expect(reqs.ok).toBeTruthy();
    expect((reqs.body as any[]).some((r) => r.requester_key === b.username && r.status === 'pending')).toBeTruthy();

    // Owner approves — B becomes a member
    const approve = await v3Post(request, 'groups/requests/join/approve', { token: a.token, group_id: groupId, requester_key: b.username });
    expect(approve.ok, `approve failed: ${JSON.stringify(approve.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);
  });

  test('join policy: request — owner can deny', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpdeny');
    const b = await signupFreshUser(request, 'grpdenyb');
    const groupId = await createGroup(request, a.token, a.username, `deny-${a.username}`, 'request');

    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    const deny = await v3Post(request, 'groups/requests/join/deny', { token: a.token, group_id: groupId, requester_key: b.username });
    expect(deny.ok, `deny failed: ${JSON.stringify(deny.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);
  });

  test('join policy: invite_only — direct join rejected, invite + accept works', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpinv');
    const b = await signupFreshUser(request, 'grpinvb');
    const groupId = await createGroup(request, a.token, a.username, `inv-${a.username}`, 'invite_only');

    // Direct join is rejected for invite_only
    const join = await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(join.ok, 'invite_only should reject a direct join').toBeFalsy();

    // Owner invites B
    const invite = await v3Post(request, 'groups/invite', { token: a.token, group_id: groupId, member_key: b.username, role: 'member' });
    expect(invite.ok, `invite failed: ${JSON.stringify(invite.body)}`).toBeTruthy();

    // B accepts — becomes a member
    const accept = await v3Post(request, 'groups/accept-invite', { token: b.token, group_id: groupId });
    expect(accept.ok, `accept failed: ${JSON.stringify(accept.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);
  });

  test('join policy: invite_only — invitee can decline', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpcln');
    const b = await signupFreshUser(request, 'grpclnb');
    const groupId = await createGroup(request, a.token, a.username, `cln-${a.username}`, 'invite_only');

    await v3Post(request, 'groups/invite', { token: a.token, group_id: groupId, member_key: b.username, role: 'member' });
    const decline = await v3Post(request, 'groups/decline-invite', { token: b.token, group_id: groupId });
    expect(decline.ok, `decline failed: ${JSON.stringify(decline.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);
  });

  test('member mgmt: owner removes a member', async ({ request }) => {
    const a = await signupFreshUser(request, 'grprm');
    const b = await signupFreshUser(request, 'grprmb');
    const groupId = await createGroup(request, a.token, a.username, `rm-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);

    const remove = await v3Post(request, 'groups/members/remove', { token: a.token, group_id: groupId, member_key: b.username });
    expect(remove.ok, `remove failed: ${JSON.stringify(remove.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);
  });

  test('member mgmt: a member can leave', async ({ request }) => {
    const a = await signupFreshUser(request, 'grplv');
    const b = await signupFreshUser(request, 'grplvb');
    const groupId = await createGroup(request, a.token, a.username, `lv-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);

    const leave = await v3Post(request, 'groups/leave', { token: b.token, group_id: groupId });
    expect(leave.ok, `leave failed: ${JSON.stringify(leave.body)}`).toBeTruthy();
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);
  });

  test('permission: a plain member cannot remove others (revokeRoles gate)', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpgate');
    const b = await signupFreshUser(request, 'grpgateb');
    const c = await signupFreshUser(request, 'grpgatec');
    const groupId = await createGroup(request, a.token, a.username, `gate-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    await v3Post(request, 'groups/join', { token: c.token, group_id: groupId });

    // B is a plain member (no revokeRoles) — removing C must be denied
    const remove = await v3Post(request, 'groups/members/remove', { token: b.token, group_id: groupId, member_key: c.username });
    expect(remove.ok, 'plain member must not remove others').toBeFalsy();
    // C is still a member
    expect(await memberKeys(request, a.token, groupId)).toContain(c.username);
  });
});

// ---------------------------------------------------------------------------
// Anti-tests — the KB with teeth. Start from a broken state, verify the
// CONSEQUENCE (not just a status code), and verify recovery.
// ---------------------------------------------------------------------------

test.describe('Groups — anti-tests (the KB with teeth)', () => {
  test('permission: a non-member cannot list a group\'s members', async ({ request }) => {
    const a = await signupFreshUser(request, 'gana');
    const outsider = await signupFreshUser(request, 'ganao');
    const groupId = await createGroup(request, a.token, a.username, `ana-${a.username}`, 'open');
    const res = await v3Post(request, 'groups/members/list', { token: outsider.token, group_id: groupId });
    expect(res.ok, `non-member listed members: ${JSON.stringify(res.body)}`).toBeFalsy();
  });

  test('permission: a plain member cannot invite (assignRoles gate)', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganb');
    const b = await signupFreshUser(request, 'ganbo');
    const c = await signupFreshUser(request, 'ganbc');
    const groupId = await createGroup(request, a.token, a.username, `anb-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId }); // b = plain member
    const res = await v3Post(request, 'groups/invite', { token: b.token, group_id: groupId, member_key: c.username, role: 'member' });
    expect(res.ok, `plain member invited: ${JSON.stringify(res.body)}`).toBeFalsy();
    // consequence: c was NOT added
    expect(await memberKeys(request, a.token, groupId)).not.toContain(c.username);
  });

  test('permission: a plain member cannot list join requests (assignRoles gate)', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganc');
    const b = await signupFreshUser(request, 'ganco');
    const groupId = await createGroup(request, a.token, a.username, `anc-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId }); // b = plain member
    const res = await v3Post(request, 'groups/requests/join/list', { token: b.token, group_id: groupId });
    expect(res.ok, `plain member listed requests: ${JSON.stringify(res.body)}`).toBeFalsy();
  });

  test('permission: a non-owner cannot delete a group (deleteGroup gate)', async ({ request }) => {
    const a = await signupFreshUser(request, 'gand');
    const b = await signupFreshUser(request, 'gando');
    const groupId = await createGroup(request, a.token, a.username, `and-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId }); // b = plain member
    const res = await v3Post(request, 'groups/delete', { token: b.token, group_id: groupId });
    expect(res.ok, `non-owner deleted group: ${JSON.stringify(res.body)}`).toBeFalsy();
    // consequence: group still exists
    expect((await v3Post(request, 'groups/get', { token: a.token, group_id: groupId })).ok).toBeTruthy();
  });

  test('permission: a non-member cannot update a group', async ({ request }) => {
    const a = await signupFreshUser(request, 'gane');
    const outsider = await signupFreshUser(request, 'ganeo');
    const groupId = await createGroup(request, a.token, a.username, `ane-${a.username}`, 'open');
    const res = await v3Post(request, 'groups/update', { token: outsider.token, group_id: groupId, join_policy: 'request' });
    expect(res.ok, `non-member updated group: ${JSON.stringify(res.body)}`).toBeFalsy();
  });

  test('recovery: remove a member → they lose access → re-add → access restored', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganf');
    const b = await signupFreshUser(request, 'ganfo');
    const groupId = await createGroup(request, a.token, a.username, `anf-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    // b has access
    expect((await v3Post(request, 'groups/members/list', { token: b.token, group_id: groupId })).ok).toBeTruthy();
    // a removes b
    await v3Post(request, 'groups/members/remove', { token: a.token, group_id: groupId, member_key: b.username });
    // consequence: b lost access
    const afterRemove = await v3Post(request, 'groups/members/list', { token: b.token, group_id: groupId });
    expect(afterRemove.ok, `removed member still has access: ${JSON.stringify(afterRemove.body)}`).toBeFalsy();
    // recovery: re-add b (members/add fork)
    await v3Post(request, 'groups/members/add', { token: a.token, group_id: groupId, member_key: b.username, role: 'member' });
    // consequence: b has access again
    expect((await v3Post(request, 'groups/members/list', { token: b.token, group_id: groupId })).ok, 're-added member lost access').toBeTruthy();
  });

  test('recovery: leave a group → it leaves your list → re-join → it returns', async ({ request }) => {
    const a = await signupFreshUser(request, 'gang');
    const b = await signupFreshUser(request, 'gango');
    const groupId = await createGroup(request, a.token, a.username, `ang-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    const inList = (tok: string) => v3Post(request, 'groups/list', { token: tok }).then((r) =>
      (r.body as any[]).some((g) => g.group_id === groupId));
    expect(await inList(b.token), 'group missing before leave').toBeTruthy();
    await v3Post(request, 'groups/leave', { token: b.token, group_id: groupId });
    expect(await inList(b.token), 'left group still in list').toBeFalsy();
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    expect(await inList(b.token), 're-joined group missing from list').toBeTruthy();
  });

  test('recovery: delete a group → get returns not-found → re-create → it works', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganh');
    const groupId = await createGroup(request, a.token, a.username, `anh-${a.username}`, 'open');
    // owner deletes
    expect((await v3Post(request, 'groups/delete', { token: a.token, group_id: groupId })).ok).toBeTruthy();
    // consequence: get returns not-found
    const afterDelete = await v3Post(request, 'groups/get', { token: a.token, group_id: groupId });
    expect(afterDelete.ok, `deleted group still found: ${JSON.stringify(afterDelete.body)}`).toBeFalsy();
    // recovery: re-create the same group
    const recreated = await createGroup(request, a.token, a.username, `anh-${a.username}`, 'open');
    expect((await v3Post(request, 'groups/get', { token: a.token, group_id: recreated })).ok, 're-created group not found').toBeTruthy();
  });

  test('idempotency: approving a request removes it from the pending list', async ({ request }) => {
    const a = await signupFreshUser(request, 'gani');
    const b = await signupFreshUser(request, 'ganio');
    const groupId = await createGroup(request, a.token, a.username, `ani-${a.username}`, 'request');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId }); // b pending
    // b shows in the pending list
    let pending = await v3Post(request, 'groups/requests/join/list', { token: a.token, group_id: groupId });
    expect((pending.body as any[]).some((r) => r.requester_key === b.username)).toBeTruthy();
    // a approves
    await v3Post(request, 'groups/requests/join/approve', { token: a.token, group_id: groupId, requester_key: b.username });
    // consequence: b is no longer pending (the resolved row supersedes the pending one)
    pending = await v3Post(request, 'groups/requests/join/list', { token: a.token, group_id: groupId });
    expect((pending.body as any[]).some((r) => r.requester_key === b.username), 'approved request still pending').toBeFalsy();
    // and b is a member
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);
  });

  test('idempotency: re-joining an open group does not duplicate the membership', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganj');
    const b = await signupFreshUser(request, 'ganjo');
    const groupId = await createGroup(request, a.token, a.username, `anj-${a.username}`, 'open');
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId });
    await v3Post(request, 'groups/join', { token: b.token, group_id: groupId }); // join again
    // consequence: b appears exactly once
    const members = await v3Post(request, 'groups/members/list', { token: a.token, group_id: groupId });
    const bRows = (members.body as any[]).filter((m) => m.member_key === b.username);
    expect(bRows.length, `b appears ${bRows.length} times`).toBe(1);
  });

  test('idempotency: re-creating a group does not duplicate it', async ({ request }) => {
    const a = await signupFreshUser(request, 'gank');
    const groupId = await createGroup(request, a.token, a.username, `ank-${a.username}`, 'open');
    // re-create the same group (as the demo does on every login)
    const again = await createGroup(request, a.token, a.username, `ank-${a.username}`, 'open');
    expect(again).toBe(groupId);
    // consequence: still exactly one membership for the creator
    const members = await v3Post(request, 'groups/members/list', { token: a.token, group_id: groupId });
    const aRows = (members.body as any[]).filter((m) => m.member_key === a.username);
    expect(aRows.length, `creator appears ${aRows.length} times`).toBe(1);
  });

  test('edge: joining a non-existent group fails', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganl');
    const res = await v3Post(request, 'groups/join', { token: a.token, group_id: 'api.localhost/groups/users/nobody/ghost' });
    expect(res.ok, `joined a ghost group: ${JSON.stringify(res.body)}`).toBeFalsy();
  });

  test('edge: accepting an invite you do not have is denied', async ({ request }) => {
    const a = await signupFreshUser(request, 'ganm');
    const b = await signupFreshUser(request, 'ganmo');
    const groupId = await createGroup(request, a.token, a.username, `anm-${a.username}`, 'invite_only');
    // b has no pending/invited request — accept must be denied
    const res = await v3Post(request, 'groups/accept-invite', { token: b.token, group_id: groupId });
    expect(res.ok, `accepted a non-existent invite: ${JSON.stringify(res.body)}`).toBeFalsy();
    expect(await memberKeys(request, a.token, groupId)).not.toContain(b.username);
  });

  test('fork: a manager can add a member directly (members/add)', async ({ request }) => {
    const a = await signupFreshUser(request, 'gann');
    const b = await signupFreshUser(request, 'ganno');
    const groupId = await createGroup(request, a.token, a.username, `ann-${a.username}`, 'invite_only');
    // owner (a) adds b directly — the members/add fork (not join/invite)
    const res = await v3Post(request, 'groups/members/add', { token: a.token, group_id: groupId, member_key: b.username, role: 'member' });
    expect(res.ok, `members/add failed: ${JSON.stringify(res.body)}`).toBeTruthy();
    // consequence: b is a member
    expect(await memberKeys(request, a.token, groupId)).toContain(b.username);
  });
});

// ---------------------------------------------------------------------------
// The group directory + detail (D53) — real SQL against ClickHouse. The
// directory is the minimal list of discoverable groups; the detail is the
// flexible, principal-based read (unlisted-model).
// ---------------------------------------------------------------------------

test.describe('Groups directory + detail — API floor (D53)', () => {
  test('directory: discoverable groups listed, non-discoverable absent', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpd');
    const listedId = await createGroupDiscoverable(request, a.token, a.username, `listed-${a.username}`, 'open', true);
    const hiddenId = await createGroupDiscoverable(request, a.token, a.username, `hidden-${a.username}`, 'open', false);

    const dir = await v3Get(request, 'groups/directory', { limit: '500' });
    expect(dir.ok, `directory failed: ${JSON.stringify(dir.body)}`).toBeTruthy();
    const ids = (dir.body.groups as any[]).map((g) => g.group_id);
    expect(ids).toContain(listedId);
    expect(ids).not.toContain(hiddenId);

    // the listed group carries the minimal fields (name = the slug, D60 — the
    // face is app data, not in the generic directory)
    const listed = (dir.body.groups as any[]).find((g) => g.group_id === listedId);
    expect(listed.owner).toBe(a.username);
    expect(listed.name).toBeTruthy();
    expect(listed.join_policy).toBe('open');
    expect(listed.member_count).toBe(1);
    expect(listed.tags).toBeUndefined();
  });

  test('detail: a non-existent group 404s', async ({ request }) => {
    const res = await v3Get(request, 'groups/detail', { group_id: 'api.localhost/groups/users/nobody/ghost' });
    expect(res.status).toBe(404);
  });

  test('detail: a non-discoverable group is reachable (unlisted-model)', async ({ request }) => {
    const a = await signupFreshUser(request, 'grpdet');
    const hiddenId = await createGroupDiscoverable(request, a.token, a.username, `det-${a.username}`, 'open', false);
    const res = await v3Get(request, 'groups/detail', { group_id: hiddenId });
    expect(res.ok, `non-discoverable detail should not 404 (got ${res.status})`).toBeTruthy();
    expect(res.body.discoverable).toBe(false);
    expect(res.body.name).toBeTruthy();
    expect(res.body.owner).toBe(a.username);
  });

  test('detail: a member sees posts, a non-member gets "join to view"', async ({ request }) => {
    const a = await signupFreshUser(request, 'grppost');
    const b = await signupFreshUser(request, 'grppostb');
    const groupId = await createGroupDiscoverable(request, a.token, a.username, `post-${a.username}`, 'open', true);

    // a (owner) posts to the group
    const post = await v3Post(request, 'create', {
      token: a.token, service: 'posts', body: { text: 'hello group' }, groups: [groupId],
    });
    expect(post.ok, `post failed: ${JSON.stringify(post.body)}`).toBeTruthy();

    // a (member) sees the post
    const asMember = await v3Get(request, 'groups/detail', { group_id: groupId, token: a.token });
    expect(asMember.ok).toBeTruthy();
    expect(asMember.body.is_member).toBe(true);
    expect(asMember.body.posts_state).toBe('ok');
    expect((asMember.body.posts as any[]).length).toBe(1);

    // b (non-member) gets "join to view" — no posts
    const asOutsider = await v3Get(request, 'groups/detail', { group_id: groupId, token: b.token });
    expect(asOutsider.ok).toBeTruthy();
    expect(asOutsider.body.is_member).toBe(false);
    expect(asOutsider.body.posts_state).toBe('join_to_view');
    expect(asOutsider.body.posts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — drive the demo UI
// ---------------------------------------------------------------------------

async function setupSignedInDemo(
  page: Page, context: any, request: APIRequestContext,
): Promise<{ username: string; token: string; groupId: string }> {
  const { username, token } = await signupFreshUser(request, 'grpui');
  await context.addCookies([
    { name: 'token', value: token, domain: 'marketing.localhost', path: '/', secure: false, httpOnly: false },
    { name: 'token', value: token, domain: 'auth.localhost', path: '/', secure: false, httpOnly: false },
  ]);

  // Pre-grant the app contract for the demo origin (the demo's CRUD calls are
  // origin-checked).
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: MARKETING_BASE,
      permissions: {
        'web10-docs-groups-demo': ['readAll', 'create', 'updateOwn', 'deleteOwn'],
        posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });

  // Pre-create a group the demo can show + post to.
  const groupId = await createGroup(request, token, username, `ui-${username}`, 'open');
  return { username, token, groupId };
}

function captureFull(page: Page): { console: string[]; errors: string[] } {
  const console: string[] = [];
  const errors: string[] = [];
  page.on('console', (msg) => console.push(`[${msg.type()}] ${msg.text()}`));
  page.on('pageerror', (err) => errors.push(String(err)));
  return { console, errors };
}

test.describe('Groups demo — browser gauntlet', () => {
  test('signed-in: group lists, members render, post to board', async ({ page, context, request }) => {
    const { username, token, groupId } = await setupSignedInDemo(page, context, request);
    const full = captureFull(page);

    // Sanity: the group IS in the list via a direct API call (isolates demo vs API).
    const listRes = await v3Post(request, 'groups/list', { token });
    expect(listRes.ok, `direct groups/list failed: ${JSON.stringify(listRes.body)}`).toBeTruthy();
    expect((listRes.body as any[]).some((g) => g.group_id === groupId), 'group missing from direct groups/list').toBeTruthy();

    await page.goto(`${MARKETING_BASE}/docs/groups/`);
    await page.waitForLoadState('networkidle');

    // Signed-in state
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#message')).toContainText(username);

    // My Groups: the pre-created group renders (initApp auto-loads)
    try {
      await expect(page.locator('#myGroups .group-card').first()).toBeVisible({ timeout: 10000 });
    } catch {
      const myGroupsHtml = await page.locator('#myGroups').innerHTML();
      const toastText = await page.locator('#toast').textContent();
      throw new Error(`My Groups did not render.\n#myGroups HTML: ${myGroupsHtml}\n#toast: ${toastText}\n--- console ---\n${full.console.join('\n')}\n--- pageerrors ---\n${full.errors.join('\n')}`);
    }

    // Members: expand the group, the owner chip renders
    await page.locator('#myGroups .group-card button:has-text("Members")').first().click();
    await expect(page.locator('#myGroups .member').first()).toContainText(username, { timeout: 10000 });

    // Board: post to the group, the post renders
    await page.locator('.tabs button:has-text("Board")').click();
    await page.locator('#postGroup').selectOption(groupId);
    const postText = `groups demo post ${Date.now()}`;
    await page.locator('#postText').fill(postText);
    await page.locator('#tab-board button:has-text("Post")').click();
    await expect(page.locator('#posts .post').first()).toContainText(postText, { timeout: 10000 });
  });

  test('create group through the real consent popup', async ({ page, context, request }) => {
    const { groupId: _ignored } = await setupSignedInDemo(page, context, request);

    await page.goto(`${MARKETING_BASE}/docs/groups/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');

    // Go to the Create tab, fill the form, submit.
    await page.locator('.tabs button:has-text("Create")').click();
    const newName = `popup-${Date.now()}`;
    await page.locator('#groupName').fill(newName);
    await page.locator('#joinPolicy').selectOption('open');

    // The demo's createGroup() calls contractRequest, which opens the auth
    // popup. Wait for it, approve the group contract, and confirm the group
    // lands in My Groups.
    const popupPromise = context.waitForEvent('page', { timeout: 15000 });
    await page.locator('#tab-create button:has-text("Create Group")').click();
    const popup = await popupPromise;
    await popup.waitForLoadState('networkidle');

    // The group contract must render (not "all set") — the load-bearing seam.
    await popup.locator('[data-testid="consent-req-0"]').waitFor({ state: 'visible', timeout: 15000 });
    await popup.locator('[data-testid="consent-approve-0"]').click();
    await popup.waitForEvent('close', { timeout: 15000 }).catch(() => {});

  // The demo toasts "Group created!" and refreshes My Groups.
  await expect(page.locator('#toast')).toContainText('Group created', { timeout: 10000 });
  // Switch back to My Groups (the Create tab is active, so #myGroups is hidden).
  await page.locator('.tabs button:has-text("My Groups")').click();
  await expect(page.locator('#myGroups .group-card').first()).toBeVisible({ timeout: 10000 });
  });

  test('state rule: a created group persists across a reload (the return run)', async ({ page, context, request }) => {
    const { username, groupId } = await setupSignedInDemo(page, context, request);

    // First run (warm): the group is already there and shows.
    await page.goto(`${MARKETING_BASE}/docs/groups/`);
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    await expect(page.locator('#myGroups .group-card').first()).toBeVisible({ timeout: 10000 });

    // Return run: reload the page (the user comes back). The token cookie
    // persists, initApp re-runs, and the group must still be there — not
    // clobbered, not duplicated, not gone.
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('#authButton')).toHaveText('Log out');
    const cards = page.locator('#myGroups .group-card');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    // Two cards: the node-default discover group (auto-enrolled at signup,
    // #686) + the pre-created group. No duplication on re-load.
    await expect(cards).toHaveCount(2, { timeout: 10000 });
    // the pre-created group's card is among them (not clobbered)
    await expect(cards.filter({ hasText: `ui-${username}` }).first()).toBeVisible();
    void groupId;
  });
});
