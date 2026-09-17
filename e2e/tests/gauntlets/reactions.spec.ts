import { test, expect, type BrowserContext } from '@playwright/test';
import {
  API_BASE, SOCIAL_BASE, SOCIAL_ORIGIN,
  signupAndLogin, addAppContract, createFollowersGroup, postToGroup,
  createReaction, deleteReaction, readReactionsByRef, setTokenCookie,
} from './helpers/setup';
import {
  reactionTruth, assertReactionTruth, assertReactionAggregate,
  clickLike, clickDislike, reloadAndSettle, postCard,
} from './helpers/truth';

/**
 * reactions — the like/dislike state machine, tortured (gauntlets/reactions.md).
 *
 * This is the proof gauntlet: the first one built, and the one that would have
 * caught every like bug on the first run (the 28-likes stacking, the
 * forgot-my-like gap, the refresh-gone bug, the swap-delta). The load-bearing
 * assertion is the truth rule — UI == DB at every step, not "the count
 * changed."
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the state machine via raw calls + the mash + the like storm
 *     (100 users) — the data-integrity core, fast, every PR.
 *   - Browser gauntlet: the full state machine via real clicks, truth asserted
 *     after each step + across the reloads — the client proof.
 *   - Cross-user: user A likes, user B (separate context) sees it — the
 *     "does B see A" test the single-user gauntlet could never see.
 */

