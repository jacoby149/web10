import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readCommentsByRef, DISCOVER_GROUP_ID } from './setup';

/**
 * The comments truth primitive (gauntlets/comments.md, the truth rule). The
 * comments counterpart of truth.ts: read the backend truth (the comment docs by
 * ref_value, the same read path the app uses), read the UI state, and compare
 * field-for-field. A gauntlet that asserts a *change* ("the count went up")
 * instead of a *match* ("the count the UI shows is the count the database
 * holds") is a corrupted measure — this is the match.
 *
 * The feed's PostActions does not pass `groups`, so comments are read and
 * written to the discover group — the default read/write group below.
 */

/** The comment truth for a target post (the DB, not the UI). */
export interface CommentTruth {
  count: number;
  /** The comment texts, in the order the DB read returns them. */
  texts: string[];
}

/**
 * Read the backend truth for a target post: the comment docs by ref_value
 * (the same read path the app uses), reduced to the count + the list of
 * comment texts. This is the source of truth, not the UI.
 */
export async function commentTruth(
  request: APIRequestContext,
  token: string,
  postId: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<CommentTruth> {
  const docs = await readCommentsByRef(request, token, postId, groups);
  const texts = docs.map((d) => d.body?.text ?? '');
  return { count: docs.length, texts };
}

/**
 * The full truth assertion: the UI (the comment button's text on the post's
 * card, scoped by the post's text) matches the DB truth, field-for-field. On a
 * mismatch, the failure names the field, the UI value, and the DB value — the
 * break, not a guess.
 *
 * A count of 0 renders as an empty string (`{count || ''}`), so the expected
 * text is '' for 0.
 */
export async function assertCommentTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  postId: string,
  postText: string,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<CommentTruth> {
  const truth = await commentTruth(request, token, postId, groups);
  const card = page.locator('[data-testid="post-card"]').filter({ hasText: postText });
  const commentButton = card.locator('[data-testid="comment-button"]');

  const commentText = (await commentButton.textContent())?.trim() ?? '';
  const expectedCommentText = truth.count > 0 ? String(truth.count) : '';
  expect(
    commentText,
    `comment count text="${commentText}" but DB count=${truth.count}`,
  ).toBe(expectedCommentText);

  return truth;
}

/**
 * The scale assertion (the multi-user rule, the aggregate): the DB holds
 * exactly the expected comment count. No UI — this is the API floor's
 * data-integrity check (the burst, the race). A count that's off by one (a
 * lost update) or doubled (a duplicate row) fails here.
 */
export async function assertCommentAggregate(
  request: APIRequestContext,
  token: string,
  postId: string,
  expectedCount: number,
  groups: string[] = [DISCOVER_GROUP_ID],
): Promise<CommentTruth> {
  const truth = await commentTruth(request, token, postId, groups);
  expect(
    truth.count,
    `DB count=${truth.count} but expected ${expectedCount}`,
  ).toBe(expectedCount);
  return truth;
}

// ── The click-sequence driver (the state machine, made readable) ─────────────

/** The card for a post (scoped by its text). */
export function postCard(page: Page, postText: string) {
  return page.locator('[data-testid="post-card"]').filter({ hasText: postText });
}

/** Click the comment button on a post's card (toggles the thread open/closed). */
export async function clickCommentButton(page: Page, postText: string): Promise<void> {
  await postCard(page, postText).locator('[data-testid="comment-button"]').click();
}

/**
 * Type a comment into the (open) thread's input and send it. The thread appends
 * the comment row + bumps the button only after the write resolves, so this
 * waits for the comment row to render before returning — the done signal the
 * caller's truth assertion relies on.
 */
export async function typeAndSendComment(page: Page, postText: string, text: string): Promise<void> {
  const card = postCard(page, postText);
  const input = card.locator('[data-testid="comment-input"]');
  await input.fill(text);
  await card.locator('[data-testid="comment-send"]').click();
  await expect(card.locator('[data-testid="comment-thread"] li').filter({ hasText: text })).toHaveCount(1);
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
