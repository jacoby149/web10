import { Users, UserPlus, UserCheck, Loader2, ArrowUpRight } from 'lucide-react';
import { cn, formatCount, hashToGradient } from './utils';
import { Avatar, AvatarFallback, Skeleton } from './ui';

/**
 * The shared Person card — the banner + overlapping avatar + name + @handle +
 * follower count, with a Follow action (interactive) or a link-out (remote).
 *
 * One source, two apps (the discover-ia-consistency keystone): the social
 * Discover "Profiles" browser and the marketing Discover "Profiles" browser
 * both render THIS card, so the two can't drift. The data layer + navigation
 * are injected — the package is presentational and knows nothing about wapi.
 *
 *   interactive (web10-social, logged in) — the card opens the profile in-app
 *     and carries a live Follow / Following button.
 *   remote (marketing-ui, anon) — the card is a link-out to web10 social; no
 *     follow (an anon visitor can't follow).
 */

/** One row in a people browser (the D0 public directory, or a follow list). */
export interface DiscoverPerson {
  username: string;
  display_name?: string;
  /** Presigned banner URL (the app resolves the profile's banner ref). */
  banner_url?: string;
  /** Presigned avatar URL (the app resolves the profile's avatar ref). */
  avatar_url?: string;
  /** The unspoofable follower count. */
  followers_count: number;
  /** Whether the reader follows this person (interactive mode). */
  is_following?: boolean;
}

export interface PersonCardProps {
  person: DiscoverPerson;
  /** Interactive mode: open the profile in-app (the card's primary action). */
  onOpen?: () => void;
  /** Interactive mode: the follow / unfollow handlers. */
  onFollow?: () => void;
  onUnfollow?: () => void;
  /** Interactive mode: the follow button is in flight. */
  followLoading?: boolean;
  /** Remote (marketing) mode: the profile link-out target. */
  profileHref?: string;
  /** The card's testid (the app keeps its own: `people-card`, …). */
  testId?: string;
  className?: string;
}

export function PersonCard({
  person,
  onOpen,
  onFollow,
  onUnfollow,
  followLoading = false,
  profileHref,
  testId = 'person-card',
  className,
}: PersonCardProps) {
  const name = person.display_name || person.username;
  const initial = name.charAt(0).toUpperCase();
  const gradient = hashToGradient(person.username);
  const interactive = !!onOpen;

  const card = (
    <div
      data-testid={testId}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={interactive ? onOpen : undefined}
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      aria-label={interactive ? `View ${name}'s profile` : undefined}
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
        interactive && 'cursor-pointer',
        className,
      )}
    >
      {/* Banner — the person's real banner or their gradient */}
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        {person.banner_url ? (
          <img
            src={person.banner_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
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
              <img src={person.avatar_url} alt={`${name}'s profile picture`} className="h-full w-full object-cover" />
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
            <span data-testid="people-followers">
              {formatCount(person.followers_count)} follower{person.followers_count === 1 ? '' : 's'}
            </span>
          </p>
        </div>

        {interactive ? (
          <button
            type="button"
            data-testid="people-follow-button"
            disabled={followLoading}
            onClick={(e) => {
              e.stopPropagation();
              if (person.is_following) onUnfollow?.();
              else onFollow?.();
            }}
            aria-label={person.is_following ? `Unfollow ${name}` : `Follow ${name}`}
            className={cn(
              'shrink-0 gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              person.is_following
                ? 'border border-border text-muted-foreground hover:border-danger/50 hover:bg-danger-muted hover:text-danger'
                : 'border border-brand/20 bg-brand-muted text-brand-300 hover:border-brand/40 hover:bg-brand/20',
            )}
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
          </button>
        ) : (
          <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        )}
      </div>
    </div>
  );

  if (interactive) {
    return card;
  }

  return (
    <a
      href={profileHref || '#'}
      target="_blank"
      rel="noopener"
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {card}
    </a>
  );
}

export function PersonCardSkeleton({ testId = 'person-card-skeleton' }: { testId?: string }) {
  return (
    <div data-testid={testId} className="w-full overflow-hidden rounded-xl border border-border bg-card">
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
