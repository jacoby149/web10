import { ReliableImage } from '@web10/discover/image';
import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppCardSize = 'default' | 'plug' | 'browse'

const catalogCard = 'h-full rounded-lg border border-border/55 bg-surface transition-colors duration-150 hover:border-border hover:bg-elevated'
const browseTile = 'flex min-h-32 flex-col items-center justify-center gap-3 px-3 py-4 text-center sm:min-h-36'

// The `?api=` override (isolated e2e stacks on a non-80 port) must survive
// the card → product-page navigation — the detail page derives its API
// origin the same way the store does.
function apiQuery(): string {
  if (typeof window === 'undefined') return ''
  const api = new URLSearchParams(window.location.search).get('api')
  return api ? `?api=${encodeURIComponent(api)}` : ''
}

export interface AppCardProps {
  iconSrc?: string
  iconLetter?: string
  name: string
  description: string
  href: string
  visits?: number
  metricLabel?: string
  flagship?: boolean
  skeleton?: boolean
  size?: AppCardSize
  badge?: string
  appId?: string
  'data-testid'?: string
}

function CardContent({
  iconSrc,
  iconLetter,
  name,
  description,
  visits,
  metricLabel,
  badge,
  flagship,
  size,
  href,
}: {
  iconSrc?: string
  iconLetter?: string
  name: string
  description: string
  visits?: number
  metricLabel?: string
  badge?: string
  flagship?: boolean
  size: AppCardSize
  href: string
}) {
  const iconBlock = (
    <div className={cn('relative flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-elevated',
      size === 'plug' ? 'size-11 sm:size-14' : size === 'browse' ? 'size-12 sm:size-14' : 'size-14 sm:size-16',
    )}>
      {iconSrc ? (
        <ReliableImage
          src={iconSrc}
          alt={name}
          className="size-full object-contain"
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
          'absolute inset-0 flex items-center justify-center font-semibold text-muted-foreground',
          size === 'plug' ? 'text-xl' : size === 'browse' ? 'text-2xl' : 'text-2xl sm:text-3xl',
          iconSrc ? 'hidden' : '',
        )}
      >
        {iconLetter ?? name.charAt(0).toUpperCase()}
      </div>
    </div>
  )

  const badgeEl = badge || flagship ? (
    <span className="shrink-0 rounded-full bg-brand-muted px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-brand-300">
      {badge ?? 'Flagship'}
    </span>
  ) : null

  const visitsEl =
    visits !== undefined && visits >= 0 ? (
      <span className="text-xs text-muted-foreground">
        {visits.toLocaleString()} {metricLabel ?? (visits === 1 ? 'visit' : 'visits')}
      </span>
    ) : null

  const openBtn = (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={cn('inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors duration-150 ease-out',
        size === 'plug' ? 'bg-brand-muted text-brand-300 hover:bg-brand hover:text-brand-foreground' : 'bg-brand text-brand-foreground hover:bg-brand-600',
      )}
    >
      Open
      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  )

  if (size === 'plug') {
    return (
      <div className={cn(catalogCard, 'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 p-4 sm:items-start sm:gap-x-4 sm:gap-y-1 sm:p-5')}>
        <div className="sm:row-span-2">{iconBlock}</div>
        <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2">
          <span className="max-w-full truncate text-lg leading-tight font-semibold text-foreground">{name}</span>
          {badgeEl}
        </div>
        <div className="sm:row-span-2">{openBtn}</div>
        <div className="col-span-3 flex flex-col gap-1 sm:col-span-1 sm:col-start-2">
          <p className="text-sm leading-snug text-muted-foreground sm:text-base">{description}</p>
          {visitsEl}
        </div>
      </div>
    )
  }

  if (size === 'browse') {
    return (
      <div className={cn(catalogCard, browseTile)}>
        {iconBlock}
        <div className="flex min-w-0 max-w-full flex-col gap-0.5">
          <span className="line-clamp-1 text-base font-semibold text-foreground">
            {name}
          </span>
          {visitsEl}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 transition-all duration-150 ease-out hover:-translate-y-1 hover:border-brand-muted hover:shadow-lg hover:shadow-brand/5">
      <div className="h-20 w-20 sm:h-24 sm:w-24">{iconBlock}</div>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">{name}</span>
          {badgeEl}
        </div>
        <p className="max-w-[200px] text-sm leading-snug text-muted-foreground">
          {description}
        </p>
      </div>

      {visitsEl}

      {openBtn}
    </div>
  )
}

export function AppCard({
  iconSrc,
  iconLetter,
  name,
  description,
  href,
  visits,
  metricLabel,
  flagship,
  skeleton,
  size = 'default',
  badge,
  appId,
  'data-testid': testId,
}: AppCardProps) {
  if (skeleton) {
    if (size === 'browse') {
      return (
        <div
          className={cn(catalogCard, browseTile)}
          data-testid={testId ?? 'app-card-skeleton'}
        >
          <div className="size-12 animate-pulse rounded-md bg-elevated sm:size-14" />
          <div className="grid justify-items-center gap-1">
            <div className="h-4 w-20 animate-pulse rounded-sm bg-elevated" />
            <div className="h-3 w-16 animate-pulse rounded-sm bg-elevated" />
          </div>
        </div>
      )
    }
    return (
      <div
        className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8"
        data-testid={testId ?? 'app-card-skeleton'}
      >
        <div className="h-20 w-20 animate-pulse rounded-2xl bg-elevated sm:h-24 sm:w-24" />
        <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
        <div className="h-3 w-32 animate-pulse rounded bg-elevated" />
        <div className="mt-2 h-3 w-16 animate-pulse rounded bg-elevated" />
        <div className="mt-4 h-8 w-20 animate-pulse rounded-full bg-elevated" />
      </div>
    )
  }

  const content = (
    <CardContent
      iconSrc={iconSrc}
      iconLetter={iconLetter}
      name={name}
      description={description}
      visits={visits}
      metricLabel={metricLabel}
      badge={badge}
      flagship={flagship}
      size={size}
      href={href}
    />
  )

  if (appId) {
    return (
      <Link
        to={`/app-store/app/${encodeURIComponent(appId)}${apiQuery()}`}
        className="group block h-full rounded-md"
        data-testid={testId ?? 'app-card'}
      >
        {content}
      </Link>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block h-full rounded-md"
      data-testid={testId ?? 'app-card'}
    >
      {content}
    </a>
  )
}
