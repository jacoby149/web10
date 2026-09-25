import { Users, UserPlus, UserCheck, Loader2, Lock, ChevronRight } from 'lucide-react';
import { cn, formatCount, hashToGradient } from './utils';
import { Avatar, AvatarFallback, Badge, Skeleton } from './ui';

/**
 * The shared Group card — the banner + overlapping avatar + name + owner +
 * member count + join-policy badge, with a Join action (interactive) or a
 * link-out (remote). The SAME shape as the social My Groups card (the two read
 * as one surface); the only difference is a Join/Request button (you're not a
 * member yet) vs. a Leave button.
 *
 * One source, two apps (the discover-ia-consistency keystone): the social
 * Discover "Profiles" browser and the marketing Discover "Profiles" browser
 * both render THIS card, so the two can't drift. Navigation is injected — the
 * package is presentational and knows nothing about wapi.
 *
 *   interactive (web10-social, logged in) — the card opens the group in-app
 *     and carries a live Join / Request / Joined button.
 *   remote (marketing-ui, anon) — the card is a link-out to web10 social; no
 *     join (an anon visitor can't join).
 */

/** One row in a groups browser (the D53 public directory, or a membership). */
export interface DiscoverGroup {
  group_id: string;
  name: string;
  owner: string;
  member_count: number;
  join_policy: string;
}

/** The group's face (D60 identity) — the banner + avatar shown on the card. */
export interface DiscoverGroupFace {
  banner_url?: string;
  avatar_url?: string;
  name?: string;
}

export type GroupJoinState = 'idle' | 'joining' | 'joined' | 'requested';

export interface GroupCardProps {
  entry: DiscoverGroup;
  /** The group's face (the app resolves the identity doc's banner/avatar). */
  face?: DiscoverGroupFace;
  /** Interactive mode: open the group in-app (the card's primary action). */
  onOpen?: () => void;
  /** Interactive mode: the join handler (open → join, request → request). */
  onJoin?: () => void;
  /** Interactive mode: the join state machine. */
  joinState?: GroupJoinState;
  /** Remote (marketing) mode: the group link-out target. */
  groupHref?: string;
  /** The card's testid (the app keeps its own: `groups-discover-card`, …). */
  testId?: string;
  className?: string;
}

export function GroupCard({
  entry,
  face,
  onOpen,
  onJoin,
  joinState = 'idle',
  groupHref,
  testId = 'group-card',
  className,
}: GroupCardProps) {
  const name = face?.name || entry.name;
  const initial = name.charAt(0).toUpperCase();
  const canJoin = entry.join_policy !== 'invite_only';
  const gradient = hashToGradient(entry.group_id);
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
      className={cn(
        'group relative w-full overflow-hidden rounded-xl border border-border bg-card text-left transition-all duration-200',
        'hover:-translate-y-1 hover:border-brand/40 hover:shadow-[0_8px_32px_-8px_var(--color-glow-intense)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'motion-reduce:transform-none',
        interactive && 'cursor-pointer',
        className,
      )}
    >
      <div className="h-24 w-full overflow-hidden" aria-hidden="true">
        {face?.banner_url ? (
          <img
            src={face.banner_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transform-none"
          />
        ) : (
          <div className={cn('h-full w-full', gradient)} />
        )}
      </div>
      <div className="flex items-end gap-3 p-4 pt-0">
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Avatar className={cn('h-16 w-16', !face?.avatar_url && gradient)}>
            {face?.avatar_url ? (
              <img src={face.avatar_url} alt={name} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="text-foreground text-xl font-semibold">{initial}</AvatarFallback>
            )}
          </Avatar>
        </div>
        <div className="min-w-0 flex-1 pb-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-base font-semibold text-foreground" data-testid="groups-discover-card-name">{name}</h3>
            <span className="shrink-0 text-xs text-muted-foreground">by @{entry.owner}</span>
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3 w-3 shrink-0" strokeWidth={2} aria-hidden="true" />
            <span className="tabular-nums">{formatCount(entry.member_count)} members</span>
            <span aria-hidden="true" className="text-muted-foreground/40">·</span>
            <JoinPolicyBadge policy={entry.join_policy} testId="group-join-policy" />
          </p>
        </div>
        {interactive ? (
          <button
            type="button"
            data-testid="groups-join-button"
            disabled={!canJoin || joinState === 'joining' || joinState === 'joined' || joinState === 'requested'}
            onClick={(e) => {
              e.stopPropagation();
              onJoin?.();
            }}
            className={cn(
              'shrink-0 gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
              joinState === 'joined'
                ? 'border border-border text-muted-foreground'
                : 'border border-brand/20 bg-brand-muted text-brand-300 hover:border-brand/40 hover:bg-brand/20',
            )}
          >
            {joinState === 'joining' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
            ) : joinState === 'joined' || joinState === 'requested' ? (
              <UserCheck className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : entry.join_policy === 'invite_only' ? (
              <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
            ) : (
              <UserPlus className="h-3.5 w-3.5" strokeWidth={1.75} />
            )}
            {joinState === 'joining'
              ? 'Joining…'
              : joinState === 'joined'
                ? 'Joined'
                : joinState === 'requested'
                  ? 'Requested'
                  : entry.join_policy === 'invite_only'
                    ? 'Invite only'
                    : entry.join_policy === 'request'
                      ? 'Request'
                      : 'Join'}
          </button>
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition-transform duration-150 group-hover:translate-x-0.5" />
        )}
      </div>
    </div>
  );

  if (interactive) {
    return card;
  }

  return (
    <a
      href={groupHref || '#'}
      target="_blank"
      rel="noopener"
      aria-label={`View ${name}`}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      {card}
    </a>
  );
}

export function GroupCardSkeleton({ testId = 'group-card-skeleton' }: { testId?: string }) {
  return (
    <div data-testid={testId} className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="h-24 w-full" />
      <div className="flex items-end gap-3 p-4 pt-0">
        <div className="shrink-0 -mt-8 rounded-full border-4 border-card">
          <Skeleton className="h-16 w-16 rounded-full" />
        </div>
        <div className="min-w-0 flex-1 space-y-2 pb-1">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-40" />
        </div>
        <Skeleton className="h-8 w-16 rounded-md" />
      </div>
    </div>
  );
}

/** The join-policy badge (open / request / invite-only). */
export function JoinPolicyBadge({ policy, testId }: { policy: string; testId?: string }) {
  const variant = policy === 'open' ? 'success' : policy === 'request' ? 'warning' : 'outline';
  const label = policy === 'open' ? 'Open' : policy === 'request' ? 'Request' : 'Invite only';
  return (
    <Badge variant={variant} data-testid={testId} className="normal-case tracking-normal">
      {label}
    </Badge>
  );
}
