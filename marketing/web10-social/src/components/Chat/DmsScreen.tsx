import { useState, useEffect, useRef } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getWapi } from '@/data/wapi';
import { listConversations, readDms, sendDm, getLastDm, readContacts } from '@/data';
import type { DmRecord, ContactRecord } from '@/data/types';
import { Send, MessageSquare, Sparkles, ChevronLeft } from 'lucide-react';
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

function DmsEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24 px-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mb-6">
        <Sparkles className="w-8 h-8 text-brand" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-2">No conversations yet</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Import your contacts from Instagram or add people to start messaging.
      </p>
      <Button
        variant="brand"
        className="gap-2"
        onClick={() => window.open('/exporters', '_blank')}
      >
        Import your Instagram
      </Button>
    </div>
  );
}

function MessageBubble({ msg, isMe }: { msg: DmRecord; isMe: boolean }) {
  return (
    <div className={cn('flex', isMe ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
          isMe
            ? 'bg-brand text-brand-foreground rounded-br-md'
            : 'bg-secondary text-foreground rounded-bl-md',
        )}
      >
        <p className="break-words">{msg.message}</p>
        <p className={cn(
          'text-xs mt-1',
          isMe ? 'text-brand-foreground/60' : 'text-muted-foreground',
        )}>
          {formatTime(msg.sent_at)}
        </p>
      </div>
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
  const [lastMessages, setLastMessages] = useState<Record<string, DmRecord | null>>({});
  const [contactMap, setContactMap] = useState<Record<string, ContactRecord>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const token = getWapi().readToken();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadData() {
    setLoading(true);
    try {
      const [convs, contactsData] = await Promise.all([
        listConversations(),
        readContacts(),
      ]);
      setConversations(convs);
      setContacts(contactsData);

      const cMap: Record<string, ContactRecord> = {};
      contactsData.forEach(c => {
        cMap[`${c.provider}/${c.username}`] = c;
      });
      setContactMap(cMap);

      const lastMsgs: Record<string, DmRecord | null> = {};
      for (const conv of convs) {
        const last = await getLastDm(conv);
        lastMsgs[conv] = last;
      }
      setLastMessages(lastMsgs);
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

  async function sendMessage() {
    if (!selectedConv || !input.trim()) return;
    try {
      const msg = await sendDm(selectedConv, input.trim());
      setMessages(prev => [...prev, msg]);
      setInput('');
    } catch (e) {
      console.error('Failed to send message:', e);
    }
  }

  function getOtherUser(conv: string): string {
    if (!token) return conv;
    const parts = conv.replace('dm-', '').split('--');
    const me = `${token.provider}/${token.username}`;
    return parts.find(p => p !== me) || conv;
  }

  function getDisplayName(userKey: string): string {
    const contact = contactMap[userKey];
    if (contact) return contact.display_name || contact.username;
    return userKey.split('/')[1] || userKey;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-2 border-brand/30 border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  if (selectedConv) {
    const otherUser = getOtherUser(selectedConv);
    const displayName = getDisplayName(otherUser);

    return (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <button
            className="p-1 hover:bg-secondary rounded-md transition-colors"
            onClick={() => setSelectedConv(null)}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-brand/20 text-brand text-xs font-semibold">
              {displayName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-semibold text-sm">{displayName}</span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-muted-foreground">No messages yet</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg._id}
                msg={msg}
                isMe={token ? `${token.provider}/${token.username}` === `${msg.sender_provider}/${msg.sender_username}` : false}
              />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-4 py-3 border-t border-border">
          <form
            onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
            className="flex gap-2"
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message..."
              className="flex-1 bg-secondary/50 border-0"
            />
            <Button
              type="submit"
              variant="brand"
              size="icon"
              disabled={!input.trim()}
            >
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  if (!conversations.length) {
    return <DmsEmptyState />;
  }

  return (
    <div>
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground">Messages</h1>
      </div>
      <div>
        {conversations.map((conv) => {
          const otherUser = getOtherUser(conv);
          const displayName = getDisplayName(otherUser);
          const lastMsg = lastMessages[conv];

          return (
            <button
              key={conv}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 transition-colors text-left"
              onClick={() => openConversation(conv)}
            >
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-brand/20 text-brand font-semibold">
                  {displayName.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-sm text-foreground truncate">{displayName}</span>
                  <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                    {lastMsg ? formatTime(lastMsg.sent_at) : ''}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {lastMsg?.message || 'No messages yet'}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}