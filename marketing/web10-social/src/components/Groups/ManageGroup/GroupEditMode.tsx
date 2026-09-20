import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Loader2,
  X,
  Globe,
  Hash,
  LockOpen,
  MessageSquare,
  Lock,
  UserCheck,
  Eye,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { getGroupMembers, type GroupIdentity, type GroupCommitInput, type GroupVisibility, type GroupJoinPolicy } from '@/data';
import { uploadMedia } from '@/data/posts';
import { errorMessage } from '@/components/shared/Toast';
import { cn } from '@/lib/utils';

const LOG = (...args: unknown[]) => console.log('[social:groups:edit]', ...args);

const JOIN_POLICIES = [
  { value: 'open', label: 'Open', icon: LockOpen, hint: 'Anyone can join immediately.' },
  { value: 'request', label: 'Request', icon: MessageSquare, hint: 'Joiners ask; you approve.' },
  { value: 'invite_only', label: 'Invite only', icon: Lock, hint: 'Only people you invite can join.' },
] as const;

const VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Public', icon: Globe, hint: 'Anyone can read, even signed out.' },
  { value: 'signed_in', label: 'Signed-in only', icon: UserCheck, hint: 'Any web10 user can read; signed-out can’t.' },
  { value: 'private', label: 'Private', icon: Lock, hint: 'Only members can read.' },
] as const;

/**
 * The group's inline edit mode (group-as-profile G2, decision 2) — the
 * manager's "Edit" pencil flips the page into this form. It is a **superset**
 * of the profile's edit mode: the face fields (name / about / website / tags /
 * cover / avatar) **and** the settings (who-can-read / how-join /
 * list-in-directory), all as inline inputs.
 *
 * **One model for a draft and a published group.** Everything here is
 * **staged** — the live group is frozen at the last commit while you edit.
 * **Save** (published) / **Publish** (draft) is the atomic commit (the parent
 * calls `saveGroup` / `publishGroup` — face + settings land together).
 * **Cancel** discards the stage (the live state is never touched).
 *
 * **Uploads (decision 3):** picking a cover / avatar starts an async upload;
 * the ref is written to the stage only when it resolves, and **no save while an
 * upload is in flight** (you can't commit a `banner_ref` that hasn't resolved).
 * The parent watches `onUploadingChange` to warn on a nav-away mid-upload.
 */
