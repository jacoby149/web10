import { test, expect, type BrowserContext } from '@playwright/test';
import {
  SOCIAL_BASE,
  signupAndLogin, addAppContract, createFollowersGroup, postToGroup,
  readUserPosts, joinGroup, leaveGroup, readGroupMembers, setTokenCookie,
} from './helpers/setup';
import {
  profilePostSetTruth, followStateTruth,
  assertProfilePostSetTruth, assertFollowButtonTruth,
} from './helpers/truth-profile';

/**
 * profile — the follow, the face, and the profile's post set, tortured
 * (gauntlets/profile.md).
 *
 * The load-bearing assertion is the truth rule — UI == DB at every step, not
 * "the profile changed." A follow is a join of the creator's followers group;
 * the profile's post set is the creator's own public posts in that group.
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the follow (membership row) + the post set via raw calls,
 *     asserted after each step — fast, every PR.
 *   - Browser gauntlet: the follow driven by a real click, the post set
 *     rendered, the truth asserted after each step + across the reload — the
 *     client proof.
 *   - Multi-user: the follow burst (10 users follow in parallel) → 11 members,
 *     no duplicate rows, every follower reads the same post set.
 *
 * The face (avatar/banner — the KB plan's bite 3) is the stretch: it needs the
 * media-upload path (uploadMedia + avatar_ref/banner_ref resolution), which is
 * built separately. The core (follow + post set + follow burst) is here.
 */

const postTextFor = (who: string) => `gauntlet ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the follow (membership row) + the post set via raw calls. The
// data-integrity core: the join/leave toggle on the followers group and the
// creator's public post set, asserted after every step.
// ---------------------------------------------------------------------------

test.describe('profile — API floor', () => {
  test('follow → membership + post set; unfollow → membership gone', async ({ request }) => {
    // Creator signs up, creates their followers group, and posts.
    const creator = await signupAndLogin(request, 'pfa');
    await addAppContract(request, creator.token);
    const creatorFollowers = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('api');
    await postToGroup(request, creator.token, creatorFollowers, postText);

    // Viewer signs up.
    const viewer = await signupAndLogin(request, 'pfb');
    await addAppContract(request, viewer.token);

    // cold: the viewer is NOT a member of the creator's followers group.
    let follow = await followStateTruth(request, creator.token, viewer.username, creatorFollowers);
    expect(follow.isFollowing).toBe(false);

    // And the creator's post is NOT in the viewer's read of the creator's
    // profile post set — the viewer can't read the followers group yet (403).
    let viewerSeesPost = false;
    try {
      const viewerPosts = await readUserPosts(request, viewer.token, creator.username);
      viewerSeesPost = viewerPosts.some((d) => d.body.text === postText);
    } catch {
      viewerSeesPost = false; // the read is denied — the post is not visible
    }
    expect(viewerSeesPost).toBe(false);

    // viewer follows (joins the creator's followers group) → the viewer IS a member.
    await joinGroup(request, viewer.token, creatorFollowers);
    follow = await followStateTruth(request, creator.token, viewer.username, creatorFollowers);
    expect(follow.isFollowing).toBe(true);

    // The creator's post IS in the creator's profile post set (read as the creator).
    const creatorPosts = await profilePostSetTruth(request, creator.token, creator.username);
    expect(creatorPosts).toContain(postText);

    // viewer unfollows (leaves) → not a member again.
    await leaveGroup(request, viewer.token, creatorFollowers);
    follow = await followStateTruth(request, creator.token, viewer.username, creatorFollowers);
    expect(follow.isFollowing).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the follow driven by a real click (the client proof). The
// truth is asserted after each step + across the reload. The reload is the step
// that catches "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('profile — browser gauntlet', () => {
  test('follow → post set → RELOAD → the follow + the post persist', async ({ browser, request }) => {
    test.setTimeout(120_000);
    // Creator signs up, adds the app contract, creates the followers group, posts.
    const creator = await signupAndLogin(request, 'pfb');
    await addAppContract(request, creator.token);
    const creatorFollowers = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('browser');
    await postToGroup(request, creator.token, creatorFollowers, postText);

    // Viewer signs up, adds the app contract.
    const viewer = await signupAndLogin(request, 'pfc');
    await addAppContract(request, viewer.token);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await page.goto(`${SOCIAL_BASE}/u/${creator.username}`);

    // Settle: the profile read is async; wait for the follow button to render.
    const followButton = page.locator('[data-testid="follow-button"]');
    await expect(followButton).toBeVisible({ timeout: 20000 });

    // 1. cold: the viewer is not following → the button reads "Follow".
    await assertFollowButtonTruth(page, request, creator.token, viewer.username, creatorFollowers);

    // 2. click follow → the button reads "Following".
    await followButton.click();
    await expect(followButton).toHaveText(/Following/, { timeout: 20000 });
    await assertFollowButtonTruth(page, request, creator.token, viewer.username, creatorFollowers);

    // 3. RELOAD → the profile re-reads the creator's followers group (the
    //    viewer can only read it now that they're a member), so the post set
    //    renders. The follow state + the post both persist across the reload.
    await page.reload();
    await expect(followButton).toBeVisible({ timeout: 20000 });
    await expect(followButton).toHaveText(/Following/, { timeout: 20000 });
    await expect(async () => {
      expect(await page.locator('[data-testid="profile-post-cell"]').filter({ hasText: postText }).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // The creator's post is in the creator's profile (the grid cell is there).
    await assertProfilePostSetTruth(page, request, viewer.token, creator.username, postText, true);
    // The follow state persists (the button still reads "Following").
    await assertFollowButtonTruth(page, request, creator.token, viewer.username, creatorFollowers);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-user (the multi-user rule) — the follow burst: 10 users follow a
// creator in parallel. The aggregate must be exactly 11 members (10 + the
// creator), with no duplicate rows, and every follower reads the same post set.
// ---------------------------------------------------------------------------

test.describe('profile — multi-user (the follow burst)', () => {
  test('10 users follow in parallel → 11 members, no dupes, all read the post set', async ({ request }) => {
    test.setTimeout(120_000);
    const creator = await signupAndLogin(request, 'pfc');
    await addAppContract(request, creator.token);
    const creatorFollowers = await createFollowersGroup(request, creator.token, creator.username);
    const postText = postTextFor('burst');
    await postToGroup(request, creator.token, creatorFollowers, postText);

    // 10 followers, each with their own token + contract, follow in parallel.
    const followers: { token: string; username: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const u = await signupAndLogin(request, `pff${i}`);
      await addAppContract(request, u.token);
      followers.push(u);
    }
    await Promise.all(followers.map((u) => joinGroup(request, u.token, creatorFollowers)));

    // The creator's followers group has exactly 11 members (10 followers + the
    // creator). get_group_members dedups by member_key, so a length of 11 means
    // 11 distinct members — no duplicate rows (a lost update → 10, a duplicate
    // → 12).
    const members = await readGroupMembers(request, creator.token, creatorFollowers);
    expect(members.length).toBe(11);
    const keys = members.map((m) => m.member_key.split('/').pop() || m.member_key);
    expect(new Set(keys).size).toBe(11); // no duplicate rows
    expect(keys).toContain(creator.username);
    for (const f of followers) expect(keys).toContain(f.username);

    // Each of the 10 followers can read the creator's profile post set (the
    // creator's posts) — the post is present for every follower.
    for (const f of followers) {
      const posts = await profilePostSetTruth(request, f.token, creator.username);
      expect(posts).toContain(postText);
    }
  });
});
