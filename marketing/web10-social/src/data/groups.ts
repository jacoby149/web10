import { getV3Client, type V3Group } from './v3';
import { extractUsername } from './types';

// ── Group helpers ────────────────────────────────────────────────────────────
// v3 groups are the core primitive. Every social pattern (follows, discover,
// close friends, DMs, communities) is a group with different join policies
// and roles.

const DISCOVER_GROUP = 'web10.app/groups/web10/discover';

/**
 * The current node's provider, read from the active token (falls back to the
 * production host when signed out). Group IDs are node-scoped, so every
 * well-known group the app derives must use the node it is actually talking
 * to — not a hardcoded production host.
 */
export function nodeProvider(): string {
  return getV3Client().readToken()?.provider || 'web10.app';
}

/**
 * Get the followers group ID for a user.
 *
 * The API derives created-group IDs as `{provider}/groups/users/{creator}/{name}`
 * (groups.py create_group), so a followers group created with name "followers"
 * lands at `{provider}/groups/users/{username}/followers`. This must match that
 * derivation exactly or the app's group-scoped reads 403 (the reader is a
 * member of the created group, not of a hardcoded production-host ID).
 */
export function followersGroupId(username: string): string {
  return `${nodeProvider()}/groups/users/${username}/followers`;
}

/**
 * Get the close-friends group ID for a user.
 */
export function closeFriendsGroupId(username: string): string {
  return `web10.app/groups/${username}/close-friends`;
}

/**
 * Get the DM group ID for two users (deterministic, sorted).
 */
export function dmGroupId(a: string, b: string): string {
  const [first, second] = [a, b].sort();
  return `web10.app/groups/${first}/dm-${second}`;
}

// ── Role definitions ─────────────────────────────────────────────────────────
// Each group contract declares its roles. The API assigns 'member' on open
// joins and on initial members without an explicit role (groups.py) — every
// role set below defines a 'member' role, and initial members always carry
// an explicit role.

const FOLLOWER_ROLES = [
  {
    name: 'owner',
    services: ['*'],
    permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
  },
  {
    name: 'member',
    services: ['posts'],
    permissions: ['readAll'],
  },
];

const CLOSE_FRIENDS_ROLES = [
  {
    name: 'owner',
    services: ['*'],
    permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
  },
  {
    name: 'member',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
];

const COMMUNITY_ROLES = [
  {
    name: 'owner',
    services: ['*'],
    permissions: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll', 'manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
  },
  {
    name: 'moderator',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll', 'assignRoles', 'revokeRoles'],
  },
  {
    name: 'page-curator',
    services: ['group-identity-service'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
  {
    name: 'member',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
];

const DM_ROLES = [
  {
    name: 'member',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
];

// ── Ensure groups ────────────────────────────────────────────────────────────

/**
 * Ensure the discover group exists. It's a system group, auto-joined on signup.
 * Returns the group ID (no-op if it exists).
 */
export async function ensureDiscover(): Promise<string> {
  // The discover group is a system group — it should always exist.
  // If it doesn't, the API will create it on first join.
  const w = getV3Client();
  try {
    await w.joinGroup(DISCOVER_GROUP);
  } catch {
    // Already a member — non-fatal
  }
  return DISCOVER_GROUP;
}

/**
 * Ensure the current user's followers group exists.
 * Open join policy — anyone can follow instantly.
 */
export async function ensureFollowers(username: string): Promise<string> {
  const w = getV3Client();
  const groupId = followersGroupId(username);
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    // Group doesn't exist — create it. The API derives the ID as
    // `{provider}/groups/users/{creator}/{name}`, so name must be "followers"
    // (not "{username}/followers") for the created ID to equal followersGroupId.
    await w.createGroup(
      'followers',
      'open',
      FOLLOWER_ROLES,
      [{ member_key: username, role: 'owner' }],
    );
    return groupId;
  }
}

/**
 * Ensure the current user's close-friends group exists.
 * Request join policy — requires approval.
 */
export async function ensureCloseFriends(username: string): Promise<string> {
  const w = getV3Client();
  const groupId = closeFriendsGroupId(username);
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    await w.createGroup(
      `${username}/close-friends`,
      'request',
      CLOSE_FRIENDS_ROLES,
      [{ member_key: `web10.app/users/${username}`, role: 'owner' }],
    );
    return groupId;
  }
}

/**
 * Ensure a DM group exists between two users.
 * Invite-only, both users are members.
 */
export async function ensureDmGroup(usernameA: string, usernameB: string): Promise<string> {
  const w = getV3Client();
  const groupId = dmGroupId(usernameA, usernameB);
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    const [first, second] = [usernameA, usernameB].sort();
    await w.createGroup(
      `${first}/dm-${second}`,
      'invite_only',
      DM_ROLES,
      [
        { member_key: `web10.app/users/${usernameA}`, role: 'member' },
        { member_key: `web10.app/users/${usernameB}`, role: 'member' },
      ],
    );
    return groupId;
  }
}

/**
 * Ensure a community group exists. Creates it if not found.
 */
export async function ensureCommunity(
  name: string,
  joinPolicy: 'open' | 'request' | 'invite_only' = 'request',
  ownerUsername: string,
): Promise<string> {
  const w = getV3Client();
  const groupId = `web10.app/groups/${ownerUsername}/${name}`;
  try {
    const group = await w.getGroup(groupId);
    return group.group_id;
  } catch {
    await w.createGroup(
      name,
      joinPolicy,
      COMMUNITY_ROLES,
      [{ member_key: `web10.app/users/${ownerUsername}`, role: 'owner' }],
    );
    return groupId;
  }
}

// ── Group queries ────────────────────────────────────────────────────────────

/**
 * Get all groups the current user belongs to.
 */
export async function getMyGroups(): Promise<V3Group[]> {
  const w = getV3Client();
  return w.getMyGroups();
}

/**
 * Get groups the current user manages (owner/moderator role).
 */
export async function getGroupsManages(): Promise<V3Group[]> {
  const w = getV3Client();
  return w.getGroupsManages();
}

/**
 * Get feed groups — all groups minus discover.
 */
export async function getFeedGroups(): Promise<string[]> {
  const groups = await getMyGroups();
  return groups
    .filter((g) => g.group_id !== DISCOVER_GROUP)
    .map((g) => g.group_id);
}

/**
 * Get followers groups — groups ending in /followers.
 */
export async function getFollowersGroups(): Promise<string[]> {
  const groups = await getMyGroups();
  return groups
    .filter((g) => g.group_id.endsWith('/followers'))
    .map((g) => g.group_id);
}

/**
 * Get discover group ID.
 */
export function getDiscoverGroupId(): string {
  return DISCOVER_GROUP;
}

// ── Group operations ─────────────────────────────────────────────────────────

/**
 * Join a group (open or request-based).
 */
export async function joinGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.joinGroup(groupId);
}

/**
 * Request to join a group (request/invite-only).
 */
export async function requestJoinGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.requestJoin(groupId);
}

