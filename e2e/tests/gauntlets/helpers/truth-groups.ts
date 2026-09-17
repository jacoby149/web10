import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readGroupMembers, readGroupPosts } from './setup';

/**
 * The groups truth primitive (gauntlets/groups.md, the truth rule). The one
 * function the groups gauntlet calls: read the backend truth (the membership
 * rows, the group feed), read the UI state (the member list, the group post
 * cards), compare field-for-field. A gauntlet that asserts a *change* ("the
 * member joined") instead of a *match* ("the member the database holds is the
 * member the UI shows") is a corrupted measure — this is the match.
 *
 * The shape (read DB, read DOM, compare) is the same as truth.ts /
 * truth-feed.ts; the fields are the group's: the membership row (isMember +
 * role) and the group feed (the set of post texts).
 */

/** The membership truth for a member of a group (the DB, not the UI). */
export interface GroupMembershipTruth {
  /** Whether the member has a live `group_members` row. */
  isMember: boolean;
  /** The member's role (null if not a member). */
  role: string | null;
}

/**
 * Read the backend membership truth for a member of a group. The source of
 * truth, not the UI: the `group_members` rows (the same read path the app uses
 * — members/list). `member_key` is the bare username (the join endpoint uses
 * the bare username), so "mine" matches on the username alone; a
 * `provider/username` key still matches (the username is a substring).
 */
export async function groupMembershipTruth(
  request: APIRequestContext,
  token: string,
  groupId: string,
  memberUsername: string,
): Promise<GroupMembershipTruth> {
  const members = await readGroupMembers(request, token, groupId);
  const match = members.find(
    (m) => m.member_key === memberUsername || m.member_key.includes(memberUsername),
  );
  return { isMember: match !== undefined, role: match ? match.role : null };
}

/**
 * The DB truth for a group's feed: the list of post texts in the group (the
 * group's posts, read as a single-group posts read — the same read path the
 * app uses). The source of truth, not the UI.
 */
export async function groupFeedTruth(
  request: APIRequestContext,
  token: string,
  groupId: string,
): Promise<string[]> {
  const docs = await readGroupPosts(request, token, groupId);
  return docs
    .map((d) => d.body.text)
    .filter((t): t is string => t !== undefined);
}

/** The group's post card for a post (scoped by its text). */
export function groupPostCard(page: Page, postText: string) {
  return page.locator('[data-testid="group-post-card"]').filter({ hasText: postText });
}

/**
 * The full truth assertion: the DB group-feed truth and the UI group feed both
 * converge to the expected `present`, and the UI reflects the database. On a
 * mismatch, the failure names the field, the UI value, and the DB value — the
 * break, not a guess. The page must be on the group detail
 * (`${SOCIAL_BASE}/groups/{groupId}`).
 *
 * Both reads are toPass-settled: the DB read tolerates ClickHouse write
 * latency (a post landing a beat after the write), and the UI read tolerates
 * the async group-feed re-read. A step that never converges times out — the
 * "the post was written but the feed didn't" (UI) or "the feed shows it but the
 * DB doesn't" (DB) bug, caught as a timeout.
 */
export async function assertGroupFeedTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  groupId: string,
  postText: string,
  present: boolean,
  timeout = 20000,
): Promise<void> {
  // 1. The DB converges to the expected presence (the anchor).
  await expect(async () => {
    const dbHas = (await groupFeedTruth(request, token, groupId)).includes(postText);
    expect(
      dbHas,
      `DB group feed ${dbHas ? 'has' : 'lacks'} "${postText}" but expected present=${present}`,
    ).toBe(present);
  }).toPass({ timeout });

  // 2. The UI converges to the expected presence (the async group-feed re-read).
  await expect(async () => {
    const uiHas = (await groupPostCard(page, postText).count()) > 0;
    expect(
      uiHas,
      `UI group feed ${uiHas ? 'shows' : 'hides'} "${postText}" but expected present=${present}`,
    ).toBe(present);
  }).toPass({ timeout });

  // 3. The load-bearing match: the UI reflects the database.
  const dbHas = (await groupFeedTruth(request, token, groupId)).includes(postText);
  const uiHas = (await groupPostCard(page, postText).count()) > 0;
  expect(
    uiHas,
    `UI group feed ${uiHas ? 'shows' : 'hides'} "${postText}" but DB ${dbHas ? 'has' : 'lacks'} it`,
  ).toBe(dbHas);
}
