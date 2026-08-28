import { useState, useEffect, useCallback, useMemo } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { getWapi } from '@/data/wapi';
import {
  readContacts,
  listConversations,
  readDms,
  updateContactNote,
  updateContactStatus,
  updateContact,
  addContact,
  deleteContact,
} from '@/data';
import type { DmRecord, ContactRecord, CrmStatus } from '@/data/types';
import {
  Search,
  User,
  UserPlus,
  MessageSquare,
  Edit3,
  Save,
  X,
  ChevronLeft,
  ArrowUpDown,
  Filter,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Link,
  Trash2,
  Plus,
  Minus,
} from 'lucide-react';
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
  crmStatus: CrmStatus | undefined;
  email?: string;
  phone?: string;
  company?: string;
  role?: string;
  links?: string;
  custom_fields?: Record<string, string>;
  isNew?: boolean;
}

const STATUS_COLORS: Record<CrmStatus, { bg: string; ring: string; label: string }> = {
  green: { bg: 'bg-success', ring: 'ring-success/40', label: 'Green' },
  yellow: { bg: 'bg-warning', ring: 'ring-warning/40', label: 'Yellow' },
  red: { bg: 'bg-danger', ring: 'ring-danger/40', label: 'Red' },
};

function StatusDot({ status, size = 'sm' }: { status: CrmStatus | undefined; size?: 'sm' | 'md' }) {
  if (!status) return null;
  const c = STATUS_COLORS[status];
  return (
    <span
      className={cn(
        'shrink-0 rounded-full ring-1',
        c.bg,
        c.ring,
        size === 'sm' ? 'h-2 w-2' : 'h-3 w-3',
      )}
      data-testid={`crm-status-${status}`}
      title={c.label}
    />
  );
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
  onDelete,
}: {
  entry: CrmContactEntry;
  onClick: () => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-border/30 hover:bg-elevated/80 transition-colors duration-150 min-h-[44px] group">
      <button
        onClick={onClick}
        className="flex-1 flex items-center gap-3 text-left min-w-0"
        data-testid="crm-contact-row"
      >
        <Avatar className="h-10 w-10 shrink-0">
          <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
            {entry.displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-medium text-foreground truncate">
                {entry.displayName}
              </span>
              <StatusDot status={entry.crmStatus} />
            </div>
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
      <button
        onClick={onDelete}
        className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground/40 hover:text-danger hover:bg-danger-muted transition-colors duration-150 opacity-0 group-hover:opacity-100"
        aria-label={`Delete ${entry.displayName}`}
        data-testid="crm-contact-row-delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

function ContactDetail({
  entry,
  onBack,
  onSaveNote,
  onSaveStatus,
  onSaveFields,
  onSaveCustomFields,
  onDelete,
}: {
  entry: CrmContactEntry;
  onBack: () => void;
  onSaveNote: (userKey: string, note: string) => void;
  onSaveStatus: (userKey: string, status: CrmStatus | undefined) => void;
  onSaveFields: (
    contactId: string,
    fields: {
      display_name?: string;
      email?: string;
      phone?: string;
      company?: string;
      role?: string;
      links?: string;
    },
  ) => void;
  onSaveCustomFields: (contactId: string, customFields: Record<string, string>) => void;
  onDelete: (userKey: string) => void;
}) {
  const [messages, setMessages] = useState<DmRecord[]>([]);
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState(entry.note);
  const [loading, setLoading] = useState(true);
  const [editingFields, setEditingFields] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState(entry.displayName);
  const [draftEmail, setDraftEmail] = useState(entry.email || '');
  const [draftPhone, setDraftPhone] = useState(entry.phone || '');
  const [draftCompany, setDraftCompany] = useState(entry.company || '');
  const [draftRole, setDraftRole] = useState(entry.role || '');
  const [draftLinks, setDraftLinks] = useState(entry.links || '');
  const [customFields, setCustomFields] = useState<Record<string, string>>(entry.custom_fields || {});
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    setNoteDraft(entry.note);
    setDraftDisplayName(entry.displayName);
    setDraftEmail(entry.email || '');
    setDraftPhone(entry.phone || '');
    setDraftCompany(entry.company || '');
    setDraftRole(entry.role || '');
    setDraftLinks(entry.links || '');
    setCustomFields(entry.custom_fields || {});
    loadMessages();
  }, [entry]);

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

  function handleStartEditFields() {
    setDraftDisplayName(entry.displayName);
    setDraftEmail(entry.email || '');
    setDraftPhone(entry.phone || '');
    setDraftCompany(entry.company || '');
    setDraftRole(entry.role || '');
    setDraftLinks(entry.links || '');
    setEditingFields(true);
  }

  function handleCancelEditFields() {
    setEditingFields(false);
  }

  function handleSaveFields() {
    if (!entry.contact?._id) return;
    onSaveFields(entry.contact._id, {
      display_name: draftDisplayName || undefined,
      email: draftEmail || undefined,
      phone: draftPhone || undefined,
      company: draftCompany || undefined,
      role: draftRole || undefined,
      links: draftLinks || undefined,
    });
    setEditingFields(false);
  }

  function handleAddCustomField() {
    const k = newKey.trim();
    if (!k || !entry.contact?._id) return;
    const updated = { ...customFields, [k]: newValue };
    setCustomFields(updated);
    onSaveCustomFields(entry.contact._id, updated);
    setNewKey('');
    setNewValue('');
  }

  function handleRemoveCustomField(key: string) {
    if (!entry.contact?._id) return;
    const updated = { ...customFields };
    delete updated[key];
    setCustomFields(updated);
    onSaveCustomFields(entry.contact._id, updated);
  }

  const linkUrls = (entry.links || '').split(';').map((s) => s.trim()).filter(Boolean);

  const fieldIcon = (icon: React.ReactNode, label: string) => (
    <div className="flex items-center gap-1.5 text-muted-foreground">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
  );

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
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">{entry.displayName}</p>
          <p className="text-xs text-muted-foreground">@{entry.username}</p>
        </div>
        <button
          onClick={() => onDelete(entry.userKey)}
          className="shrink-0 h-8 px-3 flex items-center gap-1.5 rounded-lg text-xs font-medium text-danger hover:bg-danger-muted transition-colors duration-150"
          aria-label="Delete contact"
          data-testid="crm-detail-delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Contact info card with richer fields */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Contact Info</h3>
            </div>
            {!editingFields && (
              <button
                onClick={handleStartEditFields}
                className="text-xs text-brand hover:text-brand-400 transition-colors duration-150"
                data-testid="crm-edit-fields-btn"
              >
                Edit fields
              </button>
            )}
          </div>

          {editingFields ? (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Display Name</Label>
                <Input
                  value={draftDisplayName}
                  onChange={(e) => setDraftDisplayName(e.target.value)}
                  className="text-sm h-8"
                  data-testid="crm-field-display-name"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Email</Label>
                <Input
                  type="email"
                  value={draftEmail}
                  onChange={(e) => setDraftEmail(e.target.value)}
                  placeholder="email@example.com"
                  className="text-sm h-8"
                  data-testid="crm-field-email"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input
                  type="tel"
                  value={draftPhone}
                  onChange={(e) => setDraftPhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="text-sm h-8"
                  data-testid="crm-field-phone"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Company</Label>
                <Input
                  value={draftCompany}
                  onChange={(e) => setDraftCompany(e.target.value)}
                  placeholder="Acme Corp"
                  className="text-sm h-8"
                  data-testid="crm-field-company"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Role</Label>
                <Input
                  value={draftRole}
                  onChange={(e) => setDraftRole(e.target.value)}
                  placeholder="Product Manager"
                  className="text-sm h-8"
                  data-testid="crm-field-role"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Links / Socials</Label>
                <Input
                  value={draftLinks}
                  onChange={(e) => setDraftLinks(e.target.value)}
                  placeholder="https://example.com; https://twitter.com/user"
                  className="text-sm h-8"
                  data-testid="crm-field-links"
                />
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCancelEditFields}
                  data-testid="crm-cancel-fields"
                >
                  <X className="w-3.5 h-3.5 mr-1" />
                  Cancel
                </Button>
                <Button
                  variant="brand"
                  size="sm"
                  onClick={handleSaveFields}
                  data-testid="crm-save-fields"
                >
                  <Save className="w-3.5 h-3.5 mr-1" />
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Display Name</span>
                <span className="text-sm text-foreground">{entry.displayName}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Username</span>
                <span className="text-sm text-foreground">@{entry.username}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Provider</span>
                <span className="text-sm text-foreground">{entry.provider}</span>
              </div>
              {entry.email && (
                <div className="flex items-center justify-between">
                  {fieldIcon(<Mail className="w-3 h-3" />, 'Email')}
                  <a
                    href={`mailto:${entry.email}`}
                    className="text-sm text-brand hover:text-brand-400 transition-colors duration-150"
                  >
                    {entry.email}
                  </a>
                </div>
              )}
              {entry.phone && (
                <div className="flex items-center justify-between">
                  {fieldIcon(<Phone className="w-3 h-3" />, 'Phone')}
                  <a
                    href={`tel:${entry.phone}`}
                    className="text-sm text-brand hover:text-brand-400 transition-colors duration-150"
                  >
                    {entry.phone}
                  </a>
                </div>
              )}
              {entry.company && (
                <div className="flex items-center justify-between">
                  {fieldIcon(<Building2 className="w-3 h-3" />, 'Company')}
                  <span className="text-sm text-foreground">{entry.company}</span>
                </div>
              )}
              {entry.role && (
                <div className="flex items-center justify-between">
                  {fieldIcon(<Briefcase className="w-3 h-3" />, 'Role')}
                  <span className="text-sm text-foreground">{entry.role}</span>
                </div>
              )}
              {linkUrls.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  {fieldIcon(<Link className="w-3 h-3" />, 'Links')}
                  <div className="flex flex-wrap gap-1.5 pl-5">
                    {linkUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url.startsWith('http') ? url : `https://${url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand hover:text-brand-400 underline underline-offset-2 transition-colors duration-150"
                      >
                        {url.length > 40 ? url.slice(0, 37) + '...' : url}
                      </a>
                    ))}
                  </div>
                </div>
              )}
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
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Status</span>
                <div className="flex items-center gap-1.5">
                  {(Object.keys(STATUS_COLORS) as CrmStatus[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => onSaveStatus(entry.userKey, entry.crmStatus === s ? undefined : s)}
                      className={cn(
                        'rounded-full transition-all duration-150',
                        entry.crmStatus === s
                          ? `${STATUS_COLORS[s].bg} h-4 w-4 ring-2 ${STATUS_COLORS[s].ring}`
                          : `${STATUS_COLORS[s].bg} h-2.5 w-2.5 opacity-30 hover:opacity-60`,
                      )}
                      aria-label={`Set status ${STATUS_COLORS[s].label}`}
                      data-testid={`crm-detail-status-${s}`}
                      title={STATUS_COLORS[s].label}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Custom key/value fields section */}
        <div className="px-4 py-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Edit3 className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Custom Fields</h3>
          </div>
          <div className="space-y-2 mb-3">
            {Object.keys(customFields).length === 0 ? (
              <p className="text-sm text-muted-foreground/60 italic">No custom fields yet</p>
            ) : (
              Object.entries(customFields).map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-center justify-between group/custom"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-xs text-muted-foreground">{k}</span>
                    <span className="text-sm text-foreground ml-2 truncate">{v}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveCustomField(k)}
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-muted-foreground/40 hover:text-danger transition-colors duration-150"
                    aria-label={`Remove ${k}`}
                    data-testid="crm-custom-field-remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Field name"
              className="text-sm h-8 flex-1"
              data-testid="crm-custom-field-key"
            />
            <Input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value"
              className="text-sm h-8 flex-1"
              data-testid="crm-custom-field-value"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={handleAddCustomField}
              className="h-8 w-8 p-0"
              aria-label="Add custom field"
              data-testid="crm-add-custom-field"
            >
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Notes section (unchanged from bite a) */}
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

        {/* Message history (unchanged from bite a) */}
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
                // Username-based: v3 DMs are same-node (bare-username member
                // keys), and the sender_provider derived from a bare
                // author_key is not the node's provider, so a
                // provider-qualified comparison never matches.
                const isMe = token
                  ? msg.sender_username === token.username
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

function AddContactForm({
  onAdd,
  onCancel,
}: {
  onAdd: (contact: {
    display_name: string;
    username: string;
    provider: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    links?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [display_name, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [provider, setProvider] = useState('web10');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [links, setLinks] = useState('');

  function handleSubmit() {
    if (!display_name.trim()) return;
    onAdd({
      display_name: display_name.trim(),
      username: username.trim() || display_name.trim().toLowerCase().replace(/\s+/g, '_'),
      provider,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      company: company.trim() || undefined,
      role: role.trim() || undefined,
      links: links.trim() || undefined,
    });
  }

  return (
    <div className="flex flex-col h-full" data-testid="crm-add-contact-form">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button
          onClick={onCancel}
          className="flex items-center justify-center h-8 w-8 hover:bg-elevated rounded-lg transition-colors duration-150"
          aria-label="Cancel adding contact"
          data-testid="crm-add-cancel"
        >
          <X className="w-4 h-4" />
        </button>
        <UserPlus className="w-4 h-4 text-muted-foreground" />
        <h2 className="font-display text-sm font-semibold text-foreground">Add Contact</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Name *</Label>
          <Input
            value={display_name}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Jane Doe"
            className="text-sm h-8"
            data-testid="crm-add-name"
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Username</Label>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="janedoe"
              className="text-sm h-8"
              data-testid="crm-add-username"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Provider</Label>
            <Input
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="web10"
              className="text-sm h-8"
              data-testid="crm-add-provider"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jane@example.com"
            className="text-sm h-8"
            data-testid="crm-add-email"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Phone</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 (555) 000-0000"
            className="text-sm h-8"
            data-testid="crm-add-phone"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Company</Label>
          <Input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Acme Corp"
            className="text-sm h-8"
            data-testid="crm-add-company"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Role</Label>
          <Input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Product Manager"
            className="text-sm h-8"
            data-testid="crm-add-role"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Links / Socials</Label>
          <Input
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="https://example.com; https://twitter.com/user"
            className="text-sm h-8"
            data-testid="crm-add-links"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="ghost" size="sm" onClick={onCancel} data-testid="crm-add-form-cancel">
            Cancel
          </Button>
          <Button
            variant="brand"
            size="sm"
            onClick={handleSubmit}
            disabled={!display_name.trim()}
            data-testid="crm-add-form-submit"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Contact
          </Button>
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
  const [addingContact, setAddingContact] = useState(false);
  const [statusFilter, setStatusFilter] = useState<CrmStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<'lastMessage' | 'name' | 'status'>('lastMessage');

  const statusOrder: Record<CrmStatus, number> = { red: 0, yellow: 1, green: 2 };

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

      // Build entries from DM conversations
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
          crmStatus: contact?.crm_status,
          email: contact?.email,
          phone: contact?.phone,
          company: contact?.company,
          role: contact?.role,
          links: contact?.links,
          custom_fields: contact?.custom_fields,
        } as CrmContactEntry;
      });

      // Build entries for contacts NOT yet in a DM thread
      const convKeys = new Set(convs.map((conv) => {
        const parts = conv.split('--');
        return parts.find((p) => p !== meKey) || parts[0];
      }));

      const orphanEntries: CrmContactEntry[] = contactRecords
        .filter((c) => !convKeys.has(`${c.provider}/${c.username}`))
        .map((c) => ({
          contact: c,
          userKey: `${c.provider}/${c.username}`,
          displayName: c.display_name || c.username,
          username: c.username,
          provider: c.provider,
          messageCount: 0,
          lastMessage: null,
          note: c.note || '',
          conversation: '',
          crmStatus: c.crm_status,
          email: c.email,
          phone: c.phone,
          company: c.company,
          role: c.role,
          links: c.links,
          custom_fields: c.custom_fields,
          isNew: true,
        }));

      setContacts([...(await Promise.all(entryPromises)), ...orphanEntries]);
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

  async function handleSaveStatus(userKey: string, status: CrmStatus | undefined) {
    try {
      const contact = contacts.find((c) => c.userKey === userKey);
      if (contact?.contact?._id) {
        await updateContactStatus(contact.contact._id, status);
      }
      setContacts((prev) =>
        prev.map((c) =>
          c.userKey === userKey ? { ...c, crmStatus: status } : c,
        ),
      );
      if (selectedContact?.userKey === userKey) {
        setSelectedContact((prev) => prev ? { ...prev, crmStatus: status } : null);
      }
    } catch (e) {
      console.error('Failed to save status:', e);
    }
  }

  async function handleSaveFields(
    contactId: string,
    fields: {
      display_name?: string;
      email?: string;
      phone?: string;
      company?: string;
      role?: string;
      links?: string;
    },
  ) {
    try {
      await updateContact(contactId, fields);
      const entry = contacts.find((c) => c.contact?._id === contactId);
      if (entry) {
        const updated = {
          ...entry,
          ...fields,
          displayName: fields.display_name || entry.displayName,
        };
        setContacts((prev) =>
          prev.map((c) => (c.contact?._id === contactId ? updated : c)),
        );
        if (selectedContact?.contact?._id === contactId) {
          setSelectedContact(updated);
        }
      }
    } catch (e) {
      console.error('Failed to save fields:', e);
    }
  }

  async function handleSaveCustomFields(contactId: string, customFields: Record<string, string>) {
    try {
      await updateContact(contactId, { custom_fields: customFields });
      const entry = contacts.find((c) => c.contact?._id === contactId);
      if (entry) {
        const updated = { ...entry, custom_fields: customFields };
        setContacts((prev) =>
          prev.map((c) => (c.contact?._id === contactId ? updated : c)),
        );
        if (selectedContact?.contact?._id === contactId) {
          setSelectedContact(updated);
        }
      }
    } catch (e) {
      console.error('Failed to save custom fields:', e);
    }
  }

  async function handleAddContact(data: {
    display_name: string;
    username: string;
    provider: string;
    email?: string;
    phone?: string;
    company?: string;
    role?: string;
    links?: string;
  }) {
    try {
      const record = await addContact({
        username: data.username,
        provider: data.provider,
        display_name: data.display_name,
        email: data.email,
        phone: data.phone,
        company: data.company,
        role: data.role,
        links: data.links,
        note: '',
        crm_status: 'green',
      });
      const entry: CrmContactEntry = {
        contact: record,
        userKey: `${data.provider}/${data.username}`,
        displayName: data.display_name,
        username: data.username,
        provider: data.provider,
        messageCount: 0,
        lastMessage: null,
        note: '',
        conversation: '',
        crmStatus: 'green',
        email: data.email,
        phone: data.phone,
        company: data.company,
        role: data.role,
        links: data.links,
        isNew: true,
      };
      setContacts((prev) => [...prev, entry]);
      setAddingContact(false);
      setSelectedContact(entry);
    } catch (e) {
      console.error('Failed to add contact:', e);
    }
  }

  async function handleDeleteContact(userKey: string) {
    try {
      const entry = contacts.find((c) => c.userKey === userKey);
      if (entry?.contact?._id) {
        await deleteContact(entry.contact._id);
      }
      setContacts((prev) => prev.filter((c) => c.userKey !== userKey));
      setSelectedContact(null);
    } catch (e) {
      console.error('Failed to delete contact:', e);
    }
  }

  const filtered = useMemo(() => {
    let result = contacts;
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.crmStatus === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.displayName.toLowerCase().includes(q) ||
        c.username.toLowerCase().includes(q) ||
        c.note.toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.company || '').toLowerCase().includes(q),
      );
    }
    result = [...result].sort((a, b) => {
      if (sortBy === 'name') {
        return a.displayName.localeCompare(b.displayName);
      }
      if (sortBy === 'status') {
        const aS = a.crmStatus !== undefined ? statusOrder[a.crmStatus] : 99;
        const bS = b.crmStatus !== undefined ? statusOrder[b.crmStatus] : 99;
        return aS - bS;
      }
      // lastMessage
      const aTime = a.lastMessage ? new Date(a.lastMessage.sent_at).getTime() : 0;
      const bTime = b.lastMessage ? new Date(b.lastMessage.sent_at).getTime() : 0;
      return bTime - aTime;
    });
    return result;
  }, [contacts, statusFilter, search, sortBy]);

  if (addingContact) {
    return (
      <AddContactForm
        onAdd={handleAddContact}
        onCancel={() => setAddingContact(false)}
      />
    );
  }

  if (selectedContact) {
    return (
      <ContactDetail
        entry={selectedContact}
        onBack={() => setSelectedContact(null)}
        onSaveNote={handleSaveNote}
        onSaveStatus={handleSaveStatus}
        onSaveFields={handleSaveFields}
        onSaveCustomFields={handleSaveCustomFields}
        onDelete={handleDeleteContact}
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
        <Button
          variant="brand"
          size="sm"
          onClick={() => setAddingContact(true)}
          className="shrink-0 h-8"
          data-testid="crm-add-contact-btn"
        >
          <Plus className="w-3.5 h-3.5 mr-1" />
          Add
        </Button>
      </div>

      {/* Filter chips + sort */}
      <div className="px-4 py-2 border-b border-border/30 flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <button
            onClick={() => setStatusFilter('all')}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 shrink-0',
              statusFilter === 'all'
                ? 'bg-elevated text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-elevated/50',
            )}
            data-testid="crm-filter-all"
          >
            All ({contacts.length})
          </button>
          {(Object.keys(STATUS_COLORS) as CrmStatus[]).map((s) => {
            const count = contacts.filter((c) => c.crmStatus === s).length;
            return (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors duration-150 shrink-0',
                  statusFilter === s
                    ? `bg-elevated text-foreground`
                    : 'text-muted-foreground hover:text-foreground hover:bg-elevated/50',
                )}
                data-testid={`crm-filter-${s}`}
              >
                <span className={cn('w-2 h-2 rounded-full', STATUS_COLORS[s].bg)} />
                {STATUS_COLORS[s].label} ({count})
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <ArrowUpDown className="w-3 h-3 text-muted-foreground shrink-0" />
          {(['lastMessage', 'name', 'status'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setSortBy(s)}
              className={cn(
                'px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider transition-colors duration-150',
                sortBy === s
                  ? 'bg-elevated text-foreground'
                  : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-elevated/30',
              )}
              data-testid={`crm-sort-${s}`}
            >
              {s === 'lastMessage' ? 'Recent' : s}
            </button>
          ))}
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
            {search.trim() ? 'No contacts found' : 'No contacts yet'}
          </p>
          <p className="text-xs text-muted-foreground/50 mb-4">
            Add a contact or message someone to get started
          </p>
          <Button
            variant="brand"
            size="sm"
            onClick={() => setAddingContact(true)}
            data-testid="crm-empty-add-contact"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Contact
          </Button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {filtered.map((entry) => (
            <ContactRow
              key={entry.userKey}
              entry={entry}
              onClick={() => setSelectedContact(entry)}
              onDelete={(e) => {
                e.stopPropagation();
                handleDeleteContact(entry.userKey);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}