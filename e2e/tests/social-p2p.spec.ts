import { test, expect, chromium, type APIRequestContext } from '@playwright/test';
import { v3Post, v3Login, v3Signup } from '../v3-helpers';

/**
 * Social P2P real-time — the REAL web10-social app, two live accounts,
 * witnessed in the DOM with NO reloads.
 *
 * This is the test the operator asked for: the messages-demo P2P spec
 * (messages-demo.spec.ts) proves the WebRTC PLUMBING (PeerJS + the rtc.
 * localhost signaling server + the data channel) works across two browsers.
 * But it drives the throwaway demo page, not the product. The social app's own
 * P2P wiring — initP2P on sign-in, the sendP2P nudge on send, the onP2PInbound
 * re-read in DmsScreen, and the D69 notification nudge that bumps the badge —
 * has never been e2e-tested with two live accounts. The gauntlet explicitly
 * punted on it ("timing-sensitive ... NOT covered here").
 *
 * This spec closes that gap. Two separate browser instances (WebRTC P2P
 * completes across two browsers but NOT across two contexts in the same
 * browser — Chromium isolates per-context network stacks, so the local ICE
 * check never connects). Both are pre-authed as distinct users, both open the
 * same DM conversation, and the test WITNESSES, in the DOM:
 *
 *   1. A sends → B's notification badge pops to "1" in real time (the D69
 *      nudge), with no reload / navigation on B.
 *   2. A sends → the message lands in B's OPEN thread in real time (the
 *      onP2PInbound re-read), with no reload / navigation on B.
 *   3. The reverse: B replies → A's badge pops to "1" + A's open thread shows
 *      the reply, again with no reload on A.
 *
 * The "no reload" is the whole point: the app has no polling, so the only
 * mechanism that can update B's DOM after A's send is the P2P nudge. The test
 * additionally asserts B logged the inbound P2P handler, so a green run is
 * direct evidence the fast path fired — not a CRUD coincidence.
 */

const port = process.env.E2E_HTTP_PORT || '80';
const p = port === '80' ? '' : `:${port}`;
const API_BASE = `http://api.localhost${p}`;
const AUTH_BASE = `http://auth.localhost${p}`;
const SOCIAL_BASE = `http://social.localhost${p}`;
const SOCIAL_ORIGIN = `http://social.localhost${p}`;
const PROVIDER = 'api.localhost';
const PASSWORD = 'TestPass123!';

// The full social app contract (the exact set the app's login popup grants) —
// it must include 'notifications' (the badge's CRUD cursor) and
// 'web10-social-group-identity' or the app's reads 403.
const SOCIAL_SERVICES = [
  'posts', 'media', 'public_media', 'profile', 'settings',
  'comments', 'reactions', 'contacts', 'staging_posts',
  'web10-social-group-identity', 'notifications',
];
const SOCIAL_OPERATIONS = ['create', 'readAll', 'updateOwn', 'deleteOwn'];

