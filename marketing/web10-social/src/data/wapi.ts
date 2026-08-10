// ── wapi.ts shim (v3 backward compat) ────────────────────────────────────────
// All v2 exports that components/tests still import. The v3 data layer is the
// real implementation; these shims bridge the gap during migration.

import { getV3Client } from './v3';
import { followersGroupId, getGroupMembers } from './groups';
import { extractUsername, type PostRecord, type ReactionRecord } from './types';

/** @deprecated use getV3Client() */
export function getWapi() {
  return getV3Client();
}

/** @deprecated no-op, v3 doesn't need reset */
export function resetWapi(): void {}

/** @deprecated no-op, v3 doesn't use presigned read cache */
export function clearReadUrlCache(): void {}

/** @deprecated no-op, v3 doesn't use object key derivation */
export function deriveObjectKey(_url: string): string {
  return '';
}

/** @deprecated use createV3Client from v3.ts */
export function createWapiWrapper(): ReturnType<typeof getV3Client> {
  return getV3Client();
}

/** @deprecated v3 uses app contracts, not SMRs */
export function buildSocialServiceSirs(_crossOrigins: string[]): unknown[] {
  return [];
}

// ── Feed / discover backward compat ──────────────────────────────────────────

/** @deprecated no-op, v3 doesn't use schema registry */
export async function registerDefaultSchemas(): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use schema cache */
export function clearSchemaCache(): void {}

/** @deprecated no-op, v3 doesn't use schema cache */
export function getCachedSchema(_name: string): unknown {
  return undefined;
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function createPublicEntry(_entry: unknown): Promise<unknown> {
  return {};
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function queryPublicEntries(_params: unknown): Promise<unknown[]> {
  return [];
}

/** @deprecated no-op, v3 doesn't use public ledger */
export async function deletePublicEntry(_entryId: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function markInboxRead(_id: string): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox */
export async function countUnread(): Promise<number> {
  return 0;
}

/** @deprecated no-op, v3 doesn't use repost ledger */
export async function recordRepost(
  _targetId: string,
  _postAuthor: string,
  _postService: string,
): Promise<void> {}

/** @deprecated no-op, v3 doesn't use inbox fan-out */
export async function fanOutToFollowers(_post: PostRecord): Promise<void> {}

/** @deprecated use readFeed from feed.ts */
export { readFeed, readDiscoverFeed, fetchSuggestedUsers, postToDiscoveryPost } from './feed';

// ── Reactions backward compat ────────────────────────────────────────────────

/** @deprecated use ref_value directly */
export function buildReactionTarget(
  targetId: string,
  _postAuthor?: string,
  _postService?: string,
): string {
  return targetId;
}

// ── Comments backward compat ─────────────────────────────────────────────────

/** @deprecated use ref_value directly */
export function buildCommentTarget(
  postId: string,
  _postAuthor?: string,
  _postService?: string,
): string {
  return postId;
}

// ── Follows backward compat ──────────────────────────────────────────────────

/** @deprecated use isFollowing from follows.ts */
export async function readFollow(username: string, _provider?: string): Promise<{ status: 'active' | 'rejected' } | null> {
  const { isFollowing } = await import('./follows');
  const following = await isFollowing(username);
  return following ? { status: 'active' } : { status: 'rejected' };
}

/** @deprecated use getFollowingCount from follows.ts */
export async function countFollows(): Promise<number> {
  const { getFollowingCount } = await import('./follows');
  return getFollowingCount();
}

/** @deprecated use getFollowersCount from follows.ts */
export async function countFollowers(username: string, _provider?: string): Promise<number> {
  const { getFollowersCount } = await import('./follows');
  return getFollowersCount(username);
}

/** @deprecated use getFollowingCount from follows.ts */
export async function countUserFollowing(username: string, _provider?: string): Promise<number> {
  const members = await getGroupMembers(followersGroupId(username));
  return members.filter((m) => m.role === 'member').length;
}

/** @deprecated use readFollows from follows.ts */
export async function readFollows(): Promise<{ username: string; status: 'active' }[]> {
  const { readFollows } = await import('./follows');
  return readFollows();
}

/** @deprecated use readFollows filtered */
export async function readFollowsByStatus(status: string): Promise<{ username: string; status: string }[]> {
  const follows = await readFollows();
  return follows.filter((f) => f.status === status);
}

/** @deprecated use blockUser from groups.ts */
export async function blockUser(username: string, _provider?: string): Promise<void> {
  const { blockUser: block } = await import('./groups');
  await block(`web10.app/users/${username}`);
}

/** @deprecated no-op, v3 uses leaveGroup */
export async function deleteFollow(username: string, _provider?: string): Promise<void> {
  const { unfollowUser } = await import('./follows');
  await unfollowUser(username);
}

/** @deprecated no-op, v3 doesn't use follow notifications */
export async function updateFollowNotify(_username: string, _provider: string, _notify: boolean): Promise<unknown> {
  return {};
}

// ── Posts backward compat ────────────────────────────────────────────────────

/** @deprecated use readUserPosts from posts.ts */
export async function readUserPublicPosts(username: string, _provider?: string): Promise<PostRecord[]> {
  const { readUserPosts } = await import('./posts');
  return readUserPosts(username);
}

/** @deprecated use readUserPosts from posts.ts */
export async function readUserPostsFromDiscovery(username: string, _provider?: string): Promise<PostRecord[]> {
  const { readUserPosts } = await import('./posts');
  return readUserPosts(username);
}

/** @deprecated use resolveMediaRefs from posts.ts */
export { resolveMediaRefs, refreshMediaUrls, refreshMediaUrl } from './posts';

// ── DMs backward compat ──────────────────────────────────────────────────────

/** @deprecated use sendDmMulti from dms.ts */
export { sendDmMulti, replyAllTargets, classifyThread, type DmFolder } from './dms';

// ── Contacts backward compat ─────────────────────────────────────────────────

/** @deprecated use contacts.ts directly */
export {
  readContacts,
  readContact,
  addContact,
  updateContact,
  deleteContact,
  searchContacts,
  updateContactNote,
  updateContactStatus,
  toggleSpamFlag,
  readSpamFlaggedContacts,
  readContactsForCrm,
  spamFlagUser,
  unspamFlagUser,
} from './contacts';

// ── Discover backward compat ─────────────────────────────────────────────────

/** @deprecated use readDiscoverFeed from feed.ts */
export { readDiscoverFeed as fetchDiscoveryPost } from './feed';

// ── Pull feed backward compat ────────────────────────────────────────────────

/** @deprecated use readFeed from feed.ts */
export { readFeed as readPullFeed } from './feed';