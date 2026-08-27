import { Link } from 'react-router-dom'
import { Users, Lock, LockOpen, Shield } from 'lucide-react'
import { cn } from '@/lib/utils'

// The `?api=` override (isolated e2e stacks on a non-80 port) must survive the
// card → detail navigation — the detail page derives its API origin the same
// way the directory does.
function apiQuery(): string {
  if (typeof window === 'undefined') return ''
  const api = new URLSearchParams(window.location.search).get('api')
  return api ? `?api=${encodeURIComponent(api)}` : ''
}

function joinPolicyBadge(policy: string) {
  const base = 'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide'
  switch (policy) {
    case 'open':
      return (
        <span className={cn(base, 'bg-success/15 text-success')}>
          <LockOpen className="h-3 w-3" strokeWidth={1.5} /> Open
        </span>
      )
    case 'request':
      return (
        <span className={cn(base, 'bg-warning/15 text-warning')}>
          <Shield className="h-3 w-3" strokeWidth={1.5} /> Request
        </span>
      )
    case 'invite_only':
      return (
        <span className={cn(base, 'bg-danger/15 text-danger')}>
          <Lock className="h-3 w-3" strokeWidth={1.5} /> Invite
        </span>
      )
    default:
      return <span className={cn(base, 'bg-elevated text-muted-foreground')}>{policy}</span>
  }
}

export interface GroupCardProps {
  groupId: string
  name: string
  owner: string
  joinPolicy: string
  memberCount: number
  tags: string[]
  avatarSrc?: string
  skeleton?: boolean
  'data-testid'?: string
}

export function GroupCard({
  groupId,
  name,
  owner,
  joinPolicy,
  memberCount,
  tags,
  avatarSrc,
  skeleton,
  'data-testid': testId,
}: GroupCardProps) {
  if (skeleton) {
    return (
      <div
        className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5"
        data-testid={testId ?? 'group-card-skeleton'}
      >
        <div className="h-16 w-16 animate-pulse rounded-2xl bg-elevated" />
        <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-16 animate-pulse rounded bg-elevated" />
      </div>
    )
  }

  return (
    <Link
      to={`/groups/${encodeURIComponent(groupId)}${apiQuery()}`}
      className="group flex flex-col gap-3 rounded-2xl border border-border bg-surface p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-brand-muted hover:shadow-lg hover:shadow-brand/5"
      data-testid={testId ?? 'group-card'}
    >
      {/* Avatar — the identity's avatar_ref, else a fallback letter */}
      <div className="relative flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated">
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={name}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none'
              const sibling = e.currentTarget.nextElementSibling as HTMLElement | null
              if (sibling?.dataset.fallback) sibling.style.display = 'flex'
            }}
          />
        ) : null}
        <div
          data-fallback="true"
          className={cn(
            'absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground',
            avatarSrc ? 'hidden' : '',
          )}
        >
          {name.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Name + owner */}
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="line-clamp-1 text-sm font-semibold text-foreground" data-testid="group-card-name">
          {name}
        </span>
        <span className="line-clamp-1 text-xs text-muted-foreground">@{owner}</span>
      </div>

      {/* Join policy + member count */}
      <div className="flex items-center gap-2">
        {joinPolicyBadge(joinPolicy)}
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Users className="h-3 w-3" strokeWidth={1.5} />
          {memberCount.toLocaleString()}
        </span>
      </div>

      {/* Tags — topic, for client-side filtering */}
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1" data-testid="group-card-tags">
          {tags.slice(0, 3).map((t) => (
            <span key={t} className="rounded-full bg-elevated px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground">
              #{t}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  )
}
