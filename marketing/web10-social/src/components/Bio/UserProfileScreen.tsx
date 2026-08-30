import { useState, useEffect, useCallback, useRef } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readUserProfile,
  readProfile,
  saveProfile,
  readMyPosts,
  resolveMediaRefs,
  uploadMedia,
  refreshMediaUrls,
  countStagingPosts,
  followUser,
  unfollowUser,
  readFollow,
  countFollows,
  countFollowers,
  countUserFollowing,
  readUserPublicPosts,
} from '@/data';
import { getWapi } from '@/data/wapi';
import type { ProfileRecord, PostRecord, MediaRecord, FollowRecord } from '@/data/types';
import { mediaRefId } from '@/data/types';
import { MapPin, Globe, Link, Users, UserPlus, UserCheck, Loader2, ArrowLeft, MessageSquare, Play, Camera, Edit3, Check, X, ImagePlus, AlertTriangle, Inbox } from 'lucide-react';
import { PostLightbox } from './PostLightbox';
import { cn } from '@/lib/utils';
import { MARKETING_ORIGIN } from '@/lib/origins';
import { useNavigate } from 'react-router-dom';

function UserProfileSkeleton() {
  return (
    <div data-testid="user-profile-skeleton">
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

interface UserProfileScreenProps {
  username: string;
  provider: string;
  onBack?: () => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString();
}

export default function UserProfileScreen({ username, provider, onBack }: UserProfileScreenProps) {
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [posts, setPosts] = useState<PostRecord[]>([]);
  const [mediaMap, setMediaMap] = useState<Record<string, MediaRecord>>({});
  const [loading, setLoading] = useState(true);
  const [followRecord, setFollowRecord] = useState<FollowRecord | null>(null);
  const [following, setFollowing] = useState(false);
  const [isOwnProfile, setIsOwnProfile] = useState(false);
  const [followerCount, setFollowerCount] = useState<number | null>(null);
  const [followingCount, setFollowingCount] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'posts' | 'media'>('posts');
  const [followLoading, setFollowLoading] = useState(false);
  const [followError, setFollowError] = useState<string | null>(null);
  const [followingCountError, setFollowingCountError] = useState(false);
  const [lightboxPost, setLightboxPost] = useState<PostRecord | null>(null);
  // Owner-edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<ProfileRecord>>({});
  const [stagingCount, setStagingCount] = useState<number>(0);
  // The file input is PERSISTENT in the DOM (not created on click) so the
  // upload seam is drivable from e2e (setInputFiles) — a createElement-on-
  // click input is unreachable from Playwright.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFieldRef = useRef<'avatar_ref' | 'banner_ref' | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
  }, [username, provider]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = getWapi().readToken();
      const isOwn = token && token.username === username && token.provider === provider;
      setIsOwnProfile(!!isOwn);

      let profile: ProfileRecord | null = null;
      let postsData: PostRecord[] = [];
      let fc = 0;
      // null = count not loaded (hide the tile); 0 is a REAL count (render it) —
      // `0 || null` here hid the Followers tile for every zero-follower profile
      // (gauntlet step-3 regression, #434).
      let fCount: number | null = null;

      if (isOwn) {
        // Owner path: read from own collections (same as ProfileScreen)
        const [p, postsRes, fC, fCnt, stgCount] = await Promise.all([
          readProfile(),
          readMyPosts(),
          countFollows(),
          countFollowers(token.username, token.provider),
          countStagingPosts(),
        ]);
        profile = p;
        postsData = postsRes || [];
        fc = fC;
        fCount = fCnt;
        setStagingCount(stgCount);
      } else {
        // Viewer path: read from discovery API + public ledger
        const [p, fr] = await Promise.all([
          readUserProfile(username).catch(() => null),
          readFollow(username).catch(() => null),
        ]);
        profile = p;
        setFollowRecord(fr);
        setFollowing(fr?.status === 'active' || false);

        // Fetch posts DIRECTLY from the author's public_posts collection —
        // never via discovery, so admin board-moderation (discover-only
        // takedown) can't rip the post off the author's profile.
        try {
          postsData = await readUserPublicPosts(username, provider);
        } catch {
          // Author collection unreadable
        }

        // Follower count from the public ledger (per-user, never the viewer's)
        try {
          fCount = await countFollowers(username, provider);
        } catch {
          // Ledger unavailable — fCount stays null (hide tile)
        }

        // Following count from the public ledger (per-user, never the viewer's)
        try {
          fc = await countUserFollowing(username, provider);
        } catch {
          setFollowingCountError(true);
        }
      }

      setProfile(profile);
      if (isOwn) {
        setDraft(profile || {});
      }
      setPosts(postsData);
      setFollowingCount(fc);
      setFollowerCount(fCount);

      // Resolve media refs
      const allRefs = postsData.flatMap((post) => post.media_refs || []);
      if (profile?.avatar_ref) allRefs.push(profile.avatar_ref);
      if (profile?.banner_ref) allRefs.push(profile.banner_ref);
      const mediaMapInit: Record<string, MediaRecord> = {};
      if (allRefs.length) {
        const media = isOwn
          ? await resolveMediaRefs([...new Set(allRefs)])
          : await resolveMediaRefs([...new Set(allRefs)], { username, provider }, 'public_media');
        media.forEach((m) => {
          if (m._id) mediaMapInit[m._id] = m;
        });
      }
      setMediaMap(mediaMapInit);
    } catch (e) {
      console.error('Failed to load user profile:', e);
    }
    setLoading(false);
  }, [username, provider]);

  async function handleFollow() {
    if (followLoading) return;
    setFollowLoading(true);
    setFollowError(null);
    console.log('[social] handleFollow — toggling follow for', username, '— currently following:', following);
    try {
      if (following) {
        await unfollowUser(username, provider);
        setFollowing(false);
        setFollowRecord(null);
        console.log('[social] handleFollow — no longer following', username);
      } else {
        const rec = await followUser(username, provider);
        setFollowRecord({ ...rec, provider, username });
        setFollowing(true);
        console.log('[social] handleFollow — now following', username);
      }
    } catch (e) {
      console.error('Failed to toggle follow:', e);
      setFollowError('Failed to follow. Please try again.');
      // Revert optimistic state on failure
      if (following) {
        // unfollow failed — stay following
      } else {
        setFollowing(false);
      }
    } finally {
      setFollowLoading(false);
    }
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

  function startUpload(field: 'avatar_ref' | 'banner_ref') {
    pendingFieldRef.current = field;
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so the same file can be re-selected on a second upload
    e.target.value = '';
    const field = pendingFieldRef.current;
    pendingFieldRef.current = null;
    if (!file || !field) return;
    console.log('[social] handleFileChange — uploading', file.name, file.type, file.size, 'for', field);
    setUploadError(null);
    setUploading(true);
    try {
      const media = await uploadMedia({ file, service: 'public_media' });
      console.log('[social] handleFileChange — uploaded, media _id:', media._id, 'object_key:', media.object_key);
      if (media._id) {
        const [presigned] = await refreshMediaUrls([media]);
        setMediaMap((prev) => ({ ...prev, [media._id!]: presigned }));
      }
      const updated = { ...(profile || {}), [field]: media._id || '' };
      setDraft(updated);
      const saved = await saveProfile(updated);
      setProfile(saved);
      console.log('[social] handleFileChange — profile saved, profile _id:', saved._id);
    } catch (err) {
      console.error('Failed to upload image:', err);
      setUploadError(
        err instanceof Error ? err.message : 'Upload failed. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return <UserProfileSkeleton />;
  }

  const mediaPosts = posts.filter((p) => p.media_refs?.length);
  const bannerMedia = profile?.banner_ref ? mediaMap[profile.banner_ref] : undefined;
  const avatarMedia = profile?.avatar_ref ? mediaMap[profile.avatar_ref] : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Persistent file input — the avatar/banner upload seam (e2e: setInputFiles) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        data-testid="profile-file-input"
        className="hidden"
        onChange={handleFileChange}
      />
      {/* Back button (mobile) */}
      {onBack && (
        <div className="md:hidden px-3 py-2 border-b border-border">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      )}

      {/* Banner */}
      <div className={cn(
        'relative h-32 sm:h-44 w-full group overflow-hidden',
        'bg-gradient-to-br from-brand/40 via-brand-muted to-background',
      )}>
        <div
          className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-brand/10"
          aria-hidden="true"
        />
        {bannerMedia && (
          <img src={bannerMedia.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
        )}
        {isOwnProfile && (
          <button
            onClick={() => startUpload('banner_ref')}
            disabled={uploading}
            aria-label="Change banner"
            data-testid="edit-banner-button"
            className="absolute bottom-2 right-2 flex items-center gap-1.5 px-2.5 h-9 rounded-lg bg-background/70 border border-border text-xs text-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity backdrop-blur-sm hover:border-brand/30 hover:bg-background/90"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Banner
          </button>
        )}
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-6 -mt-14">
          <div className={cn(isOwnProfile ? 'relative group' : 'flex-shrink-0')}>
            <Avatar className={cn(
              'h-20 w-20 border-4 border-background',
              isOwnProfile ? 'ring-2 ring-brand/20 hover:ring-brand/40 transition-shadow duration-150' : '',
            )}>
              {avatarMedia ? (
                <AvatarImage data-testid="avatar-image" src={avatarMedia.url} alt={profile?.display_name || username} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-brand to-brand-600 text-white text-2xl font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || username.charAt(0).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            {isOwnProfile && (
              <button
                className="absolute bottom-0 right-0 flex items-center justify-center h-7 w-7 rounded-full bg-background border border-border shadow-md opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity hover:border-brand/30"
                aria-label="Change avatar"
                data-testid="edit-avatar-button"
                disabled={uploading}
                onClick={() => startUpload('avatar_ref')}
              >
                {uploading ? (
                  <Loader2 className="w-3.5 h-3.5 text-foreground animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-foreground" />
                )}
              </button>
            )}
          </div>
          {!isOwnProfile && (
            <div className="flex flex-col gap-2 mt-14">
              <div className="flex gap-2">
                <Button
                  variant={following ? 'outline' : 'brand'}
                  size="sm"
                  className={cn(
                    'gap-1.5 min-w-[100px]',
                    following && 'border-border hover:border-danger/50 hover:text-danger hover:bg-danger-muted',
                  )}
                  data-testid="follow-button"
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {followLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : following ? (
                    <>
                      <UserCheck className="w-3.5 h-3.5" />
                      Following
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      Follow
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 min-w-[100px] border-border hover:bg-elevated"
                  data-testid="message-button"
                  onClick={() => navigate(`/messages?to=${username}`)}
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Message
                </Button>
              </div>
            </div>
          )}
          {isOwnProfile && !editing && (
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

        {uploadError && (
          <div
            className="mt-3 flex items-center gap-2 text-sm text-danger"
            role="alert"
            data-testid="profile-upload-error"
          >
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {uploadError}
          </div>
        )}

        <div className="mt-3">
          {isOwnProfile && editing ? (
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
            <>
              <h1 className="font-display text-xl font-bold text-foreground truncate">
                {profile?.display_name || username}
              </h1>
              {!isOwnProfile && (
                <p className="text-xs text-muted-foreground">@{username}</p>
              )}
            </>
          )}
        </div>

        {/* Bio section */}
        <div className="mt-3">
          {isOwnProfile && editing ? (
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
        <div className="mt-4 flex gap-6" data-testid="user-profile-stats">
          <div>
            <span className="tabular-nums font-display font-bold text-foreground text-lg block">{posts.length}</span>
            <span className="text-xs text-muted-foreground">Posts</span>
          </div>
          {followerCount !== null && followerCount !== undefined && (
            <div>
              <span className="tabular-nums font-display font-bold text-foreground text-lg block">{followerCount}</span>
              <span className="text-xs text-muted-foreground">Followers</span>
            </div>
          )}
          <div>
            <span className="tabular-nums font-display font-bold text-foreground text-lg block">
              {followingCountError ? '—' : followingCount ?? ''}
            </span>
            <span className="text-xs text-muted-foreground">Following</span>
          </div>
        </div>

        {/* Staging entry point — only shown to owner when N > 0 */}
        {isOwnProfile && stagingCount > 0 && (
          <Button
            variant="brand_subtle"
            size="sm"
            data-testid="review-imports-button"
            className="mt-3 w-full gap-2"
            onClick={() => navigate('/staging')}
          >
            <Inbox className="w-4 h-4" />
            Review imports ({stagingCount})
          </Button>
        )}

        {/* Follow error state */}
        {followError && (
          <div className="mt-3 flex items-center gap-2 text-sm text-danger" role="alert">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-danger flex-shrink-0" />
            {followError}
            <button
              onClick={() => { setFollowError(null); handleFollow(); }}
              className="text-brand-300 hover:text-brand-400 underline underline-offset-2 transition-colors duration-150"
            >
              Retry
            </button>
          </div>
        )}
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
                const firstMedia = post.media_refs?.[0] ? mediaMap[mediaRefId(post.media_refs[0])] : null;
                return (
                  <div
                    key={post._id}
                    role="button"
                    tabIndex={0}
                    aria-label="View post"
                    data-testid="profile-post-cell"
                    onClick={() => setLightboxPost(post)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLightboxPost(post);
                      }
                    }}
                    className="aspect-square bg-elevated overflow-hidden relative group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {firstMedia ? (
                      firstMedia.mime_type?.startsWith('video/') ? (
                        <div className="w-full h-full relative">
                          <video
                            src={firstMedia.url}
                            poster={firstMedia.thumbnail_url}
                            className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                            preload="metadata"
                            playsInline
                            muted
                          />
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm">
                              <Play className="w-4 h-4 text-foreground ml-0.5" strokeWidth={2} />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <img
                          src={firstMedia.url}
                          alt=""
                          className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                          loading="lazy"
                        />
                      )
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
            <div className="py-16 text-center" data-testid="profile-posts-empty">
              <p className="text-sm text-muted-foreground mb-2">No posts yet</p>
              {isOwnProfile && (
                <p className="text-xs text-muted-foreground/50">
                  Or{' '}
                  <button
                    data-testid="profile-import-cta"
                    className="text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors"
                    onClick={() => window.open(`${MARKETING_ORIGIN}/import`, '_blank', 'noopener,noreferrer')}
                  >
                    import your archive
                  </button>
                </p>
              )}
            </div>
          )
        ) : mediaPosts.length ? (
          <div className="grid grid-cols-3 gap-1">
            {mediaPosts.flatMap((post) =>
              (post.media_refs || []).map((ref) => {
                const media = mediaMap[mediaRefId(ref)];
                if (!media) return null;
                return (
                  <div
                    key={mediaRefId(ref)}
                    role="button"
                    tabIndex={0}
                    aria-label="View post"
                    data-testid="profile-media-cell"
                    onClick={() => setLightboxPost(post)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setLightboxPost(post);
                      }
                    }}
                    className="aspect-square bg-elevated overflow-hidden relative group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    {media.mime_type?.startsWith('video/') ? (
                      <div className="w-full h-full relative">
                        <video
                          src={media.url}
                          poster={media.thumbnail_url}
                          className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                          preload="metadata"
                          playsInline
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <div className="flex items-center justify-center w-9 h-9 rounded-full bg-background/80 backdrop-blur-sm">
                            <Play className="w-4 h-4 text-foreground ml-0.5" strokeWidth={2} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <img
                        src={media.url}
                        alt={media.alt_text || ''}
                        className="w-full h-full object-cover transition-transform duration-150 group-hover:scale-110"
                        loading="lazy"
                      />
                    )}
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

      {lightboxPost && (
        <PostLightbox
          post={lightboxPost}
          mediaMap={mediaMap}
          onClose={() => setLightboxPost(null)}
          onReload={loadData}
          postAuthor={username}
          postService={'public_posts'}
          isOwner={isOwnProfile}
        />
      )}
    </div>
  );
}