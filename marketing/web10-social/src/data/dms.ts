import { getWapi } from './wapi';
import type { DmRecord } from './types';

// ── DMs data layer ──────────────────────────────────────────────────────────
// All DMs live in a single `dms` service. Conversations are identified by
// filtering on sender/recipient fields — no per-conversation service.

/**
 * Derive a deterministic conversation key for a pair of users.
 * This is NOT a service name — it's a stable identifier used for
 * grouping conversations in the UI and caching.
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
 * Build the two flat, single-direction queries that together match every
 * message between two users.
 *
 * A single `{ $or: [...] }` filter CANNOT be used here: the node's query
 * translator (api `q_t`) drops any top-level `$`-prefixed key, so an `$or`
 * filter is silently ignored and the read returns every DM in the
 * collection regardless of peer — which made every conversation render the
 * same merged thread. Two flat equality queries survive translation.
 */
function conversationQueries(
  me: { provider: string; username: string },
  them: { provider: string; username: string },
): Record<string, unknown>[] {
  return [
    {
      sender_username: me.username,
      sender_provider: me.provider,
      recipient_username: them.username,
      recipient_provider: them.provider,
    },
    {
      sender_username: them.username,
      sender_provider: them.provider,
      recipient_username: me.username,
      recipient_provider: me.provider,
    },
  ];
}

// ── Legacy migration ────────────────────────────────────────────────────────

interface LegacyMessage {
  _id?: string;
  message: string;
  sentTime: string;
  web10: string; // "provider/username" of the OTHER party
}

function parseWeb10(web10: string): { username: string; provider: string } {
  const [provider, username] = web10.split('/');
  return { username: username || web10, provider: provider || 'web10' };
}

/**
 * Migrate legacy message-inbox / message-outbox records into the
 * unified `dms` service. Runs once on first read when `dms` is empty.
 */
async function migrateLegacyMessages(
  wapi: ReturnType<typeof getWapi>,
  me: { provider: string; username: string },
): Promise<void> {
  const migrated = new Set<string>();

  // Migrate message-inbox (messages received)
  try {
    const inbox = await wapi.read<LegacyMessage>('message-inbox');
    for (const old of inbox) {
      const { username: senderUsername, provider: senderProvider } = parseWeb10(old.web10);
      const record: Omit<DmRecord, '_id'> = {
        message: old.message,
        sent_at: old.sentTime,
        sender_username: senderUsername,
        sender_provider: senderProvider,
        recipient_username: me.username,
        recipient_provider: me.provider,
        media_refs: [],
      };
      await wapi.create<DmRecord>('dms', record as unknown as Record<string, unknown>);
      if (old._id) migrated.add(old._id);
    }
  } catch {
    // message-inbox may not exist
  }

  // Migrate message-outbox (messages sent)
  try {
    const outbox = await wapi.read<LegacyMessage>('message-outbox');
    for (const old of outbox) {
      const { username: recipientUsername, provider: recipientProvider } = parseWeb10(old.web10);
      const record: Omit<DmRecord, '_id'> = {
        message: old.message,
        sent_at: old.sentTime,
        sender_username: me.username,
        sender_provider: me.provider,
        recipient_username: recipientUsername,
        recipient_provider: recipientProvider,
        media_refs: [],
      };
      await wapi.create<DmRecord>('dms', record as unknown as Record<string, unknown>);
      if (old._id) migrated.add(old._id);
    }
  } catch {
    // message-outbox may not exist
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Read all messages in a conversation between the current user and a contact.
 */
export async function readDms(conversation: string): Promise<DmRecord[]> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const me = { provider: token.provider, username: token.username };
  const meKey = `${me.provider}/${me.username}`;
  const parts = conversation.split('--');
  const themKey = parts.find((p) => p !== meKey) || parts[0];
  const them = parseWeb10(themKey);

  const [outgoing, incoming] = await Promise.all(
    conversationQueries(me, them).map((q) => wapi.read<DmRecord>('dms', q)),
  );
  return [...outgoing, ...incoming].sort(
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
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const me = { provider: token.provider, username: token.username };
  const meKey = `${me.provider}/${me.username}`;
  const parts = conversation.split('--');
  const themKey = parts.find((p) => p !== meKey) || parts[0];
  const them = parseWeb10(themKey);

  const record: Omit<DmRecord, '_id'> = {
    message,
    sent_at: new Date().toISOString(),
    sender_username: me.username,
    sender_provider: me.provider,
    recipient_username: them.username,
    recipient_provider: them.provider,
    media_refs: opts?.mediaRefs || [],
    ...(opts?.subject ? { subject: opts.subject } : {}),
  };

  return wapi.create<DmRecord>('dms', record as unknown as Record<string, unknown>);
}

/**
 * Delete a DM message by ID.
 */
export async function deleteDm(id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete('dms', { _id: id });
}

/**
 * Update (edit) a DM message's text content.
 * Only the `message` field and `updated_at` are patched; sender/recipient
 * and media_refs are immutable.
 */
export async function updateDm(id: string, message: string): Promise<DmRecord> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const result = await wapi.update<DmRecord>(
    'dms',
    { _id: id },
    { $set: { message, updated_at: new Date().toISOString() } },
  );
  return result;
}

/**
 * Delete every message in a conversation.
 */
export async function deleteConversation(conversation: string): Promise<void> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const me = { provider: token.provider, username: token.username };
  const meKey = `${me.provider}/${me.username}`;
  const parts = conversation.split('--');
  const themKey = parts.find((p) => p !== meKey) || parts[0];
  const them = parseWeb10(themKey);

  // Delete all messages in both directions for this conversation.
  await Promise.all(
    conversationQueries(me, them).map((q) => wapi.delete('dms', q)),
  );
}

