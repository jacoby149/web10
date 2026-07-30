import { useState, useEffect, useCallback, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getWapi } from '@/data/wapi';
import {
  readContacts,
  listConversations,
  readDms,
  sendDm,
  conversationKey as deriveConversationKey,
  updateContactNote,
  toggleSpamFlag,
  classifyThread,
} from '@/data';
import type { DmRecord, ContactRecord } from '@/data/types';
import {
  Search,
  Mail,
  MailOpen,
  Send,
  Archive,
  AlertTriangle,
  ChevronLeft,
  Flag,
  FlagOff,
  Reply,
  Repeat2,
  User,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type MailFolder = 'inbox' | 'sent' | 'spam';

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
  folder: MailFolder;
  spamFlagged: boolean;
  contactId?: string;
}

const FOLDER_META: Record<MailFolder, { label: string; icon: typeof Mail }> = {
  inbox: { label: 'Inbox', icon: Mail },
  sent: { label: 'Sent', icon: Send },
  spam: { label: 'Spam', icon: AlertTriangle },
};

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
  onToggleSpam,
}: {
  thread: MailThread;
  onClick: () => void;
  onToggleSpam: () => void;
}) {
  return (
    <div className="group">
      <button
        onClick={onClick}
        className={cn(
          'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-border/30 transition-colors duration-150 min-h-[44px]',
          thread.unread
            ? 'bg-surface hover:bg-elevated/80'
            : 'hover:bg-elevated/50',
          thread.folder === 'spam' ? 'opacity-70' : '',
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
            {thread.lastMessage?.subject
              ? `${thread.lastMessage.subject}${thread.lastMessage.message ? ' — ' + thread.lastMessage.message : ''}`
              : thread.lastMessage?.message || 'No messages yet'}
          </p>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="outline" className="text-[10px]">
              {FOLDER_META[thread.folder].label}
            </Badge>
            <Badge variant={thread.unread ? 'brand' : 'outline'}>
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleSpam();
        }}
        className={cn(
          'absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100',
          'flex items-center justify-center h-8 w-8 rounded-lg transition-all duration-150',
          thread.spamFlagged
            ? 'text-danger hover:bg-danger-muted'
            : 'text-muted-foreground hover:bg-elevated',
        )}
        aria-label={thread.spamFlagged ? 'Remove from spam' : 'Mark as spam'}
        data-testid="mail-thread-spam-toggle"
      >
        {thread.spamFlagged ? (
          <FlagOff className="w-4 h-4" />
        ) : (
          <Flag className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}

function ThreadDetail({
  thread,
  onBack,
  onToggleSpam,
  onSent,
}: {
  thread: MailThread;
  onBack: () => void;
  onToggleSpam: () => void;
  onSent: (msg: DmRecord) => void;
}) {
  const token = getWapi().readToken();
  const myKey = token ? `${token.provider}/${token.username}` : '';
  const myUsername = token?.username || '';
  const [input, setInput] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<DmRecord | null>(null);
  const [forwardTarget, setForwardTarget] = useState<DmRecord | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Use the thread's first message's subject as the thread subject if available
  const threadSubject = thread.messages.find((m) => m.subject)?.subject || '';

  function formatFromTo(msg: DmRecord) {
    const senderKey = `${msg.sender_provider}/${msg.sender_username}`;
    const recipientKey = `${msg.recipient_provider}/${msg.recipient_username}`;
    const isMe = myKey === senderKey;
    const fromName = isMe ? myUsername : msg.sender_username;
    const toName = isMe ? msg.recipient_username : myUsername;
    return { fromName, toName, isMe };
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendDm(thread.conversation, input.trim(), {
        subject: subject.trim() || undefined,
      });
      // Reflect the sent message in the parent's thread list immediately
      // (operator, 29.07: Sent folder didn't update without a refresh).
      onSent(msg);
      setInput('');
      setSubject('');
      setReplyingTo(null);
      setForwardTarget(null);
      onBack();
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  }

  function handleReply(msg: DmRecord) {
    const quoted = `\n\n--- ${msg.sender_username} wrote (${formatTimestamp(msg.sent_at)}) ---\n${msg.message}`;
    setInput(quoted);
    setSubject(msg.subject || '');
    setReplyingTo(msg);
    setForwardTarget(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleForward(msg: DmRecord) {
    const fwdBody = `\n\n--- Forwarded from ${msg.sender_username} (${formatTimestamp(msg.sent_at)}) ---\n${msg.subject ? `Subject: ${msg.subject}\n` : ''}${msg.message}`;
    setInput(fwdBody);
    setSubject(`Fwd: ${msg.subject || 'No subject'}`);
    setForwardTarget(msg);
    setReplyingTo(null);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function handleCancelCompose() {
    setInput('');
    setSubject('');
    setReplyingTo(null);
    setForwardTarget(null);
  }

  async function handleQuickSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const msg = await sendDm(thread.conversation, input.trim(), {
        subject: subject.trim() || undefined,
      });
      onSent(msg);
      setInput('');
      setSubject('');
      onBack();
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="mail-thread-detail">
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
            <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
              {thread.displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{thread.displayName}</p>
            <p className="text-xs text-muted-foreground">
              {thread.messageCount} message{thread.messageCount !== 1 ? 's' : ''} · {FOLDER_META[thread.folder].label}
            </p>
          </div>
        </div>
        {threadSubject && (
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex shrink-0">
            Re: {threadSubject}
          </Badge>
        )}
        <button
          onClick={onToggleSpam}
          className={cn(
            'flex items-center justify-center h-8 w-8 rounded-lg transition-colors duration-150',
            thread.spamFlagged
              ? 'text-danger hover:bg-danger-muted'
              : 'text-muted-foreground hover:bg-elevated',
          )}
          aria-label={thread.spamFlagged ? 'Remove from spam' : 'Mark as spam'}
          data-testid="mail-thread-detail-spam-toggle"
        >
          {thread.spamFlagged ? <FlagOff className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {thread.messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-sm text-muted-foreground">No messages in this thread</p>
          </div>
        ) : (
          thread.messages.map((msg) => {
            const isMe = myKey === `${msg.sender_provider}/${msg.sender_username}`;
            const { fromName, toName } = formatFromTo(msg);
            return (
              <div
                key={msg._id}
                className={cn(
                  'border border-border/50 rounded-lg overflow-hidden',
                  isMe ? 'bg-elevated/30' : 'bg-surface',
                )}
              >
                {/* From/To header block */}
                <div className="px-3 py-2 border-b border-border/30 space-y-0.5">
                  {msg.subject && (
                    <p className="text-sm font-semibold text-foreground">
                      {msg.subject}
                    </p>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs text-muted-foreground">From:</span>
                      <span className="text-xs font-medium text-foreground">{fromName}</span>
                    </div>
                    <ArrowRightLeft className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">To:</span>
                      <span className="text-xs font-medium text-foreground">{toName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatTimestamp(msg.sent_at)}
                    </span>
                  </div>
                </div>

                {/* Message body */}
                <div className="px-3 py-2.5">
                  <p className="text-sm leading-relaxed text-foreground break-words whitespace-pre-wrap">
                    {msg.message}
                  </p>
                </div>

                {/* Action bar */}
                <div className="px-3 py-1.5 border-t border-border/30 flex items-center gap-1">
                  <button
                    onClick={() => handleReply(msg)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated rounded-md transition-colors duration-150"
                    aria-label="Reply to this message"
                    data-testid="mail-message-reply"
                  >
                    <Reply className="w-3 h-3" />
                    Reply
                  </button>
                  <button
                    onClick={() => handleForward(msg)}
                    className="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-elevated rounded-md transition-colors duration-150"
                    aria-label="Forward this message"
                    data-testid="mail-message-forward"
                  >
                    <Repeat2 className="w-3 h-3" />
                    Forward
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Compose area */}
      {(replyingTo || forwardTarget) ? (
        <div className="border-t border-border bg-surface px-3 py-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {replyingTo ? 'Replying' : 'Forwarding'}
            </span>
            <button
              onClick={handleCancelCompose}
              className="flex items-center justify-center h-6 w-6 hover:bg-elevated rounded-md transition-colors duration-150"
              aria-label="Cancel compose"
              data-testid="mail-compose-cancel"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            data-testid="mail-compose-subject"
            className="h-8 text-xs"
          />
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type your message…"
              disabled={sending}
              data-testid="mail-compose-input"
              className="flex-1"
            />
            <Button
              variant="brand"
              size="sm"
              disabled={!input.trim() || sending}
              onClick={handleSend}
              data-testid="mail-compose-send"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="border-t border-border px-3 py-2">
          <div className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleQuickSend();
                }
              }}
              placeholder="Quick reply…"
              disabled={sending}
              data-testid="mail-quick-reply"
              className="flex-1 h-8 text-xs"
            />
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              data-testid="mail-quick-subject"
              className="w-28 h-8 text-xs shrink-0"
            />
            <Button
              variant="brand"
              size="icon"
              disabled={!input.trim() || sending}
              onClick={handleQuickSend}
              data-testid="mail-quick-send"
              aria-label="Send message"
              className="h-8 w-8"
            >
              <Send className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderEmptyState({ folder, search }: { folder: MailFolder; search: string }) {
  const Icon = FOLDER_META[folder].icon;
  const hasSearch = search.trim().length > 0;

  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <Icon className="w-8 h-8 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground mb-1">
        {hasSearch
          ? 'No threads found'
          : folder === 'inbox'
            ? 'Inbox is empty'
            : folder === 'sent'
              ? 'No sent messages'
              : 'No spam'}
      </p>
      <p className="text-xs text-muted-foreground/50">
        {hasSearch
          ? 'Try a different search'
          : folder === 'inbox'
            ? 'Messages you receive will appear here'
            : folder === 'sent'
              ? 'Messages you send will appear here'
              : 'Flagged senders will appear here'}
      </p>
    </div>
  );
}

export default function MailView() {
  const [threads, setThreads] = useState<MailThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedThread, setSelectedThread] = useState<MailThread | null>(null);
  const [contactMap, setContactMap] = useState<Record<string, ContactRecord>>({});
  const [activeFolder, setActiveFolder] = useState<MailFolder>('inbox');

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
        const spamFlagged = !!contact?.spam_flagged;
        const folder = classifyThread(lastMsg, me, spamFlagged);

        return {
          conversation: conv,
          otherUser: otherKey,
          displayName,
          messages,
          lastMessage: lastMsg,
          unread: false,
          messageCount: messages.length,
          folder,
          spamFlagged,
          contactId: contact?._id,
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

  const handleToggleSpam = useCallback(async (thread: MailThread) => {
    if (!thread.contactId) return;
    const newFlag = !thread.spamFlagged;
    try {
      await toggleSpamFlag(thread.contactId, newFlag);
      const token = getWapi().readToken();
      if (!token) return;
      const me = { provider: token.provider, username: token.username };
      const newFolder = classifyThread(thread.lastMessage, me, newFlag);

      setThreads((prev) =>
        prev.map((t) =>
          t.conversation === thread.conversation
            ? { ...t, spamFlagged: newFlag, folder: newFolder }
            : t,
        ),
      );
      if (selectedThread?.conversation === thread.conversation) {
        setSelectedThread((prev) => prev ? { ...prev, spamFlagged: newFlag, folder: newFolder } : null);
      }
    } catch (e) {
      console.error('Failed to toggle spam flag:', e);
    }
  }, [selectedThread]);

  // Reflect a just-sent message in the thread list immediately — update
  // lastMessage, reclassify the folder (a send moves the thread to Sent),
  // and re-sort newest-first, all without a reload.
  const handleSent = useCallback((conversation: string, msg: DmRecord) => {
    const token = getWapi().readToken();
    if (!token) return;
    const me = { provider: token.provider, username: token.username };
    setThreads((prev) =>
      prev
        .map((t) =>
          t.conversation === conversation
            ? {
                ...t,
                messages: [...t.messages, msg],
                lastMessage: msg,
                messageCount: t.messageCount + 1,
                folder: classifyThread(msg, me, t.spamFlagged),
              }
            : t,
        )
        .sort((a, b) => {
          const aTime = a.lastMessage ? new Date(a.lastMessage.sent_at).getTime() : 0;
          const bTime = b.lastMessage ? new Date(b.lastMessage.sent_at).getTime() : 0;
          return bTime - aTime;
        }),
    );
  }, []);

  const folderThreads = threads.filter((t) => t.folder === activeFolder);

  const displayed = search.trim()
    ? folderThreads.filter((t) =>
        t.displayName.toLowerCase().includes(search.toLowerCase()) ||
        t.lastMessage?.message.toLowerCase().includes(search.toLowerCase()),
      )
    : folderThreads;

  const currentThread = selectedThread
    ? threads.find((t) => t.conversation === selectedThread.conversation) || selectedThread
    : null;

  const folderCounts = {
    inbox: threads.filter((t) => t.folder === 'inbox').length,
    sent: threads.filter((t) => t.folder === 'sent').length,
    spam: threads.filter((t) => t.folder === 'spam').length,
  };

  if (currentThread) {
    return (
      <ThreadDetail
        thread={currentThread}
        onBack={() => setSelectedThread(null)}
        onToggleSpam={() => handleToggleSpam(currentThread)}
        onSent={(msg) => handleSent(currentThread.conversation, msg)}
      />
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0" data-testid="mail-view">
      {/* Header */}
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

      {/* Folder tabs — top rail at 375px, left rail at desktop */}
      <div className="flex items-center border-b border-border" data-testid="mail-folders">
        {/* Mobile: horizontal tabs */}
        <div className="flex items-center sm:hidden flex-1">
          {(Object.entries(FOLDER_META) as [MailFolder, typeof FOLDER_META['inbox']][]).map(([folder, { label, icon: Icon }]) => (
            <button
              key={folder}
              onClick={() => setActiveFolder(folder)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
                activeFolder === folder
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`mail-folder-${folder}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {folderCounts[folder] > 0 && (
                <Badge variant={folder === 'spam' ? 'danger' : 'outline'} className="text-[10px] h-4 px-1 ml-0.5">
                  {folderCounts[folder]}
                </Badge>
              )}
              {activeFolder === folder && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>

        {/* Desktop: left rail */}
        <div className="hidden sm:flex flex-col w-44 shrink-0 border-r border-border py-2">
          {(Object.entries(FOLDER_META) as [MailFolder, typeof FOLDER_META['inbox']][]).map(([folder, { label, icon: Icon }]) => (
            <button
              key={folder}
              onClick={() => setActiveFolder(folder)}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 text-sm font-medium transition-colors duration-150 rounded-lg mx-2',
                activeFolder === folder
                  ? 'bg-elevated text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated/50',
              )}
              data-testid={`mail-folder-${folder}`}
            >
              <Icon className="w-4 h-4" />
              <span className="flex-1 text-left">{label}</span>
              {folderCounts[folder] > 0 && (
                <Badge variant={folder === 'spam' ? 'danger' : 'outline'} className="text-[10px] h-4 px-1.5">
                  {folderCounts[folder]}
                </Badge>
              )}
            </button>
          ))}
        </div>

        {/* Desktop: content area */}
        <div className="hidden sm:block flex-1 overflow-y-auto">
          {loading ? (
            <div>
              {Array.from({ length: 5 }).map((_, i) => (
                <ThreadSkeleton key={i} />
              ))}
            </div>
          ) : displayed.length === 0 ? (
            <FolderEmptyState folder={activeFolder} search={search} />
          ) : (
            displayed.map((thread) => (
              <ThreadRow
                key={thread.conversation}
                thread={thread}
                onClick={() => setSelectedThread(thread)}
                onToggleSpam={() => handleToggleSpam(thread)}
              />
            ))
          )}
        </div>
      </div>

      {/* Mobile: content area (below tabs) */}
      <div className="sm:hidden flex-1 overflow-y-auto">
        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <ThreadSkeleton key={i} />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <FolderEmptyState folder={activeFolder} search={search} />
        ) : (
          displayed.map((thread) => (
            <ThreadRow
              key={thread.conversation}
              thread={thread}
              onClick={() => setSelectedThread(thread)}
              onToggleSpam={() => handleToggleSpam(thread)}
            />
          ))
        )}
      </div>
    </div>
  );
}
