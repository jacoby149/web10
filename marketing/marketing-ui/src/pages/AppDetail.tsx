import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, PackageX } from 'lucide-react'
import { cn } from '@/lib/utils'

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

interface AppDetailData {
  url: string
  name: string
  description: string
  icon_url?: string
  screenshots: string[]
  visits: number
}

function AppDetail() {
  const { id } = useParams<{ id: string }>()
  const [app, setApp] = useState<AppDetailData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/discover/app/${encodeURIComponent(id!)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => {
        if (r.status === 404) throw new Error('not found')
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => {
        if (!alive) return
        setApp(data)
      })
      .catch((err) => {
        if (!alive) return
        if (err.message === 'not found') {
          setNotFound(true)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <Link
            to="/app-store"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to App Store
          </Link>
          <div className="mt-8 flex flex-col items-center gap-6 sm:flex-row sm:gap-8">
            <div className="h-24 w-24 animate-pulse rounded-2xl bg-elevated sm:h-28 sm:w-28" />
            <div className="flex flex-1 flex-col gap-3 sm:items-start">
              <div className="h-7 w-48 animate-pulse rounded bg-elevated" />
              <div className="h-4 w-64 animate-pulse rounded bg-elevated" />
              <div className="h-4 w-24 animate-pulse rounded bg-elevated" />
              <div className="mt-2 h-10 w-24 animate-pulse rounded-full bg-elevated" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (notFound || !app) {
    return (
      <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <Link
            to="/app-store"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
            Back to App Store
          </Link>
          <div className="mt-12 flex flex-col items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-elevated">
              <PackageX className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground">
              App not found
            </h1>
            <p className="max-w-xs text-muted-foreground">
              This app may have been removed or the link is outdated.
            </p>
            <Link
              to="/app-store"
              className="mt-2 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600"
            >
              Browse App Store
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl">
        <Link
          to="/app-store"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground"
          data-testid="back-to-store"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} />
          Back to App Store
        </Link>

        <div className="mt-8 flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left sm:gap-8">
          <div className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated">
            {app.icon_url ? (
              <img
                src={app.icon_url}
                alt={app.name}
                className="h-24 w-24 object-contain sm:h-28 sm:w-28"
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
                'absolute inset-0 flex items-center justify-center text-4xl font-semibold text-muted-foreground',
                app.icon_url ? 'hidden' : ''
              )}
            >
              {app.name.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl" data-testid="app-detail-name">
              {app.name}
            </h1>
            {app.description ? (
              <p className="text-muted-foreground" data-testid="app-detail-description">
                {app.description}
              </p>
            ) : null}
            <span className="text-sm text-muted-foreground" data-testid="app-detail-visits">
              {app.visits.toLocaleString()} {app.visits === 1 ? 'visit' : 'visits'}
            </span>
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600"
              data-testid="open-app-button"
            >
              Open
              <ExternalLink className="h-4 w-4" strokeWidth={2} />
            </a>
          </div>
        </div>

        {app.screenshots && app.screenshots.length > 0 ? (
          <div className="mt-12" data-testid="screenshots-section">
            <h2 className="mb-4 font-display text-lg font-medium text-foreground">
              Preview
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {app.screenshots.map((url, i) => (
                <div
                  key={i}
                  className="shrink-0 overflow-hidden rounded-xl border border-border bg-surface"
                  style={{ aspectRatio: '9/16', width: '180px' }}
                >
                  <img
                    src={url}
                    alt={`${app.name} screenshot ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default AppDetail