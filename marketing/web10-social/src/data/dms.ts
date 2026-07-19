import { getWapi } from './wapi';
import type { DmRecord } from './types';

// ── DMs data layer ─────────────────────────────────────────────────────────
// Records-based DMs: each conversation lives in a service named
// `dm-{lexicographically-smaller-username}--{lexicographically-larger-username}`
// so both parties address the same service.

/**
 * Derive the conversation service name from two user identities.
 * The service name is deterministic: dm-{smaller}--{larger}
 * where each identity is "provider/username".
 */
export function conversationServiceName(
  a: { provider: string; username: string },
  b: { provider: string; username: string },
): string {
  const idA = `${a.provider}/${a.username}`;
  const idB = `${b.provider}/${b.username}`;
  const [first, second] = [idA, idB].sort();
  return `dm-${first}--${second}`;
}

/**
 * Read all messages in a conversation.
 */
export async function readDms(conversation: string): Promise<DmRecord[]> {
  const wapi = getWapi();
  const records = await wapi.read<DmRecord>(conversation);
  return records.sort((a, b) => {
    return new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime();
  });
}

/**
 * Send a DM message to a conversation.
 */
export async function sendDm(
  conversation: string,
  message: string,
  mediaRefs?: string[],
): Promise<DmRecord> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) throw new Error('not authenticated');

  const record: Omit<DmRecord, '_id'> = {
    message,
    sent_at: new Date().toISOString(),
    sender_username: token.username,
    sender_provider: token.provider,
    media_refs: mediaRefs || [],
  };

  return wapi.create<DmRecord>(conversation, record);
}

/**
 * Delete a DM message by ID.
 */
export async function deleteDm(conversation: string, id: string): Promise<void> {
  const wapi = getWapi();
  await wapi.delete(conversation, { _id: id });
}

/**
 * List all conversations the current user participates in.
 * Reads contact list and derives conversation names.
 */
export async function listConversations(): Promise<string[]> {
  const wapi = getWapi();
  const token = wapi.readToken();
  if (!token) return [];

  const contacts = await wapi.read<{ username: string; provider: string }>('contacts');
  const conversations = new Set<string>();
  for (const c of contacts) {
    conversations.add(
      conversationServiceName(token, { username: c.username, provider: c.provider }),
    );
  }
  return [...conversations];
}

/**
 * Get the last message from a conversation (for the inbox preview).
 */
export async function getLastDm(conversation: string): Promise<DmRecord | null> {
  const messages = await readDms(conversation);
  return messages[messages.length - 1] || null;
}