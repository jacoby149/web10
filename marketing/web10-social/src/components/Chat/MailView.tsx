import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getWapi } from '@/data/wapi';
import { readContacts, listConversations, readDms, conversationKey as deriveConversationKey, updateContactNote } from '@/data';
import type { DmRecord, ContactRecord } from '@/data/types';
import { Search, Mail, MailOpen, Clock, Edit3, Save, X, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatMailTime(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 1) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface MailThread {
  conversation: string;
  otherUser: string;
  displayName: string;
  messages: DmRecord[];
  lastMessage: DmRecord | null;
  unread: boolean;
  messageCount: number;
}

function ThreadSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-border/30">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
        <Skeleton className="h-2.5 w-48 mt-1.5" />
      </div>
    </div>
  );
}

function ThreadRow({
  thread,
  onClick,
}: {
  thread: MailThread;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/30 transition-colors duration-150 min-h-[44px]',
        thread.unread
          ? 'bg-surface hover:bg-elevated/80'
          : 'hover:bg-elevated/50',
      )}
      data-testid="mail-thread-row"
    >
      <div className="relative shrink-0 pt-0.5">
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
            {thread.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'text-sm truncate',
              thread.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/80',
            )}
          >
            {thread.displayName}
          </span>
          <span className={cn(
            'text-xs shrink-0 tabular-nums',
            thread.unread ? 'text-foreground font-medium' : 'text-muted-foreground',
          )}>
            {thread.lastMessage ? formatMailTime(thread.lastMessage.sent_at) : ''}
          </span>
        </div>
        <p className="text-sm text-muted-foreground truncate mt-0.5">
          {thread.lastMessage?.message || 'No messages yet'}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Badge
            variant={thread.unread ? 'brand' : 'outline'}
          >
            {thread.messageCount} msg{thread.messageCount !== 1 ? 's' : ''}
          </Badge>
          {thread.unread && (
            <Badge variant="brand_glow">
              <Mail className="w-3 h-3 mr-1" />
              New
            </Badge>
          )}
        </div>
      </div>
    </button>
  );
}

function ThreadDetail({
  thread,
  onBack,
}: {
  thread: MailThread;
  onBack: () => void;
}) {
  const token = getWapi().readToken();
  const myKey = token ? `${token.provider}/${token.username}` : '';

  return (
    <div className="flex flex-col h-full" data-testid="mail-thread-detail">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 hover:bg-elevated rounded-lg transition-colors duration-150"
          aria-label="Back to inbox"
          data-testid="mail-back-button"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
              {thread.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{thread.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''} · Thread
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {thread.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-sm text-muted-foreground">No messages in this thread</p>
          </div>
        ) : (
          thread.messages.map((msg) => {
            const isMe = myKey === `${msg.sender_provider}/${msg.sender_username}`;
            return (
              <div
                key={msg._id}
                className={cn(
                  'flex gap-3',
                  isMe ? 'flex-row-reverse' : '',
                )}
              >
                <Avatar className="h-8 w-8 shrink-0 mt-0.5">
                  <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
                    {isMe ? 'You' : thread.displayName.charAt(0).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={cn(
                  'max-w-[75%]',
                  isMe ? 'text-right' : '',
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-foreground">
                      {isMe ? 'You' : thread.displayName}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(msg.sent_at)}
                    </span>
                  </div>
                  <div
                    className={cn(
                      'inline-block px-3 py-2 rounded-lg text-sm leading-relaxed',
                      isMe
                        ? 'bg-gradient-to-br from-brand to-brand-600 text-brand-foreground rounded-tr-sm'
                        : 'bg-elevated text-foreground rounded-tl-sm',
                    )}
                  >
                    <p className="break-words">{msg.message}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function MailView() {
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedThread, setSelectedThread] = useState<MailThread | null>(null);
  const [contactMap, setContactMap] = useState<Record<string, ContactRecord>>({});

  const loadThreads = useCallback(async () => {
    setLoading(true);
    try {
      const token = getWapi().readToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const me = { provider: token.provider, username: token.username };
      const meKey = `${me.provider}/${me.username}`;

      const [convs, contacts] = await Promise.all([
        listConversations(),
        readContacts(),
      ]);

      const cMap: Record<string, ContactRecord> = {};
      contacts.forEach((c) => {
        cMap[`${c.provider}/${c.username}`] = c;
      });
      setContactMap(cMap);

      const threadPromises = convs.map(async (conv) => {
        const parts = conv.split('--');
        const otherKey = parts.find((p) => p !== meKey) || parts[0];
        const contact = cMap[otherKey];
        const displayName = contact?.display_name || otherKey.split('/')[1] || otherKey;

        const messages = await readDms(conv).catch(() => []);
        const lastMsg = messages[messages.length - 1] || null;

        return {
          conversation: conv,
          otherUser: otherKey,
          displayName,
          messages,
          lastMessage: lastMsg,
          unread: false,
          messageCount: messages.length,
        } as MailThread;
      });

      const loaded = await Promise.all(threadPromises);
      loaded.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.sent_at).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.sent_at).getTime() : 0;
        return bTime - aTime;
      });
      setThreads(loaded);
    } catch (e) {
      console.error('Failed to load mail threads:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads]);

  const filtered = search.trim()
    ? threads.filter((t) =>
        t.displayName.toLowerCase().includes(search.toLowerCase()) ||
        t.lastMessage?.message.toLowerCase().includes(search.toLowerCase()),
      )
    : threads;

  if (selectedThread) {
    return <ThreadDetail thread={selectedThread} onBack={() => setSelectedThread(null)} />;
  }

  return (
    <div className="flex flex-col h-full" data-testid="mail-view">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold text-foreground">Mail</h1>
        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search threads…"
            data-testid="mail-search"
            className="w-full h-8 pl-8 pr-2 rounded-sm border border-input bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
        </div>
      </div>

      {/* Column headers (desktop) */}
      <div className="hidden sm:grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-[0.6875rem] font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50">
        <span>From</span>
        <span>Subject</span>
        <span className="text-right">Time</span>
      </div>

      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <ThreadSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <MailOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {search.trim() ? 'No threads found' : 'No conversations yet'}
          </p>
          <p className="text-xs text-muted-foreground/50">
            Start messaging someone to see threads here
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((thread) => (
            <ThreadRow
              key={thread.conversation}
              thread={thread}
              onClick={() => setSelectedThread(thread)}
            />
          ))}
        </div>
      )}
    </div>
  );
}