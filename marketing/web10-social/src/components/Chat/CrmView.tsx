import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { getWapi } from '@/data/wapi';
import { readContacts, listConversations, readDms, updateContactNote } from '@/data';
import type { DmRecord, ContactRecord } from '@/data/types';
import { Search, User, MessageSquare, Edit3, Save, X, ChevronLeft, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

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

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface CrmContactEntry {
  contact: ContactRecord | null;
  userKey: string;
  displayName: string;
  username: string;
  provider: string;
  messageCount: number;
  lastMessage: DmRecord | null;
  note: string;
  conversation: string;
}

function ContactSkeleton() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30">
      <Skeleton className="h-10 w-10 rounded-full shrink-0" />
      <div className="flex-1 min-w-0">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-2.5 w-32 mt-1.5" />
      </div>
    </div>
  );
}

function ContactRow({
  entry,
  onClick,
}: {
  entry: CrmContactEntry;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-3 text-left border-b border-border/30 hover:bg-elevated/80 transition-colors duration-150 min-h-[44px]"
      data-testid="crm-contact-row"
    >
      <Avatar className="h-10 w-10 shrink-0">
        <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
          {entry.displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-foreground truncate">
            {entry.displayName}
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            {entry.note && (
              <Badge variant="brand">
                <Edit3 className="w-3 h-3 mr-1" />
                Note
              </Badge>
            )}
            <Badge variant="outline">
              {entry.messageCount} msg{entry.messageCount !== 1 ? 's' : ''}
            </Badge>
          </div>
        </div>
        <p className="text-xs text-muted-foreground truncate mt-0.5">
          @{entry.username}
          {entry.provider !== 'web10' ? ` · ${entry.provider}` : ''}
          {entry.lastMessage ? ` · ${formatTime(entry.lastMessage.sent_at)}` : ''}
        </p>
        {entry.note && (
          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
            {entry.note}
          </p>
        )}
      </div>
    </button>
  );
}

function ContactDetail({
  entry,
  onBack,
  onSaveNote,
}: {
  entry: CrmContactEntry;
  onBack: () => void;
  onSaveNote: (userKey: string, note: string) => void;
}) {
  const [messages, setMessages] = useState<DmRecord[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(entry.note);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setNoteDraft(entry.note);
    loadMessages();
  }, [entry.conversation]);

  async function loadMessages() {
    setLoading(true);
    try {
      const msgs = await readDms(entry.conversation);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
    }
    setLoading(false);
  }

  function handleSaveNote() {
    onSaveNote(entry.userKey, noteDraft);
    setEditingNote(false);
  }

  function handleCancelNote() {
    setNoteDraft(entry.note);
    setEditingNote(false);
  }

  return (
    <div className="flex flex-col h-full" data-testid="crm-contact-detail">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onBack}
          className="flex items-center justify-center h-8 w-8 hover:bg-elevated rounded-lg transition-colors duration-150"
          aria-label="Back to contact list"
          data-testid="crm-back-button"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
            {entry.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{entry.displayName}</p>
          <p className="text-xs text-muted-foreground">@{entry.username}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact info card */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <User className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact Info</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Username</span>
              <span className="text-sm text-foreground">@{entry.username}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Provider</span>
              <span className="text-sm text-foreground">{entry.provider}</span>
            </div>
            {entry.contact?.added_at && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Added</span>
                <span className="text-sm text-foreground tabular-nums">
                  {new Date(entry.contact.added_at).toLocaleDateString()}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Messages</span>
              <span className="text-sm text-foreground tabular-nums">{entry.messageCount}</span>
            </div>
            {entry.lastMessage && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last contact</span>
                <span className="text-sm text-foreground tabular-nums">
                  {formatTimestamp(entry.lastMessage.sent_at)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Notes section */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Notes</h3>
            </div>
            {!editingNote && (
              <button
                onClick={() => setEditingNote(true)}
                className="text-xs text-brand hover:text-brand-400 transition-colors duration-150"
                data-testid="crm-edit-note-btn"
              >
                {entry.note ? 'Edit note' : 'Add note'}
              </button>
            )}
          </div>
          {editingNote ? (
            <div className="space-y-2">
              <Textarea
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="Add a note about this contact…"
                rows={3}
                data-testid="crm-note-input"
                className="text-sm resize-none"
              />
              <div className="flex gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelNote}
                  data-testid="crm-cancel-note"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleSaveNote}
                  data-testid="crm-save-note"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : entry.note ? (
            <p className="text-sm text-foreground leading-relaxed">{entry.note}</p>
          ) : (
            <p className="text-sm text-muted-foreground/60 italic">No notes yet</p>
          )}
        </div>

        {/* Message history */}
        <div className="px-4 py-4">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Message History</h3>
          </div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <Skeleton className="h-12 w-48" />
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground/60 italic">No messages yet</p>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                const token = getWapi().readToken();
                const isMe = token
                  ? `${token.provider}/${token.username}` === `${msg.sender_provider}/${msg.sender_username}`
                  : false;
                return (
                  <div
                    key={msg._id}
                    className={cn(
                      'flex gap-3',
                      isMe ? 'flex-row-reverse' : '',
                    )}
                  >
                    <Avatar className="h-7 w-7 shrink-0 mt-0.5">
                      <AvatarFallback className="bg-brand-muted text-brand-300 text-[10px] font-semibold">
                        {isMe ? 'Y' : entry.displayName.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className={cn(
                      'max-w-[80%]',
                      isMe ? 'text-right' : '',
                    )}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-foreground">
                          {isMe ? 'You' : entry.displayName}
                        </span>
                        <span className="text-[10px] text-muted-foreground tabular-nums">
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
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CrmView() {
  const [contacts, setContacts] = useState<CrmContactEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedContact, setSelectedContact] = useState<CrmContactEntry | null>(null);

  const loadContacts = useCallback(async () => {
    setLoading(true);
    try {
      const token = getWapi().readToken();
      if (!token) {
        setLoading(false);
        return;
      }

      const me = { provider: token.provider, username: token.username };
      const meKey = `${me.provider}/${me.username}`;

      const [convs, contactRecords] = await Promise.all([
        listConversations(),
        readContacts(),
      ]);

      const cMap: Record<string, ContactRecord> = {};
      contactRecords.forEach((c) => {
        cMap[`${c.provider}/${c.username}`] = c;
      });

      const entryPromises = convs.map(async (conv) => {
        const parts = conv.split('--');
        const otherKey = parts.find((p) => p !== meKey) || parts[0];
        const [provider, username] = otherKey.split('/');
        const contact = cMap[otherKey] || null;
        const displayName = contact?.display_name || username || otherKey;

        const messages = await readDms(conv).catch(() => []);
        const lastMsg = messages[messages.length - 1] || null;

        return {
          contact,
          userKey: otherKey,
          displayName,
          username: username || otherKey,
          provider: provider || 'web10',
          messageCount: messages.length,
          lastMessage: lastMsg,
          note: contact?.note || '',
          conversation: conv,
        } as CrmContactEntry;
      });

      const loaded = await Promise.all(entryPromises);
      loaded.sort((a, b) => {
        const aTime = a.lastMessage ? new Date(a.lastMessage.sent_at).getTime() : 0;
        const bTime = b.lastMessage ? new Date(b.lastMessage.sent_at).getTime() : 0;
        return bTime - aTime;
      });
      setContacts(loaded);
    } catch (e) {
      console.error('Failed to load CRM contacts:', e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  async function handleSaveNote(userKey: string, note: string) {
    try {
      const contact = contacts.find((c) => c.userKey === userKey);
      if (contact?.contact?._id) {
        await updateContactNote(contact.contact._id, note);
      }
      setContacts((prev) =>
        prev.map((c) =>
          c.userKey === userKey ? { ...c, note } : c,
        ),
      );
      if (selectedContact?.userKey === userKey) {
        setSelectedContact((prev) => prev ? { ...prev, note } : null);
      }
    } catch (e) {
      console.error('Failed to save note:', e);
    }
  }

  const filtered = search.trim()
    ? contacts.filter((c) =>
        c.displayName.toLowerCase().includes(search.toLowerCase()) ||
        c.username.toLowerCase().includes(search.toLowerCase()) ||
        c.note.toLowerCase().includes(search.toLowerCase()),
      )
    : contacts;

  if (selectedContact) {
    return (
      <ContactDetail
        entry={selectedContact}
        onBack={() => setSelectedContact(null)}
        onSaveNote={handleSaveNote}
      />
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="crm-view">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
        <h1 className="font-display text-lg font-bold text-foreground">Contacts</h1>
        <div className="relative flex-1 max-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search contacts…"
            data-testid="crm-search"
            className="w-full h-8 pl-8 pr-2 rounded-sm border border-input bg-transparent text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-brand/50 transition-colors duration-150"
          />
        </div>
      </div>

      {loading ? (
        <div>
          {Array.from({ length: 5 }).map((_, i) => (
            <ContactSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <User className="w-8 h-8 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-1">
            {search.trim() ? 'No contacts found' : 'No contacts with messages yet'}
          </p>
          <p className="text-xs text-muted-foreground/50">
            Message someone to add them to your contacts
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((entry) => (
            <ContactRow
              key={entry.userKey}
              entry={entry}
              onClick={() => setSelectedContact(entry)}
            />
          ))}
        </div>
      )}
    </div>
  );
}