const uniqueUser = (prefix: string) =>
  `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

async function signupAndLogin(
  request: APIRequestContext,
  prefix: string,
): Promise<{ username: string; token: string }> {
  const username = uniqueUser(prefix);
  await v3Signup(request, username, PASSWORD, '+1555' + Math.floor(Math.random() * 10000000));
  const token = await v3Login(request, username, PASSWORD);
  return { username, token };
}

async function addSocialAppContract(request: APIRequestContext, token: string): Promise<void> {
  const res = await v3Post(request, `${API_BASE}/v3/app-contracts/add`, {
    token,
    allowed_origin: SOCIAL_ORIGIN,
    permissions: Object.fromEntries(SOCIAL_SERVICES.map((s) => [s, [...SOCIAL_OPERATIONS]])),
  });
  expect(res.ok(), `app contract add failed (${res.status})`).toBeTruthy();
}

// The app-exact DM group (dms.ts ensureDmGroup): name dm-{sorted}, invite_only,
// one member role, both participants as bare-username members. Pre-created via
// the API so the test isolates the P2P fast path from the group-creation popup
// (the popup flow is covered by the gauntlet).
async function createDmGroup(
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
    headers: { 'Content-Type': 'application/json' },
  });
  expect(res.ok(), `DM group create failed (${res.status})`).toBeTruthy();
  return (await res.json()).group_id as string;
}

function setTokenCookie(context: any, domain: string, token: string): Promise<void> {
  return context.addCookies([
    { name: 'token', value: token, domain, path: '/', secure: false, httpOnly: false },
  ]);
}

function captureConsoleLogs(page: any, prefix: string): string[] {
  const logs: string[] = [];
  page.on('console', (msg: any) => {
    const text = msg.text();
    if (text.includes(prefix)) logs.push(text);
  });
  return logs;
}

// Poll a captured log array until a line matches `needle` (the P2P-ready gate).
// Throws with the logs-so-far on timeout so a failure is diagnosable.
async function waitForLog(logs: string[], needle: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (logs.some((l) => l.includes(needle))) return;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out waiting for log "${needle}". Logs so far:\n${logs.join('\n')}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}

// The mDNS flag is REQUIRED for headless local ICE: without it, Chromium hides
// local IPs behind mDNS .local names for ICE host candidates, which don't
// resolve in the headless environment, so the local ICE check never connects.
// (Same flag the messages-demo P2P tests use.)
const rtcArgs = ['--disable-features=WebRtcHideLocalIpsWithMdns'];

test.describe('Social P2P real-time — two live accounts, witnessed in the DOM (no reloads)', () => {
  test(
    'A messages B: B\'s notification badge pops to 1 AND the message lands in B\'s open thread with no reload (and vice versa)',
    async ({ request }) => {
      test.setTimeout(120_000);
      const A = await signupAndLogin(request, 'p2pa');
      const B = await signupAndLogin(request, 'p2pb');
      await addSocialAppContract(request, A.token);
      await addSocialAppContract(request, B.token);
      await createDmGroup(request, A.token, A.username, B.username);

      const browserA = await chromium.launch({ args: rtcArgs });
      const browserB = await chromium.launch({ args: rtcArgs });
      try {
        const contextA = await browserA.newContext();
        const contextB = await browserB.newContext();
        await setTokenCookie(contextA, 'social.localhost', A.token);
        await setTokenCookie(contextA, 'auth.localhost', A.token);
        await setTokenCookie(contextB, 'social.localhost', B.token);
        await setTokenCookie(contextB, 'auth.localhost', B.token);
        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        const logsA = captureConsoleLogs(pageA, '[social-dms]');
        const logsB = captureConsoleLogs(pageB, '[social-dms]');
        const p2pLogsA = captureConsoleLogs(pageA, '[p2p]');
        const p2pLogsB = captureConsoleLogs(pageB, '[p2p]');
        const pageErrorsA: string[] = [];
        pageA.on('pageerror', (e: any) => pageErrorsA.push(e.message));
        const pageErrorsB: string[] = [];
        pageB.on('pageerror', (e: any) => pageErrorsB.push(e.message));

        // --- Both load /messages (pre-authed, no login popup) ---
        await pageA.goto(`${SOCIAL_BASE}/messages`);
        await pageA.waitForLoadState('networkidle');
        await pageB.goto(`${SOCIAL_BASE}/messages`);
        await pageB.waitForLoadState('networkidle');

        // --- Gate: BOTH local peers are P2P-ready (the initP2P READY log) ---
        await waitForLog(p2pLogsA, 'initP2P — READY', 30_000);
        await waitForLog(p2pLogsB, 'initP2P — READY', 30_000);

        // --- Both open the conversation with each other ---
        const convA = pageA.locator('[data-testid="dm-conversation-item"]', { hasText: B.username });
        const convB = pageB.locator('[data-testid="dm-conversation-item"]', { hasText: A.username });
        await expect(convA).toBeVisible({ timeout: 20_000 });
        await expect(convB).toBeVisible({ timeout: 20_000 });
        await convA.click();
        await convB.click();
        await expect(pageA.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20_000 });
        await expect(pageB.locator('[data-testid="dm-conversation"]')).toBeVisible({ timeout: 20_000 });

        // --- A sends to B (NO reload / navigation on B anywhere) ---
        const msgA = `p2p hello from A ${Date.now()}`;
        await pageA.locator('[data-testid="dm-input"]').fill(msgA);
        await pageA.locator('[data-testid="dm-send-button"]').click();
        // A's own optimistic append (the sender always sees their own message).
        await expect(pageA.locator('[data-testid="dm-message"]').filter({ hasText: msgA })).toBeVisible({ timeout: 15_000 });

        // WITNESS 1: B's notification badge pops to "1" in real time (the D69
        // nudge) — the "message pops up with a (1)" the operator wants.
        await expect(pageB.locator('[data-testid="nav-notifications-badge"]')).toHaveText('1', { timeout: 20_000 });

        // WITNESS 2: B's OPEN thread shows the message in real time (the
        // onP2PInbound re-read) — "immediately message loads in the dm without
        // needing a refresh."
        await expect(pageB.locator('[data-testid="dm-message"]').filter({ hasText: msgA })).toBeVisible({ timeout: 20_000 });

        // WITNESS 3 (it was the P2P fast path, not a CRUD coincidence): B logged
        // the inbound P2P handler that triggered the re-read.
        const bInboundIdx = logsB.findIndex((l) => l.includes('p2p inbound — refreshing'));
        expect(bInboundIdx, 'B must receive the inbound P2P nudge (the fast path)').toBeGreaterThanOrEqual(0);

        // --- B replies to A (NO reload / navigation on A) ---
        const msgB = `p2p reply from B ${Date.now()}`;
        await pageB.locator('[data-testid="dm-input"]').fill(msgB);
        await pageB.locator('[data-testid="dm-send-button"]').click();
        await expect(pageB.locator('[data-testid="dm-message"]').filter({ hasText: msgB })).toBeVisible({ timeout: 15_000 });

        // WITNESS: A's notification badge pops to "1" + A's open thread shows
        // the reply, again with no reload on A.
        await expect(pageA.locator('[data-testid="nav-notifications-badge"]')).toHaveText('1', { timeout: 20_000 });
        await expect(pageA.locator('[data-testid="dm-message"]').filter({ hasText: msgB })).toBeVisible({ timeout: 20_000 });

        // No console errors / uncaught exceptions on either side.
        const errorsA = [...logsA, ...p2pLogsA].filter((l) => l.includes('FAILED') || l.includes('Error'));
        const errorsB = [...logsB, ...p2pLogsB].filter((l) => l.includes('FAILED') || l.includes('Error'));
        expect(errorsA).toEqual([]);
        expect(errorsB).toEqual([]);
        expect(pageErrorsA).toEqual([]);
        expect(pageErrorsB).toEqual([]);
      } finally {
        await browserA.close();
        await browserB.close();
      }
    },
  );
});
