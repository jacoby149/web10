import { useState, useEffect } from 'react';
import { onMessagesUnreadChange, unreadMessagesCount, isConversationUnread } from '@/data/messagesUnread';

export interface MessagesUnreadState {
  unread: number;
  isUnread: (conv: string) => boolean;
}

/**
 * Subscribe to the app-wide Messages unread store. Returns a fresh snapshot
 * (unread count + a per-conversation unread check) on every change so the
 * consuming component re-renders — the Messages badge (mobile + desktop) and
 * the conversation list all use this.
 */
export function useMessagesUnread(): MessagesUnreadState {
  const [state, setState] = useState<MessagesUnreadState>(() => ({
    unread: unreadMessagesCount(),
    isUnread: (conv: string) => isConversationUnread(conv),
  }));
  useEffect(() => {
    const update = () =>
      setState({ unread: unreadMessagesCount(), isUnread: (conv: string) => isConversationUnread(conv) });
    update();
    return onMessagesUnreadChange(update);
  }, []);
  return state;
}
