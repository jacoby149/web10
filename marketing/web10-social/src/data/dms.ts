import { getV3Client } from './v3';
import { getMyGroups } from './groups';
import { fromV3DocToDm, type DmRecord, type DmRecipient } from './types';

// ── DMs data layer (v3) ──────────────────────────────────────────────────────
// DMs use groups: each conversation is a group. Messages are posts in that group.
// No sender/recipient fields needed — the group membership defines who can read.
//
// Group ID model (the API's constraint): /v3/groups/create derives
// group_id = {provider}/groups/users/{creator}/{name} from the caller's token,
// so the creator is embedded in the ID — the ID is NOT symmetric (whoever
// sends first owns it). The symmetric, deterministic identifier is the group
// NAME: dm-{sorted}. Both parties derive the same name and find the group by
// name suffix in their own group list (the messages-demo's findDmGroup
// pattern). Member keys are bare usernames — the node's user-key form (the
// JWT's username claim); a provider-qualified key would not match the real
// user and the recipient would never be a member.

/**
 * The deterministic DM group NAME for a pair of users (sorted, so both
 * parties derive the same name).
 */
export function dmGroupName(a: string, b: string): string {
  return `dm-${[a, b].sort().join('-')}`;
}

// The DM group contract (KB: groups/social-contracts.md §5): invite_only,
// one role, both participants equal members.
const DM_ROLES = [
  {
    name: 'member',
    services: ['posts', 'comments'],
    permissions: ['readAll', 'create', 'updateOwn', 'deleteOwn'],
  },
];

/**
 * Find the DM group between me and other in my group list (by deterministic
 * name suffix — the creator-embedded group_id is not derivable by the
 * recipient). Null when no DM group exists yet.
 */
async function findDmGroup(me: string, other: string): Promise<string | null> {
  const w = getV3Client();
  const suffix = `/${dmGroupName(me, other)}`;
  const groups = await w.getMyGroups();
  const match = groups.find((g) => g.group_id.endsWith(suffix));
  console.log(
    '[social-dms] findDmGroup — me:', me,
    'other:', other, 'suffix:', suffix,
    'match:', match ? match.group_id : null,
  );
  return match ? match.group_id : null;
}

/**
 * Ensure the DM group between me and other exists. Returns the group_id.
 * Finds an existing group by the deterministic name (either party may have
 * created it); creates it (invite_only, both as members) when absent.
 */
async function ensureDmGroup(me: string, other: string): Promise<string> {
  const existing = await findDmGroup(me, other);
  if (existing) return existing;
  const w = getV3Client();
  const name = dmGroupName(me, other);
  console.log('[social-dms] ensureDmGroup — no group yet, creating', name);
  const res = await w.createGroup(name, 'invite_only', DM_ROLES, [
    { member_key: me, role: 'member' },
    { member_key: other, role: 'member' },
  ]);
  console.log('[social-dms] ensureDmGroup — created', res.group_id);
  return res.group_id;
}

/**
 * Derive a deterministic conversation key for a pair of users.
 */
export function conversationKey(
  a: { provider: string; username: string },
  b: { provider: string; username: string },
): string {
  const idA = `${a.provider}/${a.username}`;
  const idB = `${b.provider}/${b.username}`;
  const [first, second] = [idA, idB].sort();
  return `${first}--${second}`;
}

/**
 * Read all messages in a conversation.
 */
export async function readDms(conversation: string): Promise<DmRecord[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const parts = conversation.split('--');
  const meKey = `${token.provider}/${token.username}`;
  const themKey = parts.find((p) => p !== meKey) || parts[0];
  const [, otherUsername] = themKey.split('/');

  const groupId = await findDmGroup(token.username, otherUsername);
  if (!groupId) {
    // No DM group yet (nothing sent either way) — an empty conversation,
    // not an error (a group read by a non-member would 403).
    console.log('[social-dms] readDms — no DM group yet for', otherUsername, '— empty');
    return [];
  }
  const docs = await w.read('posts', { groups: [groupId] });
  console.log('[social-dms] readDms — got', docs.length, 'messages from', groupId);
  return docs.map(fromV3DocToDm).sort(
    (a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime(),
  );
}

/**
 * Send a DM message.
 */
export async function sendDm(
  conversation: string,
  message: string,
  opts?: { mediaRefs?: string[]; subject?: string },
): Promise<DmRecord> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const parts = conversation.split('--');
  const meKey = `${token.provider}/${token.username}`;
  const themKey = parts.find((p) => p !== meKey) || parts[0];
  const [, otherUsername] = themKey.split('/');

  // Ensure the DM group exists
  const groupId = await ensureDmGroup(token.username, otherUsername);

  const body: Record<string, unknown> = {
    message,
    sender_username: token.username,
    sender_provider: token.provider,
    recipient_username: otherUsername,
    recipient_provider: themKey.split('/')[0],
    media_refs: opts?.mediaRefs || [],
  };
  if (opts?.subject) body.subject = opts.subject;

  const doc = await w.create('posts', body, { groups: [groupId] });
  console.log('[social-dms] sendDm — sent', doc.doc_id, 'in', groupId);
  return fromV3DocToDm(doc);
}

