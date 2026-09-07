import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * Query engine (w.query / POST /v3/query) — the flexible-read gauntlet.
 *
 * The safe-query engine (safe-query.md) compiles a caller's ClickHouse SELECT
 * into boundary-CTE-enforced SQL: every service name is replaced by an
 * API-built CTE filtered to the caller's readable groups, so the raw node
 * tables are unreachable (a wall, not a membrane). This spec is the seam test
 * the unit tests can't provide — it runs the compiled SQL against a REAL
 * ClickHouse on a REAL node and pins the boundary end to end:
 *
 *   - a member reads their own group (self-joins, aggregations, CTEs);
 *   - I3: a non-member cannot read the group (explicit → 403, own groups →
 *     the member's docs are absent);
 *   - the app-contract gate: an ungranted service is 403;
 *   - the membrane: raw tables / DML / stacked statements are 403;
 *   - anon reads the public board (D41).
 *
 * The engine's own rejection facets are pinned in api/tests/test_safe_query.py;
 * the endpoint's contract (auth, scoping, serialization) in
 * api/tests/test_query_endpoint.py.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
// A dedicated app origin for the contract gate (not the social app's).
const ORIGIN = `http://query-engine.localhost${p}`;

const uniqueUser = (prefix: string) => `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
const password = 'TestPass123!';

// Membership grants read + write on all services in the group (D58), so a
// minimal owner role is enough for the owner to create posts + comments.
const GROUP_ROLES = [
  { name: 'owner', permissions: { '*': ['readAll', 'create'] } },
];

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
    allowed_origin: ORIGIN,
    permissions,
  });
  expect(res.ok(), `add app contract failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
}

