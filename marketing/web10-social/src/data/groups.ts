import { getV3Client, readTokenCookie, extractDetail, Web10Error, type V3Group, type V3Document } from './v3';
import { extractUsername } from './types';
import { API_HOST, API_ORIGIN } from '../lib/origins';

const LOG = (...args: unknown[]) => console.log('[social:groups]', ...args);

// The group's face (D60) is documents in this app-named service — read/written
// through the normal CRUD path, exactly like `posts`. Publicness is a role
// grant on this service, not a flag.
const GROUP_IDENTITY_SERVICE = 'web10-social-group-identity';

// ── Group helpers ────────────────────────────────────────────────────────────
// v3 groups are the core primitive. Every social pattern (follows, discover,
// close friends, DMs, communities) is a group with different join policies
// and roles.

// The discover board is provider-derived — `{provider}/groups/web10/discover`,
// provider = the node's (the token's provider). See getDiscoverGroupId().

/**
 * The provider that mints this node's group IDs. The API derives a created
 * group's ID from the token's `provider` claim (`{provider}/groups/users/
 * {creator}/{slug}`), so the client must use the same provider to address a
 * group. The token's provider is the source of truth (it is exactly what the
 * API embeds); `API_HOST` is the fallback when no token is loaded yet (the
 * two always agree — the token's provider is the API's own hostname).
 */
function currentProvider(): string {
  try {
    const token = getV3Client().readToken();
    if (token?.provider) return token.provider;
  } catch {
    // No token yet — fall through to the API host.
  }
  return API_HOST;
}

/**
 * Get the followers group ID for a user.
 *
 * The deterministic ID the API derives for a user's followers group:
 * `{provider}/groups/users/{username}/followers`. The `provider` is the node's
 * (the token's provider), NOT a hardcoded host — followers groups are
 * user-created groups, so they live under the provider, unlike the well-known
 * discover board (`web10.app/groups/web10/discover`).
 */
export function followersGroupId(username: string, provider?: string): string {
  const p = provider || currentProvider();
  return `${p}/groups/users/${username}/followers`;
}

/**
 * Get the close-friends group ID for a user.
 *
 * Same derivation as the followers group (a user-created group under the
 * token's provider): `{provider}/groups/users/{username}/close-friends`.
 */
export function closeFriendsGroupId(username: string, provider?: string): string {
  const p = provider || currentProvider();
  return `${p}/groups/users/${username}/close-friends`;
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
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll'] },
  },
];

const CLOSE_FRIENDS_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
];

const COMMUNITY_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'moderator',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'group': ['assignRoles', 'revokeRoles'] },
  },
  {
    name: 'page-curator',
    permissions: { 'web10-social-group-identity': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
];

const DM_ROLES = [
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
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
    await w.joinGroup(getDiscoverGroupId());
  } catch {
    // Already a member — non-fatal
  }
  return getDiscoverGroupId();
}

/**
 * Ensure the current user's followers group exists.
 * Open join policy — anyone can follow instantly.
 *
 * The group is created under the name `followers` (the API embeds the creator
 * in the derived ID: `{provider}/groups/users/{creator}/followers`), so the
 * result matches `followersGroupId(username)`. The owner's member_key is the
 * bare username — the same key format the API uses for joins and discover
 * auto-enrollment — so the owner is found by the membership checks the read
 * path runs.
 *
 * HEAL: a group created by the pre-3.25.1 code has a phantom member key
 * (`web10.app/users/{username}`) that the membership checks never match — the
 * group exists but its owner is NOT a member, so every group-scoped read of
 * it 403s (the profile screen's "nothing persists" state on real nodes).
 * getGroup doesn't require membership, so "the group exists" is not "I can
 * read it": after confirming existence, check membership via getMyGroups and
 * join if missing (open policy; join is idempotent — duplicate member rows
 * dedupe in the ReplacingMergeTree).
 */