/**
 * Delete a DM message by ID.
 */
export async function deleteDm(id: string): Promise<void> {
  const w = getV3Client();
  await w.delete(id);
}

/**
 * Update (edit) a DM message.
 */
export async function updateDm(id: string, message: string): Promise<DmRecord> {
  const w = getV3Client();
  const doc = await w.update(id, { message });
  return fromV3DocToDm(doc);
}

/**
 * List all conversations the current user participates in.
 * DM groups are the 2-member groups whose slug is the deterministic name
 * dm-{first}-{second}. The creator is embedded in the group_id, so the other
 * party is resolved from membership (the name alone is ambiguous — usernames
 * may contain dashes).
 */
export async function listConversations(): Promise<string[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];

  const groups = await getMyGroups();
  const conversations = new Set<string>();

  for (const g of groups) {
    const slug = g.group_id.split('/').pop() || '';
    if (!slug.startsWith('dm-') || g.member_count !== 2) continue;
    const members = await w.getGroupMembers(g.group_id);
    const other = members.find((m) => m.member_key !== token.username);
    if (!other) continue;
    const otherProvider = g.group_id.split('/')[0] || token.provider;
    conversations.add(conversationKey(
      { provider: token.provider, username: token.username },
      { provider: otherProvider, username: other.member_key },
    ));
  }

  console.log('[social-dms] listConversations —', conversations.size, 'conversations');
  return [...conversations];
}

/**
 * Get the last message from a conversation.
 */
export async function getLastDm(conversation: string): Promise<DmRecord | null> {
  const messages = await readDms(conversation);
  return messages[messages.length - 1] || null;
}

/**
 * Start a new conversation with a user.
 */
export async function startConversation(
  recipient: { username: string; provider: string },
  message: string,
  opts?: { subject?: string; mediaRefs?: string[] },
): Promise<{ conversation: string; message: DmRecord }> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const conv = conversationKey(
    { provider: token.provider, username: token.username },
    recipient,
  );
  const dm = await sendDm(conv, message, opts);
  return { conversation: conv, message: dm };
}

/**
 * Delete every message in a conversation.
 */
export async function deleteConversation(conversation: string): Promise<void> {
  const messages = await readDms(conversation);
  const w = getV3Client();
  await Promise.all(messages.map((m) => m._id && w.delete(m._id)));
}

/**
 * Classify a conversation into a folder based on the last message direction.
 */
export type DmFolder = 'inbox' | 'sent' | 'spam';

export function classifyThread(
  lastMsg: DmRecord | null,
  me: { provider: string; username: string },
  _otherSpamFlagged: boolean,
): DmFolder {
  if (!lastMsg) return 'inbox';
  // Compare by username: v3 DMs are same-node (member keys are bare
  // usernames), and the sender_provider derived from a bare author_key is
  // not the node's provider, so a provider-qualified comparison never
  // matches.
  return lastMsg.sender_username === me.username ? 'sent' : 'inbox';
}

// ── Backward compat ──────────────────────────────────────────────────────────

/**
 * Send a DM to multiple recipients (CC/BCC).
 * Creates one record per recipient so each person gets their own copy.
 */
export async function sendDmMulti(
  recipients: DmRecipient[],
  cc: DmRecipient[],
  bcc: DmRecipient[],
  message: string,
  opts?: { subject?: string; mediaRefs?: string[] },
): Promise<DmRecord[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) throw new Error('not authenticated');

  const allTargets = [...recipients, ...cc, ...bcc];
  const created: DmRecord[] = [];
  for (const target of allTargets) {
    const conv = conversationKey(
      { provider: token.provider, username: token.username },
      target,
    );
    created.push(await sendDm(conv, message, opts));
  }
  return created;
}

/**
 * Derive the full set of reply targets from a message's to/cc fields.
 */
export function replyAllTargets(
  msg: DmRecord,
  me: { username: string; provider: string },
): DmRecipient[] {
  const meKey = `${me.provider}/${me.username}`;
  const seen = new Set<string>();
  const targets: DmRecipient[] = [];

  const add = (r: DmRecipient) => {
    const key = `${r.provider}/${r.username}`;
    if (key === meKey || seen.has(key)) return;
    seen.add(key);
    targets.push(r);
  };

  if (msg.to) msg.to.forEach(add);
  if (msg.cc) msg.cc.forEach(add);

  if (!msg.to?.length) {
    // Username-based: the sender_provider on a v3 doc is derived from the
    // bare author_key, so a provider-qualified comparison never matches.
    const isSenderMe = msg.sender_username === me.username;
    const otherKey = isSenderMe
      ? `${msg.recipient_provider}/${msg.recipient_username}`
      : `${msg.sender_provider}/${msg.sender_username}`;
    const [provider, username] = otherKey.split('/');
    add({ username, provider });
  }

  return targets;
}