async function createGroup(request: APIRequestContext, token: string, name: string, members: { member_key: string; role?: string }[]): Promise<string> {
  const res = await v3Post(request, `${API_BASE}/v3/groups/create`, {
    token,
    name,
    join_policy: 'open',
    roles: GROUP_ROLES,
    members,
  });
  expect(res.ok(), `create group failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
  return (await res.json()).group_id as string;
}

async function createDoc(request: APIRequestContext, token: string, service: string, body: Record<string, unknown>, groups: string[], refValue?: string) {
  const payload: Record<string, unknown> = { token, service, body, groups };
  if (refValue) payload.ref_value = refValue;
  const res = await v3Post(request, `${API_BASE}/v3/create`, payload);
  expect(res.ok(), `create ${service} failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
  return (await res.json()) as { doc_id: string };
}

async function query(request: APIRequestContext, token: string | null, sql: string, groups?: string[]) {
  const body: Record<string, unknown> = { sql };
  if (token) body.token = token;
  if (groups) body.groups = groups;
  return v3Post(request, `${API_BASE}/v3/query`, body, { Origin: ORIGIN });
}

const settle = (ms = 1500) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// The power: a member reads their own group (self-join + aggregation + CTE)
// ---------------------------------------------------------------------------

test.describe('Query engine — the power (real ClickHouse, member reads own group)', () => {
  test('cross-service self-join + aggregation over the boundary', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'qepower');
    await addAppContract(request, token, { posts: ['readAll', 'create'], comments: ['readAll', 'create'] });
    const groupId = await createGroup(request, token, 'qe-power', [{ member_key: username, role: 'owner' }]);

    const p1 = await createDoc(request, token, 'posts', { text: 'one' }, [groupId]);
    const p2 = await createDoc(request, token, 'posts', { text: 'two' }, [groupId]);
    await createDoc(request, token, 'comments', { text: 'nice one' }, [groupId], p1.doc_id);
    await settle();

    // The "go crazy" shape: a self-join across services + an aggregation, all
    // inside the group boundary. p1 has 1 comment, p2 has 0.
    //
    // ClickHouse note: a LEFT JOIN non-match yields default values (empty
    // string for String), not NULL — so `count(c.doc_id)` overcounts. The
    // correct idiom is `countIf(c.ref_value = p.doc_id)`.
    const res = await query(
      request,
      token,
      `SELECT p.doc_id, countIf(c.ref_value = p.doc_id) AS comments
       FROM posts p
       LEFT JOIN comments c ON c.ref_value = p.doc_id
       GROUP BY p.doc_id
       ORDER BY comments DESC, p.doc_id`,
      [groupId],
    );
    expect(res.ok(), `query failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
    const data = (await res.json()) as { rows: { doc_id: string; comments: number }[]; count: number };
    expect(data.count).toBe(2);
    expect(data.rows[0].doc_id).toBe(p1.doc_id);
    expect(data.rows[0].comments).toBe(1);
    expect(data.rows[1].doc_id).toBe(p2.doc_id);
    expect(data.rows[1].comments).toBe(0);
  });

  test('caller CTE + subquery + JSON body field', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'qecte');
    await addAppContract(request, token, { posts: ['readAll', 'create'], comments: ['readAll', 'create'] });
    const groupId = await createGroup(request, token, 'qe-cte', [{ member_key: username, role: 'owner' }]);

    const p1 = await createDoc(request, token, 'posts', { text: 'hello', tags: ['a'] }, [groupId]);
    await createDoc(request, token, 'comments', { text: 'first' }, [groupId], p1.doc_id);
    await createDoc(request, token, 'comments', { text: 'second' }, [groupId], p1.doc_id);
    await settle();

    // A caller-defined CTE that aggregates, then a subquery selecting from it,
    // plus a JSON body field via JSONExtractString.
    const res = await query(
      request,
      token,
      `WITH counts AS (
         SELECT ref_value, count() AS n FROM comments GROUP BY ref_value
       )
       SELECT p.doc_id, JSONExtractString(p.body, 'text') AS text, c.n AS comments
       FROM posts p
       JOIN counts c ON c.ref_value = p.doc_id
       WHERE c.n > 1`,
      [groupId],
    );
    expect(res.ok(), `query failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
    const data = (await res.json()) as { rows: { doc_id: string; text: string; comments: number }[]; count: number };
    expect(data.count).toBe(1);
    expect(data.rows[0].doc_id).toBe(p1.doc_id);
    expect(data.rows[0].text).toBe('hello');
    expect(data.rows[0].comments).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// I3: the boundary is the group membership — a non-member reads nothing
// ---------------------------------------------------------------------------

test.describe('Query engine — I3 (the boundary holds end to end)', () => {
  test('a non-member gets 403 on an explicit group (not an empty result)', async ({ request }) => {
    const owner = await signupAndLogin(request, 'qeown');
    const intruder = await signupAndLogin(request, 'qeintr');
    await addAppContract(request, owner.token, { posts: ['readAll', 'create'] });
    await addAppContract(request, intruder.token, { posts: ['readAll', 'create'] });
    const groupId = await createGroup(request, owner.token, 'qe-private', [{ member_key: owner.username, role: 'owner' }]);
    const secret = await createDoc(request, owner.token, 'posts', { text: 'secret' }, [groupId]);
    await settle();

    // The intruder names the group explicitly → an access failure, not empty.
    const res = await query(request, intruder.token, 'SELECT doc_id FROM posts', [groupId]);
    expect(res.status()).toBe(403);
    expect(await res.text()).toMatch(/not a member/i);
  });

  test('a non-member cannot see the member posts via their own groups', async ({ request }) => {
    const owner = await signupAndLogin(request, 'qeown2');
    const intruder = await signupAndLogin(request, 'qeintr2');
    await addAppContract(request, owner.token, { posts: ['readAll', 'create'] });
    await addAppContract(request, intruder.token, { posts: ['readAll', 'create'] });
    const groupId = await createGroup(request, owner.token, 'qe-private2', [{ member_key: owner.username, role: 'owner' }]);
    const secret = await createDoc(request, owner.token, 'posts', { text: 'secret' }, [groupId]);
    // The intruder has their own group with their own post (so the read is non-empty).
    const ownGroup = await createGroup(request, intruder.token, 'qe-own', [{ member_key: intruder.username, role: 'owner' }]);
    const own = await createDoc(request, intruder.token, 'posts', { text: 'mine' }, [ownGroup]);
    await settle();

    // No explicit groups → the intruder's own groups only. The owner's secret
    // post must be absent; the intruder's own post present.
    const res = await query(request, intruder.token, 'SELECT doc_id, body FROM posts');
    expect(res.ok(), `query failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
    const data = (await res.json()) as { rows: { doc_id: string; body: { text: string } }[] };
    const ids = data.rows.map((r) => r.doc_id);
    expect(ids).toContain(own.doc_id);
    expect(ids).not.toContain(secret.doc_id);
  });
});

// ---------------------------------------------------------------------------
// The app-contract gate: the query may only touch granted services
// ---------------------------------------------------------------------------

test.describe('Query engine — the app-contract gate', () => {
  test('an ungranted service is 403 (granted service is not)', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'qegate');
    // Grant readAll on posts only — comments is ungranted.
    await addAppContract(request, token, { posts: ['readAll'] });
    const groupId = await createGroup(request, token, 'qe-gate', [{ member_key: username, role: 'owner' }]);
    await settle();

    const denied = await query(request, token, 'SELECT doc_id FROM comments', [groupId]);
    expect(denied.status()).toBe(403);
    expect(await denied.text()).toMatch(/comments/);

    const allowed = await query(request, token, 'SELECT doc_id FROM posts', [groupId]);
    expect(allowed.ok(), `granted service query failed (${allowed.status}) ${await allowed.text().catch(() => '')}`).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The membrane: raw tables / DML / stacked statements never execute
// ---------------------------------------------------------------------------

test.describe('Query engine — the membrane (unsafe queries are 403)', () => {
  test('raw table, DML, and stacked statements are rejected', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'qemembr');
    await addAppContract(request, token, { posts: ['readAll'] });
    const groupId = await createGroup(request, token, 'qe-membr', [{ member_key: username, role: 'owner' }]);
    await settle();

    for (const sql of [
      'SELECT * FROM documents',
      'SELECT * FROM doc_groups',
      'SELECT * FROM file(\'/etc/passwd\')',
      'SELECT doc_id FROM posts; DROP TABLE documents',
      'INSERT INTO posts VALUES (1)',
      'DROP TABLE documents',
    ]) {
      const res = await query(request, token, sql, [groupId]);
      expect(res.status(), `expected 403 for: ${sql}`).toBe(403);
    }
  });

  test('a caller SQL error (unknown column) is 400, not a boundary breach', async ({ request }) => {
    const { username, token } = await signupAndLogin(request, 'qecol');
    await addAppContract(request, token, { posts: ['readAll'] });
    const groupId = await createGroup(request, token, 'qe-col', [{ member_key: username, role: 'owner' }]);
    await settle();

    // `nope` is not a column the boundary CTE exposes → a safe 400.
    const res = await query(request, token, 'SELECT nope FROM posts', [groupId]);
    expect(res.status()).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Anon: the public board is readable without a token (D41)
// ---------------------------------------------------------------------------

test.describe('Query engine — anon (the public board)', () => {
  test('a token-less query reads the discover board', async ({ request }) => {
    // Ensure the node is up + the board exists (a signup boots nothing new,
    // but guarantees the API is reachable).
    await signupAndLogin(request, 'qeanon');
    await settle();

    const res = await query(request, null, 'SELECT doc_id FROM posts');
    expect(res.ok(), `anon query failed (${res.status}) ${await res.text().catch(() => '')}`).toBeTruthy();
    const data = (await res.json()) as { rows: unknown[]; count: number };
    expect(Array.isArray(data.rows)).toBeTruthy();
    expect(typeof data.count).toBe('number');
  });
});
