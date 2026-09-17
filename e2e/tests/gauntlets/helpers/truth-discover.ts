import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readDiscoverBoard } from './setup';
import { reactionTruth, type ReactionTruth } from './truth';

/**
 * The discover truth primitive (gauntlets/discover.md, the truth rule). The
 * discover board is the public board (the node-default discover group, D41 —
 * readable by anon), ranked server-side, taking live reactions (the like/
 * dislike pair, the same way of reacting as the feed). The truth here is the
 * board read (the posts on the board) + the reaction docs by ref_value over the
 * discover group (where board reactions are written).
 *
 * The shape — read DB, read DOM, compare — is the same contract as truth.ts;
 * the fields are discover-specific (the board's post set + the card's
 * heart/thumb state + counts).
 */

/**
 * The board read truth (the DB, not the UI): the post texts on the discover
 * board (the discover group). The same read path the app's board uses.
 */
export async function discoverBoardTruth(
  request: APIRequestContext,
  token: string,
): Promise<string[]> {
  const docs = await readDiscoverBoard(request, token);
  return docs.map((d) => d.body.text).filter((t): t is string => t !== undefined);
}

/**
 * The board-reaction truth for a target post + reader (the DB, not the UI).
 * Reuses the reactions truth primitive — a board reaction is the same reaction
 * doc, written to the discover group (the default reaction group).
 */
export async function discoverReactionTruth(
  request: APIRequestContext,
  token: string,
  postId: string,
  readerUsername: string,
): Promise<ReactionTruth> {
  return reactionTruth(request, token, postId, readerUsername);
}

/**
 * The full card truth assertion: the discover card (scoped by the post's text)
 * matches the DB reaction truth, field-for-field — the heart's aria-pressed +
 * like count text, the thumb's aria-pressed + dislike count text. On a mismatch
 * the failure names the field, the UI value, and the DB value.
 *
 * A count of 0 renders as an empty string (`{count || ''}`), so the expected
 * text is '' for 0. The page must be on the discover board.
 */
export async function assertDiscoverCardTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  postId: string,
  readerUsername: string,
  postText: string,
): Promise<ReactionTruth> {
  const truth = await discoverReactionTruth(request, token, postId, readerUsername);
  const card = page.locator('[data-testid="discover-card"]').filter({ hasText: postText });
  const likeButton = card.locator('[data-testid="like-button"]');
  const dislikeButton = card.locator('[data-testid="dislike-button"]');

  const likePressed = (await likeButton.getAttribute('aria-pressed')) === 'true';
  expect(
    likePressed,
    `heart aria-pressed=${likePressed} but DB myLike=${truth.myLike}`,
  ).toBe(truth.myLike);

  const likeText = (await likeButton.textContent())?.trim() ?? '';
  const expectedLikeText = truth.likeCount > 0 ? String(truth.likeCount) : '';
  expect(
    likeText,
    `like count text="${likeText}" but DB likeCount=${truth.likeCount}`,
  ).toBe(expectedLikeText);

  const dislikePressed = (await dislikeButton.getAttribute('aria-pressed')) === 'true';
  expect(
    dislikePressed,
    `thumb aria-pressed=${dislikePressed} but DB myDislike=${truth.myDislike}`,
  ).toBe(truth.myDislike);

  const dislikeText = (await dislikeButton.textContent())?.trim() ?? '';
  const expectedDislikeText = truth.dislikeCount > 0 ? String(truth.dislikeCount) : '';
  expect(
    dislikeText,
    `dislike count text="${dislikeText}" but DB dislikeCount=${truth.dislikeCount}`,
  ).toBe(expectedDislikeText);

  return truth;
}

/**
 * The full board-presence assertion: the post is present/absent in BOTH the DB
 * board read and the UI (the discover cards on the board, scoped by the post's
 * text). On a mismatch the failure names which side (DB / UI) disagreed. The
 * page must be on the discover board.
 */
export async function assertDiscoverBoardHasPost(
  page: Page,
  request: APIRequestContext,
  token: string,
  postText: string,
  present: boolean,
): Promise<void> {
  const boardTexts = await discoverBoardTruth(request, token);
  const inDb = boardTexts.includes(postText);
  expect(
    inDb,
    `post "${postText}" in DB board=${inDb} but expected present=${present}`,
  ).toBe(present);

  const inUi = (await discoverCard(page, postText).count()) > 0;
  expect(
    inUi,
    `post "${postText}" in UI board=${inUi} but expected present=${present}`,
  ).toBe(present);
}

// ── The click-sequence driver (the state machine, made readable) ─────────────

/** The discover card for a post (scoped by its text). */
export function discoverCard(page: Page, postText: string) {
  return page.locator('[data-testid="discover-card"]').filter({ hasText: postText });
}

/**
 * Reload + settle on the discover board. The reload re-reads the board from the
 * backend; the settle waits for the card to re-render (the board read is async).
 * This is the step that catches "I refresh and it's gone."
 */
export async function reloadAndSettleDiscover(page: Page, postText: string, timeout = 20000): Promise<void> {
  await page.reload();
  await expect(async () => {
    expect(await discoverCard(page, postText).count()).toBeGreaterThan(0);
  }).toPass({ timeout });
}
