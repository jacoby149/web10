import { test, expect, type BrowserContext } from '@playwright/test';
import {
  SOCIAL_BASE, DISCOVER_GROUP_ID,
  signupAndLogin, addAppContract, postToGroup,
  createReaction, deleteReaction, setTokenCookie,
} from './helpers/setup';
import {
  discoverBoardTruth, discoverReactionTruth,
  assertDiscoverCardTruth, assertDiscoverBoardHasPost,
  discoverCard, reloadAndSettleDiscover,
} from './helpers/truth-discover';

/**
 * discover — the public board, tortured (gauntlets/discover.md).
 *
 * The discover board is the node-default discover group (D41 — readable by
 * anon), ranked server-side, taking live reactions (the like/dislike pair, the
 * same way of reacting as the feed). The load-bearing assertion is the truth
 * rule — UI == DB at every step, not "the board changed."
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the board read + the board reactions via raw calls — the
 *     data-integrity core, fast, every PR.
 *   - Browser gauntlet: the board reactions via real clicks, truth asserted
 *     after each step + across the reloads — the client proof.
 *   - Multi-user: 2 users like the same board post → the like count is 2 for
 *     BOTH (the board aggregate is public, D41).
 *
 * Stretch (the KB plan's bite 3, not built yet): the view toggle (grid/youtube)
 * + the topic filter — the URL-held (?view=, ?tag=) deep-link persistence.
 */

const postTextFor = (who: string) =>
  `gauntlet discover ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the board read + the board reactions via raw calls (fast, no
// browser). The creator posts to the discover group; the post is on the board;
// a viewer likes then swaps to a dislike — the truth asserted at every step.
// ---------------------------------------------------------------------------

test.describe('discover — API floor', () => {
  test('the board read + the board reactions: post → on the board → like → dislike (swap)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'dga');
    await addAppContract(request, creator.token);
    const postText = postTextFor('api');
    const postId = await postToGroup(request, creator.token, DISCOVER_GROUP_ID, postText);

    // cold: the post is on the board (the discover group read)
    const board = await discoverBoardTruth(request, creator.token);
    expect(board).toContain(postText);

    // cold: no reactions
    let truth = await discoverReactionTruth(request, creator.token, postId, creator.username);
    expect(truth).toEqual({ likeCount: 0, dislikeCount: 0, myLike: false, myDislike: false });

    // a viewer likes the board post → the like count is 1
    const viewer = await signupAndLogin(request, 'dgv');
    await addAppContract(request, viewer.token);
    const likeId = await createReaction(request, viewer.token, postId, 'like');
    truth = await discoverReactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 1, dislikeCount: 0, myLike: true, myDislike: false });

    // the viewer swaps to a dislike → the like count is 0, the dislike count is 1
    await deleteReaction(request, viewer.token, likeId);
    const dislikeId = await createReaction(request, viewer.token, postId, 'dislike');
    expect(dislikeId).not.toBe(likeId);
    truth = await discoverReactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 0, dislikeCount: 1, myLike: false, myDislike: true });
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the board reactions via real clicks (the client proof).
// The truth is asserted after every step + across every reload. The reloads
// are the steps that catch "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('discover — browser gauntlet', () => {
  test('the board reactions: like → RELOAD → dislike (swap) → RELOAD, truth at every step', async ({ browser, request }) => {
    test.setTimeout(90_000);
    const creator = await signupAndLogin(request, 'dgb');
    await addAppContract(request, creator.token);
    const postText = postTextFor('browser');
    const postId = await postToGroup(request, creator.token, DISCOVER_GROUP_ID, postText);

    const viewer = await signupAndLogin(request, 'dgv2');
    await addAppContract(request, viewer.token);

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await page.goto(`${SOCIAL_BASE}/discover`);
    // Settle: the board read is async; wait for the card to render.
    await expect(async () => {
      expect(await discoverCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // 1. cold: the board shows the creator's post, no reactions
    await assertDiscoverBoardHasPost(page, request, viewer.token, postText, true);
    await assertDiscoverCardTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 2. like → like:1, heart on
    await discoverCard(page, postText).locator('[data-testid="like-button"]').click();
    await assertDiscoverCardTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 3. RELOAD → the like persists (like:1, heart on)  ← "refresh my like is gone"
    await reloadAndSettleDiscover(page, postText);
    await assertDiscoverCardTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 4. swap to dislike → like:0, dislike:1, thumb on, heart off
    await discoverCard(page, postText).locator('[data-testid="dislike-button"]').click();
    await assertDiscoverCardTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 5. RELOAD → the swap persists
    await reloadAndSettleDiscover(page, postText);
    await assertDiscoverCardTruth(page, request, viewer.token, postId, viewer.username, postText);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Multi-user (the board aggregate is public, D41) — 2 users like the same
// board post → the like count is 2 for BOTH. The single-user gauntlet could
// never see the aggregate.
// ---------------------------------------------------------------------------

test.describe('discover — multi-user (the board aggregate is public)', () => {
  test('2 users like the same board post → the like count is 2 for BOTH (D41)', async ({ request }) => {
    const creator = await signupAndLogin(request, 'dgm');
    await addAppContract(request, creator.token);
    const postText = postTextFor('multi');
    const postId = await postToGroup(request, creator.token, DISCOVER_GROUP_ID, postText);

    const u1 = await signupAndLogin(request, 'dgu1');
    await addAppContract(request, u1.token);
    const u2 = await signupAndLogin(request, 'dgu2');
    await addAppContract(request, u2.token);

    await createReaction(request, u1.token, postId, 'like');
    await createReaction(request, u2.token, postId, 'like');

    // the board aggregate is public (D41) — both users see the same count of 2
    const t1 = await discoverReactionTruth(request, u1.token, postId, u1.username);
    expect(t1.likeCount).toBe(2);
    expect(t1.myLike).toBe(true);

    const t2 = await discoverReactionTruth(request, u2.token, postId, u2.username);
    expect(t2.likeCount).toBe(2);
    expect(t2.myLike).toBe(true);
  });
});
