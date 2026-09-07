import { Search, ChevronDown } from 'lucide-react'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { trackFunnel } from '@/lib/analytics'
import { AUTH_ORIGIN, SOCIAL_ORIGIN } from '@/lib/origins'
import { AppCard } from '@/components/AppCard'

const ICON_PATH = '/brand/icon-192.png'
const PAGE_SIZE = 20

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
  users_30d: number
  users_1d?: number
  users_90d?: number
  users_1y?: number
  name?: string
  description?: string
  icon_url?: string
  screenshots?: string[]
  pwaIcon?: string
  pwaName?: string
}

interface NodeStats {
  users: number
  app_count: number
  active_users: { users_1d: number; users_30d: number; users_90d: number; users_1y: number }
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

// A known host at its ROOT is infrastructure (mapped to the curated plug
// slots). A known host WITH a path is an app — a path is an app (D47): the
// demo apps live under the marketing host, one per path, and belong in the
// grid.
function isHostRoot(url: string): boolean {
  try {
    const p = new URL(url).pathname
    return p === '' || p === '/'
  } catch {
    return true
  }
}

function appName(url: string): string {
  const h = hostOf(url)
  return h.replace(/^www\./, '')
}

function pickIcon(manifest: any): string | undefined {
  const icons: { src: string; sizes?: string; type?: string }[] = manifest?.icons
  if (!Array.isArray(icons) || icons.length === 0) return undefined
  // SVG first — it scales crisply to any card size (browse 64px → plug 44px →
  // detail 96px) without a raster step.
  const svg = icons.find((ic) => ic.type === 'image/svg+xml')
  if (svg) return svg.src
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
const FLAGSHIP_HOST = 'social.web10.app'
const FLAGSHIP_NAME = 'web10 social'

interface StoreApp {
  name: string
  description: string
  href: string
  iconSrc?: string
  users_30d: number
  visits: number
  flagship?: boolean
  appId?: string
}

interface PlugSlot {
  name: string
  description: string
  href: string
  iconSrc?: string
  // Optional: the flagship shows its real user count; the core management
  // app (node console) is an operator surface, not a consumer app, so it
  // carries no "users" metric (a permanent 0 would read as a placeholder).
  users_30d?: number
  badge: string
  appId?: string
}

async function enrichWithManifest(app: RegisteredApp, api: string): Promise<RegisteredApp> {
  if (!app.url) return app
  try {
    const resp = await fetch(`${api}/pwa_listing?url=${encodeURIComponent(app.url)}`)
    if (resp.ok) {
      const manifest = await resp.json()
      const icon = pickIcon(manifest)
      return {
        ...app,
        pwaIcon: icon ? resolveIcon(app.url, icon) : undefined,
        // short_name first — it's the PWA field for constrained display
        // (store cards, taskbars); name is the long form.
        pwaName: manifest?.short_name || manifest?.name,
      }
    }
  } catch {
    // No manifest
  }
  return app
}

function AppStore() {
  const [stats, setStats] = useState<NodeStats | null>(null)
  const [apps, setApps] = useState<StoreApp[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    trackFunnel('app_store_view')
  }, [])

  // Macro node stats (active users, app count, storage) — for the header.
  useEffect(() => {
    let alive = true
    fetch(`${nodeApi()}/v3/stats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: NodeStats) => {
        if (alive) setStats(data)
      })
      .catch(() => { /* header degrades gracefully */ })
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // The paginated store list — server-sorted by users_30d desc (D49).
  const loadPage = useCallback(async (offset: number, append: boolean) => {
    const resp = await fetch(`${nodeApi()}/v3/apps/list`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: PAGE_SIZE, offset }),
    })
    if (!resp.ok) throw new Error(String(resp.status))
    const data = await resp.json()
    const page: RegisteredApp[] = Array.isArray(data.apps) ? data.apps : []
    const api = nodeApi()
    const enriched = await Promise.all(page.map((app) => enrichWithManifest(app, api)))
    const mapped: StoreApp[] = enriched
      .filter((a) => a.url && (!KNOWN_HOSTS.includes(hostOf(a.url)) || !isHostRoot(a.url)))
      .filter((a) => hostOf(a.url) !== '' && !hostOf(a.url).endsWith('.localhost'))
      .map((a) => ({
        name: a.pwaName || a.name || appName(a.url),
        description: a.description || 'Registered on web10.',
        href: a.url,
        iconSrc: a.icon_url || a.pwaIcon,
        users_30d: a.users_30d ?? 0,
        visits: a.visits ?? 0,
        // D52: the app's URL is the detail-page key (the store's identity).
        appId: a.url,
      }))
    setApps((prev) => (append ? [...prev, ...mapped] : mapped))
    setTotal(typeof data.total === 'number' ? data.total : mapped.length)
  }, [])

  useEffect(() => {
    loadPage(0, false).catch(() => { /* store still renders first-party catalog */ }).finally(() => setLoading(false))
  }, [loadPage])

  const loadMore = () => {
    if (loadingMore || apps.length >= total) return
    setLoadingMore(true)
    loadPage(apps.length, true).catch(() => {}).finally(() => setLoadingMore(false))
  }

  // First-party plug slots (curated). Their users_30d comes from the list
  // when the app is registered; the importer is a marketing page (no metric).
  const firstParty: StoreApp[] = useMemo(() => {
    // The flagship's real registration may live at a different host than the
    // canonical origin — match by display name first, then fall back to host.
    const flagship = apps.find((a) => a.name === FLAGSHIP_NAME || hostOf(a.href) === FLAGSHIP_HOST)
    const consoleApp = apps.find((a) => hostOf(a.href) === 'auth.web10.app')
    return [
      {
        name: FLAGSHIP_NAME,
        description: 'Feed, DMs, media, streaming — your audience and your data, on a node you own.',
        href: SOCIAL_ORIGIN,
        iconSrc: ICON_PATH,
        users_30d: flagship?.users_30d ?? 0,
        visits: flagship?.visits ?? 0,
        flagship: true,
        appId: flagship?.appId,
      },
      {
        name: 'The node console',
        description: 'Login, consent, contracts, and the Studio — the operator surface every node runs.',
        href: AUTH_ORIGIN,
        iconSrc: ICON_PATH,
        users_30d: consoleApp?.users_30d ?? 0,
        visits: consoleApp?.visits ?? 0,
        appId: consoleApp?.appId,
      },
      {
        name: 'The importer',
        description: 'Pulls your Instagram, Facebook, and YouTube history into your node in one pass.',
        href: '/import',
        iconSrc: ICON_PATH,
        users_30d: 0,
        visits: 0,
      },
    ]
  }, [apps])

  const allApps = useMemo(() => [...firstParty, ...apps], [firstParty, apps])

  const plugSlots: PlugSlot[] = useMemo(() => {
    const flagship = firstParty.find((a) => a.flagship)
    if (!flagship) return []
    const plugs: PlugSlot[] = [{ ...flagship, badge: 'Flagship' }]
    // CORE — the node console, the operator surface every node runs. The
    // curated pair is the flagship product + the core management app (the
    // first-party catalog, per the KB). Replaces the old "Most Popular" slot,
    // which could surface a duplicate of the flagship when it was also
    // registered. No user metric — it's an operator surface, not a consumer
    // app (a permanent 0 would read as a placeholder).
    const core = firstParty.find((a) => a.href === AUTH_ORIGIN)
    if (core) {
      plugs.push({ name: core.name, description: core.description, href: core.href, iconSrc: core.iconSrc, badge: 'Core', appId: core.appId })
    }
    return plugs
  }, [firstParty])

  // The grid shows first-party + registered apps, minus the plug slots. A
  // registered copy of the flagship product (same product, different URL) is
  // a duplicate — the flagship is curated above, so keep it out of the grid.
  const gridApps = useMemo(
    () =>
      allApps.filter((app) => {
        if (plugSlots.some((p) => p.href === app.href)) return false
        if (app.name === FLAGSHIP_NAME) return false
        return true
      }),
    [allApps, plugSlots],
  )
  const filteredGrid = useMemo(
    () => gridApps.filter((app) => app.name.toLowerCase().includes(searchQuery.toLowerCase())),
    [gridApps, searchQuery],
  )

  const activeUsers30d = stats?.active_users?.users_30d ?? 0

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
            Sorted by active users — no algorithm, no promotion, just who&rsquo;s actually using it.
            {loading ? (
              <span className="inline-block h-5 w-64 animate-pulse rounded bg-elevated align-middle" />
            ) : stats ? (
              <>
                {' '}
                <span className="font-semibold text-foreground">{activeUsers30d.toLocaleString()}</span> web10 users &middot; 30d
                {' · '}
                <span className="font-semibold text-foreground">{stats.app_count.toLocaleString()}</span> apps
                {' · '}
                <span className="font-semibold text-foreground">{formatBytes(stats.storage)}</span> of data owned on web10.
              </>
            ) : null}
          </p>
        </div>

        {/* Plug slots — curated, above the grid */}
        {!loading && plugSlots.length > 0 && (
          <div className="reveal mt-12 flex flex-col gap-4" data-testid="plug-slots">
            {plugSlots.map((plug, i) => (
              <AppCard
                key={plug.href}
                size="plug"
                iconSrc={plug.iconSrc}
                iconLetter={plug.name.charAt(0)}
                name={plug.name}
                description={plug.description}
                href={plug.href}
                visits={plug.users_30d}
                metricLabel="users · 30d"
                badge={plug.badge}
                appId={plug.appId}
                data-testid={`plug-slot-${i}`}
              />
            ))}
          </div>
        )}

        {/* Browse — search + uniform small cards, paginated */}
        <div className="reveal mt-12" data-testid="browse-section">
          {!loading && gridApps.length > 0 && (
            <div className="relative mb-6">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={2} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search apps…"
                className="w-full rounded-full border border-border bg-surface py-2.5 pl-10 pr-4 text-sm text-foreground placeholder-muted-foreground outline-none transition-colors duration-150 focus:border-brand"
                data-testid="browse-search"
              />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {loading
              ? Array.from({ length: 10 }).map((_, i) => (
                  <AppCard
                    key={`skeleton-${i}`}
                    size="browse"
                    skeleton
                    name=""
                    description=""
                    href=""
                    data-testid={`browse-card-skeleton-${i}`}
                  />
                ))
              : filteredGrid.map((app, i) => (
                  <AppCard
                    key={app.href}
                    size="browse"
                    iconSrc={app.iconSrc}
                    iconLetter={app.name.charAt(0)}
                    name={app.name}
                    description=""
                    href={app.href}
                    visits={app.users_30d}
                    metricLabel="users · 30d"
                    appId={app.appId}
                    data-testid={`browse-card-${i}`}
                  />
                ))}
          </div>

          {!loading && searchQuery && filteredGrid.length === 0 && (
            <p className="py-12 text-center text-muted-foreground">No apps match &ldquo;{searchQuery}&rdquo;.</p>
          )}

          {/* Load more — the list is server-paginated (D49) */}
          {!loading && !searchQuery && apps.length < total && (
            <div className="mt-10 flex justify-center">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                data-testid="load-more"
                className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-5 py-2.5 text-sm font-medium text-foreground transition-colors duration-150 hover:border-brand disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more apps'}
                <ChevronDown className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default AppStore
