import { test, expect, type BrowserContext } from '@playwright/test';
import {
  SOCIAL_BASE,
  signupAndLogin, addAppContract, createFollowersGroup, postToGroup,
  updatePost, deletePost, readDiscoverBoard, appFeedRead, joinGroup, setTokenCookie,
} from './helpers/setup';
import { postTruth, assertPostTruth, postCard } from './helpers/truth-posts';

/**
 * posts — the create/edit/delete/visibility/repost state machine, tortured
 * (gauntlets/posts.md).
 *
 * A post is a `posts` doc; visibility is controlled by groups (public →
 * discover + the author's followers group; private → the close-friends group).
 * The load-bearing assertion is the truth rule — UI == DB at every step, not
 * "the post changed."
 *
 * Three layers (the ladder + the multi-user rule):
 *   - API floor: the lifecycle via raw calls (create → edit → delete →
 *     re-create), the doc asserted after each step — fast, every PR.
 *   - Browser gauntlet: the lifecycle via the real composer (create → reload →
 *     discover board), truth asserted after each step + across the reload —
 *     the client proof.
 *   - Cross-user: user A posts (public); user B (who follows A) sees it in
 *     B's feed; user D (who does not follow A) does not (I3 at the feed level).
 *
 * Stretch (the KB's bites 3-5, not built here): the image + video variants
 * (the presigned upload to MinIO + the transcode pipeline) and the owner
 * actions from the lightbox (edit/delete/visibility/repost). The card differs
 * per media type; the lifecycle is the same. The "post + reaction at scale"
 * and "visibility at N" multi-user axes live in the scale gauntlet.
 */

