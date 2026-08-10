import { getV3Client } from './v3';
import { dmGroupId, ensureDmGroup, getMyGroups } from './groups';
import { fromV3DocToDm, type DmRecord, type DmRecipient, extractUsername } from './types';

// ── DMs data layer (v3) ──────────────────────────────────────────────────────
// DMs use groups: each conversation is a group. Messages are posts in that group.
// No sender/recipient fields needed — the group membership defines who can read.

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

  const groupId = dmGroupId(token.username, otherUsername);
  const docs = await w.read('posts', { groups: [groupId] });
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
 * DM groups are groups with names containing 'dm-'.
 */
export async function listConversations(): Promise<string[]> {
  const w = getV3Client();
  const token = w.readToken();
  if (!token) return [];

  const groups = await getMyGroups();
  const conversations = new Set<string>();

  for (const g of groups) {
    if (g.group_id.includes('/dm-')) {
      // Extract the other user's username from the group ID
      const match = g.group_id.match(/dm-(.+)$/);
      if (match) {
        const otherUsername = match[1];
        const otherProvider = g.group_id.split('/')[0] || 'web10';
        conversations.add(conversationKey(
          { provider: token.provider, username: token.username },
          { provider: otherProvider, username: otherUsername },
        ));
      }
    }
  }

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
  const senderKey = `${lastMsg.sender_provider}/${lastMsg.sender_username}`;
  const meKey = `${me.provider}/${me.username}`;
  return senderKey === meKey ? 'sent' : 'inbox';
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
    const senderKey = `${msg.sender_provider}/${msg.sender_username}`;
    const recipientKey = `${msg.recipient_provider}/${msg.recipient_username}`;
    const otherKey = senderKey === meKey ? recipientKey : senderKey;
    const [provider, username] = otherKey.split('/');
    add({ username, provider });
  }

  return targets;
}