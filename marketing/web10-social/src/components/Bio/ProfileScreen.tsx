import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { readProfile, saveProfile, readMyPosts, resolveMediaRefs, uploadMedia } from '@/data';
import type { ProfileRecord, PostRecord, MediaRecord } from '@/data/types';
import { MapPin, Globe, Link, Camera, Edit3, Check, X, Sparkles, ImagePlus } from 'lucide-react';
import { cn } from '@/lib/utils';

function ProfileEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-8 text-center" data-testid="profile-empty">
      <div className={cn(
        'w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-600 flex items-center justify-center mb-6',
        'shadow-lg shadow-brand/25',
      )}>
        <Sparkles className="w-8 h-8 text-white" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground mb-2">Your profile is empty</h3>
      <p className="text-sm text-muted-foreground max-w-xs mb-6">
        Import your Instagram to fill your profile with your existing posts, followers, and media.
      </p>
      <Button variant="brand" data-testid="profile-import-cta" className="gap-2" onClick={() => window.open('/exporters', '_blank')}>
        Import your Instagram
      </Button>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div data-testid="profile-skeleton">
      <Skeleton className="h-32 sm:h-44 w-full rounded-none" />
      <div className="px-4 pt-4">
        <Skeleton className="h-20 w-20 rounded-full -mt-14 border-4 border-background" />
        <Skeleton className="h-5 w-40 mt-4" />
        <Skeleton className="h-4 w-64 mt-2" />
      </div>
      <div className="grid grid-cols-3 gap-1 p-1 mt-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-none" />
        ))}
      </div>
    </div>
  );
}

