import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { getWapi } from '@/data/wapi';
import { listConversations, readDms, sendDm, getLastDm, readContacts, startConversation, conversationKey as deriveConversationKey, readFollows, addContact, deleteDm, updateDm, deleteConversation } from '@/data';
import type { DmRecord, ContactRecord, FollowRecord } from '@/data/types';
import { Send, ChevronLeft, Plus, X, Search, MessageSquare, Mail, Users, MoreVertical, Edit3, Trash2, Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TextWithLinks } from '@/components/Feed/LinkEmbed';
import { MARKETING_ORIGIN } from '@/lib/origins';
import MailView from './MailView';
import CrmView from './CrmView';

type MessagesView = 'chat' | 'mail' | 'crm';

function formatTime(dateStr: string): string {
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

interface PickerPerson {
  username: string;
  provider: string;
  display_name?: string;
  source: 'contact' | 'follow' | 'search';
}

function ContactPicker({
  onClose,
  onSelect,
  prefilledUsername,
}: {
  onClose: () => void;
  onSelect: (person: PickerPerson, initialMessage?: string) => void;
  prefilledUsername?: string;
}) {
  const [people, setPeople] = useState<PickerPerson[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [composeMode, setComposeMode] = useState(!!prefilledUsername);
  const [composeUsername, setComposeUsername] = useState(prefilledUsername || '');
  const [composeProvider, setComposeProvider] = useState('');
  const [composeMessage, setComposeMessage] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadPeople();
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function loadPeople() {
    setLoading(true);
    try {
      const [contacts, follows] = await Promise.all([
        readContacts(),
        readFollows(),
      ]);

      const map = new Map<string, PickerPerson>();

      contacts.forEach((c) => {
        const key = `${c.provider}/${c.username}`;
        map.set(key, {
          username: c.username,
          provider: c.provider,
          display_name: c.display_name,
          source: 'contact',
        });
      });

      follows
        .filter((f) => f.status === 'active')
        .forEach((f) => {
          const key = `${f.provider}/${f.username}`;
          if (!map.has(key)) {
            map.set(key, {
              username: f.username,
              provider: f.provider,
              source: 'follow',
            });
          }
        });

      setPeople([...map.values()]);
    } catch (e) {
      console.error('Failed to load contacts/follows:', e);
    }
    setLoading(false);
  }

  const filtered = search.trim()
    ? people.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.username.toLowerCase().includes(q) ||
          p.display_name?.toLowerCase().includes(q)
        );
      })
    : people;

  const token = getWapi().readToken();
  const myKey = token ? `${token.provider}/${token.username}` : '';

  async function handleSelect(person: PickerPerson, initialMsg?: string) {
    if (!token) return;
    if (initialMsg?.trim()) {
      setSending(true);
      try {
        const { conversation } = await startConversation(
          { username: person.username, provider: person.provider },
          initialMsg.trim(),
        );
        onSelect(person, conversation);
      } catch (e) {
        console.error('Failed to start conversation:', e);
      } finally {
        setSending(false);
      }
    } else {
      onSelect(person);
    }
  }

  async function handleComposeToUsername() {
    if (!token || !composeUsername.trim()) return;
    const username = composeUsername.trim().toLowerCase();
    const provider = composeProvider.trim() || token.provider;

    setSending(true);
    try {
      // Add as contact first (so they show up in the picker)
      await addContact({
        username,
        provider,
        added_at: new Date().toISOString(),
      });

      const { conversation } = await startConversation(
        { username, provider },
        composeMessage.trim() || 'Hey!',
      );

      const person: PickerPerson = {
        username,
        provider,
        source: 'contact',
      };
      setPeople((prev) => [person, ...prev]);
      onSelect(person, conversation);
    } catch (e) {
      console.error('Failed to compose to username:', e);
    } finally {
      setSending(false);
    }
  }

  function displayName(p: PickerPerson): string {
    return p.display_name || p.username;
  }

  return (
    <div className="flex flex-col h-full" data-testid="dm-contact-picker">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <button
          onClick={onClose}
          className="flex items-center justify-center h-8 w-8 hover:bg-elevated rounded-lg transition-colors duration-150"
          aria-label="Close picker"
          data-testid="dm-picker-close"
        >
          <X className="w-4 h-4" />
        </button>
        <h2 className="font-display text-sm font-semibold text-foreground">New message</h2>
      </div>

      {/* Search */}
      <div className="px-4 py-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            data-testid="dm-picker-search"
            className="w-full h-9 pl-9 pr-3 rounded-sm border border-input bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
        </div>
      </div>

      {composeMode ? (
        /* Compose to username */
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Message someone by username
          </p>
          <input
            value={composeUsername}
            onChange={(e) => setComposeUsername(e.target.value)}
            placeholder="Username"
            data-testid="dm-compose-username"
            className="w-full h-9 px-3 rounded-sm border border-input bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
          <input
            value={composeProvider}
            onChange={(e) => setComposeProvider(e.target.value)}
            placeholder="Provider (optional)"
            data-testid="dm-compose-provider"
            className="w-full h-9 px-3 rounded-sm border border-input bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
          <textarea
            value={composeMessage}
            onChange={(e) => setComposeMessage(e.target.value)}
            placeholder="Message…"
            data-testid="dm-compose-message"
            rows={3}
            className="w-full px-3 py-2 rounded-sm border border-input bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150 resize-none"
          />
          <Button
            variant="brand"
            size="sm"
            className="w-full"
            disabled={!composeUsername.trim() || sending}
            onClick={handleComposeToUsername}
            data-testid="dm-compose-send"
          >
            Send message
          </Button>
          <button
            onClick={() => {
              setComposeMode(false);
              setComposeUsername('');
              setComposeProvider('');
              setComposeMessage('');
            }}
            className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 py-1"
          >
            Back to contacts
          </button>
        </div>
      ) : loading ? (
        <div className="flex-1 overflow-y-auto px-4 py-2 space-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 py-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-muted-foreground mb-2">
                {search.trim() ? 'No contacts found' : 'No contacts yet'}
              </p>
              {!search.trim() && (
                <p className="text-xs text-muted-foreground/60 mb-4">
                  Add someone by username to start messaging
                </p>
              )}
            </div>
          ) : (
            filtered
              .filter((p) => `${p.provider}/${p.username}` !== myKey)
              .map((p) => (
                <button
                  key={`${p.provider}/${p.username}`}
                  data-testid="dm-picker-person"
                  className="w-full flex items-center gap-3 px-4 py-2.5 min-h-[44px] hover:bg-elevated/80 transition-all duration-150 text-left"
                  onClick={() => handleSelect(p)}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
                      {displayName(p).charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {displayName(p)}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      @{p.username}
                      {p.provider !== token?.provider ? ` · ${p.provider}` : ''}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'text-[10px] font-medium px-1.5 py-0.5 rounded uppercase tracking-wider shrink-0',
                      p.source === 'contact'
                        ? 'bg-brand-muted text-brand-300'
                        : 'bg-elevated text-muted-foreground',
                    )}
                  >
                    {p.source === 'contact' ? 'Contact' : 'Follow'}
                  </span>
                </button>
              ))
          )}

          {/* Compose fallback */}
          <div className="px-4 py-3 border-t border-border/50">
            <button
              onClick={() => setComposeMode(true)}
              data-testid="dm-compose-username-btn"
              className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150"
            >
              <Search className="w-3.5 h-3.5" />
              Message by username
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DmsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center" data-testid="dms-empty">
      <p className="text-sm text-muted-foreground mb-3">No conversations yet. Find someone to message or start a new thread.</p>
      <p className="text-xs text-muted-foreground/50">
        Or{' '}
        <button
          data-testid="dms-import-cta"
          className="text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
          onClick={() => window.open(`${MARKETING_ORIGIN}/import`, '_blank', 'noopener,noreferrer')}
        >
          import your contacts
        </button>
      </p>
    </div>
  );
}

