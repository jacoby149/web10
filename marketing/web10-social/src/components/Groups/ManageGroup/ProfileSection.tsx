import { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, X, Globe, Hash } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { readGroupIdentity, writeGroupIdentity, type GroupIdentity } from '@/data';
import { uploadMedia } from '@/data/posts';

const LOG = (...args: unknown[]) => console.log('[social:groups:manage:profile]', ...args);

/**
 * The Profile section of the Manage sheet — the group's face (D60): display
 * name, about, website, tags, plus the cover (banner) + avatar. This is the
 * authenticator's `GroupProfileDialog` ported into the social app, **plus**
 * cover/avatar editing (the authenticator's profile dialog is text-only — the
 * cover was only set at create time and never editable anywhere). Save writes
 * the `web10-social-group-identity` doc via `writeGroupIdentity`; the detail
 * re-reads the face on `onSaved`.
 */
export default function ManageProfileSection({
  groupId,
  onSaved,
}: {
  groupId: string;
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [bannerRef, setBannerRef] = useState<string | undefined>(undefined);
  const [avatarRef, setAvatarRef] = useState<string | undefined>(undefined);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bannerInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Load the current face when the section mounts.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    readGroupIdentity(groupId)
      .then((ident: GroupIdentity) => {
        if (cancelled) return;
        setName(ident.name || '');
        setDescription(ident.description || '');
        setWebsite(ident.website || '');
        setTags(ident.tags || []);
        setBannerRef(ident.banner_ref);
        setAvatarRef(ident.avatar_ref);
      })
      .catch(() => {
        /* no face yet — start empty */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
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

  const pickFile = useCallback(
    (setter: (f: File | null) => void, previewSetter: (u: string | null) => void) => {
      return (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] || null;
        setter(file);
        previewSetter(file ? URL.createObjectURL(file) : null);
        e.target.value = '';
      };
    },
    [],
  );

  const handleBannerPick = useCallback(pickFile(setBannerFile, setBannerPreview), [pickFile]);
  const handleAvatarPick = useCallback(pickFile(setAvatarFile, setAvatarPreview), [pickFile]);

  const addTag = useCallback(() => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  }, [tagInput, tags]);

  const removeTag = useCallback((t: string) => setTags((prev) => prev.filter((x) => x !== t)), []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    LOG('save — start', groupId);
    try {
      // Upload a new cover / avatar if the user picked one.
      let finalBannerRef = bannerRef;
      let finalAvatarRef = avatarRef;
      if (bannerFile) {
        const media = await uploadMedia({ file: bannerFile, service: 'public_media' });
        finalBannerRef = media._id || undefined;
        LOG('save — banner uploaded', finalBannerRef);
      }
      if (avatarFile) {
        const media = await uploadMedia({ file: avatarFile, service: 'public_media' });
        finalAvatarRef = media._id || undefined;
        LOG('save — avatar uploaded', finalAvatarRef);
      }
      const face: GroupIdentity = {
        name: name.trim() || undefined,
        description: description.trim() || undefined,
        website: website.trim() || undefined,
        tags: tags.length ? tags : undefined,
        banner_ref: finalBannerRef,
        avatar_ref: finalAvatarRef,
      };
      await writeGroupIdentity(groupId, face);
      LOG('save — face written', groupId);
      onSaved();
    } catch (e) {
      LOG('save — failed:', e);
      setError(e instanceof Error ? e.message : 'Could not save the group profile.');
    } finally {
      setSaving(false);
    }
  }, [saving, groupId, bannerRef, avatarRef, bannerFile, avatarFile, name, description, website, tags, onSaved]);

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground" data-testid="manage-profile-loading">
        Loading profile…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Cover (banner) */}
      <div className="overflow-hidden rounded-lg border border-border" data-testid="manage-profile-cover">
        <div className="relative h-24 w-full bg-gradient-to-br from-brand-muted via-brand/20 to-background">
          {bannerPreview ? (
            <img src={bannerPreview} alt="" className="h-full w-full object-cover" data-testid="manage-profile-banner-preview" />
          ) : (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Cover</div>
          )}
          <button
            type="button"
            onClick={() => bannerInputRef.current?.click()}
            disabled={saving}
            className="absolute inset-0 flex items-center justify-center gap-2 bg-background/30 text-xs font-medium text-foreground transition-colors hover:bg-background/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50"
            data-testid="manage-profile-banner-button"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            {bannerPreview ? 'Change cover' : 'Add cover'}
          </button>
        </div>
        {/* Avatar */}
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="-mt-7 rounded-full border-4 border-card">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="h-12 w-12 rounded-full object-cover" data-testid="manage-profile-avatar-preview" />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-elevated text-base font-semibold text-muted-foreground">
                {(name.trim().charAt(0) || 'G').toUpperCase()}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => avatarInputRef.current?.click()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-elevated px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            data-testid="manage-profile-avatar-button"
          >
            <ImagePlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            {avatarPreview ? 'Change photo' : 'Add photo'}
          </button>
        </div>
      </div>

      {/* Name */}
      <div>
        <label htmlFor="manage-profile-name" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Display name
        </label>
        <Input
          id="manage-profile-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Group name"
          disabled={saving}
          data-testid="manage-profile-name"
          className="bg-surface"
        />
      </div>

      {/* About */}
      <div>
        <label htmlFor="manage-profile-about" className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
          About
        </label>
        <Textarea
          id="manage-profile-about"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this group about?"
          rows={3}
          disabled={saving}
          data-testid="manage-profile-about"
          className="resize-none bg-surface"
        />
      </div>

      {/* Website */}
      <div>
        <label htmlFor="manage-profile-website" className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          <Globe className="h-3 w-3" strokeWidth={1.75} /> Website
        </label>
        <Input
          id="manage-profile-website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="https://…"
          inputMode="url"
          disabled={saving}
          data-testid="manage-profile-website"
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
              <button type="button" onClick={() => removeTag(t)} aria-label={`Remove ${t}`} data-testid={`manage-profile-tag-remove-${t}`}>
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
            disabled={saving}
            data-testid="manage-profile-tag-input"
            className="flex-1 bg-surface"
          />
          <Button type="button" variant="outline" size="sm" onClick={addTag} disabled={saving} data-testid="manage-profile-tag-add">
            Add
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-danger" role="alert" data-testid="manage-profile-error">
          {error}
        </div>
      )}

      {/* Save — this section owns its save (the authenticator's dialog pattern) */}
      <div className="flex justify-end border-t border-border pt-3">
        <Button variant="brand" size="sm" onClick={handleSave} disabled={saving} data-testid="manage-profile-save">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} /> : 'Save profile'}
        </Button>
      </div>

      {/* Hidden file inputs (e2e-drivable) */}
      <input ref={bannerInputRef} type="file" accept="image/*" className="hidden" onChange={handleBannerPick} data-testid="manage-profile-banner-input" />
      <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} data-testid="manage-profile-avatar-input" />
    </div>
  );
}
