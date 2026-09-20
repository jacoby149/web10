import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserPlus, UserCheck, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PersonCard } from '@/data';

// ── Helpers ──────────────────────────────────────────────────────────────────

// Deterministic rich gradient per entity — the fallback "face" when a person
// has no uploaded banner/avatar. Gradients read as designed, not as a flat
// color strip (design.md §1: the screenshot test).
export function hashToGradient(str: string): string {
  const gradients = [
    'bg-gradient-to-br from-rose-600 to-pink-900',
    'bg-gradient-to-br from-sky-600 to-indigo-900',
    'bg-gradient-to-br from-amber-600 to-orange-900',
    'bg-gradient-to-br from-emerald-600 to-teal-900',
    'bg-gradient-to-br from-violet-600 to-purple-900',
    'bg-gradient-to-br from-pink-600 to-rose-900',
    'bg-gradient-to-br from-indigo-600 to-violet-900',
    'bg-gradient-to-br from-orange-600 to-red-900',
    'bg-gradient-to-br from-teal-600 to-cyan-900',
    'bg-gradient-to-br from-red-600 to-rose-900',
  ];
  let hash = 0;
  for (let i = 0; str.length > i; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
}

export function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// ── Person card (the groups-tab shape, but with the person's own face) ───────
// Shared by the standalone People screen and the Discover/People subtab (D2)
// — one card, two surfaces.

interface PersonCardRowProps {
  person: PersonCard;
  followLoading: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  onOpen: () => void;
}

export function PersonCardRow({ person, followLoading, onFollow, onUnfollow, onOpen }: PersonCardRowProps) {
  const name = person.display_name || person.username;
  const initial = name.charAt(0).toUpperCase();
  const gradient = hashToGradient(person.username);

  return (
    <div
      data-testid="people-card"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      aria-label={`View ${name}'s profile`}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left cursor-pointer transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
      )}
    >
      {/* Banner — the person's real banner or their gradient */}
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        {person.banner_url ? (
          <img
            src={person.banner_url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
            loading="lazy"
          />
        ) : (
          <div className={cn('h-full w-full', gradient)} />
        )}
      </div>

      <div className="flex items-end gap-3 p-4 pt-0">
        {/* Avatar overlapping the banner — the profile pic preview */}
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Avatar className={cn('h-16 w-16', !person.avatar_url && gradient)}>
            {person.avatar_url ? (
              <AvatarImage src={person.avatar_url} alt={`${name}'s profile picture`} />
            ) : (
              <AvatarFallback className="text-foreground text-xl font-semibold">{initial}</AvatarFallback>
            )}
          </Avatar>
        </div>

        <div className="min-w-0 flex-1 pb-1">
          <h3 className="truncate text-base font-semibold text-foreground">{name}</h3>
          <p className="truncate text-xs text-muted-foreground">@{person.username}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
            <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span data-testid="people-mutuals">
              {person.mutuals} mutual{person.mutuals === 1 ? '' : 's'}
            </span>
            <span aria-hidden="true" className="text-muted-foreground/40">·</span>
            <span>{formatCount(person.followers_count)} followers</span>
          </p>
        </div>

        <Button
          variant={person.is_following ? 'outline' : 'brand_subtle'}
          size="sm"
          data-testid="people-follow-button"
          disabled={followLoading}
          onClick={(e) => {
            e.stopPropagation();
            if (person.is_following) {
              onUnfollow();
            } else {
              onFollow();
            }
          }}
          className={cn(
            'shrink-0 gap-1.5',
            person.is_following && 'border-border text-muted-foreground hover:border-danger/50 hover:text-danger hover:bg-danger-muted',
          )}
          aria-label={person.is_following ? `Unfollow ${name}` : `Follow ${name}`}
        >
          {followLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
          ) : person.is_following ? (
            <>
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Following</span>
            </>
          ) : (
            <>
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Follow</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function PersonCardSkeleton() {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full" />
      <div className="flex items-end gap-3 p-4 pt-0">
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-md" />
      </div>
    </div>
  );
}