/**
 * List all conversations the current user participates in.
 * Reads contacts and derives conversation keys, but also checks for
 * legacy messages to discover conversations with non-contacts.
 */
export async function listConversations(): Promise<string[]> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) return [];

  const me = { provider: token.provider, username: token.username };
  const conversations = new Set<string>();

  // First: check if dms service has any records. If empty, migrate legacy.
  // Every DM in the caller's own collection already involves the caller, so
  // an unfiltered read IS "all my DMs" — no `$or` needed (and `$or` would be
  // dropped by the node's query translator anyway; see conversationQueries).
  const existingDms = await wapi.read<DmRecord>('dms', {});

  if (!existingDms.length) {
    await migrateLegacyMessages(wapi, me);
  }

  // Derive conversations from contacts
  const contacts = await wapi.read<{ username: string; provider: string }>('contacts');
  for (const c of contacts) {
    conversations.add(conversationKey(me, { username: c.username, provider: c.provider }));
  }

  // Also discover conversations from migrated messages (in case sender
  // was not in contacts)
  const allDms = await wapi.read<DmRecord>('dms', {});
  for (const dm of allDms) {
    const other =
      dm.sender_username === me.username
        ? { username: dm.recipient_username, provider: dm.recipient_provider }
        : { username: dm.sender_username, provider: dm.sender_provider };
    conversations.add(conversationKey(me, other));
  }

  return [...conversations];
}

/**
 * Start a new conversation with a user who has no existing thread.
 * Writes the first DM record; the deterministic conversationKey ensures
 * subsequent reads find the thread. Returns the created message.
 */
export async function startConversation(
  recipient: { username: string; provider: string },
  message: string,
  opts?: { subject?: string; mediaRefs?: string[] },
): Promise<{ conversation: string; message: DmRecord }> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const me = { provider: token.provider, username: token.username };
  const conv = conversationKey(me, recipient);

  const dm: Omit<DmRecord, '_id'> = {
    message,
    sent_at: new Date().toISOString(),
    sender_username: me.username,
    sender_provider: me.provider,
    recipient_username: recipient.username,
    recipient_provider: recipient.provider,
    media_refs: opts?.mediaRefs || [],
    ...(opts?.subject ? { subject: opts.subject } : {}),
  };

  const created = await wapi.create<DmRecord>('dms', dm as unknown as Record<string, unknown>);
  return { conversation: conv, message: created };
}

/**
 * Get the last message from a conversation (for the inbox preview).
 */
export type DmFolder = 'inbox' | 'sent' | 'spam';

/**
 * Classify a conversation into a folder based on the last message direction.
 * - inbox: the latest message is inbound (someone else sent it to me)
 * - sent: the latest message is outbound (I sent it)
 * - spam: the other user is spam-flagged
 */
export function classifyThread(
  lastMsg: DmRecord | null,
  me: { provider: string; username: string },
  otherSpamFlagged: boolean,
): DmFolder {
  if (otherSpamFlagged) return 'spam';
  if (!lastMsg) return 'inbox';
  const senderKey = `${lastMsg.sender_provider}/${lastMsg.sender_username}`;
  const meKey = `${me.provider}/${me.username}`;
  return senderKey === meKey ? 'sent' : 'inbox';
}

/**
 * Get the last message from a conversation (for the inbox preview).
 */
export async function getLastDm(conversation: string): Promise<DmRecord | null> {
  const messages = await readDms(conversation);
  return messages[messages.length - 1] || null;
}