const postTextFor = (who: string) => `gauntlet ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the state machine via raw calls (fast, no browser). The
// data-integrity core: the create/delete/create toggle, the mash (no
// stacking), and the like storm (100 users, no lost updates).
// ---------------------------------------------------------------------------

test.describe('reactions — API floor', () => {
  test('the state machine: like → unclick → click → the truth holds at every step', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'rga');
    await addAppContract(request, viewer.token);
    const followers = await createFollowersGroup(request, viewer.token, viewer.username);
    const postId = await postToGroup(request, viewer.token, followers, postTextFor('api'));

    // cold: no reactions
    await assertReactionAggregate(request, viewer.token, postId, 0, 0);

    // like → the count is 1, the reader holds a like
    const r1 = await createReaction(request, viewer.token, postId, 'like');
    let truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 1, dislikeCount: 0, myLike: true, myDislike: false });

    // unclick (delete the like) → the count is 0
    await deleteReaction(request, viewer.token, r1);
    truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 0, dislikeCount: 0, myLike: false, myDislike: false });

    // click again → the count is 1 (a fresh doc, not a stack)
    const r2 = await createReaction(request, viewer.token, postId, 'like');
    expect(r2).not.toBe(r1); // a new doc_id, not the deleted one
    truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 1, dislikeCount: 0, myLike: true, myDislike: false });

    // swap: dislike (the like is cleared, the dislike is set)
    await deleteReaction(request, viewer.token, r2);
    const r3 = await createReaction(request, viewer.token, postId, 'dislike');
    truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth).toEqual({ likeCount: 0, dislikeCount: 1, myLike: false, myDislike: true });
    expect(r3).not.toBe(r2);
  });

  test('the mash: 10 rapid-fire toggles settle at 0 or 1, never 10 (the 28-likes bug)', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'rgm');
    await addAppContract(request, viewer.token);
    const followers = await createFollowersGroup(request, viewer.token, viewer.username);
    const postId = await postToGroup(request, viewer.token, followers, postTextFor('mash'));

    // The viewer mashes the like 10 times: like, unclick, like, unclick, …
    // Each like is a create, each unclick is a delete of the current doc.
    let currentId: string | null = null;
    for (let i = 0; i < 10; i++) {
      if (currentId === null) {
        currentId = await createReaction(request, viewer.token, postId, 'like');
      } else {
        await deleteReaction(request, viewer.token, currentId);
        currentId = null;
      }
    }
    // The viewer holds exactly 0 or 1 like (the toggle), not 10. The viewer is
    // the only user, so the like count is the viewer's reaction count.
    const truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth.likeCount).toBeLessThanOrEqual(1);
    expect(truth.myLike).toBe(currentId !== null);
    // The DB has at most 1 live like doc for the viewer (no stacking).
    expect(truth.likeCount).toBe(truth.myLike ? 1 : 0);
  });

  test('the like storm: 100 users like one post in parallel → the count is exactly 100 (no lost updates)', async ({ request }) => {
    test.setTimeout(120_000);
    const creator = await signupAndLogin(request, 'rgs');
    await addAppContract(request, creator.token);
    const followers = await createFollowersGroup(request, creator.token, creator.username);
    const postId = await postToGroup(request, creator.token, followers, postTextFor('storm'));

    // 100 users, each with their own token + contract, like the same post in
    // parallel. The aggregate must be exactly 100 — a lost update (99) or a
    // duplicate (101) fails.
    const likers: { token: string; username: string }[] = [];
    for (let i = 0; i < 100; i++) {
      const u = await signupAndLogin(request, `rgl${i}`);
      await addAppContract(request, u.token);
      likers.push(u);
    }
    // 50 of them unlike → the count is 50 (the tombstone dedup picks the
    // tombstones, the 50 live likes remain). Each user deletes their OWN
    // reaction (the doc_id the create returned — the delete's get_document
    // lookup is by (doc_id, author_key), so the creator's token can't delete
    // a liker's doc).
    const createdIds = await Promise.all(likers.map((u) => createReaction(request, u.token, postId, 'like')));
    await assertReactionAggregate(request, creator.token, postId, 100, 0);
    await Promise.all(
      likers.slice(0, 50).map((u, i) => deleteReaction(request, u.token, createdIds[i])),
    );
    await assertReactionAggregate(request, creator.token, postId, 50, 0);
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the full state machine via real clicks (the client
// proof). The truth is asserted after every step + across every reload. The
// reloads are the steps that catch "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('reactions — browser gauntlet (the full state machine)', () => {
  test('like → unclick → click → RELOAD → unclick → RELOAD → dislike → swap → RELOAD → mash', async ({ browser, request }) => {
    test.setTimeout(120_000);
    const viewer = await signupAndLogin(request, 'rgb');
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

    // 1. cold: no reactions, heart + thumb off
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 2. click like → like:1, heart on
    await clickLike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 3. click like (unclick) → like:0, heart off
    await clickLike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 4. click like → like:1, heart on
    await clickLike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 5. RELOAD → like:1, heart on  ← "refresh my like is gone" lives here
    await reloadAndSettle(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 6. click like (unclick) → like:0, heart off
    await clickLike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 7. RELOAD → like:0, heart off  ← the un-like persists
    await reloadAndSettle(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 8. click dislike → dislike:1, thumb on, heart off
    await clickDislike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 9. click like (swap) → like:1, dislike:0, heart on, thumb off  ← the swap
    await clickLike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 10. RELOAD → like:1, dislike:0, heart on  ← the swap persists
    await reloadAndSettle(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 11. click dislike → dislike:1, thumb on
    await clickDislike(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 12. RELOAD → dislike:1, thumb on
    await reloadAndSettle(page, postText);
    await assertReactionTruth(page, request, viewer.token, postId, viewer.username, postText);

    // 13. MASH ×10 → the reader's reaction settles at 0 or 1 (never 10)
    for (let i = 0; i < 10; i++) await clickLike(page, postText);
    const truth = await reactionTruth(request, viewer.token, postId, viewer.username);
    expect(truth.likeCount).toBeLessThanOrEqual(1);
    expect(truth.myLike).toBe(truth.likeCount === 1);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Cross-user (the multi-user rule) — user A likes, user B (separate context)
// sees it. The single-user gauntlet could never see a like that only updates
// A's count.
// ---------------------------------------------------------------------------

test.describe('reactions — cross-user (does B see A)', () => {
  test('user A likes a post; user B (who follows A) sees the like in B\'s view', async ({ browser, request }) => {
    test.setTimeout(90_000);
    // Creator A posts; viewer B follows A.
    const a = await signupAndLogin(request, 'rga2');
    await addAppContract(request, a.token);
    const aFollowers = await createFollowersGroup(request, a.token, a.username);
    const postText = postTextFor('cross');
    const postId = await postToGroup(request, a.token, aFollowers, postText);

    const b = await signupAndLogin(request, 'rgb2');
    await addAppContract(request, b.token);
    // B follows A (joins A's followers group) so A's post is in B's feed.
    await (await request.post(`${API_BASE}/v3/groups/join`, {
      data: JSON.stringify({ token: b.token, group_id: aFollowers }),
      headers: { 'Content-Type': 'application/json', Origin: SOCIAL_ORIGIN },
    })).json();

    // A likes the post (via the API — A's action).
    await createReaction(request, a.token, postId, 'like');

    // B opens the feed in a separate context → B's view of the post shows the
    // like count of 1 (A's like), and B's heart is off (B hasn't liked).
    const context = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', b.token);
    await page.goto(`${SOCIAL_BASE}/feed`);
    await expect(async () => {
      expect(await postCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // B's view: the like count is 1 (A's like), B's heart is off.
    const truth = await assertReactionTruth(page, request, b.token, postId, b.username, postText);
    expect(truth.likeCount).toBe(1); // A's like is visible to B
    expect(truth.myLike).toBe(false); // B hasn't liked

    // B likes → the count is 2 (A's + B's), B's heart is on.
    await clickLike(page, postText);
    const after = await assertReactionTruth(page, request, b.token, postId, b.username, postText);
    expect(after.likeCount).toBe(2);
    expect(after.myLike).toBe(true);

    // A's view (a second context) also sees 2 — the aggregate is consistent
    // across both users.
    const aContext = await browser.newContext();
    const aPage = await aContext.newPage();
    await setTokenCookie(aContext, 'social.localhost', a.token);
    await aPage.goto(`${SOCIAL_BASE}/feed`);
    await expect(async () => {
      expect(await postCard(aPage, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });
    const aTruth = await assertReactionTruth(aPage, request, a.token, postId, a.username, postText);
    expect(aTruth.likeCount).toBe(2);
    expect(aTruth.myLike).toBe(true); // A's own like

    await context.close();
    await aContext.close();
  });
});
