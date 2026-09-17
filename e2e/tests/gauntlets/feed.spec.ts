import { test, expect, type BrowserContext } from '@playwright/test';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN, SERVICE,
  signupAndLogin, addAppContract, createFollowersGroup, postToGroup,
  joinGroup, leaveGroup, readGroupMembers, setTokenCookie,
} from './helpers/setup';
import { feedTruth, assertFeedTruth } from './helpers/truth-feed';

/**
 * feed — the following feed, tortured (gauntlets/feed.md).
 *
 * The feed is the reader's followers groups (minus discover) read as one
 * multi-group posts read. A follow is a join of the creator's followers group;
 * an unfollow is a leave. The load-bearing assertion is the truth rule — UI ==
 * DB at every step: the post the database says is in the feed is the post the
 * feed renders.
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the follow/unfollow delta via raw group joins/leaves + the
 *     follow burst (10 users, no duplicate membership rows) — fast, every PR.
 *   - Browser gauntlet: the follow/unfollow delta via the real follow button,
 *     truth asserted after each step + across the reload — the client proof.
 *   - I3: a stranger who never followed cannot read the creator's followers
 *     group (the post is in neither their DB feed nor their UI feed).
 *
 * Stretch (the D36 knobs, feed.md bite 4): twist Newest → Most Loved, assert
 * the ranking changes + the knob state persists across a reload (?knobs= +
 * the settings service). Not built here — the core (membership + content) is.
 */

const postTextFor = (who: string) => `feed ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the follow/unfollow delta via raw group joins/leaves (fast, no
// browser). Pins the app's exact feed read + the membership → content delta.
// ---------------------------------------------------------------------------

test.describe('feed — API floor', () => {
  test('follow → creator post enters the feed; unfollow → it leaves (feed-read delta)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'fdc');
    await addAppContract(request, creator.token);
    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('api');
    await postToGroup(request, creator.token, followersId, postText);

    const viewer = await signupAndLogin(request, 'fdv');
    await addAppContract(request, viewer.token);

    // cold: the viewer follows nobody → the creator's post is NOT in the feed.
    expect(await feedTruth(request, viewer.token)).not.toContain(postText);

    // follow = join the creator's followers group → the post IS in the feed.
    await joinGroup(request, viewer.token, followersId);
    expect(await feedTruth(request, viewer.token)).toContain(postText);

    // unfollow = leave → the post leaves the feed.
    await leaveGroup(request, viewer.token, followersId);
    expect(await feedTruth(request, viewer.token)).not.toContain(postText);
  });

  test('the follow burst: 10 users follow a creator in parallel → the post is in all 10 feeds, 11 members, no dupes', async ({ request }) => {
    test.setTimeout(120_000);
    const creator = await signupAndLogin(request, 'fdb');
    await addAppContract(request, creator.token);
    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('burst');
    await postToGroup(request, creator.token, followersId, postText);

    // 10 viewers, each with their own token + contract, follow in parallel.
    const viewers: { token: string; username: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const u = await signupAndLogin(request, `fdl${i}`);
      await addAppContract(request, u.token);
      viewers.push(u);
    }
    await Promise.all(viewers.map((u) => joinGroup(request, u.token, followersId)));

    // The creator's post is in every viewer's feed.
    for (const u of viewers) {
      expect(
        await feedTruth(request, u.token),
        `viewer ${u.username} feed missing the creator's post`,
      ).toContain(postText);
    }

    // The followers group has exactly 11 members (10 viewers + the creator),
    // no duplicate rows (the ReplacingMergeTree dedup under concurrent joins).
    const members = await readGroupMembers(request, creator.token, followersId);
    expect(members.length, `expected 11 members, got ${members.length}`).toBe(11);
    const keys = members.map((m) => m.member_key);
    expect(new Set(keys).size, 'duplicate membership rows').toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the real follow/unfollow button, the feed reflects it.
// The truth is asserted after every step + across the reload. The reload is
// the step that catches "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('feed — browser gauntlet', () => {
  test('follow → creator post appears in /feed; RELOAD persists; unfollow → it leaves', async ({ browser, request }) => {
    test.setTimeout(120_000);
    // Creator set up via API (they're "other users", not driven in-browser).
    const creator = await signupAndLogin(request, 'fdb2');
    await addAppContract(request, creator.token);
    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('browser');
    await postToGroup(request, creator.token, followersId, postText);

    // Viewer (pre-authed via the token cookie — no login popup).
    const viewer = await signupAndLogin(request, 'fdbv');
    await addAppContract(request, viewer.token);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await setTokenCookie(context, 'auth.localhost', viewer.token);

    // --- Open the creator's profile, follow through the app (the real button) ---
    await page.goto(`${SOCIAL_BASE}/u/${creator.username}`);
    const followBtn = page.locator('[data-testid="follow-button"]');
    await expect(followBtn).toContainText('Follow');
    await followBtn.click();
    await expect(followBtn).toContainText('Following', { timeout: 10000 });

    // --- The creator's post appears in /feed; UI == DB ---
    await page.goto(`${SOCIAL_BASE}/feed`);
    await assertFeedTruth(page, request, viewer.token, postText, true);

    // --- RELOAD → the post persists (the return run) ---
    await page.reload();
    await assertFeedTruth(page, request, viewer.token, postText, true);

    // --- Unfollow through the app (the real button again) ---
    await page.goto(`${SOCIAL_BASE}/u/${creator.username}`);
    await expect(followBtn).toContainText('Following');
    await followBtn.click();
    await expect(followBtn).toContainText('Follow', { timeout: 10000 });

    // --- The creator's post leaves /feed; UI == DB ---
    await page.goto(`${SOCIAL_BASE}/feed`);
    await assertFeedTruth(page, request, viewer.token, postText, false);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// I3 — a stranger who never followed cannot read the creator's followers
// group. The post is in neither the stranger's DB feed nor their UI feed.
// ---------------------------------------------------------------------------

test.describe('feed — I3 (a stranger cannot read the followers group)', () => {
  test('a stranger who never followed: the creator\'s post is in neither their feed (DB) nor their UI feed', async ({ browser, request }) => {
    test.setTimeout(90_000);
    const creator = await signupAndLogin(request, 'fdi3c');
    await addAppContract(request, creator.token);
    const followersId = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('i3');
    await postToGroup(request, creator.token, followersId, postText);

    const stranger = await signupAndLogin(request, 'fdi3s');
    await addAppContract(request, stranger.token);

    // DB: the stranger's feed does NOT contain the creator's post.
    expect(await feedTruth(request, stranger.token)).not.toContain(postText);

    // I3: a direct read of the creator's followers group is denied —
    // membership is the gate, not a cached feed.
    const directRead = await request.post(`${API_BASE}/v3/read`, {
      data: JSON.stringify({ token: stranger.token, service: SERVICE, groups: [followersId] }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    });
    expect(directRead.status()).toBe(403);

    // UI: the stranger's feed does NOT show the post (UI == DB).
    const context = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', stranger.token);
    await setTokenCookie(context, 'auth.localhost', stranger.token);
    await page.goto(`${SOCIAL_BASE}/feed`);
    await assertFeedTruth(page, request, stranger.token, postText, false);

    await context.close();
  });
});
