import { test, expect, type BrowserContext, type APIRequestContext } from '@playwright/test';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN,
  signupAndLogin, addAppContract, createDmGroup, postToGroup, setTokenCookie,
} from './helpers/setup';
import { dmTruth, assertDmTruth } from './helpers/truth-messages';

/**
 * messages — the DM state machine, tortured (gauntlets/messages.md).
 *
 * The load-bearing assertion is the truth rule — UI == DB at every step, not
 * "the message appeared." A DM is a `posts` doc in a 2-member DM group; the
 * CRUD read of that group is the source of truth, and the P2P fast path must
 * agree with it.
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the DM round-trip via raw calls (A sends → B reads → B
 *     replies → A reads) + the DM isolation at 10 pairs — the data-integrity
 *     core, fast, every PR.
 *   - Browser gauntlet: the DM round-trip via real clicks (A sends → B
 *     receives → RELOAD → persists), the truth asserted after each step +
 *     across the reload — the client proof.
 *   - Multi-user: the DM isolation at scale (3 users, A↔B and A↔C) — the
 *     "does the message leak across conversations" test.
 *
 * STRETCH (the KB plan's bites 3-4): the P2P (WebRTC) push and the presence
 * dot (Online/Offline) are timing-sensitive and hard to test reliably on a
 * runner. They are NOT covered here — the CRUD source of truth is. The P2P
 * fast path and the presence flip are left as a stretch.
 */

const uniqueText = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Create the DM group exactly the way the app does (dms.ts ensureDmGroup): the
 * deterministic name dm-{sorted} (invite_only, one member role, both
 * participants as BARE-username members). The shared setup.ts createDmGroup
 * uses a different name format ({first}/dm-{second}) + provider-qualified
 * member keys (web10.app/users/{user}), which the app's findDmGroup /
 * listConversations cannot resolve (it matches the name suffix dm-{sorted} and
 * compares member keys to the bare token username) — so the browser gauntlet,
 * which drives the real app, uses this app-exact variant. The API floor uses
 * the shared createDmGroup (it reads by group_id, not by name).
 */