function DmsSkeleton() {
  return (
    <div data-testid="dms-skeleton">
      <div className="px-4 py-4 border-b border-border">
        <Skeleton className="h-5 w-28" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <Skeleton className="h-12 w-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-elevated px-4 py-3 rounded-2xl rounded-bl-md">
        <div className="flex gap-1">
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

function MessageContextMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && ref.current.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-center h-6 w-6 hover:bg-white/20 rounded-full transition-colors duration-150"
        aria-label="Message options"
        data-testid="message-options-btn"
      >
        <MoreVertical className="w-3 h-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 bg-surface border border-border rounded-lg shadow-lg overflow-hidden min-w-[140px]">
          {onEdit && (
            <button
              onClick={() => { onEdit(); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-foreground hover:bg-elevated transition-colors duration-150"
              data-testid="message-edit-btn"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          )}
          <button
            onClick={() => { onDelete(); setOpen(false); }}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger hover:bg-danger-muted transition-colors duration-150"
            data-testid="message-delete-btn"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  confirmLabel = 'Delete',
  variant = 'destructive',
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  variant?: 'destructive' | 'default';
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" data-testid="confirm-dialog">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-surface border border-border rounded-lg shadow-lg max-w-sm w-full p-5">
        <h3 className="text-sm font-semibold text-foreground mb-1">{title}</h3>
        <p className="text-xs text-muted-foreground mb-4">{description}</p>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="confirm-cancel">
            Cancel
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'brand'}
            size="sm"
            onClick={onConfirm}
            data-testid="confirm-ok"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  msg,
  isMe,
  onDelete,
  onEdit,
}: {
  msg: DmRecord;
  isMe: boolean;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(msg.message);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!draft.trim()) return;
    setSaving(true);
    try {
      await onEdit(msg._id!);
      setEditing(false);
    } catch (e) {
      console.error('Failed to edit message:', e);
      setDraft(msg.message);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDraft(msg.message);
    setEditing(false);
  }

  return (
    <div className={cn('flex items-end gap-1.5', isMe ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'group max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed transition-shadow duration-150 relative',
          isMe
            ? cn(
                'bg-gradient-to-br from-brand to-brand-600 text-brand-foreground rounded-br-md',
                'shadow-md shadow-brand/10',
              )
            : 'bg-elevated text-foreground rounded-bl-md',
        )}
      >
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              autoFocus
              rows={2}
              className="w-full bg-transparent text-sm leading-relaxed break-words resize-none outline-none"
              data-testid="message-edit-input"
            />
            <div className="flex gap-1.5 justify-end">
              <button
                onClick={handleCancel}
                className="flex items-center justify-center h-6 w-6 hover:bg-white/20 rounded-full transition-colors duration-150"
                aria-label="Cancel edit"
                data-testid="message-edit-cancel"
              >
                <X className="w-3 h-3" />
              </button>
              <button
                onClick={handleSave}
                disabled={!draft.trim() || saving}
                className="flex items-center justify-center h-6 w-6 hover:bg-white/20 rounded-full transition-colors duration-150 disabled:opacity-50"
                aria-label="Save edit"
                data-testid="message-edit-save"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
              </button>
            </div>
          </div>
        ) : (
          <>
            <TextWithLinks text={msg.message} className="break-words" />
            <p className={cn('text-xs mt-1', isMe ? 'text-brand-foreground/60' : 'text-muted-foreground')}>
              {formatTime(msg.sent_at)}
              {msg.updated_at ? ' (edited)' : ''}
            </p>
          </>
        )}
      </div>
      {isMe && !editing && (
        <MessageContextMenu
          onEdit={() => setEditing(true)}
          onDelete={() => onDelete(msg._id!)}
        />
      )}
    </div>
  );
}

