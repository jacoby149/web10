import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * CONCURRENCY TORTURE — the API must handle a burst of concurrent requests
 * correctly: every request succeeds, with the right data, no cross-talk.
 *
 * This is the anti-test for the thread-pool + thread-local-ClickHouse-client
 * fix (the "Checking node status..." hang). 100k users means real concurrency,
 * so this proves the API survives a burst without errors or data cross-talk.
 *
 * Why NOT a timing assertion ("parallel is faster than serialized"): measured
 * at N=20–60, a concurrent burst is NOT reliably faster than the same requests
 * run sequentially. A single local ClickHouse serializes the queries, HTTP
 * caps at ~6 connections per host, and each worker thread sets up its own
 * connection — so the speedup is small and noisy (0.9–1.2×). Any timing
 * threshold is flaky by construction (a corrupted measure). The robust,
 * physical signal is CORRECTNESS UNDER CONCURRENCY: every request in the burst
 * succeeds, returns the right data, and one user's data never leaks into
 * another's request (the thread-local client holds up).
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

test.describe('Concurrency torture — the API handles a burst of concurrent requests correctly', () => {
  test('a burst of 50 concurrent reads all succeed with correct data', async ({ request }) => {
    const username = uniqueUser('conc');
    const { token, groupId } = await setupUser(request, username);

    // Warm up (establish thread-pool threads + ClickHouse connections).
    for (let i = 0; i < 10; i++) await readNotes(request, token, groupId);

    // Fire a burst of 50 concurrent reads.
    const N = 50;
    const results = await Promise.all(
      Array.from({ length: N }, () => readNotes(request, token, groupId)),
    );

    // Every request succeeds and returns the right note. No 500s, no timeouts,
    // no missing data — the API survived the burst.
    let okCount = 0;
    for (const res of results) {
      expect(res.status(), `a read in the burst returned ${res.status()}`).toBe(200);
      const docs = await res.json();
      expect(docs.length).toBe(1);
      expect(docs[0].body.note).toBe(`note for ${username}`);
      okCount++;
    }
    expect(okCount).toBe(N);
  });

  test('concurrent reads for DIFFERENT users do not cross-contaminate (thread-local client)', async ({ request }) => {
    // Set up several users, each with their own note.
    const users = Array.from({ length: 8 }, (_, i) => uniqueUser(`concu${i}`));
    const setup = await Promise.all(users.map((u) => setupUser(request, u)));

    // Fire concurrent reads for every user, all at once (3 reads each = 24).
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
        expect(res.status(), `user ${users[i]} read ${j} returned ${res.status()}`).toBe(200);
        const docs = await res.json();
        expect(docs.length).toBe(1);
        expect(docs[0].body.note, `user ${users[i]} read ${j} got the wrong note`).toBe(`note for ${users[i]}`);
      }
    }
  });
});
