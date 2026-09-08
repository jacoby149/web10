// Screenshot-harness mock of `@/data/notifications` — seeded with a few
// notifications (2 unread, 1 read) so the bell badge, the "N new" banner, and
// the /notifications list render with content (no backend). markAllRead is a
// no-op so the shots show the unread state (the "New" labels + glow dots).
export type NotificationType =
  | 'reaction'
  | 'comment'
  | 'reply'
  | 'dm'
  | 'follow_request'
  | 'group_join';

export interface Notification {
  id: string;
  type: NotificationType;
  from: string;
  ref_doc_id?: string;
  read: boolean;
  created_at: string;
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const items: Notification[] = [
  { id: 'n1', type: 'reaction', from: 'bob', ref_doc_id: 'post-1', read: false, created_at: minsAgo(2) },
  { id: 'n2', type: 'comment', from: 'carol', ref_doc_id: 'post-1', read: false, created_at: minsAgo(15) },
  { id: 'n3', type: 'dm', from: 'dave', read: true, created_at: minsAgo(180) },
];

export function unreadCount(): number {
  return items.reduce((n, it) => n + (it.read ? 0 : 1), 0);
}

export function getNotifications(): readonly Notification[] {
  return items;
}

export function onNotificationChange(_listener: () => void): () => void {
  return () => {};
}

export async function markAllRead(): Promise<void> {
  // No-op in the harness — keep the unread state for the screenshot.
}

export async function initNotifications(): Promise<void> {}
export function teardownNotifications(): void {}
export async function recordNotification(_n: unknown): Promise<void> {}