export default function DmsScreen() {
  const [conversations, setConversations] = useState<string[]>([]);
  const [contacts, setContacts] = useState<ContactRecord[]>([]);
  const [selectedConv, setSelectedConv] = useState<string | null>(null);
  const [messages, setMessages] = useState<DmRecord[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [lastMessages, setLastMessages] = useState<Record<string, DmRecord | null>>({});
  const [contactMap, setContactMap] = useState<Record<string, ContactRecord>>({});
  const [showPicker, setShowPicker] = useState(false);
  const [activeView, setActiveView] = useState<MessagesView>('chat');
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; description: string; onConfirm: () => void; confirmLabel?: string; variant?: 'destructive' | 'default' }>({ open: false, title: '', description: '', onConfirm: () => {} });
  const [searchParams] = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = getWapi().readToken();

  useEffect(() => {
    loadData();
  }, []);

  // Handle ?to=<username> deep link from profile Message button
  useEffect(() => {
    const to = searchParams.get('to');
    if (!to || !token || loading) return;

    const existingConv = conversations.find((conv) => {
      const other = conv.split('--').find((p) => p !== `${token.provider}/${token.username}`);
      return other && other.split('/')[1] === to;
    });

    if (existingConv) {
      openConversation(existingConv);
    } else {
      // No existing conversation — open picker prefilled with the username
      setShowPicker(true);
    }
  }, [searchParams, token, loading, conversations]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadData() {
    setLoading(true);
    try {
      const [convs, contactsData] = await Promise.all([listConversations(), readContacts()]);

      const cMap: Record<string, ContactRecord> = {};
      contactsData.forEach((c) => {
        cMap[`${c.provider}/${c.username}`] = c;
      });
      setContactMap(cMap);

      const lastMsgs: Record<string, DmRecord | null> = {};
      for (const conv of convs) {
        lastMsgs[conv] = await getLastDm(conv);
      }
      setLastMessages(lastMsgs);

      // Sort conversations by last-message recency, newest first
      // (operator, 29.07: the list was in insertion order — oldest on top).
      const sorted = [...convs].sort((a, b) => {
        const aTime = lastMsgs[a] ? new Date(lastMsgs[a]!.sent_at).getTime() : 0;
        const bTime = lastMsgs[b] ? new Date(lastMsgs[b]!.sent_at).getTime() : 0;
        return bTime - aTime;
      });
      setConversations(sorted);
      setContacts(contactsData);
    } catch (e) {
      console.error('Failed to load DMs:', e);
    }
    setLoading(false);
  }

  async function openConversation(conv: string) {
    setSelectedConv(conv);
    try {
      const msgs = await readDms(conv);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
  }

  const handlePickerSelect = useCallback(
    async (person: PickerPerson, existingConv?: string) => {
      setShowPicker(false);
      const conv =
        existingConv || deriveConversationKey(
          { provider: token!.provider, username: token!.username },
          { username: person.username, provider: person.provider },
        );
      await openConversation(conv);
    },
    [token],
  );

  async function sendMessage() {
    if (!selectedConv || !input.trim()) return;
    setSending(true);
    try {
      const msg = await sendDm(selectedConv, input.trim());
      setMessages((prev) => [...prev, msg]);
      setInput('');
    } catch (e) {
      console.error('Failed to send message:', e);
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(id: string) {
    setConfirmDialog({
      open: true,
      title: 'Delete message',
      description: 'This will permanently delete this message.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deleteDm(id);
          setMessages((prev) => prev.filter((m) => m._id !== id));
        } catch (e) {
          console.error('Failed to delete message:', e);
        }
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  async function handleEditMessage(id: string) {
    try {
      const msg = messages.find((m) => m._id === id);
      if (!msg) return;
      const updated = await updateDm(id, msg.message);
      setMessages((prev) => prev.map((m) => m._id === id ? updated : m));
    } catch (e) {
      console.error('Failed to edit message:', e);
    }
  }

  async function handleDeleteConversation(conv: string) {
    setConfirmDialog({
      open: true,
      title: 'Delete conversation',
      description: 'This will permanently delete all messages in this conversation.',
      confirmLabel: 'Delete',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deleteConversation(conv);
          setSelectedConv(null);
          setMessages([]);
          await loadData();
        } catch (e) {
          console.error('Failed to delete conversation:', e);
        }
        setConfirmDialog((prev) => ({ ...prev, open: false }));
      },
    });
  }

  function getOtherUser(conv: string): string {
    if (!token) return conv;
    const parts = conv.split('--');
    const me = `${token.provider}/${token.username}`;
    return parts.find((p) => p !== me) || conv;
  }

  function getDisplayName(userKey: string): string {
    const contact = contactMap[userKey];
    if (contact) return contact.display_name || contact.username;
    return userKey.split('/')[1] || userKey;
  }

  if (showPicker) {
    return (
      <ContactPicker
        onClose={() => setShowPicker(false)}
        onSelect={handlePickerSelect}
        prefilledUsername={searchParams.get('to') || undefined}
      />
    );
  }

  // Alternate views: mail and CRM
  if (activeView === 'mail') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b border-border" data-testid="messages-view-toggle">
          {([
            ['chat', 'Chat', MessageSquare],
            ['mail', 'Mail', Mail],
            ['crm', 'CRM', Users],
          ] as [MessagesView, string, typeof MessageSquare][]).map(([view, label, Icon]) => (
            <button
              key={view}
              onClick={() => {
                setActiveView(view);
                setSelectedConv(null);
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
                activeView === view
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`view-toggle-${view}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {activeView === view && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <MailView />
        </div>
      </div>
    );
  }

  if (activeView === 'crm') {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b border-border" data-testid="messages-view-toggle">
          {([
            ['chat', 'Chat', MessageSquare],
            ['mail', 'Mail', Mail],
            ['crm', 'CRM', Users],
          ] as [MessagesView, string, typeof MessageSquare][]).map(([view, label, Icon]) => (
            <button
              key={view}
              onClick={() => {
                setActiveView(view);
                setSelectedConv(null);
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
                activeView === view
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`view-toggle-${view}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {activeView === view && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-hidden">
          <CrmView />
        </div>
      </div>
    );
  }

  if (loading) {
    return <DmsSkeleton />;
  }

  if (selectedConv) {
    const otherUser = getOtherUser(selectedConv);
    const displayName = getDisplayName(otherUser);

    return (
      <div className="flex flex-col h-full" data-testid="dm-conversation">
        {/* Header */}
        <div className="flex items-center gap-3 px-2 py-2 border-b border-border">
          <button
            className="flex items-center justify-center h-11 w-11 hover:bg-elevated rounded-lg transition-colors duration-150"
            onClick={() => setSelectedConv(null)}
            aria-label="Back to messages"
            data-testid="dm-back-button"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="relative">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
                {displayName.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className={cn(
              'absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background',
              'bg-success animate-glow-pulse',
            )} />
          </div>
          <span className="font-medium text-sm text-foreground flex-1">{displayName}</span>
          <button
            onClick={() => handleDeleteConversation(selectedConv)}
            className="flex items-center justify-center h-11 w-11 hover:bg-danger-muted rounded-lg transition-colors duration-150 text-muted-foreground hover:text-danger"
            aria-label="Delete conversation"
            data-testid="dm-delete-conversation-btn"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <p className="text-sm text-muted-foreground mb-1">No messages yet</p>
              <p className="text-xs text-muted-foreground/60">Say hello to start the conversation</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                msg={msg}
                isMe={
                  token
                    ? `${token.provider}/${token.username}` === `${msg.sender_provider}/${msg.sender_username}`
                    : false
                }
                onDelete={handleDeleteMessage}
                onEdit={handleEditMessage}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message…"
              disabled={sending}
              data-testid="dm-input"
              className="flex-1"
            />
            <Button type="submit" variant="brand" size="icon" disabled={!input.trim() || sending} data-testid="dm-send-button" aria-label="Send message">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!conversations.length) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center border-b border-border" data-testid="messages-view-toggle">
          {([
            ['chat', 'Chat', MessageSquare],
            ['mail', 'Mail', Mail],
            ['crm', 'CRM', Users],
          ] as [MessagesView, string, typeof MessageSquare][]).map(([view, label, Icon]) => (
            <button
              key={view}
              onClick={() => {
                setActiveView(view);
                setSelectedConv(null);
              }}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
                activeView === view
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              data-testid={`view-toggle-${view}`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {activeView === view && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
              )}
            </button>
          ))}
        </div>
        <div className="px-4 py-4 border-b border-border flex items-center justify-between">
          <h1 className="font-display text-lg font-bold text-foreground">Messages</h1>
          <Button
            variant="brand"
            size="sm"
            onClick={() => setShowPicker(true)}
            data-testid="dm-new-message-btn"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            New message
          </Button>
        </div>
        <DmsEmptyState />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center border-b border-border" data-testid="messages-view-toggle">
        {([
          ['chat', 'Chat', MessageSquare],
          ['mail', 'Mail', Mail],
          ['crm', 'CRM', Users],
        ] as [MessagesView, string, typeof MessageSquare][]).map(([view, label, Icon]) => (
          <button
            key={view}
            onClick={() => {
              setActiveView(view);
              setSelectedConv(null);
            }}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium transition-all duration-150 relative',
              activeView === view
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            data-testid={`view-toggle-${view}`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
            {activeView === view && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand" />
            )}
          </button>
        ))}
      </div>
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="font-display text-lg font-bold text-foreground">Messages</h1>
        <Button
          variant="brand"
          size="sm"
          onClick={() => setShowPicker(true)}
          data-testid="dm-new-message-btn"
        >
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New message
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.map((conv) => {
          const otherUser = getOtherUser(conv);
          const displayName = getDisplayName(otherUser);
          const lastMsg = lastMessages[conv];

          return (
            <div className="group relative" key={conv}>
              <button
                data-testid="dm-conversation-item"
                className="w-full flex items-center gap-3 px-4 py-3 min-h-[44px] hover:bg-elevated/80 transition-all duration-150 text-left border-b border-border/30"
                onClick={() => openConversation(conv)}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-brand-muted text-brand-300 font-semibold">
                      {displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className={cn(
                    'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background',
                    'bg-success',
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm text-foreground truncate">{displayName}</span>
                    <span className="text-xs text-muted-foreground ml-2 shrink-0">
                      {lastMsg ? formatTime(lastMsg.sent_at) : ''}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground truncate mt-0.5">
                    {lastMsg?.message || 'No messages yet'}
                  </p>
                </div>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteConversation(conv);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 flex items-center justify-center h-8 w-8 hover:bg-danger-muted rounded-lg transition-all duration-150 text-muted-foreground hover:text-danger"
                aria-label={`Delete conversation with ${displayName}`}
                data-testid="dm-delete-conversation-list-btn"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        variant={confirmDialog.variant}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}