import { ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface AppCardProps {
  iconSrc?: string
  iconLetter?: string
  name: string
  description: string
  href: string
  visits?: number
  flagship?: boolean
  skeleton?: boolean
  'data-testid'?: string
}

export function AppCard({
  iconSrc,
  iconLetter,
  name,
  description,
  href,
  visits,
  flagship,
  skeleton,
  'data-testid': testId,
}: AppCardProps) {
  if (skeleton) {
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

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="group block"
      data-testid={testId ?? 'app-card'}
    >
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border bg-surface p-8 transition-all duration-150 ease-out hover:-translate-y-1 hover:border-brand-muted hover:shadow-lg hover:shadow-brand/5">
        <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated sm:h-24 sm:w-24">
          {iconSrc ? (
            <img
              src={iconSrc}
              alt={name}
              className="h-14 w-14 object-contain sm:h-16 sm:w-16"
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
              'absolute inset-0 flex items-center justify-center text-2xl font-semibold text-muted-foreground sm:text-3xl',
              iconSrc ? 'hidden' : '',
            )}
          >
            {iconLetter ?? name.charAt(0).toUpperCase()}
          </div>
        </div>

        <div className="flex flex-col items-center gap-1.5 text-center">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{name}</span>
            {flagship && (
              <span className="rounded-full bg-brand-muted px-2 py-0.5 text-[0.625rem] font-medium uppercase tracking-wide text-brand-300">
                Flagship
              </span>
            )}
          </div>
          <p className="max-w-[200px] text-sm leading-snug text-muted-foreground">
            {description}
          </p>
        </div>

        {visits !== undefined && visits >= 0 && (
          <span className="text-xs text-muted-foreground">
            {visits.toLocaleString()} {visits === 1 ? 'visit' : 'visits'}
          </span>
        )}

        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-elevated px-4 py-2 text-sm font-medium text-brand-300 transition-colors duration-150 ease-out group-hover:bg-brand-muted group-hover:text-brand-300">
          Open
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
      </div>
    </a>
  )
}