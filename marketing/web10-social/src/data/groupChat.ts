import { getV3Client } from './v3';
import {
  getMyGroups,
  GROUP_TAG,
  readGroupIdentity,
  writeGroupIdentity,
  groupDisplayName,
  slugify,
  type GroupIdentity,
} from './groups';
import { fromV3DocToDm, type DmRecord } from './types';

// ── Group chat data layer (v3) — group-chat.md, D77 ─────────────────────────
// A group chat is an N-member group (the same primitive a DM is — a DM is a
// 2-member `dm-` group). It is distinguished by `kind: 'chat'` on its face
// (the `web10-social-group-identity` doc, D60) and rendered in the Messages
// surface. Messages are `posts` docs in the group, each carrying
// `sender_username` so the thread can attribute every bubble (a DM hides the
// sender because it's implicit; a group has N senders). Zero node changes —
// groups, roles, the identity service, and posts-in-a-group all exist.

const LOG = (...args: unknown[]) => console.log('[social-group-chat]', ...args);

/**
 * The group-chat role set. invite_only (no random joiners). `owner` (the
 * creator) manages the group + face; `member` (everyone added) can read +
 * post + edit/delete their own, and read the face (see the name/avatar) but
 * not rename the chat. Member keys are bare usernames (the node's user-key
 * form — the same rule as DMs).
 */
const CHAT_ROLES = [
  {
    name: 'owner',
    permissions: {
      posts: ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn', 'deleteAll'],
      'web10-social-group-identity': ['readAll', 'create', 'updateOwn', 'updateAll', 'deleteOwn'],
      group: ['manageRoles', 'assignRoles', 'revokeRoles', 'deleteGroup'],
    },
  },
  {
    name: 'member',
    permissions: {
      posts: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
      'web10-social-group-identity': ['readAll'],
    },
  },
];

/** A group chat's face, as the Messages list + thread header need it. */
export interface GroupChatSummary {
  groupId: string;
  name: string;
  avatarRef?: string;
}

/**
 * Create a group chat: an invite_only group (creator = owner, the added
 * members = member) + a face with `kind: 'chat'` + the chosen name. Returns
 * the API-derived group_id (never a locally computed one — the API derives it
 * from the caller's token).
 */
export async function createGroupChat(
  name: string,
  memberUsernames: string[],
): Promise<string> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');
  const slug = slugify(name);
  if (!slug) throw new Error('A group name is required.');
  const members: { member_key: string; role: string }[] = [
    { member_key: token.username, role: 'owner' },
    ...memberUsernames
      .filter((u) => u && u !== token.username)
      .map((u) => ({ member_key: u, role: 'member' })),
  ];
  LOG('createGroupChat — creating', { name, slug, members: members.length });
  const res = await w.createGroup(slug, 'invite_only', CHAT_ROLES, members, { tags: [GROUP_TAG.chat] });
  const groupId = res.group_id;
  await writeGroupIdentity(groupId, { kind: 'chat', name });
  LOG('createGroupChat — created', groupId);
  return groupId;
}

/**
 * The current user's group chats — selected by the `web10-social-chat` tag
 * (D78, server-side), then read each group's face for the name + avatar. The
 * tag is the authoritative classifier (a chat is a chat); the face's `kind` is
 * a render hint. Per-group identity reads (the list is small; batching is a
 * later optimization).
 */
export async function getMyGroupChats(): Promise<GroupChatSummary[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];
  // D78: select chats by the platform tag (server-side) — the tag is the
  // authoritative classifier (a `web10-social-chat` group is a chat). Read each
  // face for the name + avatar (the render data).
  const groups = await getMyGroups({ tags: [GROUP_TAG.chat] });
  const chats: GroupChatSummary[] = [];
  for (const g of groups) {
    const identity = await readGroupIdentity(g.group_id).catch((): GroupIdentity => ({}));
    chats.push({
      groupId: g.group_id,
      name: identity.name || groupDisplayName(g.group_id),
      avatarRef: identity.avatar_ref,
    });
  }
  LOG('getMyGroupChats —', groups.length, 'chats (by tag)');
  return chats;
}

/** Read a group chat's face (name + avatar ref). Degrades to `{}` on a miss. */
export async function readGroupChatFace(
  groupId: string,
): Promise<{ name: string; avatarRef?: string }> {
  const identity = await readGroupIdentity(groupId).catch((): GroupIdentity => ({}));
  return { name: identity.name || groupDisplayName(groupId), avatarRef: identity.avatar_ref };
}

/** Read the messages in a group chat (posts in the group, oldest first). */
export async function readGroupChatMessages(groupId: string): Promise<DmRecord[]> {
  const w = getV3Client();
  const docs = await w.read('posts', { groups: [groupId] });
  LOG('readGroupChatMessages — got', docs.length, 'messages from', groupId);
  return docs.map(fromV3DocToDm).sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
  );
}

/**
 * Send a message to a group chat (a posts doc in the group). The body carries
 * `sender_username` / `sender_provider` so the recipient's thread can attribute
 * the bubble. The D58 write gate requires membership; a non-member 403s (I3).
 */
export async function sendGroupChatMessage(
  groupId: string,
  message: string,
): Promise<DmRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');
  const body: Record<string, unknown> = {
    message,
    sender_username: token.username,
    sender_provider: token.provider,
  };
  const doc = await w.create('posts', body, { groups: [groupId] });
  LOG('sendGroupChatMessage — sent', doc.doc_id, 'in', groupId);
  return fromV3DocToDm(doc);
}

/**
 * The route key for a group chat conversation (the splat route captures
 * `group/{groupId}` — the `group/` prefix distinguishes it from a DM key,
 * which is `provider/user--provider/user`).
 */
export function groupChatRouteKey(groupId: string): string {
  return `group/${groupId}`;
}

/** The group_id from a group-chat route key (`group/{groupId}` → `{groupId}`). */
export function groupIdFromRouteKey(key: string): string | null {
  return key.startsWith('group/') ? key.slice('group/'.length) : null;
}
