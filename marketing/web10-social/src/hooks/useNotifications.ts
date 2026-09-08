import { useState, useEffect } from 'react';
import { onNotificationChange, unreadCount, getNotifications, type Notification } from '@/data/notifications';

export interface NotificationsState {
  unread: number;
  items: readonly Notification[];
}

/**
 * Subscribe to the app-wide notification store. Returns a fresh snapshot
 * (unread count + items) on every change so the consuming component
 * re-renders — the badge, the banner, and the screen all use this.
 */
export function useNotifications(): NotificationsState {
  const [state, setState] = useState<NotificationsState>(() => ({
    unread: unreadCount(),
    items: getNotifications(),
  }));
  useEffect(() => {
    const update = () =>
      setState({ unread: unreadCount(), items: getNotifications() });
    update();
    return onNotificationChange(update);
  }, []);
  return state;
}
