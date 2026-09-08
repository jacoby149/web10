import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

/**
 * The notification bell — a bell icon with a live unread-count badge
 * (glow-pulse when there's something new). Tapping it goes to /notifications.
 * Used in the mobile top-header (the desktop sidebar has its own nav item).
 */
export default function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { unread } = useNotifications();

  return (
    <button
      type="button"
      data-testid="notification-bell"
      aria-label={unread > 0 ? `Notifications (${unread} unread)` : 'Notifications'}
      onClick={() => navigate('/notifications')}
      className={cn(
        'relative h-11 w-11 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
        className,
      )}
    >
      <Bell className="w-5 h-5" strokeWidth={unread > 0 ? 2 : 1.75} />
      {unread > 0 && (
        <span
          data-testid="notification-badge"
          aria-hidden="true"
          className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-brand text-background text-[0.625rem] font-bold flex items-center justify-center animate-glow-pulse"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </button>
  );
}