const postTextFor = (who: string) => `gauntlet ${who} post ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

// ---------------------------------------------------------------------------
// API floor — the lifecycle via raw calls (fast, no browser). The
// data-integrity core: create → edit → delete → re-create (no tombstone
// collision), the doc asserted after each step.
// ---------------------------------------------------------------------------

test.describe('posts — API floor', () => {
  test('the lifecycle: create → edit → delete → re-create (distinct), the truth holds at every step', async ({ request }) => {
    const viewer = await signupAndLogin(request, 'pga');
    await addAppContract(request, viewer.token);
    const followers = await createFollowersGroup(request, viewer.token, viewer.username);

    // create → exists, text matches
    const text1 = postTextFor('api');
    const postId = await postToGroup(request, viewer.token, followers, text1);
    let truth = await postTruth(request, viewer.token, postId);
    expect(truth).toEqual({ exists: true, text: text1, deleted: false });

    // edit the text → the text changes (the DB reflects the new text)
    const text2 = `${text1} — edited`;
    await updatePost(request, viewer.token, postId, { text: text2 });
    truth = await postTruth(request, viewer.token, postId);
    expect(truth).toEqual({ exists: true, text: text2, deleted: false });

    // delete → gone (tombstone)
    await deletePost(request, viewer.token, postId);
    truth = await postTruth(request, viewer.token, postId);
    expect(truth).toEqual({ exists: false, text: null, deleted: true });

    // create a 2nd post (distinct) → no tombstone collision
    const text3 = postTextFor('api-recreate');
    const postId2 = await postToGroup(request, viewer.token, followers, text3);
    expect(postId2, 'the re-created post must be a distinct doc').not.toBe(postId);
    truth = await postTruth(request, viewer.token, postId2);
    expect(truth).toEqual({ exists: true, text: text3, deleted: false });

    // and the deleted post is still gone (the tombstone held)
    const deletedTruth = await postTruth(request, viewer.token, postId);
    expect(deletedTruth).toEqual({ exists: false, text: null, deleted: true });
  });
});

// ---------------------------------------------------------------------------
// Browser gauntlet — the lifecycle via the real composer (the client proof).
// The truth is asserted after every step + across the reload. The reload is
// the step that catches "I refresh and it's gone."
// ---------------------------------------------------------------------------

test.describe('posts — browser gauntlet', () => {
  test('compose → appears in the feed → RELOAD (persists) → on the discover board', async ({ browser, request }) => {
    test.setTimeout(90_000);
    const viewer = await signupAndLogin(request, 'pbg');
    await addAppContract(request, viewer.token);
    await createFollowersGroup(request, viewer.token, viewer.username);
    const postText = postTextFor('browser');

    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await setTokenCookie(context, 'social.localhost', viewer.token);
    await page.goto(`${SOCIAL_BASE}/feed`);

    // Post via the composer (default visibility: public → discover + followers).
    await page.locator('[data-testid="post-composer"] textarea').fill(postText);
    await page.locator('[data-testid="post-submit"]').click();

    // The post appears in the feed (composing remounts FeedScreen, so the card
    // shows up without a manual refresh).
    await expect(async () => {
      expect(await postCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // The post is public → it's on the discover board. Find its doc_id there
    // (the UI post has no visible doc_id; the discover read is the truth path).
    let postId = '';
    await expect(async () => {
      const board = await readDiscoverBoard(request, viewer.token);
      const mine = board.find((d) => d.body?.text === postText);
      if (!mine) throw new Error('post not yet on the discover board');
      postId = mine.doc_id;
    }).toPass({ timeout: 20000 });

    // 1. create → UI (card present) == DB (post exists, text matches)
    await assertPostTruth(page, request, viewer.token, postId, postText);

    // 2. RELOAD → the post persists ("refresh my post is gone" lives here)
    await page.reload();
    await expect(async () => {
      expect(await postCard(page, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });
    await assertPostTruth(page, request, viewer.token, postId, postText);

    // 3. the post is on the discover board (public) — the DB truth
    const board = await readDiscoverBoard(request, viewer.token);
    expect(board.some((d) => d.body?.text === postText), 'post not on the discover board').toBe(true);

    await context.close();
  });
});

// ---------------------------------------------------------------------------
// Cross-user (the multi-user rule) — user A posts (public); user B (who
// follows A) sees it in B's feed; user D (who does not follow A) does not
// (I3 at the feed level). The single-user gauntlet could never see a post
// that only lands in one user's feed.
// ---------------------------------------------------------------------------

test.describe('posts — cross-user', () => {
  test('A posts (public); B (follows A) sees it in B\'s feed; D (no follow) does not (I3)', async ({ browser, request }) => {
    test.setTimeout(120_000);
    // A posts (public) to A's followers group.
    const a = await signupAndLogin(request, 'pca');
    await addAppContract(request, a.token);
    const aFollowers = await createFollowersGroup(request, a.token, a.username);
    const postText = postTextFor('cross');
    await postToGroup(request, a.token, aFollowers, postText);

    // B follows A (joins A's followers group) → A's post is in B's feed.
    const b = await signupAndLogin(request, 'pcb');
    await addAppContract(request, b.token);
    await createFollowersGroup(request, b.token, b.username);
    await joinGroup(request, b.token, aFollowers);

    // D does NOT follow A → A's post is not in D's feed.
    const d = await signupAndLogin(request, 'pcd');
    await addAppContract(request, d.token);
    await createFollowersGroup(request, d.token, d.username);

    // Feed truth (the API): B's feed has the post, D's feed does not.
    expect(await appFeedRead(request, b.token), 'B\'s feed missing A\'s post').toContain(postText);
    expect(await appFeedRead(request, d.token), 'D\'s feed should not have A\'s post').not.toContain(postText);

    // UI: B's feed shows the card.
    const bContext: BrowserContext = await browser.newContext();
    const bPage = await bContext.newPage();
    await setTokenCookie(bContext, 'social.localhost', b.token);
    await bPage.goto(`${SOCIAL_BASE}/feed`);
    await expect(async () => {
      expect(await postCard(bPage, postText).count()).toBeGreaterThan(0);
    }).toPass({ timeout: 20000 });

    // UI: D's feed does NOT show the card (I3 at the feed level). Wait for the
    // feed to render (the composer is always in the feed), then assert absence.
    const dContext: BrowserContext = await browser.newContext();
    const dPage = await dContext.newPage();
    await setTokenCookie(dContext, 'social.localhost', d.token);
    await dPage.goto(`${SOCIAL_BASE}/feed`);
    await expect(dPage.locator('[data-testid="post-composer"]')).toBeVisible({ timeout: 20000 });
    expect(await postCard(dPage, postText).count(), 'D\'s feed should not show A\'s post').toBe(0);

    await bContext.close();
    await dContext.close();
  });
});
