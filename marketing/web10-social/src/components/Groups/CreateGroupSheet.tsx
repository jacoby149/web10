import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  ImagePlus,
  Loader2,
  AlertTriangle,
  Globe,
  UserCheck,
  Lock,
  Hash,
  Link as LinkIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { getV3Client } from '@/data/v3';
import { createCommunityGroup, type GroupVisibility } from '@/data/groups';
import { uploadMedia } from '@/data/posts';

const LOG = (...args: unknown[]) => console.log('[social:groups:create]', ...args);

const VISIBILITY_OPTIONS: { value: GroupVisibility; label: string; hint: string; icon: typeof Globe }[] = [
  { value: 'public', label: 'Public', hint: 'Anyone can read, even signed out', icon: Globe },
  { value: 'signed_in', label: 'Signed in', hint: 'Only signed-in members of the node', icon: UserCheck },
  { value: 'private', label: 'Private', hint: 'Only people you add', icon: Lock },
];

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * The create-group flow — a bottom sheet (the `VideoEditorSheet` idiom) that
 * builds a group's face: cover + avatar (uploaded to media), name, about,
 * visibility (the D58 read grant), tags, and website. On create it writes the
 * group + the identity doc, then hands the new group_id back to the caller.
 */
export function CreateGroupSheet({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (groupId: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<GroupVisibility>('private');
  const [tags, setTags] = useState('');
  const [website, setWebsite] = useState('');
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const username = useMemo(() => {
    try {
      return getV3Client().readToken()?.username || '';
    } catch {
      return '';
    }
  }, []);

  // Reset the form whenever the sheet opens fresh.
  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setVisibility('private');
      setTags('');
      setWebsite('');
      setBannerFile(null);
      setAvatarFile(null);
      setBannerPreview(null);
      setAvatarPreview(null);
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  // Revoke object URLs on cleanup (no leak).
  useEffect(() => {
    return () => {
      if (bannerPreview) URL.revokeObjectURL(bannerPreview);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [bannerPreview, avatarPreview]);

  const pickFile = useCallback((setter: (f: File | null) => void, previewSetter: (u: string | null) => void) => {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] || null;
      setter(file);
      previewSetter(file ? URL.createObjectURL(file) : null);
      e.target.value = ''; // allow re-picking the same file
    };
  }, []);

  const handleBannerPick = useCallback(pickFile(setBannerFile, setBannerPreview), [pickFile]);
  const handleAvatarPick = useCallback(pickFile(setAvatarFile, setAvatarPreview), [pickFile]);

  const canSubmit = name.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    LOG('submit — start', { name, visibility });
    try {
      let bannerRef: string | undefined;
      let avatarRef: string | undefined;
      if (bannerFile) {
        const media = await uploadMedia({ file: bannerFile, service: 'public_media' });
        bannerRef = media._id || undefined;
        LOG('submit — banner uploaded', bannerRef);
      }
      if (avatarFile) {
        const media = await uploadMedia({ file: avatarFile, service: 'public_media' });
        avatarRef = media._id || undefined;
        LOG('submit — avatar uploaded', avatarRef);
      }
      const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
      const groupId = await createCommunityGroup(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          website: website.trim() || undefined,
          tags: tagList.length ? tagList : undefined,
          visibility,
          banner_ref: bannerRef,
          avatar_ref: avatarRef,
        },
        username,
      );
      LOG('submit — created', groupId);
      onCreated(groupId);
    } catch (e) {
      LOG('submit — failed:', e);
      setError(e instanceof Error ? e.message : 'Could not create the group. Try again.');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, name, description, website, tags, visibility, bannerFile, avatarFile, username, onCreated]);

  if (!open) return null;

  const previewId = username ? `web10.app/groups/${username}/${slugify(name) || '…'}` : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Create group"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={submitting ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-lg border-t border-border bg-card shadow-[0_-8px_30px_rgb(0,0,0,0.35)] sm:rounded-lg sm:border"
        data-testid="create-group-sheet"
      >
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
          <h3 className="font-display text-base font-semibold text-foreground">New group</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-4 py-4">
          {/* Cover + avatar (the face) */}
          <div className="overflow-hidden rounded-lg border border-border" data-testid="create-group-face">
            <div className="relative h-28 w-full bg-gradient-to-br from-brand-muted via-brand/20 to-background">
              {bannerPreview && (
                <img src={bannerPreview} alt="" className="h-full w-full object-cover" data-testid="create-group-banner-preview" />
              )}
              <button
                type="button"
                onClick={() => bannerInputRef.current?.click()}
                disabled={submitting}
                className="absolute inset-0 flex items-center justify-center gap-2 bg-background/30 text-sm font-medium text-foreground transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
                data-testid="create-group-banner-button"
              >
                <ImagePlus className="h-4 w-4" strokeWidth={1.75} />
                {bannerPreview ? 'Change cover' : 'Add cover'}
              </button>
            </div>
            <div className="flex items-end gap-3 px-4 pb-3 pt-0">
              <div className="-mt-7 rounded-full border-4 border-card">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="" className="h-14 w-14 rounded-full object-cover" data-testid="create-group-avatar-preview" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-lg font-semibold text-muted-foreground">
                    {(name.trim().charAt(0) || 'G').toUpperCase()}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={submitting}
                className="mb-1 inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                data-testid="create-group-avatar-button"
              >
                <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
                {avatarPreview ? 'Change photo' : 'Add photo'}
              </button>
            </div>
          </div>

          {/* Name */}
          <div className="mt-4">
            <label htmlFor="create-group-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Name
            </label>
            <Input
              id="create-group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My community"
              disabled={submitting}
              data-testid="create-group-name"
              className="bg-surface"
            />
            {name.trim() && previewId && (
              <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground" data-testid="create-group-id-preview">
                {previewId}
              </p>
            )}
          </div>

          {/* About */}
          <div className="mt-4">
            <label htmlFor="create-group-description" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
              About
            </label>
            <Textarea
              id="create-group-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this group about?"
              rows={3}
              disabled={submitting}
              data-testid="create-group-description"
              className="resize-none bg-surface"
            />
          </div>

          {/* Visibility */}
          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">Who can read</span>
            <div className="grid grid-cols-3 gap-2" data-testid="create-group-visibility">
              {VISIBILITY_OPTIONS.map(({ value, label, hint, icon: Icon }) => {
                const active = visibility === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setVisibility(value)}
                    disabled={submitting}
                    aria-pressed={active}
                    data-testid={`create-group-visibility-${value}`}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-brand bg-brand-muted/60'
                        : 'border-border bg-surface hover:border-brand/40',
                    )}
                  >
                    <Icon className={cn('h-4 w-4', active ? 'text-brand-300' : 'text-muted-foreground')} strokeWidth={1.75} />
                    <span className={cn('text-sm font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>{label}</span>
                    <span className="text-[0.7rem] leading-tight text-muted-foreground">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tags */}
          <div className="mt-4">
            <label htmlFor="create-group-tags" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Hash className="h-3 w-3" strokeWidth={1.75} /> Tags
            </label>
            <Input
              id="create-group-tags"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="gaming, retro, weekly"
              disabled={submitting}
              data-testid="create-group-tags"
              className="bg-surface"
            />
          </div>

          {/* Website */}
          <div className="mt-4">
            <label htmlFor="create-group-website" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <LinkIcon className="h-3 w-3" strokeWidth={1.75} /> Website
            </label>
            <Input
              id="create-group-website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://…"
              inputMode="url"
              disabled={submitting}
              data-testid="create-group-website"
              className="bg-surface"
            />
          </div>

          {error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-danger" role="alert" data-testid="create-group-error">
              <AlertTriangle className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center gap-2 border-t border-border bg-card px-4 py-3">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting} data-testid="create-group-cancel">
            Cancel
          </Button>
          <Button variant="brand" className="flex-1" onClick={handleSubmit} disabled={!canSubmit} data-testid="create-group-submit">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                Creating…
              </>
            ) : (
              'Create group'
            )}
          </Button>
        </div>

        {/* Hidden file inputs (e2e-drivable) */}
        <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} data-testid="create-group-banner-input" />
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} data-testid="create-group-avatar-input" />
      </div>
    </div>
  );
}
