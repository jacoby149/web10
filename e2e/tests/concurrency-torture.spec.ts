import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * CONCURRENCY TORTURE — the API must handle concurrent requests in PARALLEL,
 * not serialized on a blocked event loop.
 *
 * This is the anti-test for the "Checking node status..." hang fix: the v3
 * endpoints used to be `async def` doing a blocking ClickHouse call, so a burst
 * of concurrent requests serialized on the single-threaded event loop (total
 * time ≈ the SUM of the round-trips). Now they're sync (run in FastAPI's thread
 * pool) with a thread-local ClickHouse client, so a burst runs in parallel
 * (total time ≈ ONE round-trip). 100k users means real concurrency — this
 * proves the endpoints actually run in parallel, and that the thread-local
 * client doesn't cross-contaminate one user's data into another's.
 *
 * Note: a local stack can't sustain production concurrency, but the
 * parallel-vs-serialized distinction is clear at modest N — serialized is ~N×
 * a single round-trip, parallel is ~1×.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const MARKETING_BASE = `http://marketing.localhost${p}`;

const password = 'TestPass123!';
const uniqueUser = (prefix: string) =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

/** Sign up a user, grant the app contract, create their notes group + a note. */
async function setupUser(
  request: APIRequestContext,
  username: string,
): Promise<{ token: string; groupId: string }> {
  await request.post(`${API_BASE}/v3/signup`, {
    data: JSON.stringify({ username, password, phone: '+15550000042' }),
    headers: { 'Content-Type': 'application/json' },
  });
  const login = await request.post(`${API_BASE}/v3/login`, {
    data: JSON.stringify({ username, password }),
    headers: { 'Content-Type': 'application/json' },
  });
  const token = (await login.json()).token as string;
  const groupId = `api.localhost/groups/users/${username}/notes-${username}`;
  await request.post(`${API_BASE}/v3/app-contracts/add`, {
    data: JSON.stringify({
      token,
      allowed_origin: MARKETING_BASE,
      permissions: { notes: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
    }),
    headers: { 'Content-Type': 'application/json', Origin: AUTH_BASE },
  });
  await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token,
      name: `notes-${username}`,
      join_policy: 'invite_only',
      roles: [
        { name: 'owner', services: ['*'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'manageRoles'] },
      ],
      members: [{ member_key: username, role: 'owner' }],
    }),
    headers: { 'Content-Type': 'application/json' },
  });
  await request.post(`${API_BASE}/v3/create`, {
    data: JSON.stringify({
      token,
      service: 'notes',
      body: { note: `note for ${username}` },
      groups: [groupId],
    }),
    headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
  });
  return { token, groupId };
}

async function readNotes(
  request: APIRequestContext,
  token: string,
  groupId: string,
) {
  return request.post(`${API_BASE}/v3/read`, {
    data: JSON.stringify({ token, service: 'notes', groups: [groupId] }),
    headers: { 'Content-Type': 'application/json', Origin: MARKETING_BASE },
  });
}

test.describe('Concurrency torture — the API handles concurrent requests in parallel', () => {
  test('a burst of concurrent reads runs in parallel, not serialized', async ({ request }) => {
    const username = uniqueUser('conc');
    const { token, groupId } = await setupUser(request, username);

    // Measure the single-request time (a few samples for a stable estimate).
    let tSingle = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = Date.now();
      await readNotes(request, token, groupId);
      tSingle += Date.now() - t0;
    }
    tSingle /= 3;

    // Fire N concurrent reads.
    const N = 20;
    const t1 = Date.now();
    const results = await Promise.all(
      Array.from({ length: N }, () => readNotes(request, token, groupId)),
    );
    const tTotal = Date.now() - t1;

    // Correctness: every request returns the note.
    for (const res of results) {
      expect(res.ok()).toBeTruthy();
      const docs = await res.json();
      expect(docs.length).toBe(1);
      expect(docs[0].body.note).toBe(`note for ${username}`);
    }

    // Parallel, not serialized: the burst took much less than N × single.
    // Serialized ≈ N × tSingle; parallel ≈ tSingle. A 0.5×N threshold is 10×
    // looser than the serialized time, so it's robust to timing variance.
    expect(
      tTotal,
      `burst of ${N} reads took ${tTotal}ms; one read is ~${Math.round(tSingle)}ms, so serialized would be ~${Math.round(N * tSingle)}ms. The endpoints must run in parallel (thread pool), not block the event loop.`,
    ).toBeLessThan(N * tSingle * 0.5);
  });

  test('concurrent reads for DIFFERENT users do not cross-contaminate (thread-local client)', async ({ request }) => {
    // Set up several users, each with their own note.
    const users = Array.from({ length: 5 }, (_, i) => uniqueUser(`concu${i}`));
    const setup = await Promise.all(users.map((u) => setupUser(request, u)));

    // Fire concurrent reads for every user, all at once (3 reads each).
    const N_PER_USER = 3;
    const reads = setup.flatMap(({ token, groupId }) =>
      Array.from({ length: N_PER_USER }, () => readNotes(request, token, groupId)),
    );
    const results = await Promise.all(reads);

    // Correctness: each user's reads return THEIR note — the thread-local
    // client must not leak one user's connection/data into another's request.
    for (let i = 0; i < setup.length; i++) {
      for (let j = 0; j < N_PER_USER; j++) {
        const res = results[i * N_PER_USER + j];
        expect(res.ok()).toBeTruthy();
        const docs = await res.json();
        expect(docs.length).toBe(1);
        expect(docs[0].body.note).toBe(`note for ${users[i]}`);
      }
    }
  });
});
