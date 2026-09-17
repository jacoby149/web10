import { test, expect, type BrowserContext } from '@playwright/test';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN,
  signupAndLogin, addAppContract, createFollowersGroup, postToGroup,
  createComment, deleteReaction, setTokenCookie,
} from './helpers/setup';
import {
  commentTruth, assertCommentTruth, assertCommentAggregate,
  postCard, clickCommentButton, typeAndSendComment, reloadAndSettle,
} from './helpers/truth-comments';

/**
 * comments — the thread state machine, tortured (gauntlets/comments.md).
 *
 * The load-bearing assertion is the truth rule — UI == DB at every step, not
 * "the count changed." The comment count must match the DB count after every
 * send/delete and across every reload.
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the state machine via raw calls + the comment burst (10 users,
 *     no lost updates) — the data-integrity core, fast, every PR.
 *   - Browser gauntlet: the full state machine via real clicks, truth asserted
 *     after each step + across the reloads — the client proof.
 *   - Cross-user: user A comments, user B (separate context) sees it — the
 *     "does B see A" test the single-user gauntlet could never see.
 */

const postTextFor = (who: string) => `gauntlet ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the state machine via raw calls (fast, no browser). The
// data-integrity core: the create/create/delete/delete cycle and the comment
// burst (10 users, no lost updates).
// ---------------------------------------------------------------------------

test.describe('comments — API floor', () => {
  test('the state machine: comment → comment → delete → delete → truth holds at every step', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'cga');
    await addAppContract(request, viewer.token);
    const followers = await createFollowersGroup(request, viewer.token, viewer.username);
    const postId = await postToGroup(request, viewer.token, followers, postTextFor('api'));

    // cold: no comments
    let truth = await commentTruth(request, viewer.token, postId);
    expect(truth.count).toBe(0);
    expect(truth.texts).toEqual([]);

    // comment 1 → count 1
    const c1 = await createComment(request, viewer.token, postId, 'first comment');
    truth = await commentTruth(request, viewer.token, postId);
    expect(truth.count).toBe(1);
    expect(truth.texts).toEqual(['first comment']);

    // comment 2 → count 2
    const c2 = await createComment(request, viewer.token, postId, 'second comment');
    truth = await commentTruth(request, viewer.token, postId);
    expect(truth.count).toBe(2);
    expect([...truth.texts].sort()).toEqual(['first comment', 'second comment'].sort());

    // delete one → count 1
    await deleteReaction(request, viewer.token, c1);
    truth = await commentTruth(request, viewer.token, postId);
    expect(truth.count).toBe(1);
    expect(truth.texts).toEqual(['second comment']);

    // delete the last → count 0
    await deleteReaction(request, viewer.token, c2);
    truth = await commentTruth(request, viewer.token, postId);
    expect(truth.count).toBe(0);
    expect(truth.texts).toEqual([]);
  });

  test('the comment burst: 10 users comment on one post in parallel → the count is exactly 10 (no lost updates)', async ({ request }) => {
    test.setTimeout(120_000);
    const creator = await signupAndLogin(request, 'cgs');
    await addAppContract(request, creator.token);
    const followers = await createFollowersGroup(request, creator.token, creator.username);
    const postId = await postToGroup(request, creator.token, followers, postTextFor('burst'));

    // 10 users, each with their own token + contract, comment on the same post
    // in parallel. The aggregate must be exactly 10 — a lost update (9) or a
    // duplicate (11) fails.
    const commenters: { token: string }[] = [];
    for (let i = 0; i < 10; i++) {
      const u = await signupAndLogin(request, `cgc${i}`);
      await addAppContract(request, u.token);
      commenters.push(u);
    }
    await Promise.all(commenters.map((u, i) => createComment(request, u.token, postId, `burst comment ${i}`)));

    await assertCommentAggregate(request, creator.token, postId, 10);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the full state machine via real clicks (the client
// proof). The truth is asserted after every step + across every reload. The
// reloads are the steps that catch "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('comments — browser gauntlet', () => {
  test('open thread → comment → RELOAD → comment → RELOAD, the count holds at every step', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const viewer = await signupAndLogin(request, 'cgb');
    await addAppContract(request, viewer.token);
    const followers = await createFollowersGroup(request, viewer.token, viewer.username);
    const postText = postTextFor('browser');
    const postId = await postToGroup(request, viewer.token, followers, postText);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await page.goto(`${SOCIAL_BASE}/feed`);
    // Settle: the feed read is async; wait for the post card to render.
    await expect(async () => {
      expect(await postCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // 1. cold: no comments, the button is empty
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 2. open the thread (empty state, count 0)
    await clickCommentButton(page, postText);
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 3. type + send a comment → count 1, the comment renders
    await typeAndSendComment(page, postText, 'gauntlet comment one');
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 4. RELOAD → count 1 survives  ← "refresh my comment is gone" lives here
    await reloadAndSettle(page, postText);
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 5. open the thread again (it closed on reload) → the comment is there
    await clickCommentButton(page, postText);
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 6. send a 2nd comment → count 2
    await typeAndSendComment(page, postText, 'gauntlet comment two');
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    // 7. RELOAD → count 2 survives
    await reloadAndSettle(page, postText);
    await assertCommentTruth(page, request, viewer.token, postId, postText);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Cross-user (the multi-user rule) — user A comments, user B (separate
// context) sees it. The single-user gauntlet could never see a comment that
// only updates A's count.
// ---------------------------------------------------------------------------

test.describe('comments — cross-user', () => {
  test('user A comments; user B (who follows A) sees it, then B comments → both see 2', async ({ browser, request }) => {
    test.setTimeout(90_000);
    // Creator A posts; viewer B follows A.
    const a = await signupAndLogin(request, 'cga2');
    await addAppContract(request, a.token);
    const aFollowers = await createFollowersGroup(request, a.token, a.username);
    const postText = postTextFor('cross');
    const postId = await postToGroup(request, a.token, aFollowers, postText);

    const b = await signupAndLogin(request, 'cgb2');
    await addAppContract(request, b.token);
    // B follows A (joins A's followers group) so A's post is in B's feed.
    await (await request.post(`${API_BASE}/v3/groups/join`, {
      data: JSON.stringify({ token: b.token, group_id: aFollowers }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    })).json();

    // A comments on the post (via the API — A's action).
    await createComment(request, a.token, postId, 'comment from A');

    // B opens the feed in a separate context → B's view of the post shows A's
    // comment (count 1).
    const context = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', b.token);
    await page.goto(`${SOCIAL_BASE}/feed`);
    await expect(async () => {
      expect(await postCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // B's view: the comment count is 1 (A's comment).
    await assertCommentTruth(page, request, b.token, postId, postText);

    // B opens the thread → A's comment is there.
    await clickCommentButton(page, postText);
    await expect(page.locator('[data-testid="comment-thread"]')).toContainText('comment from A');

    // B comments → the thread shows both, count 2.
    await typeAndSendComment(page, postText, 'comment from B');
    await assertCommentTruth(page, request, b.token, postId, postText);

    // The aggregate is 2 for both users (A's + B's).
    await assertCommentAggregate(request, a.token, postId, 2);
    await assertCommentAggregate(request, b.token, postId, 2);

    await context.close();
  });
});
