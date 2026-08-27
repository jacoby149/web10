import { Link } from 'react-router-dom'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'

export type AppCardSize = 'default' | 'plug' | 'browse'

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
    <div className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated">
      {iconSrc ? (
        <img
          src={iconSrc}
          alt={name}
          className={cn(
            'object-contain',
            size === 'plug' ? 'h-11 w-11' : size === 'browse' ? 'h-14 w-14' : 'h-14 w-14 sm:h-16 sm:w-16',
          )}
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
      className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-elevated px-4 py-2 text-sm font-medium text-brand-300 transition-colors duration-150 ease-out hover:bg-brand-muted hover:text-brand-300"
    >
      Open
      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
    </a>
  )

  if (size === 'plug') {
    return (
      <div className="flex items-start gap-5 rounded-2xl border border-border bg-surface p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-brand-muted hover:shadow-lg hover:shadow-brand/5">
        <div className="h-16 w-16">{iconBlock}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {badgeEl}
            <span className="truncate font-semibold text-foreground">{name}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted-foreground">
            {description}
          </p>
          {visitsEl}
        </div>
        {openBtn}
      </div>
    )
  }

  if (size === 'browse') {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:border-brand-muted hover:shadow-lg hover:shadow-brand/5">
        <div className="h-16 w-16">{iconBlock}</div>

        <div className="flex flex-col items-center gap-1 text-center">
          <span className="line-clamp-1 text-sm font-semibold text-foreground">
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
          className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface p-5"
          data-testid={testId ?? 'app-card-skeleton'}
        >
          <div className="h-16 w-16 animate-pulse rounded-2xl bg-elevated" />
          <div className="h-4 w-20 animate-pulse rounded bg-elevated" />
          <div className="h-3 w-16 animate-pulse rounded bg-elevated" />
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
        to={`/app-store/app/${appId}`}
        className="group block"
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
      className="group block"
      data-testid={testId ?? 'app-card'}
    >
      {content}
    </a>
  )
}