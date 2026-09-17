import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readReactionsByRef, DISCOVER_GROUP_ID } from './setup';

/**
 * The truth primitive (gauntlets/README.md, the truth rule). The one function
 * every gauntlet calls: read the backend truth, read the UI state, compare
 * field-for-field. A gauntlet that asserts a *change* ("the count went up")
 * instead of a *match* ("the count the UI shows is the count the database
 * holds") is a corrupted measure — this is the match.
 *
 * This file is reactions-specific (the proof surface). The shape — read DB,
 * read DOM, compare — is surface-agnostic; a new surface adds its own
 * `<surface>Truth` + `assert<Surface>Truth` here (or in its own file) with the
 * same contract.
 */

/** The reaction truth for a target post + reader (the DB, not the UI). */
export interface ReactionTruth {
  likeCount: number;
  dislikeCount: number;
  /** Whether the reader holds a like (the heart should be filled). */
  myLike: boolean;
  /** Whether the reader holds a dislike (the thumb should be filled). */
  myDislike: boolean;
}

/**
 * Read the backend truth for a target post + reader. The source of truth, not
 * the UI: the reaction docs by ref_value (the same read path the app uses),
 * reduced to the counts + whether the reader holds each.
 *
 * `author_key` is the bare username (v3 — the node's provider is implicit), so
 * "mine" matches on the username alone (the 28-likes / 3.79.3 rule). A
 * `provider/username` key still matches (the username is the last segment).
 */
export async function reactionTruth(
  request: APIRequestContext,
  token: string,
  postId: string,
  readerUsername: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<ReactionTruth> {
  const docs = await readReactionsByRef(request, token, postId, groups);
  let likeCount = 0;
  let dislikeCount = 0;
  let myLike = false;
  let myDislike = false;
  for (const d of docs) {
    const type = d.body?.type || 'like';
    if (type === 'like') likeCount++;
    else if (type === 'dislike') dislikeCount++;
    const author = d.author_key.split('/').pop() || d.author_key;
    if (author === readerUsername) {
      if (type === 'like') myLike = true;
      else if (type === 'dislike') myDislike = true;
    }
  }
  return { likeCount, dislikeCount, myLike, myDislike };
}

/**
 * The full truth assertion: the UI (the heart's aria-pressed, the like count's
 * text, the thumb's aria-pressed, the dislike count's text) matches the DB
 * truth, field-for-field. On a mismatch, the failure names the field, the UI
 * value, and the DB value — the break, not a guess.
 *
 * The card is scoped by the post's text (the feed can have many posts; the
 * like/dislike buttons are per-card). A count of 0 renders as an empty string
 * (`{count || ''}`), so the expected text is '' for 0.
 */
export async function assertReactionTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  postId: string,
  readerUsername: string,
  postText: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<ReactionTruth> {
  const truth = await reactionTruth(request, token, postId, readerUsername, groups);
  const card = page.locator('[data-testid="post-card"]').filter({ hasText: postText });
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
 * The scale assertion (the multi-user rule, the aggregate): the DB holds
 * exactly the expected like + dislike counts. No UI — this is the API floor's
 * data-integrity check (the like storm, the race). A count that's off by one
 * (a lost update) or doubled (a duplicate row) fails here.
 *
 * The assertion RETRIES (polls until the count settles, up to `timeoutMs`)
 * because ClickHouse is eventually consistent: a burst of parallel creates/
 * deletes returns 200 before every row is committed, so a single read right
 * after the burst can undercount. The retry waits for the commit to land
 * (the count converges to the expected value) — a lost update (the count never
 * reaches the expected value) still fails, but a transient undercount doesn't.
 */
export async function assertReactionAggregate(
  request: APIRequestContext,
  token: string,
  postId: string,
  expectedLike: number,
  expectedDislike: number,
  groups: string[] = [DISCOVER_GROUP_ID],
  timeoutMs = 30_000,
): Promise<ReactionTruth> {
  const deadline = Date.now() + timeoutMs;
  let truth = await reactionTruth(request, token, postId, 'nobody', groups);
  while (
    (truth.likeCount !== expectedLike || truth.dislikeCount !== expectedDislike) &&
    Date.now() < deadline
  ) {
    await new Promise((r) => setTimeout(r, 500));
    truth = await reactionTruth(request, token, postId, 'nobody', groups);
  }
  expect(
    truth.likeCount,
    `DB likeCount=${truth.likeCount} but expected ${expectedLike} (after ${timeoutMs}ms)`,
  ).toBe(expectedLike);
  expect(
    truth.dislikeCount,
    `DB dislikeCount=${truth.dislikeCount} but expected ${expectedDislike} (after ${timeoutMs}ms)`,
  ).toBe(expectedDislike);
  return truth;
}

// ── The click-sequence driver (the state machine, made readable) ─────────────

/** The card for a post (scoped by its text). */
export function postCard(page: Page, postText: string) {
  return page.locator('[data-testid="post-card"]').filter({ hasText: postText });
}

/** Click the like button on a post's card. */
export async function clickLike(page: Page, postText: string): Promise<void> {
  await postCard(page, postText).locator('[data-testid="like-button"]').click();
}

/** Click the dislike button on a post's card. */
export async function clickDislike(page: Page, postText: string): Promise<void> {
  await postCard(page, postText).locator('[data-testid="dislike-button"]').click();
}

/**
 * Reload + settle (the return run). The reload re-reads the feed from the
 * backend; the settle waits for the post card to re-render (the feed read is
 * async). This is the step that catches "I refresh and it's gone."
 */
export async function reloadAndSettle(page: Page, postText: string, timeout = 15000): Promise<void> {
  await page.reload();
  await expect(async () => {
    expect(await postCard(page, postText).count()).toBeGreaterThan(0);
  }).toPass({ timeout });
}
