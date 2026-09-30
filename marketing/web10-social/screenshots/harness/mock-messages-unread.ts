// Screenshot-harness mock of `@/data/messagesUnread` — seeded with a couple of
// unread conversations so the purple Messages badge renders (no backend).
export function unreadMessagesCount(): number {
  return 2;
}
export function isConversationUnread(_conv: string): boolean {
  return false;
}
export function onMessagesUnreadChange(_listener: () => void): () => void {
  return () => {};
}
export async function initMessagesUnread(): Promise<void> {}
export async function markConversationRead(_conv: string, _latest?: string): Promise<void> {}
export function teardownMessagesUnread(): void {}