export default function ProfileScreen() {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<ProfileRecord>>({});
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [p, postsData] = await Promise.all([readProfile(), readMyPosts()]);
      setProfile(p);
      setDraft(p || {});
      setPosts(postsData || []);

      const allRefs = (postsData || []).flatMap((post) => post.media_refs || []);
      if (p?.avatar_ref) allRefs.push(p.avatar_ref);
      if (p?.banner_ref) allRefs.push(p.banner_ref);
      if (allRefs.length) {
        const media = await resolveMediaRefs([...new Set(allRefs)]);
        const map: Record<string, MediaRecord> = {};
        media.forEach((m) => {
          if (m._id) map[m._id] = m;
        });
        setMediaMap(map);
      }
    } catch (e) {
      console.error('Failed to load profile:', e);
    }
    setLoading(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const saved = await saveProfile(draft);
      setProfile(saved);
      setEditing(false);
    } catch (e) {
      console.error('Failed to save profile:', e);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpload(field: 'avatar_ref' | 'banner_ref') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const media = await uploadMedia({ file });
      if (media._id) setMediaMap((prev) => ({ ...prev, [media._id!]: media }));
      const updated = { ...(profile || {}), [field]: media._id || '' };
      setDraft(updated);
      const saved = await saveProfile(updated);
      setProfile(saved);
    };
    input.click();
  }

  const mediaPosts = posts.filter((p) => p.media_refs?.length);

  if (loading) {
    return <ProfileSkeleton />;
  }

  if (!profile && !posts.length) {
    return <ProfileEmptyState />;
  }

  const bannerMedia = profile?.banner_ref ? mediaMap[profile.banner_ref] : undefined;

  return (
    <div>
      {/* Banner — creator page with vibrant gradient */}
      <div className={cn(
        'relative h-32 sm:h-44 w-full group overflow-hidden',
        'bg-gradient-to-br from-brand/40 via-brand-muted to-background',
      )}>
        {/* Ambient glow layer */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-brand/10"
          aria-hidden="true"
        />
        {bannerMedia && (
          <img src={bannerMedia.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        <button
          onClick={() => handleUpload('banner_ref')}
          aria-label="Change banner"
          data-testid="edit-banner-button"
          className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-background/70 border border-border text-xs text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity backdrop-blur-sm hover:border-brand/30 hover:bg-background/90"
        >
          <ImagePlus className="w-3.5 h-3.5" />
          Banner
        </button>
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-6 -mt-14">
          <div className="relative group">
            <Avatar className={cn(
              'h-20 w-20 border-4 border-background transition-shadow duration-150',
              'ring-2 ring-brand/20 hover:ring-brand/40',
            )}>
              {profile?.avatar_ref && mediaMap[profile.avatar_ref] ? (
                <AvatarImage src={mediaMap[profile.avatar_ref].url} alt={profile.display_name || ''} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-brand to-brand-600 text-white text-2xl font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || '?'}
                </AvatarFallback>
              )}
            </Avatar>
            <button
              className="absolute bottom-0 right-0 flex items-center justify-center h-7 w-7 rounded-full bg-background border border-border shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:border-brand/30"
              aria-label="Change avatar"
              data-testid="edit-avatar-button"
              onClick={() => handleUpload('avatar_ref')}
            >
              <Camera className="w-3.5 h-3.5 text-foreground" />
            </button>
          </div>
          {!editing && (
            <Button
              variant="brand_subtle"
              size="sm"
              className="mt-14 gap-1.5"
              data-testid="edit-profile-button"
              onClick={() => setEditing(true)}
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit profile
            </Button>
          )}
        </div>

        <div className="mt-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <Input
                value={draft.display_name || ''}
                onChange={(e) => setDraft({ ...draft, display_name: e.target.value })}
                placeholder="Display name"
                data-testid="profile-name-input"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="brand" onClick={handleSave} disabled={saving} data-testid="save-profile-button" className="gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(false);
                    setDraft(profile || {});
                  }}
                  className="gap-1.5"
                >
                  <X className="w-3.5 h-3.5" />
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <h1 className="font-display text-xl font-bold text-foreground truncate">
              {profile?.display_name || 'Your name'}
            </h1>
          )}
        </div>

        {/* Bio section */}
        <div className="mt-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <Textarea
                value={draft.bio || ''}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                placeholder="Bio"
                className="text-sm min-h-[60px] resize-none"
              />
              <Input
                value={draft.website || ''}
                onChange={(e) => setDraft({ ...draft, website: e.target.value })}
                placeholder="Website"
              />
              <Input
                value={draft.location || ''}
                onChange={(e) => setDraft({ ...draft, location: e.target.value })}
                placeholder="Location"
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              {profile?.bio && (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{profile.bio}</p>
              )}
              {profile?.location && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{profile.location}</span>
                </div>
              )}
              {profile?.website && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  {profile.website.startsWith('http') ? (
                    <Globe className="w-3.5 h-3.5" />
                  ) : (
                    <Link className="w-3.5 h-3.5" />
                  )}
                  <a
                    href={profile.website.startsWith('http') ? profile.website : `https://${profile.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-300 hover:text-brand-400 hover:underline transition-colors duration-150"
                  >
                    {profile.website}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stats row — tabular-nums (design.md §5) */}
        <div className="mt-4 flex gap-6" data-testid="profile-stats">
          <div>
            <span className="tabular-nums font-display font-bold text-foreground text-lg block">{posts.length}</span>
            <span className="text-xs text-muted-foreground">Posts</span>
          </div>
          <div>
            <span className="tabular-nums font-display font-bold text-foreground text-lg block">{mediaPosts.length}</span>
            <span className="text-xs text-muted-foreground">Media</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          data-testid="profile-tab-posts"
          aria-current={activeTab === 'posts' ? 'true' : undefined}
          className={cn(
            'flex-1 min-h-11 py-3 text-sm font-medium text-center transition-all duration-150 relative',
            activeTab === 'posts'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('posts')}
        >
          Posts
          {activeTab === 'posts' && (
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600" />
          )}
        </button>
        <button
          data-testid="profile-tab-media"
          aria-current={activeTab === 'media' ? 'true' : undefined}
          className={cn(
            'flex-1 min-h-11 py-3 text-sm font-medium text-center transition-all duration-150 relative',
            activeTab === 'media'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
          onClick={() => setActiveTab('media')}
        >
          Media
          {activeTab === 'media' && (
            <div className="absolute bottom-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600" />
          )}
        </button>
      </div>

      {/* Grid */}
      <div className="p-1">
        {activeTab === 'posts' ? (
          posts.length ? (
            <div className="grid grid-cols-3 gap-1">
              {posts.map((post) => {
                const firstMedia = post.media_refs?.[0] ? mediaMap[post.media_refs[0]] : null;
                return (
                  <div key={post._id} className="aspect-square bg-elevated overflow-hidden relative group">
                    {firstMedia ? (
                      <img
                        src={firstMedia.url}
                        alt=""
                        className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                        loading="lazy"
                      />
                    ) : post.text ? (
                      <div className="w-full h-full p-3 flex items-start">
                        <p className="text-xs text-muted-foreground line-clamp-6">{post.text}</p>
                      </div>
                    ) : null}
                    {(post.media_refs?.length || 0) > 1 && (
                      <div className="absolute top-2 right-2 bg-background/80 text-foreground text-xs px-1.5 py-0.5 rounded-md backdrop-blur-sm border border-border/50">
                        {post.media_refs?.length}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-16 text-center">
              <p className="text-sm text-muted-foreground">No posts yet</p>
            </div>
          )
        ) : mediaPosts.length ? (
          <div className="grid grid-cols-3 gap-1">
            {mediaPosts.flatMap((post) =>
              (post.media_refs || []).map((ref) => {
                const media = mediaMap[ref];
                if (!media) return null;
                return (
                  <div key={ref} className="aspect-square bg-elevated overflow-hidden group">
                    <img
                      src={media.url}
                      alt={media.alt_text || ''}
                      className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-150" />
                  </div>
                );
              }),
            )}
          </div>
        ) : (
          <div className="py-16 text-center">
            <p className="text-sm text-muted-foreground">No media yet</p>
          </div>
        )}
      </div>
    </div>
  );
}