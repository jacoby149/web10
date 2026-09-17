import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readPostById } from './setup';

/**
 * The posts truth primitive (gauntlets/posts.md, the truth rule). The one
 * function the posts gauntlet calls: read the backend truth (the post doc by
 * doc_id), read the UI state (the post card), compare field-for-field. A
 * gauntlet that asserts a *change* ("the post appeared") instead of a *match*
 * ("the card the UI shows is the post the database holds") is a corrupted
 * measure — this is the match.
 *
 * A post's truth is its existence + its text. A deleted post is a tombstone:
 * `readPostById` returns null → the post is gone. A live post returns its body
 * (the text is `body.text`). The shape (read DB, read DOM, compare) is the same
 * as truth.ts; the fields are the post's: existence + text.
 */

/** The post truth for a target post (the DB, not the UI). */
export interface PostTruth {
  /** Whether the post doc exists (a live post, not a tombstone). */
  exists: boolean;
  /** The post's text (null if deleted or a media-only post). */
  text: string | null;
  /** Whether the post is a tombstone (deleted). */
  deleted: boolean;
}

/**
 * Read the backend truth for a target post. The source of truth, not the UI:
 * the post doc by doc_id (the same read path the app uses — readPostById). A
 * deleted post is a tombstone — `readPostById` returns null → `{ exists: false,
 * text: null, deleted: true }`. A live post → `{ exists: true, text: body.text,
 * deleted: false }`.
 */
export async function postTruth(
  request: APIRequestContext,
  token: string,
  postId: string,
): Promise<PostTruth> {
  const doc = await readPostById(request, token, postId);
  if (!doc || !doc.doc_id) {
    return { exists: false, text: null, deleted: true };
  }
  const text = typeof doc.body?.text === 'string' ? doc.body.text : null;
  return { exists: true, text, deleted: false };
}

/** The card for a post (scoped by its text). The feed can have many posts. */
export function postCard(page: Page, postText: string) {
  return page.locator('[data-testid="post-card"]').filter({ hasText: postText });
}

/**
 * The full truth assertion: the UI (the post card) matches the DB truth,
 * field-for-field. On a mismatch, the failure names the field, the UI value,
 * and the DB value — the break, not a guess.
 *
 * The card is scoped by `postText` for presence. If the post is deleted, the
 * card should be GONE (count 0). If live, the card should be present AND its
 * text content should match the DB text (the edit case: the card shows the
 * current text, not the original — scope by the current text for that step).
 */
export async function assertPostTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  postId: string,
  postText: string,
): Promise<PostTruth> {
  const truth = await postTruth(request, token, postId);

  if (!truth.exists) {
    // Deleted: the card should be gone.
    const count = await postCard(page, postText).count();
    expect(
      count,
      `post card present (${count}) but the DB says the post is deleted (tombstone)`,
    ).toBe(0);
    return truth;
  }

  // Live: the card should be present.
  const count = await postCard(page, postText).count();
  expect(
    count,
    `post card absent (0) but the DB says the post is live (text="${truth.text}")`,
  ).toBeGreaterThan(0);

  // The card's text content matches the DB text (the edit case: the card shows
  // the current text, not the original).
  const cardText = (await postCard(page, postText).first().textContent())?.trim() ?? '';
  expect(
    cardText.includes(truth.text ?? ''),
    `post card text="${cardText}" does not contain the DB text="${truth.text}"`,
  ).toBe(true);

  return truth;
}
