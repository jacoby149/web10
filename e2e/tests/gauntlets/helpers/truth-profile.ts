import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { readUserPosts, readGroupMembers } from './setup';

/**
 * The profile truth primitive (gauntlets/profile.md). The one rule — UI ==
 * backend truth at every step — applied to the profile surface: the follow
 * (a join of the creator's followers group) and the profile's post set (the
 * creator's public posts in their followers group).
 *
 * Shape mirrors helpers/truth.ts: read DB, read DOM, compare field-for-field.
 * On a mismatch the failure names the field, the UI value, and the DB value.
 */

/**
 * The DB truth for a user's profile post set: the texts of the user's public
 * posts (their followers group), via the same read path the app uses
 * (`readUserPosts`). The `token` must be able to read the user's followers
 * group — the owner always can, and so can any member (a follower).
 */
export async function profilePostSetTruth(
  request: APIRequestContext,
  token: string,
  username: string,
): Promise<string[]> {
  const docs = await readUserPosts(request, token, username);
  return docs.map((d) => d.body.text).filter((t): t is string => t !== undefined);
}

/**
 * The DB truth for the viewer's follow state on the creator: whether the
 * viewer is a member of the creator's followers group (a follow is a join of
 * that group — see src/data/follows.ts). The `token` must be able to list the
 * group's members: the creator (owner) always can, so pass the creator's token.
 */
export async function followStateTruth(
  request: APIRequestContext,
  token: string,
  viewerUsername: string,
  creatorFollowersGroupId: string,
): Promise<{ isFollowing: boolean }> {
  const members = await readGroupMembers(request, token, creatorFollowersGroupId);
  const isFollowing = members.some((m) => {
    const key = m.member_key.split('/').pop() || m.member_key;
    return key === viewerUsername;
  });
  return { isFollowing };
}

/**
 * The full profile-post-set assertion: the DB post set (`readUserPosts`) and
 * the UI (the profile's insta-grid cells, scoped by the post's text) both agree
 * on whether the post is present. On a mismatch, names the field + UI value +
 * DB value — the break, not a guess.
 */
export async function assertProfilePostSetTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  username: string,
  postText: string,
  present: boolean,
): Promise<string[]> {
  const dbPosts = await profilePostSetTruth(request, token, username);
  const dbHas = dbPosts.includes(postText);

  const cell = page.locator('[data-testid="profile-post-cell"]').filter({ hasText: postText });
  const uiHas = (await cell.count()) > 0;

  expect(
    uiHas,
    `profile post set: UI has post "${postText}"=${uiHas} but expected present=${present} (DB has it=${dbHas})`,
  ).toBe(present);
  expect(
    dbHas,
    `profile post set: DB has post "${postText}"=${dbHas} but expected present=${present} (UI has it=${uiHas})`,
  ).toBe(present);

  return dbPosts;
}

/**
 * The full follow-button assertion: the DB follow state (the membership row in
 * the creator's followers group) and the UI (the follow button's label) match.
 * The label is "Following" when the viewer is a member, "Follow" otherwise.
 *
 * NOTE: the button shows a spinner (empty label) while `followLoading` is true,
 * so the caller must let the button settle to its text label before calling
 * this (wait for the expected text in the spec).
 */
export async function assertFollowButtonTruth(
  page: Page,
  request: APIRequestContext,
  token: string,
  viewerUsername: string,
  creatorFollowersGroupId: string,
): Promise<{ isFollowing: boolean }> {
  const truth = await followStateTruth(request, token, viewerUsername, creatorFollowersGroupId);
  const button = page.locator('[data-testid="follow-button"]');
  const label = (await button.textContent())?.trim() ?? '';
  const expectedLabel = truth.isFollowing ? 'Following' : 'Follow';
  expect(
    label,
    `follow button label="${label}" but DB isFollowing=${truth.isFollowing} (expected "${expectedLabel}")`,
  ).toBe(expectedLabel);
  return truth;
}
