import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchSuggestedUsers,
  followUser,
  unfollowUser,
  readFollow,
  readUserProfile,
} from '@/data';
import type { SuggestedUser, FollowRecord } from '@/data';
import { Users, UserPlus, UserCheck, Loader2, Sparkles, UserX } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DiscoverUserCardProps {
  user: SuggestedUser;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onViewProfile: () => void;
  followLoading: boolean;
}

function DiscoverUserCard({
  user,
  isFollowing,
  onFollow,
  onUnfollow,
  onViewProfile,
  followLoading,
}: DiscoverUserCardProps) {
  const handleFollowToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFollowing) {
      onUnfollow();
    } else {
      onFollow();
    }
  };

  return (
    <div
      data-testid="discover-user-card"
      className={cn(
        'bg-card border border-border rounded-lg overflow-hidden cursor-pointer transition-all duration-150',
        'glow-card hover:border-brand/30',
      )}
      onClick={onViewProfile}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onViewProfile();
        }
      }}
      aria-label={`View ${user.display_name || user.username}'s profile`}
    >
      <div className="p-4">
        <div className="flex items-center gap-3">
          <Avatar
            className={cn(
              'h-12 w-12 flex-shrink-0 ring-2 ring-transparent transition-all duration-150',
              isFollowing && 'ring-brand/30',
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <AvatarFallback className="bg-gradient-to-br from-brand to-brand-600 text-white text-lg font-bold">
              {(user.display_name || user.username).charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm text-foreground truncate">
              {user.display_name || user.username}
            </h3>
            <p className="text-xs text-muted-foreground truncate">@{user.username}</p>
            {user.bio && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{user.bio}</p>
            )}
          </div>
        </div>

        {user.followers_count !== undefined && user.followers_count !== null && (
          <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="w-3.5 h-3.5" />
            <span className="tabular-nums">{user.followers_count} followers</span>
          </div>
        )}

        <div className="mt-3">
          <Button
            variant={isFollowing ? 'outline' : 'brand'}
            size="sm"
            className={cn(
              'w-full gap-1.5',
              isFollowing &&
                'border-border hover:border-danger/50 hover:text-danger hover:bg-danger-muted',
            )}
            data-testid="discover-follow-button"
            onClick={handleFollowToggle}
            disabled={followLoading}
          >
            {followLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : isFollowing ? (
              <>
                <UserX className="w-3.5 h-3.5" />
                Unfollow
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Follow
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

function DiscoverSkeleton() {
  return (
    <div className="space-y-3" data-testid="discover-skeleton">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <Skeleton className="h-8 w-full mt-3" />
        </div>
      ))}
    </div>
  );
}

export default function DiscoverScreen() {
  const [users, setUsers] = useState<SuggestedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followStates, setFollowStates] = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSuggested();
  }, []);

  async function loadSuggested() {
    setLoading(true);
    try {
      const suggested = await fetchSuggestedUsers(20);
      setUsers(suggested);

      // Check follow status for each user
      const states: Record<string, boolean> = {};
      await Promise.all(
        suggested.map(async (user) => {
          const key = `${user.username}@${user.provider}`;
          try {
            const follow = await readFollow(user.username, user.provider);
            states[key] = follow?.status === 'active' || false;
          } catch {
            states[key] = false;
          }
        }),
      );
      setFollowStates(states);
    } catch (e) {
      console.error('Failed to load suggested users:', e);
    }
    setLoading(false);
  }

  async function handleFollow(user: SuggestedUser) {
    const key = `${user.username}@${user.provider}`;
    setFollowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await followUser(user.username, user.provider);
      setFollowStates((prev) => ({ ...prev, [key]: true }));
    } catch (e) {
      console.error('Failed to follow user:', e);
    } finally {
      setFollowLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  async function handleUnfollow(user: SuggestedUser) {
    const key = `${user.username}@${user.provider}`;
    setFollowLoading((prev) => ({ ...prev, [key]: true }));
    try {
      await unfollowUser(user.username, user.provider);
      setFollowStates((prev) => ({ ...prev, [key]: false }));
    } catch (e) {
      console.error('Failed to unfollow user:', e);
    } finally {
      setFollowLoading((prev) => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="md:max-w-xl md:mx-auto">
      <div className="sticky top-0 z-10 bg-background/90 backdrop-blur-md border-b border-border md:static md:border-0 md:bg-transparent md:mb-4">
        <div className="flex items-center justify-between px-4 py-3 md:px-0">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-brand" />
            <h1 className="font-display text-lg font-bold text-foreground">Discover</h1>
          </div>
        </div>
      </div>

      <div className="px-4 md:px-0">
        <p className="text-sm text-muted-foreground mb-4">
          Suggested accounts to follow. Their posts will appear in your feed.
        </p>

        {loading ? (
          <DiscoverSkeleton />
        ) : users.length ? (
          <div className="space-y-3">
            {users.map((user) => {
              const key = `${user.username}@${user.provider}`;
              return (
                <DiscoverUserCard
                  key={key}
                  user={user}
                  isFollowing={!!followStates[key]}
                  followLoading={!!followLoading[key]}
                  onFollow={() => handleFollow(user)}
                  onUnfollow={() => handleUnfollow(user)}
                  onViewProfile={() => {
                    // Navigate to user profile
                    const event = new CustomEvent('navigate-user-profile', {
                      detail: { username: user.username, provider: user.provider },
                    });
                    window.dispatchEvent(event);
                  }}
                />
              );
            })}
          </div>
        ) : (
          <div className="py-16 text-center" data-testid="discover-empty">
            <Users className="w-8 h-8 text-muted-foreground mx-auto mb-3 opacity-50" />
            <p className="text-sm text-muted-foreground">No suggestions available</p>
            <p className="text-xs text-muted-foreground/50 mt-1">Check back later for new accounts</p>
          </div>
        )}
      </div>
    </div>
  );
}