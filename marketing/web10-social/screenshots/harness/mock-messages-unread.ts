// Screenshot-harness mock of `@/data/messagesUnread` — seeded with a couple of
// unread conversations so the purple Messages badge renders (no backend).
// The conversation keys mirror mock-data.ts conversationKey() (sorted pair).
const UNREAD_CONVS = new Set([
  'web10/alina--web10/me',
  'web10/me--web10/sam',
]);
export function unreadMessagesCount(): number {
  return UNREAD_CONVS.size;
}
export function isConversationUnread(conv: string): boolean {
  return UNREAD_CONVS.has(conv);
}
export function onMessagesUnreadChange(_listener: () => void): () => void {
  return () => {};
}
export async function initMessagesUnread(): Promise<void> {}
export async function markConversationRead(_conv: string, _latest?: string): Promise<void> {}
export function teardownMessagesUnread(): void {}
