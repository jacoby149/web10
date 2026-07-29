import { useEffect, useState, useMemo } from 'react'
import { trackFunnel } from '@/lib/analytics'
import { AUTH_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins'
import { AppCard } from '@/components/AppCard'

const ICON_PATH = '/brand/icon-192.png'

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

interface RegisteredApp {
  url: string
  visits: number
  pwaIcon?: string
  pwaName?: string
}

interface Stats {
  users: number
  apps: RegisteredApp[]
  storage: number
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val >= 100 || i <= 1 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

function appName(url: string): string {
  const h = hostOf(url)
  return h.replace(/^www\./, '')
}

function pickIcon(manifest: any): string | undefined {
  const icons: { src: string; sizes?: string }[] = manifest?.icons
  if (!Array.isArray(icons) || icons.length === 0) return undefined
  const target = icons.find((ic) => ic.sizes?.includes('192') || ic.sizes?.includes('512'))
  return target?.src ?? icons[0]?.src
}

function resolveIcon(appUrl: string, iconSrc: string): string {
  if (!iconSrc) return ''
  if (iconSrc.startsWith('http')) return iconSrc
  try {
    const base = new URL(appUrl)
    if (!base.pathname.endsWith('/')) {
      base.pathname = base.pathname.replace(/\/[^/]*$/, '/') ?? '/'
    }
    return new URL(iconSrc, base).href
  } catch {
    return iconSrc
  }
}

const KNOWN_HOSTS = ['social.web10.app', 'auth.web10.app', 'api.web10.app', 'www.web10.app', 'web10.app']

interface StoreApp {
  name: string
  description: string
  href: string
  iconSrc?: string
  visits: number
  flagship?: boolean
}

function AppStore() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    trackFunnel('app_store_view')
  }, [])

  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(async (data) => {
        if (!alive) return
        const apps: RegisteredApp[] = Array.isArray(data.apps) ? data.apps : []

        const api = nodeApi()
        const enriched = await Promise.all(
          apps.map(async (app) => {
            if (!app.url) return app as RegisteredApp
            try {
              const resp = await fetch(`${api}/pwa_listing?url=${encodeURIComponent(app.url)}`)
              if (resp.ok) {
                const manifest = await resp.json()
                const icon = pickIcon(manifest)
                return {
                  ...app,
                  pwaIcon: icon ? resolveIcon(app.url, icon) : undefined,
                  pwaName: manifest?.name || manifest?.short_name,
                }
              }
            } catch {
              // No manifest
            }
            return app as RegisteredApp
          }),
        )

        setStats({
          users: data.users ?? 0,
          apps: enriched,
          storage: data.storage ?? 0,
        })
      })
      .catch(() => { /* store still renders first-party catalog */ })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
  }, [])

  const allApps: StoreApp[] = useMemo(() => {
    const firstParty: StoreApp[] = [
      {
        name: 'web10 social',
        description:
          'Feed, DMs, media, streaming — your audience and your data, on a node you own.',
        href: SOCIAL_ORIGIN,
        iconSrc: ICON_PATH,
        visits: stats?.apps.find(
          (a) => hostOf(a.url) === 'social.web10.app',
        )?.visits ?? 0,
        flagship: true,
      },
      {
        name: 'The node console',
        description: 'Login, consent, contracts, and the Studio — the operator surface every node runs.',
        href: AUTH_ORIGIN,
        iconSrc: ICON_PATH,
        visits: stats?.apps.find(
          (a) => hostOf(a.url) === 'auth.web10.app',
        )?.visits ?? 0,
      },
      {
        name: 'The importer',
        description: 'Pulls your Instagram, Facebook, and YouTube history into your node in one pass.',
        href: '/import',
        iconSrc: ICON_PATH,
        visits: 0,
      },
    ]

    const registered: StoreApp[] = (stats?.apps ?? [])
      .filter((a) => a.url && !KNOWN_HOSTS.includes(hostOf(a.url)))
      .filter((a) => hostOf(a.url) !== '' && !hostOf(a.url).endsWith('.localhost'))
      .map((a) => ({
        name: a.pwaName || appName(a.url),
        description: 'Registered on web10.',
        href: a.url,
        iconSrc: a.pwaIcon,
        visits: a.visits ?? 0,
      }))

    return [...firstParty, ...registered].sort((a, b) => b.visits - a.visits)
  }, [stats])

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="reveal text-center">
          <span className="inline-flex items-center rounded-full bg-brand-muted px-2.5 py-0.5 text-[0.75rem] font-medium uppercase tracking-wide text-brand-300">
            The web10 App Store
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Apps that run on data you own.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Sorted by visits — no algorithm, no promotion, just what people use.
            {loading ? (
              <span className="inline-block h-5 w-64 animate-pulse rounded bg-elevated align-middle" />
            ) : stats ? (
              <>
                {' '}
                <span className="font-semibold text-foreground">{stats.users.toLocaleString()}</span> members
                {' · '}
                <span className="font-semibold text-foreground">{allApps.length.toLocaleString()}</span> apps
                {' · '}
                <span className="font-semibold text-foreground">{formatBytes(stats.storage)}</span> of data owned on web10.
              </>
            ) : null}
          </p>
        </div>

        <div className="reveal mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <AppCard
                  key={`skeleton-${i}`}
                  skeleton
                  name=""
                  description=""
                  href=""
                  data-testid={`app-card-skeleton-${i}`}
                />
              ))
            : allApps.map((app, i) => (
                <AppCard
                  key={app.href}
                  iconSrc={app.iconSrc}
                  iconLetter={app.name.charAt(0)}
                  name={app.name}
                  description={app.description}
                  href={app.href}
                  visits={app.visits}
                  flagship={app.flagship}
                  data-testid={`app-card-${i}`}
                />
              ))}
        </div>
      </div>
    </div>
  )
}

export default AppStore