export default function GroupEditMode({
  groupId,
  identity,
  joinPolicy,
  discoverable,
  isDraft,
  onUploadingChange,
  onSave,
  onCancel,
}: {
  groupId: string;
  identity: GroupIdentity;
  joinPolicy: string;
  discoverable: boolean;
  isDraft: boolean;
  onUploadingChange: (uploading: boolean) => void;
  onSave: (staged: GroupCommitInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(identity.name || '');
  const [description, setDescription] = useState(identity.description || '');
  const [website, setWebsite] = useState(identity.website || '');
  const [tags, setTags] = useState<string[]>(identity.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [bannerRef, setBannerRef] = useState<string | undefined>(identity.banner_ref);
  const [avatarRef, setAvatarRef] = useState<string | undefined>(identity.avatar_ref);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [policy, setPolicy] = useState<GroupJoinPolicy>(
    (['open', 'request', 'invite_only'] as const).includes(joinPolicy as GroupJoinPolicy)
      ? (joinPolicy as GroupJoinPolicy)
      : 'open',
  );
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [listed, setListed] = useState<boolean>(discoverable);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Derive the current who-can-read from the group's reserved member rows
  // (the D58 read grant — the same derivation the retired Settings section used).
  useEffect(() => {
    let cancelled = false;
    getGroupMembers(groupId)
      .catch(() => [] as { member_key: string; role: string }[])
      .then((members: { member_key: string; role: string }[]) => {
        if (cancelled) return;
        const anyone = members.find((m) => m.member_key === 'anyone');
        const authed = members.find((m) => m.member_key === 'authenticated');
        if (anyone?.role === 'reader') setVisibility('public');
        else if (authed?.role === 'reader') setVisibility('signed_in');
        else setVisibility('private');
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  // Revoke object URLs on cleanup.
  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [bannerPreview, avatarPreview]);

  // Pick a cover / avatar → start the async upload (decision 3). The ref lands
  // in the stage only when the upload resolves; `uploading` gates the save.
  const startUpload = useCallback(
    async (file: File, kind: 'banner' | 'avatar') => {
      setError(null);
      setUploading(true);
      onUploadingChange(true);
      LOG('upload — start', kind, file.name);
      try {
        const media = await uploadMedia({ file, service: 'public_media' });
        const ref = media._id || undefined;
        if (kind === 'banner') setBannerRef(ref);
        else setAvatarRef(ref);
        LOG('upload — resolved', kind, ref);
      } catch (e) {
        LOG('upload — failed', kind, e);
        setError(errorMessage(e, 'Upload failed. Please try again.'));
      } finally {
        setUploading(false);
        onUploadingChange(false);
      }
    },
    [onUploadingChange],
  );

  const handleBannerPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        setBannerPreview(URL.createObjectURL(file));
        void startUpload(file, 'banner');
      }
      e.target.value = '';
    },
    [startUpload],
  );

  const handleAvatarPick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      if (file) {
        setAvatarPreview(URL.createObjectURL(file));
        void startUpload(file, 'avatar');
      }
      e.target.value = '';
    },
    [startUpload],
  );

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => setTags((prev) => prev.filter((x) => x !== t)), []);

  const buildStaged = useCallback(
    (): GroupCommitInput => ({
      face: {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        tags: tags.length ? tags : undefined,
        banner_ref: bannerRef,
        avatar_ref: avatarRef,
      },
      visibility,
      joinPolicy: policy,
      discoverable: listed,
    }),
    [name, description, website, tags, bannerRef, avatarRef, visibility, policy, listed],
  );

  const handleSave = useCallback(async () => {
    if (saving || uploading) return;
    setSaving(true);
    setError(null);
    LOG('save — start (atomic commit)', { isDraft });
    try {
      await onSave(buildStaged());
      LOG('save — committed');
    } catch (e) {
      LOG('save — failed:', e);
      setError(errorMessage(e, 'Could not save the group.'));
    } finally {
      setSaving(false);
    }
  }, [saving, uploading, isDraft, onSave, buildStaged]);

  const busy = saving || uploading;

  return (
    <div className="space-y-4" data-testid="group-edit-mode">
      {/* Cover (banner) + avatar pickers */}
      <div className="overflow-hidden rounded-lg border border-border" data-testid="group-edit-cover">
        <div className="relative h-24 w-full bg-gradient-to-br from-brand-muted via-brand/20 to-background">
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="h-full w-full object-cover" data-testid="group-edit-banner-preview" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Cover</div>
          )}
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            disabled={busy}
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/30 text-xs font-medium text-foreground transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
            data-testid="group-edit-banner-button"
          >
            {uploading && !avatarPreview ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {bannerPreview ? 'Change cover' : 'Add cover'}
          </button>
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="-mt-7 rounded-full border-4 border-card">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-12 w-12 rounded-full object-cover" data-testid="group-edit-avatar-preview" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-base font-semibold text-muted-foreground">
                {(name.trim().charAt(0) || 'G').toUpperCase()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            data-testid="group-edit-avatar-button"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            {avatarPreview ? 'Change photo' : 'Add photo'}
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="group-edit-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Display name
        </label>
        <Input
          id="group-edit-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          disabled={busy}
          data-testid="group-edit-name"
          className="bg-surface"
        />
      </div>

      {/* About */}
      <div>
        <label htmlFor="group-edit-about" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          About
        </label>
        <Textarea
          id="group-edit-about"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this group about?"
          rows={3}
          disabled={busy}
          data-testid="group-edit-about"
          className="resize-none bg-surface"
        />
      </div>

      {/* Website */}
      <div>
        <label htmlFor="group-edit-website" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Globe className="h-3 w-3" strokeWidth={1.75} /> Website
        </label>
        <Input
          id="group-edit-website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          disabled={busy}
          data-testid="group-edit-website"
          className="bg-surface"
        />
      </div>

      {/* Tags */}
      <div>
        <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Hash className="h-3 w-3" strokeWidth={1.75} /> Tags
        </label>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 rounded-full border border-brand/10 bg-brand-muted/60 px-2.5 py-1 text-xs text-brand-300">
              #{t}
              <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`} data-testid={`group-edit-tag-remove-${t}`}>
                <X className="h-3 w-3" strokeWidth={1.75} />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder="Add a tag…"
            disabled={busy}
            data-testid="group-edit-tag-input"
            className="flex-1 bg-surface"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={busy} data-testid="group-edit-tag-add">
            Add
          </Button>
        </div>
      </div>

      {/* Who can read (the D58 read grant) */}
      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Who can read</span>
        <div className="space-y-2" data-testid="group-edit-visibility">
          {VISIBILITY_OPTIONS.map(({ value, label, icon: Icon, hint }) => {
            const active = visibility === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setVisibility(value)}
                disabled={busy}
                aria-pressed={active}
                data-testid={`group-edit-visibility-${value}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-brand bg-brand-muted/60' : 'border-border bg-surface hover:border-brand/40',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.75} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* How people join (the join policy) */}
      <div>
        <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">How people join</span>
        <div className="space-y-2" data-testid="group-edit-join-policy">
          {JOIN_POLICIES.map(({ value, label, icon: Icon, hint }) => {
            const active = policy === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setPolicy(value)}
                disabled={busy}
                aria-pressed={active}
                data-testid={`group-edit-join-${value}`}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'border-brand bg-brand-muted/60' : 'border-border bg-surface hover:border-brand/40',
                )}
              >
                <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.75} />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-foreground">{label}</span>
                  <span className="block text-xs text-muted-foreground">{hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* List in directory (the D53 blasting flag) */}
      <div className="rounded-lg border border-border bg-surface px-3 py-3" data-testid="group-edit-listed">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            <div>
              <p className="text-sm font-medium text-foreground">List in directory</p>
              <p className="text-xs text-muted-foreground">
                {listed ? 'Shown in the public Discover directory.' : 'Hidden from the public directory (unlisted).'}
              </p>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={listed}
            aria-label="List in directory"
            onClick={() => setListed(!listed)}
            disabled={busy}
            data-testid="group-edit-listed-toggle"
            className={cn(
              'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              listed ? 'bg-brand' : 'bg-elevated',
            )}
          >
            <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', listed ? 'translate-x-4' : 'translate-x-0.5')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger" role="alert" data-testid="group-edit-error">
          {error}
        </div>
      )}

      {/* Save / Cancel — the profile's footer. Save is the atomic commit
          (disabled while an upload is in flight — decision 3). */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving} data-testid="group-edit-cancel">
          <X className="h-3.5 w-3.5" strokeWidth={1.75} />
          Cancel
        </Button>
        <Button variant="brand" size="sm" onClick={handleSave} disabled={busy} data-testid="group-edit-save" className="gap-1.5">
          {saving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : (
            <Check className="h-3.5 w-3.5" strokeWidth={2} />
          )}
          {isDraft ? 'Publish group' : 'Save'}
        </Button>
      </div>

      {/* Hidden file inputs (e2e-drivable) */}
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} data-testid="group-edit-banner-input" />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} data-testid="group-edit-avatar-input" />
    </div>
  );
}
