import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellOff, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useNotifications } from '@/hooks/useNotifications';
import { markAllRead, notificationHref, resolveReplyHref, type Notification } from '@/data/notifications';
import { getWapi } from '@/data/wapi';
import { cn } from '@/lib/utils';

// The "did X" line for each notification type (the KB's screen shape:
// "alice liked your post · 2m ago").
function describe(n: Notification): string {
  const who = n.from || 'Someone';
  switch (n.type) {
    case 'reaction':
      return `${who} reacted to your post`;
    case 'comment':
      return `${who} commented on your post`;
    case 'reply':
      return `${who} replied to your comment`;
    case 'dm':
      return `${who} sent you a message`;
    case 'follow_request':
      return `${who} requested to follow you`;
    case 'group_join':
      return `${who} joined a group`;
    default:
      return `${who} did something`;
  }
}

// A compact relative time ("2m ago", "3h ago", "5d ago") — the KB's "· 2m ago".
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function NotificationRow({ n, unread }: { n: Notification; unread: boolean }) {
  const navigate = useNavigate();
  const me = getWapi().readToken();

  // The row's deep link: the place in the app the event is about (the post
  // permalink, the conversation, the profile). A `reply` needs a CRUD
  // re-read (parent comment → post → author), so it resolves on click.
  const href = me ? notificationHref(n, me) : null;
  const clickable = !!href || n.type === 'reply';

  const open = () => {
    if (n.type === 'reply') {
      if (!me) return;
      resolveReplyHref(n, me)
        .then((r) => { if (r) navigate(r); })
        .catch(() => {});
      return;
    }
    if (href) navigate(href);
  };

  const rowClasses = cn(
    'flex items-center gap-3 px-4 py-3 border-b border-border/40 w-full text-left',
    unread && 'bg-brand-muted/20',
    clickable && 'cursor-pointer transition-colors duration-150 hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-inset',
  );
  const rowInner = (
    <>
      <div className="relative shrink-0">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
            {(n.from || '?').charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        {unread && (
          <span
            className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-brand border-2 border-background animate-glow-pulse"
            aria-hidden="true"
            data-testid="notification-unread-dot"
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', unread ? 'text-foreground font-medium' : 'text-foreground/90')}>
          {describe(n)}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
      </div>
      {unread && (
        <span className="text-[0.625rem] font-semibold uppercase tracking-wide text-brand-300" data-testid="notification-new-label">
          New
        </span>
      )}
    </>
  );

  if (!clickable) {
    return (
      <li data-testid="notification-row" className={rowClasses}>
        {rowInner}
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        data-testid="notification-row"
        aria-label={`${describe(n)} — open`}
        onClick={open}
        className={rowClasses}
      >
        {rowInner}
      </button>
    </li>
  );
}

export default function NotificationsScreen() {
  const { unread, items } = useNotifications();

  // Mark all read on open — clears the badge + banner (the "you looked" state).
  useEffect(() => {
    markAllRead().catch(() => {
      // Best-effort — a persist failure still cleared the local badge.
    });
  }, []);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <h1 className="font-display text-lg font-bold text-foreground">Notifications</h1>
        {unread > 0 && (
          <Button
            size="sm"
            variant="ghost"
            data-testid="mark-all-read-button"
            className="gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => markAllRead().catch(() => {})}
          >
            <CheckCheck className="w-4 h-4" strokeWidth={1.75} />
            Mark all read
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-6" data-testid="notifications-empty">
          <div className="w-12 h-12 rounded-full bg-elevated flex items-center justify-center mb-3">
            <BellOff className="w-6 h-6 text-muted-foreground" strokeWidth={1.5} />
          </div>
          <p className="text-sm font-medium text-foreground">No notifications yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            When someone reacts to, comments on, or replies to your posts — or messages you — it shows up here.
          </p>
        </div>
      ) : (
        <ul data-testid="notifications-list">
          {items.map((n) => (
            <NotificationRow key={n.id} n={n} unread={!n.read} />
          ))}
        </ul>
      )}
    </div>
  );
}
