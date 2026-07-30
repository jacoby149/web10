import { useState, useEffect, useCallback } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  readUserProfile,
  readProfile,
  readMyPosts,
  resolveMediaRefs,
  followUser,
  unfollowUser,
  readFollow,
  countFollows,
  countFollowers,
} from '@/data';
import { getWapi } from '@/data/wapi';
import { API_ORIGIN } from '@/lib/origins';
import type { ProfileRecord, PostRecord, MediaRecord, FollowRecord, DiscoveryPost } from '@/data/types';
import { MapPin, Globe, Link, Users, UserPlus, UserCheck, Loader2, ArrowLeft, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
      let fCount = 0;

      if (isOwn) {
        // Owner path: read from own collections (same as ProfileScreen)
        const [p, postsRes, fC, fCnt] = await Promise.all([
          readProfile(),
          readMyPosts(),
          countFollows(),
          countFollowers(token.username, token.provider),
        ]);
        profile = p;
        postsData = postsRes || [];
        fc = fC;
        fCount = fCnt;
      } else {
        // Viewer path: read from discovery API
        const [p, fr] = await Promise.all([
          readUserProfile(username, provider),
          readFollow(username, provider).catch(() => null),
        ]);
        profile = p;
        setFollowRecord(fr);
        setFollowing(fr?.status === 'active' || false);

        // Fetch posts from discovery API (public posts index)
        try {
          const resp = await fetch(
            `${API_ORIGIN}/discover/posts?sort=recent&limit=50`,
            { method: 'PATCH' },
          );
          if (resp.ok) {
            const allPosts: DiscoveryPost[] = await resp.json();
            postsData = allPosts
              .filter((dp) => dp.author === username && dp.provider === provider)
              .map((dp) => {
                const post: PostRecord = {
                  _id: dp.post_id,
                  text: dp.text,
                  created_at: dp.created_at,
                  tags: dp.tags,
                };
                if (dp.media_refs?.length) {
                  post.media_refs = dp.media_refs;
                }
                return post;
              });
          }
        } catch {
          // Discovery API unavailable
        }

        // Follower/following counts from discovery API
        try {
          const usersResp = await fetch(
            `${API_ORIGIN}/discover/users?limit=100`,
            { method: 'PATCH' },
          );
          if (usersResp.ok) {
            const users = await usersResp.json();
            const userEntry = users.find(
              (u: { username: string; provider: string }) =>
                u.username === username && u.provider === provider,
            );
            if (userEntry) {
              fCount = userEntry.followers_count ?? 0;
            }
          }
        } catch {
          // Discovery users API unavailable
        }

        // Following count from our own follows service
        try {
          fc = await countFollows();
        } catch {
          setFollowingCountError(true);
        }
      }

      setProfile(profile);
      setPosts(postsData);
      setFollowingCount(fc);
      setFollowerCount(fCount || null);

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
    try {
      if (following) {
        await unfollowUser(username, provider);
        setFollowing(false);
        setFollowRecord(null);
      } else {
        const rec = await followUser(username, provider);
        setFollowRecord(rec);
        setFollowing(true);
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

  if (loading) {
    return <UserProfileSkeleton />;
  }

  const mediaPosts = posts.filter((p) => p.media_refs?.length);
  const bannerMedia = profile?.banner_ref ? mediaMap[profile.banner_ref] : undefined;
  const avatarMedia = profile?.avatar_ref ? mediaMap[profile.avatar_ref] : undefined;

  return (
    <div>
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
      </div>

      {/* Header */}
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-start justify-between gap-6 -mt-14">
          <div className="flex-shrink-0">
            <Avatar className={cn(
              'h-20 w-20 border-4 border-background',
              'ring-2 ring-brand/20',
            )}>
              {avatarMedia ? (
                <AvatarImage src={avatarMedia.url} alt={profile?.display_name || username} />
              ) : (
                <AvatarFallback className="bg-gradient-to-br from-brand to-brand-600 text-white text-2xl font-bold">
                  {profile?.display_name?.charAt(0)?.toUpperCase() || username.charAt(0).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
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
        </div>

        <div className="mt-3">
          <h1 className="font-display text-xl font-bold text-foreground truncate">
            {profile?.display_name || username}
          </h1>
          <p className="text-xs text-muted-foreground">@{username}</p>
        </div>

        {/* Bio section */}
        <div className="mt-3 space-y-1.5">
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