export async function ensureFollowers(username: string, provider?: string): Promise<string> {
  const w = getV3Client();
  const groupId = followersGroupId(username, provider);
  try {
    await w.getGroup(groupId);
  } catch {
    // Group doesn't exist — create it (the creator is the owner member)
    await w.createGroup(
      'followers',
      'open',
      FOLLOWER_ROLES,
      [{ member_key: username, role: 'owner' }],
    );
    return groupId;
  }
  // Group exists — make sure the user is actually a member of it.
  const myGroups = await w.getMyGroups();
  if (!myGroups.some((g) => g.group_id === groupId)) {
    console.log('[groups] ensureFollowers — group exists but user is not a member; joining:', groupId);
    await w.joinGroup(groupId);
  }
  return groupId;
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
      'close-friends',
      'request',
      CLOSE_FRIENDS_ROLES,
      [{ member_key: username, role: 'owner' }],
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

// ── Group creation + face (the create-group flow) ────────────────────────────

/** The group's visibility at birth — maps to the initial read grant. */
export type GroupVisibility = 'public' | 'signed_in' | 'private';

/** How a human becomes a member (the group's join policy at birth). */
export type GroupJoinPolicy = 'open' | 'request' | 'invite_only';

/**
 * The community role set. Publicness is a role grant (D58): a `reader` role
 * (read-only on posts + the face) is granted to the `anyone` principal (public)
 * or the `authenticated` principal (signed-in-only) as a reserved member row.
 * The `reader` role is always defined so the grant resolves; `private` simply
 * adds no reserved member row (members only).
 */
const COMMUNITY_CREATE_ROLES = [
  {
    name: 'owner',
    permissions: { '*': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll', 'hideAll'], 'group': ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'] },
  },
  {
    name: 'moderator',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn', 'hideAll'], 'group': ['assignRoles', 'revokeRoles'] },
  },
  {
    name: 'page-curator',
    permissions: { 'web10-social-group-identity': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
  {
    name: 'member',
    permissions: { 'posts': ['readAll', 'create', 'updateOwn', 'deleteOwn'], 'comments': ['readAll', 'create', 'updateOwn', 'deleteOwn'] },
  },
  {
    name: 'reader',
    permissions: { 'posts': ['readAll'], 'web10-social-group-identity': ['readAll'] },
  },
];

export interface CreateGroupInput {
  name: string;
  description?: string;
  website?: string;
  tags?: string[];
  visibility: GroupVisibility;
  /** How a human becomes a member (open / request / invite-only). Defaults to `open`. */
  join_policy?: GroupJoinPolicy;
  banner_ref?: string;
  avatar_ref?: string;
}

/** A clean URL slug for the group name (the group_id's last segment). */
function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Create a community group (the social app's create-group flow). Creates the
 * group with the community role set + a visibility-appropriate reserved read
 * grant, then writes the group's face (the identity doc) if any face fields
 * were provided. The group_id uses a clean slug; the face keeps the pretty
 * name. Returns the group_id.
 */
export async function createCommunityGroup(
  input: CreateGroupInput,
  ownerUsername: string,
): Promise<string> {
  const w = getV3Client();
  const slug = slugify(input.name);
  LOG('createCommunityGroup — start', { name: input.name, slug, visibility: input.visibility });
  const groupId = `web10.app/groups/${ownerUsername}/${slug}`;
  const members: { member_key: string; role: string }[] = [
    { member_key: `web10.app/users/${ownerUsername}`, role: 'owner' },
  ];
  if (input.visibility === 'public') {
    members.push({ member_key: 'anyone', role: 'reader' });
  } else if (input.visibility === 'signed_in') {
    members.push({ member_key: 'authenticated', role: 'reader' });
  }
  // A "public" group is findable: it's listed in the public directory (the D53
  // `discoverable` blasting flag) the moment it's created. Signed-in / private
  // groups stay unlisted (the Settings section's "List in directory" toggle is
  // the manual override for every visibility). This is the fix for "my friend
  // can't find my public group" — public meant readable but never findable.
  const discoverable = input.visibility === 'public';
  const joinPolicy = input.join_policy ?? 'open';
  await w.createGroup(slug, joinPolicy, COMMUNITY_CREATE_ROLES, members, { discoverable });
  LOG('createCommunityGroup — created', groupId, { discoverable, joinPolicy });
  const face: GroupIdentity = {
    name: input.name,
    description: input.description || undefined,
    website: input.website || undefined,
    tags: input.tags && input.tags.length ? input.tags : undefined,
    banner_ref: input.banner_ref || undefined,
    avatar_ref: input.avatar_ref || undefined,
  };
  await writeGroupIdentity(groupId, face);
  LOG('createCommunityGroup — face written', groupId);
  return groupId;
}

/**
 * Write (or replace) a group's face — a document in the
 * `web10-social-group-identity` service. The detail screen reads the latest
 * doc, so a fresh create is a "replace".
 */
export async function writeGroupIdentity(groupId: string, identity: GroupIdentity): Promise<void> {
  const w = getV3Client();
  LOG('writeGroupIdentity — start', groupId, { name: identity.name });
  const body: Record<string, unknown> = {};
  if (identity.name) body.name = identity.name;
  if (identity.description) body.description = identity.description;
  if (identity.website) body.website = identity.website;
  if (identity.tags && identity.tags.length) body.tags = identity.tags;
  if (identity.banner_ref) body.banner_ref = identity.banner_ref;
  if (identity.avatar_ref) body.avatar_ref = identity.avatar_ref;
  await w.create(GROUP_IDENTITY_SERVICE, body, { groups: [groupId] });
  LOG('writeGroupIdentity — done', groupId);
}

/**
 * Read a single group's posts (the group feed). The group feed is a plain
 * group read — the same read the main feed runs, scoped to one group.
 */
export async function readGroupFeed(groupId: string, limit = 50): Promise<V3Document[]> {
  const w = getV3Client();
  LOG('readGroupFeed — start', groupId);
  const docs = await w.read('posts', { groups: [groupId], limit });
  LOG('readGroupFeed — got', docs.length, 'posts from', groupId);
  return docs;
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
 * Get feed groups — the followers groups only (the user's own + the ones
 * they follow). The feed is the "following" feed: it shows the user's own
 * posts + posts from people the user follows. DM groups, community groups,
 * and close-friends groups are NOT part of the feed — they surface in the
 * Messages and Groups screens respectively. Including them leaked posts from
 * people the user didn't follow (DM recipients, community members).
 */
export async function getFeedGroups(): Promise<string[]> {
  const groups = await getMyGroups();
  const feedGroups = groups
    .filter((g) => g.group_id.endsWith('/followers'))
    .map((g) => g.group_id);
  LOG('getFeedGroups —', groups.length, 'my groups →', feedGroups.length, 'feed groups (followers only)');
  return feedGroups;
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
  return `${currentProvider()}/groups/web10/discover`;
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
 * Update group settings (join policy, roles, discoverable). The D53 blasting
 * flag (`discoverable`) is what lists a group in the public directory.
 */
export async function updateGroup(
  groupId: string,
  opts?: { join_policy?: string; roles?: Record<string, unknown>[]; discoverable?: boolean },
) {
  const w = getV3Client();
  return w.updateGroup(groupId, opts);
}

/**
 * Add a member (or a reserved principal-class row like `anyone` /
 * `authenticated` — the D58 read grant).
 */
export async function addGroupMember(groupId: string, memberKey: string, role: string) {
  const w = getV3Client();
  return w.addGroupMember(groupId, memberKey, role);
}

/**
 * Remove a member (or a reserved principal-class row).
 */
export async function removeGroupMember(groupId: string, memberKey: string) {
  const w = getV3Client();
  return w.removeGroupMember(groupId, memberKey);
}

/**
 * Delete a group (owner only — the `deleteGroup` op under the `'group'` key).
 */
export async function deleteGroup(groupId: string) {
  const w = getV3Client();
  return w.deleteGroup(groupId);
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

// ── The group directory + detail (D53) ────────────────────────────────────────
// The node's public group store: `GET /v3/groups/directory` (anon, the minimal
// list of discoverable groups) and `GET /v3/groups/detail?group_id=` (the
// flexible, principal-based read — metadata always, posts only for members,
// only a non-existent group 404s). These are public GET endpoints (the SDK's
// POST /v3/<action> pattern doesn't cover them), so they're fetched directly
// here — the data module keeps its API, the seam stays inside this file.

/** A row from `GET /v3/groups/directory` — the minimal canonical view.
 *  D60: the directory does NOT return tags (they are app data in the
 *  identity service) — the field is optional for forward-compat. */
export interface GroupDirectoryEntry {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  member_count: number;
  tags?: string[];
  permission_summary: string;
}

/** The group detail (D53 unlisted-model) from `GET /v3/groups/detail`. */
export interface GroupDetail {
  group_id: string;
  name: string;
  owner: string;
  slug: string;
  join_policy: string;
  discoverable: boolean;
  member_count: number;
  roles: Record<string, unknown>[];
  permission_summary: string;
  is_member: boolean;
  posts_state: 'ok' | 'join_to_view';
  posts: V3Document[];
}

/** The group's face (D60: documents in an app-named service, not a table). */
export interface GroupIdentity {
  name?: string;
  description?: string;
  banner_ref?: string;
  avatar_ref?: string;
  website?: string;
  tags?: string[];
}

/**
 * Read the public group directory (discoverable groups, anon).
 */
export async function readGroupDirectory(
  limit = 50,
  offset = 0,
): Promise<GroupDirectoryEntry[]> {
  LOG('readGroupDirectory — start', { limit, offset });
  const res = await fetch(
    `${API_ORIGIN}/v3/groups/directory?limit=${limit}&offset=${offset}`,
    { headers: { 'Content-Type': 'application/json' } },
  );
  if (!res.ok) {
    const detail = await res.text().then(extractDetail).catch(() => null);
    LOG('readGroupDirectory — failed', res.status, detail ?? '');
    throw new Error(detail ?? `Group directory read failed: ${res.status}`);
  }
  const data = (await res.json()) as { groups: GroupDirectoryEntry[] };
  LOG('readGroupDirectory — got', data.groups.length, 'groups');
  return data.groups;
}

/**
 * Read a group's detail (D53 principal-based read). Reads as the current
 * user when a token is present (posts come back for members), else as anon
 * (metadata only). Only a non-existent group 404s.
 */
export async function readGroupDetail(groupId: string): Promise<GroupDetail> {
  LOG('readGroupDetail — start', groupId);
  const token = readTokenCookie();
  const params = new URLSearchParams({ group_id: groupId });
  if (token) params.set('token', token);
  const res = await fetch(`${API_ORIGIN}/v3/groups/detail?${params.toString()}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const detail = await res.text().then(extractDetail).catch(() => null);
    LOG('readGroupDetail — failed', res.status, groupId, detail ?? '');
    // A Web10Error carries the status so the detail screen can still key its
    // "not found" state off a 404 (a ghost group) vs. a real error; the
    // message is the API's detail (informative) with a status fallback.
    throw new Web10Error(detail ?? `Group detail read failed: ${res.status}`, res.status);
  }
  const data = (await res.json()) as GroupDetail;
  LOG('readGroupDetail — got', data.name, {
    is_member: data.is_member,
    posts_state: data.posts_state,
  });
  return data;
}

/**
 * Read a group's face (D60: documents in the `web10-social-group-identity`
 * service). Returns the latest identity doc's body, or an empty object if
 * the group has no face yet.
 */
export async function readGroupIdentity(groupId: string): Promise<GroupIdentity> {
  LOG('readGroupIdentity — start', groupId);
  try {
    const w = getV3Client();
    const docs = await w.read(GROUP_IDENTITY_SERVICE, { groups: [groupId] });
    if (!docs || docs.length === 0) {
      LOG('readGroupIdentity — no identity doc', groupId);
      return {};
    }
    const latest = docs[docs.length - 1];
    const body = (latest.body || {}) as GroupIdentity;
    LOG('readGroupIdentity — got', body.name, { tags: body.tags?.length });
    return body;
  } catch (e) {
    // A 403 (no permission) is expected — the viewer's app contract may not
    // include the identity service. Log without the error message (its "Request
    // failed: 403" text would trip the e2e console-error filter).
    const status = (e as { status?: number })?.status;
    if (status === 403) {
      LOG('readGroupIdentity — no access (expected)');
    } else {
      LOG('readGroupIdentity — unexpected error (non-fatal)', (e as Error)?.message ?? e);
    }
    return {};
  }
}

// ── Community-group filtering ─────────────────────────────────────────────────
// A user's raw group list is mostly infrastructure: their own followers
// group (the follow target), DM groups (the message threads), and the
// node-default discover board. The Groups screen shows the rest — the
// communities the user actually belongs to.

/** The node-default discover board (a board, not a community). */
export function isDiscoverGroup(groupId: string): boolean {
  return groupId === getDiscoverGroupId();
}

/** A user's own followers group (the follow target, not a community). */
export function isFollowersGroup(groupId: string, username?: string): boolean {
  if (!groupId.endsWith('/followers')) return false;
  if (username && !groupId.includes(`/users/${username}/`)) return false;
  return true;
}

/** A DM group (the message threads live here). */
export function isDmGroup(groupId: string): boolean {
  return /\/dm-[^/]+$/.test(groupId);
}

/**
 * A per-user app-storage group — the private group another app (media, notes,
 * sharing, …) creates to hold that user's data for it. The demos name these
 * `{service}-{username}` (e.g. `media-jacoby149`), so the slug ends with the
 * owner's username. These power other apps; they are NOT communities the
 * social app should surface in My Groups.
 */
export function isAppStorageGroup(groupId: string, username?: string): boolean {
  if (!username) return false;
  const slug = groupId.split('/').pop() || '';
  return slug.endsWith(`-${username}`);
}

/** True when the group is infrastructure, not a browsable community. */
export function isInfrastructureGroup(groupId: string, username?: string): boolean {
  return (
    isDiscoverGroup(groupId) ||
    isFollowersGroup(groupId, username) ||
    isDmGroup(groupId) ||
    isAppStorageGroup(groupId, username)
  );
}

/**
 * The user's community groups — `getMyGroups()` minus the infrastructure
 * (discover board, followers groups, DM groups).
 */
export async function getMyCommunityGroups(): Promise<V3Group[]> {
  const token = getV3Client().readToken();
  const groups = await getMyGroups();
  const visible = groups.filter(
    (g) => !isInfrastructureGroup(g.group_id, token?.username),
  );
  LOG('getMyCommunityGroups —', groups.length, 'total,', visible.length, 'visible');
  return visible;
}

/**
 * A display name for a group: the identity name if present, else the slug
 * (the last path segment of the group_id — `{provider}/groups/users/{owner}/{slug}`).
 */
export function groupDisplayName(groupId: string, name?: string): string {
  if (name) return name;
  const parts = groupId.split('/');
  return parts[parts.length - 1] || groupId;
}