async function createAppDmGroup(
  request: APIRequestContext,
  creatorToken: string,
  a: string,
  b: string,
): Promise<string> {
  const name = `dm-${[a, b].sort().join('-')}`;
  const res = await request.post(`${API_BASE}/v3/groups/create`, {
    data: JSON.stringify({
      token: creatorToken,
      name,
      join_policy: 'invite_only',
      roles: [
        { name: 'member', services: ['posts', 'comments'], permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
      ],
      members: [
        { member_key: a, role: 'member' },
        { member_key: b, role: 'member' },
      ],
    }),
    headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
  });
  if (!res.ok()) throw new Error(`create DM group failed (${res.status})`);
  return (await res.json()).group_id as string;
}

// ---------------------------------------------------------------------------
// API floor — the DM round-trip via raw calls (fast, no browser). The
// data-integrity core: the send/read/reply/read cycle, and the DM isolation
// at 10 pairs (no cross-talk between conversations).
// ---------------------------------------------------------------------------

test.describe('messages — API floor', () => {
  test('the DM round-trip: A sends → B reads → B replies → A reads, truth at every step', async ({ request }) => {
    const a = await signupAndLogin(request, 'dma');
    const b = await signupAndLogin(request, 'dmb');
    await addAppContract(request, a.token);
    await addAppContract(request, b.token);
    const dmGroup = await createDmGroup(request, a.token, a.username, b.username);

    // cold: no messages in the DM group
    let truth = await dmTruth(request, a.token, dmGroup);
    expect(truth.count).toBe(0);
    expect(truth.messages).toEqual([]);

    // A sends a message → it is in the DM group
    const msgA = `gauntlet dm a2b ${uniqueText()}`;
    await postToGroup(request, a.token, dmGroup, msgA);
    truth = await dmTruth(request, a.token, dmGroup);
    expect(truth.count).toBe(1);
    expect(truth.messages).toContain(msgA);

    // B reads the DM → the message is there (B is a member of the DM group)
    const bTruth = await dmTruth(request, b.token, dmGroup);
    expect(bTruth.count).toBe(1);
    expect(bTruth.messages).toContain(msgA);

    // B replies → the reply is in the DM group
    const msgB = `gauntlet dm b2a ${uniqueText()}`;
    await postToGroup(request, b.token, dmGroup, msgB);
    truth = await dmTruth(request, a.token, dmGroup);
    expect(truth.count).toBe(2);
    expect(truth.messages).toContain(msgA);
    expect(truth.messages).toContain(msgB);

    // A reads → the reply is there
    const aTruth = await dmTruth(request, a.token, dmGroup);
    expect(aTruth.count).toBe(2);
    expect(aTruth.messages).toContain(msgB);
  });

  test('DM isolation at 10 pairs: a message in A↔P1 does not leak into any other pair', async ({ request }) => {
    test.setTimeout(120_000);
    // Hub user A + 10 peers → 10 DM pairs.
    const a = await signupAndLogin(request, 'dih');
    await addAppContract(request, a.token);
    const peers: { username: string; token: string }[] = [];
    for (let i = 1; i <= 10; i++) {
      const p = await signupAndLogin(request, `dip${i}`);
      await addAppContract(request, p.token);
      peers.push(p);
    }

    // Create the 10 DM pairs (A↔P1 … A↔P10).
    const groups: string[] = [];
    for (const p of peers) {
      groups.push(await createDmGroup(request, a.token, a.username, p.username));
    }

    // A sends a message in A↔P1.
    const msg = `gauntlet dm iso ${uniqueText()}`;
    await postToGroup(request, a.token, groups[0], msg);

    // The message is in A↔P1.
    const p1Truth = await dmTruth(request, a.token, groups[0]);
    expect(p1Truth.messages).toContain(msg);

    // The message is NOT in any other pair (no cross-talk).
    for (let i = 1; i < groups.length; i++) {
      const otherTruth = await dmTruth(request, a.token, groups[i]);
      expect(
        otherTruth.messages,
        `message leaked into A↔P${i + 1} (group ${groups[i]})`,
      ).not.toContain(msg);
      expect(otherTruth.count).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the DM round-trip via real clicks (the client proof).
// The truth is asserted after each step + across the reload. The reload is
// the step that catches "I refresh and it's gone" (the CRUD source of truth).
// ---------------------------------------------------------------------------

test.describe('messages — browser gauntlet', () => {
  test('DM round-trip: A sends → B receives → RELOAD → the message persists', async ({ browser, request }) => {
    test.setTimeout(90_000);
    const a = await signupAndLogin(request, 'bga');
    const b = await signupAndLogin(request, 'bgb');
    await addAppContract(request, a.token);
    await addAppContract(request, b.token);
    // Create the DM group the way the app does (so the app can find it).
    const dmGroup = await createAppDmGroup(request, a.token, a.username, b.username);

    const msgText = `gauntlet dm ${uniqueText()}`;

    // A opens the messages page; the conversation with B is there.
    const contextA: BrowserContext = await browser.newContext();
    const pageA = await contextA.newPage();
    await setTokenCookie(contextA, 'social.localhost', a.token);
    await pageA.goto(`${SOCIAL_BASE}/messages`);

    const convItemA = pageA.locator('[data-testid="dm-conversation-item"]').filter({ hasText: b.username });
    await expect(convItemA).toBeVisible({ timeout: 20000 });

    // A opens the conversation and sends a message.
    await convItemA.click();
    await expect(pageA.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });
    await pageA.locator('[data-testid="dm-input"]').fill(msgText);
    await pageA.locator('[data-testid="dm-send-button"]').click();

    // The message appears in A's conversation.
    await expect(pageA.locator('[data-testid="dm-message"]').filter({ hasText: msgText })).toBeVisible({ timeout: 20000 });

    // Ensure the message has landed in the DB (CRUD) before B reads it.
    await expect(async () => {
      const truth = await dmTruth(request, a.token, dmGroup);
      expect(truth.messages).toContain(msgText);
    }).toPass({ timeout: 20000 });

    // B opens the messages page in a 2nd context; the conversation with A is
    // there. B opens it → the message is there (assert the truth).
    const contextB: BrowserContext = await browser.newContext();
    const pageB = await contextB.newPage();
    await setTokenCookie(contextB, 'social.localhost', b.token);
    await pageB.goto(`${SOCIAL_BASE}/messages`);

    const convItemB = pageB.locator('[data-testid="dm-conversation-item"]').filter({ hasText: a.username });
    await expect(convItemB).toBeVisible({ timeout: 20000 });
    await convItemB.click();
    await expect(pageB.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });

    await assertDmTruth(pageB, request, b.token, dmGroup, msgText, true);

    // RELOAD B → the message persists (the CRUD source of truth).
    await pageB.reload();
    await expect(pageB.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20000 });
    await assertDmTruth(pageB, request, b.token, dmGroup, msgText, true);

    await contextA.close();
    await contextB.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-user (the multi-user rule) — the DM isolation at scale: 3 users,
// A↔B and A↔C DMs. A message in A↔B must not leak into A↔C.
// ---------------------------------------------------------------------------

test.describe('messages — multi-user (DM isolation)', () => {
  test('a message in A↔B is not in A↔C (the conversations are isolated)', async ({ request }) => {
    const a = await signupAndLogin(request, 'mua');
    const b = await signupAndLogin(request, 'mub');
    const c = await signupAndLogin(request, 'muc');
    await addAppContract(request, a.token);
    await addAppContract(request, b.token);
    await addAppContract(request, c.token);

    const abGroup = await createDmGroup(request, a.token, a.username, b.username);
    const acGroup = await createDmGroup(request, a.token, a.username, c.username);

    // A sends a message in A↔B.
    const msgAB = `gauntlet dm a2b ${uniqueText()}`;
    await postToGroup(request, a.token, abGroup, msgAB);

    // The message is in A↔B.
    const abTruth = await dmTruth(request, a.token, abGroup);
    expect(abTruth.messages).toContain(msgAB);

    // The message is NOT in A↔C (no cross-talk).
    const acTruth = await dmTruth(request, a.token, acGroup);
    expect(acTruth.messages).not.toContain(msgAB);
    expect(acTruth.count).toBe(0);
  });
});
