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

// The deep-link resolvers (the screen imports them for the clickable rows).
// Same mapping as the real module — the harness rows render clickable.
export function notificationHref(
  n: Notification,
  me: { username: string; provider: string },
): string | null {
  switch (n.type) {
    case 'reaction':
    case 'comment': {
      if (!n.ref_doc_id) return null;
      let href = `/u/${encodeURIComponent(me.username)}/p/${encodeURIComponent(n.ref_doc_id)}`;
      if (n.type === 'comment') {
        const parts = n.id.split(':');
        if (parts.length === 3 && parts[0] === 'comment' && parts[2]) {
          href += `?comment=${encodeURIComponent(parts[2])}`;
        }
      }
      return href;
    }
    case 'dm': {
      if (!n.from) return null;
      const idA = `${me.provider}/${me.username}`;
      const idB = `${me.provider}/${n.from}`;
      const [first, second] = [idA, idB].sort();
      return `/messages/${encodeURIComponent(`${first}--${second}`)}`;
    }
    case 'follow_request':
      return n.from ? `/u/${encodeURIComponent(n.from)}` : null;
    case 'group_join':
      return n.ref_doc_id ? `/groups/${encodeURIComponent(n.ref_doc_id)}` : '/groups';
    default:
      return null;
  }
}

export async function resolveReplyHref(
  n: Notification,
  me: { username: string; provider: string },
): Promise<string | null> {
  if (n.type !== 'reply' || !n.ref_doc_id) return null;
  // The harness has no backend — the chain can't resolve.
  void me;
  return null;
}
