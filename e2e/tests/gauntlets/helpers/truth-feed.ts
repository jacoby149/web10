import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { appFeedRead } from './setup';

/**
 * The feed truth primitive (gauntlets/feed.md, the truth rule). The feed's
 * truth is the reader's followers groups (minus discover) read as ONE
 * multi-group posts read — the app's exact feed read (readFeed). The
 * load-bearing assertion is UI == DB at every step: the post the database
 * says is in the feed is the post the feed renders, and vice versa. A
 * follow that updates the button but not the membership row, or a membership
 * row that doesn't change the feed, is a bug the UI-only assertion misses —
 * this is the match that catches it.
 *
 * The shape (read DB, read DOM, compare) is the same as truth.ts; the fields
 * are the feed's: the post's presence in the reader's feed.
 */

/**
 * The DB truth for the reader's feed: the list of post texts in the reader's
 * feed (the reader's followers groups minus discover, read as one multi-group
 * posts read). The source of truth, not the UI — the same read path the app
 * uses (readFeed in src/data/feed.ts).
 */
export async function feedTruth(request: APIRequestContext, token: string): Promise<string[]> {
  return appFeedRead(request, token);
}

/** The feed's post card for a post (scoped by its text). */
export function feedPostCard(page: Page, postText: string) {
  return page.locator('[data-testid="post-card"]').filter({ hasText: postText });
}

/**
 * The UI-only presence check (a toPass retry for posts that appear/disappear
 * asynchronously after a follow/unfollow triggers a feed re-read). The page
 * must be on the feed (`${SOCIAL_BASE}/feed`).
 */
export async function assertFeedHasPost(
  page: Page,
  postText: string,
  present: boolean,
  timeout = 20000,
): Promise<void> {
  await expect(async () => {
    const has = (await feedPostCard(page, postText).count()) > 0;
    expect(has, `UI feed ${has ? 'shows' : 'hides'} "${postText}" but expected present=${present}`).toBe(present);
  }).toPass({ timeout });
}

/**
 * The full truth assertion: the DB feed truth and the UI feed both converge to
 * the expected `present`, and the UI reflects the database. On a mismatch, the
 * failure names the field, the UI value, and the DB value — the break, not a
 * guess. The page must be on the feed.
 *
 * Both reads are toPass-settled: the DB read tolerates ClickHouse write
 * latency (a join/leave landing a beat after the click), and the UI read
 * tolerates the async feed re-read. A step that never converges times out —
 * the "follow updated the button but not the membership row" (DB) or "the
 * membership row changed but the feed didn't" (UI) bug, caught as a timeout.
 */
export async function assertFeedTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  postText: string,
  present: boolean,
  timeout = 20000,
): Promise<void> {
  // 1. The DB converges to the expected presence (the anchor).
  await expect(async () => {
    const dbHas = (await feedTruth(request, token)).includes(postText);
    expect(dbHas, `DB feed ${dbHas ? 'has' : 'lacks'} "${postText}" but expected present=${present}`).toBe(present);
  }).toPass({ timeout });

  // 2. The UI converges to the expected presence (the async feed re-read).
  await assertFeedHasPost(page, postText, present, timeout);

  // 3. The load-bearing match: the UI reflects the database.
  const dbHas = (await feedTruth(request, token)).includes(postText);
  const uiHas = (await feedPostCard(page, postText).count()) > 0;
  expect(
    uiHas,
    `UI feed ${uiHas ? 'shows' : 'hides'} "${postText}" but DB ${dbHas ? 'has' : 'lacks'} it`,
  ).toBe(dbHas);
}
