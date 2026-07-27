import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { getWapi } from '@/data/wapi';
import { readContacts, listConversations, readDms, spamFlagUser, unspamFlagUser } from '@/data';
import { classifyThread, type DmFolder } from '@/data/dms';
import type { DmRecord, ContactRecord } from '@/data/types';
import { Search, Mail, MailOpen, Send, AlertTriangle, CheckCircle, Flag, FlagOff, ChevronLeft } from 'lucide-react';
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
  folder: DmFolder;
  messageCount: number;
}

const folders: Array<{ key: DmFolder; label: string; icon: typeof Mail }> = [
  { key: 'inbox', label: 'Inbox', icon: Mail },
  { key: 'sent', label: 'Sent', icon: Send },
  { key: 'spam', label: 'Spam', icon: AlertTriangle },
];

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
  onFlag,
  onUnflag,
}: {
  thread: MailThread;
  onClick: () => void;
  onFlag: () => void;
  onUnflag: () => void;
}) {
  return (
    <div className="group">
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/30 transition-colors duration-150 min-h-[44px]',
          thread.folder === 'spam'
            ? 'bg-danger-muted/30 hover:bg-danger-muted/50'
            : 'hover:bg-elevated/50',
        )}
        data-testid="mail-thread-row"
      >
        <div className="relative shrink-0 pt-0.5">
          <Avatar className="h-10 w-10">
            <AvatarFallback className={cn(
              'text-sm font-semibold',
              thread.folder === 'spam'
                ? 'bg-danger-muted text-danger'
                : 'bg-brand-muted text-brand-300',
            )}>
              {thread.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-foreground truncate">
              {thread.displayName}
            </span>
            <span className="text-xs shrink-0 tabular-nums text-muted-foreground">
              {thread.lastMessage ? formatMailTime(thread.lastMessage.sent_at) : ''}
            </span>
          </div>
          <p className="text-sm text-muted-foreground truncate mt-0.5">
            {thread.lastMessage?.message || 'No messages yet'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline">
              {thread.messageCount} msg{thread.messageCount !== 1 ? 's' : ''}
            </Badge>
            {thread.folder === 'spam' && (
              <Badge variant="danger">
                <AlertTriangle className="w-3 h-3 mr-1" />
                Spam
              </Badge>
            )}
          </div>
        </div>
      </button>
      <div className={cn(
        'absolute right-2 top-1/2 -translate-y-1/2 flex gap-1 transition-opacity duration-150',
        thread.folder === 'spam' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}>
        {thread.folder === 'spam' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-success"
            onClick={(e) => { e.stopPropagation(); onUnflag(); }}
            aria-label="Remove spam flag"
            data-testid="mail-unspam-btn"
          >
            <FlagOff className="w-3.5 h-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-warning"
            onClick={(e) => { e.stopPropagation(); onFlag(); }}
            aria-label="Mark as spam"
            data-testid="mail-spam-btn"
          >
            <Flag className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

function ThreadDetail({
  thread,
  onBack,
  onFlag,
  onUnflag,
}: {
  thread: MailThread;
  onBack: () => void;
  onFlag: () => void;
  onUnflag: () => void;
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
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className={cn(
              'text-xs font-semibold',
              thread.folder === 'spam'
                ? 'bg-danger-muted text-danger'
                : 'bg-brand-muted text-brand-300',
            )}>
              {thread.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{thread.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''} · {thread.folder}
            </p>
          </div>
        </div>
        {thread.folder === 'spam' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-success hover:bg-success/10"
            onClick={onUnflag}
            data-testid="mail-detail-unspam-btn"
          >
            <FlagOff className="w-3.5 h-3.5 mr-1.5" />
            Not spam
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-warning hover:bg-warning/10"
            onClick={onFlag}
            data-testid="mail-detail-spam-btn"
          >
            <Flag className="w-3.5 h-3.5 mr-1.5" />
            Mark spam
          </Button>
        )}
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
                  <AvatarFallback className={cn(
                    'text-xs font-semibold',
                    isMe ? 'bg-brand text-brand-foreground' : 'bg-brand-muted text-brand-300',
                  )}>
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
                    {isMe ? (
                      <Badge variant="outline" className="text-[10px]">Sent</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Received</Badge>
                    )}
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
  const [activeFolder, setActiveFolder] = useState<DmFolder>('inbox');

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
        const folder = classifyThread(lastMsg, me, !!contact?.spam_flagged);

        return {
          conversation: conv,
          otherUser: otherKey,
          displayName,
          messages,
          lastMessage: lastMsg,
          folder,
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

  const handleFlag = useCallback(async (thread: MailThread) => {
    await spamFlagUser(
      thread.otherUser.split('/')[1] || thread.otherUser,
      thread.otherUser.split('/')[0] || 'web10',
    );
    setThreads((prev) =>
      prev.map((t) =>
        t.conversation === thread.conversation
          ? { ...t, folder: 'spam' as DmFolder }
          : t,
      ),
    );
    setContactMap((prev) => {
      const updated = { ...prev };
      const c = updated[thread.otherUser];
      if (c) updated[thread.otherUser] = { ...c, spam_flagged: true };
      return updated;
    });
    if (selectedThread?.conversation === thread.conversation) {
      setSelectedThread((prev) => prev ? { ...prev, folder: 'spam' as DmFolder } : null);
    }
  }, [selectedThread]);

  const handleUnflag = useCallback(async (thread: MailThread) => {
    await unspamFlagUser(
      thread.otherUser.split('/')[1] || thread.otherUser,
      thread.otherUser.split('/')[0] || 'web10',
    );
    const token = getWapi().readToken();
    if (!token) return;
    const me = { provider: token.provider, username: token.username };
    setThreads((prev) =>
      prev.map((t) =>
        t.conversation === thread.conversation
          ? {
              ...t,
              folder: classifyThread(t.lastMessage, me, false),
            }
          : t,
      ),
    );
    setContactMap((prev) => {
      const updated = { ...prev };
      const c = updated[thread.otherUser];
      if (c) updated[thread.otherUser] = { ...c, spam_flagged: false };
      return updated;
    });
    if (selectedThread?.conversation === thread.conversation) {
      const token = getWapi().readToken();
      if (token) {
        const me = { provider: token.provider, username: token.username };
        setSelectedThread((prev) =>
          prev ? { ...prev, folder: classifyThread(prev.lastMessage, me, false) } : null,
        );
      }
    }
  }, [selectedThread]);

  const folderThreads = threads.filter((t) => t.folder === activeFolder);
  const filtered = search.trim()
    ? folderThreads.filter((t) =>
        t.displayName.toLowerCase().includes(search.toLowerCase()) ||
        t.lastMessage?.message.toLowerCase().includes(search.toLowerCase()),
      )
    : folderThreads;

  const folderCounts: Record<DmFolder, number> = {
    inbox: threads.filter((t) => t.folder === 'inbox').length,
    sent: threads.filter((t) => t.folder === 'sent').length,
    spam: threads.filter((t) => t.folder === 'spam').length,
  };

  if (selectedThread) {
    return (
      <ThreadDetail
        thread={selectedThread}
        onBack={() => setSelectedThread(null)}
        onFlag={() => handleFlag(selectedThread)}
        onUnflag={() => handleUnflag(selectedThread)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="mail-view">
      {/* Folder tabs */}
      <div className="flex items-center border-b border-border" data-testid="mail-folder-tabs">
        {folders.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => { setActiveFolder(key); setSearch(''); }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
              activeFolder === key
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`mail-folder-${key}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <Badge
              variant={activeFolder === key ? 'brand' : 'outline'}
              className="text-[10px] h-4 px-1.5 ml-0.5"
            >
              {folderCounts[key]}
            </Badge>
            {activeFolder === key && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
            )}
          </button>
        ))}
      </div>

      {/* Header bar */}
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-sm font-bold text-foreground">
            {folders.find((f) => f.key === activeFolder)?.label}
          </h1>
          <span className="text-xs text-muted-foreground tabular-nums">
            {filtered.length} thread{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            data-testid="mail-search"
            className="w-full h-8 pl-8 pr-2 rounded-sm border border-input bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
        </div>
      </div>

      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <ThreadSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          {activeFolder === 'inbox' ? (
            <MailOpen className="w-8 h-8 text-muted-foreground/40 mb-3" />
          ) : activeFolder === 'sent' ? (
            <Send className="w-8 h-8 text-muted-foreground/40 mb-3" />
          ) : (
            <CheckCircle className="w-8 h-8 text-muted-foreground/40 mb-3" />
          )}
          <p className="text-sm text-muted-foreground mb-1">
            {search.trim()
              ? 'No threads found'
              : activeFolder === 'inbox'
                ? 'Inbox is empty'
                : activeFolder === 'sent'
                  ? 'No sent messages yet'
                  : 'No spam flagged'}
          </p>
          <p className="text-xs text-muted-foreground/50">
            {activeFolder === 'spam'
              ? 'Flag a sender to move them here'
              : 'Start messaging someone to see threads here'}
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((thread) => (
            <ThreadRow
              key={thread.conversation}
              thread={thread}
              onClick={() => setSelectedThread(thread)}
              onFlag={() => handleFlag(thread)}
              onUnflag={() => handleUnflag(thread)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