/**
 * Leave a group.
 */
export async function leaveGroup(groupId: string): Promise<void> {
  const w = getV3Client();
  await w.leaveGroup(groupId);
}

/**
 * Get group members.
 */
export async function getGroupMembers(groupId: string) {
  const w = getV3Client();
  return w.getGroupMembers(groupId);
}

/**
 * Invite a member to a group.
 */
export async function inviteMember(groupId: string, memberKey: string, role: string) {
  const w = getV3Client();
  return w.inviteMember(groupId, memberKey, role);
}

/**
 * Accept a group invite.
 */
export async function acceptInvite(groupId: string) {
  const w = getV3Client();
  return w.acceptInvite(groupId);
}

/**
 * Decline a group invite.
 */
export async function declineInvite(groupId: string) {
  const w = getV3Client();
  return w.declineInvite(groupId);
}

/**
 * Get pending join requests for a group.
 */
export async function getJoinRequests(groupId: string) {
  const w = getV3Client();
  return w.getJoinRequests(groupId);
}

/**
 * Approve a join request.
 */
export async function approveJoinRequest(groupId: string, requesterKey: string) {
  const w = getV3Client();
  return w.approveJoinRequest(groupId, requesterKey);
}

/**
 * Deny a join request.
 */
export async function denyJoinRequest(groupId: string, requesterKey: string) {
  const w = getV3Client();
  return w.denyJoinRequest(groupId, requesterKey);
}

/**
 * Block a user in a group.
 */
export async function blockUserInGroup(blockedKey: string, groupId: string) {
  const w = getV3Client();
  return w.blockUserInGroup(blockedKey, groupId);
}

/**
 * Unblock a user in a group.
 */
export async function unblockUserInGroup(blockedKey: string, groupId: string) {
  const w = getV3Client();
  return w.unblockUserInGroup(blockedKey, groupId);
}

/**
 * Set sharing toggle for a group.
 */
export async function setSharing(groupId: string, enabled: boolean) {
  const w = getV3Client();
  return w.setSharing(groupId, enabled);
}

// ── Blocking ─────────────────────────────────────────────────────────────────

/**
 * Block a user globally.
 */
export async function blockUser(blockedKey: string) {
  const w = getV3Client();
  return w.blockUser(blockedKey);
}

/**
 * Unblock a user globally.
 */
export async function unblockUser(blockedKey: string) {
  const w = getV3Client();
  return w.unblockUser(blockedKey);
}