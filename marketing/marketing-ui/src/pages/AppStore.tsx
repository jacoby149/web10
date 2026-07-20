import { useEffect, useState } from 'react'
import { Users, LayoutDashboard, BookOpen, Terminal, ArrowUpRight, Boxes, Globe } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardFooter, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'

// The node API that holds the live app registry + member count. Overridable
// via ?api= or VITE_API_URL; *.localhost hosts default to the local node.
function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

interface PwaIcon {
  src: string
  sizes?: string
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

// The hero — the killer app stays promoted up top, never buried (D16).
const HERO = {
  name: 'web10 social',
  description:
    'The flagship lens: an instagram-shaped feed, DMs, media, and streaming — your audience and your data, on a node you own. CRM and Mail live inside it.',
  href: 'https://social.web10.app',
  source: 'https://github.com/jacoby149/web10/tree/main/marketing/web10-social',
}

// First-party surfaces that ship with every node — shown as the seed of the
// catalog so the store is never empty even before third parties register.
const FIRST_PARTY = [
  {
    icon: LayoutDashboard,
    name: 'The node console',
    description: 'Login, consent, contracts, and the Studio — the operator surface every node runs.',
    href: 'https://auth.web10.app',
  },
  {
    icon: Boxes,
    name: 'The importer',
    description: 'Pulls your Instagram, Facebook, and YouTube history into your node in one pass.',
    href: '/import',
  },
]

// Hosts already represented by the hero / first-party cards — don't list twice.
const KNOWN_HOSTS = ['social.web10.app', 'auth.web10.app', 'api.web10.app', 'www.web10.app', 'web10.app']

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}

// "crm.web10.app" → "crm.web10.app" (kept as-is; the hostname IS the identity).
function appName(url: string): string {
  const h = hostOf(url)
  return h.replace(/^www\./, '')
}

// Pick the best icon from a PWA manifest — prefer ~192px or 512px.
function pickIcon(manifest: any): string | undefined {
  const icons: PwaIcon[] = manifest?.icons
  if (!Array.isArray(icons) || icons.length === 0) return undefined

  // Prefer a 192px or 512px icon (standard PWA sizes)
  const target = icons.find((ic: PwaIcon) => ic.sizes?.includes('192') || ic.sizes?.includes('512'))
  return target?.src ?? icons[0]?.src
}

// Resolve a potentially relative icon URL against the app's base URL.
function resolveIcon(appUrl: string, iconSrc: string): string {
  if (!iconSrc) return ''
  if (iconSrc.startsWith('http')) return iconSrc
  try {
    const base = new URL(appUrl)
    // Ensure base path ends with / for correct resolution
    if (!base.pathname.endsWith('/')) {
      base.pathname = base.pathname.replace(/\/[^/]*$/, '/') ?? '/'
    }
    return new URL(iconSrc, base).href
  } catch {
    return iconSrc
  }
}

function AppStore() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

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

        // Fetch PWA manifests for each app in parallel
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
              // No manifest — fine, we'll show the hostname
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
      .catch(() => { /* store still renders the hero + first-party catalog */ })
      .finally(() => alive && setLoading(false))

    return () => {
      alive = false
    }
  }, [])

  const registered = (stats?.apps ?? [])
    .filter((a) => a.url && !KNOWN_HOSTS.includes(hostOf(a.url)))
    .filter((a) => hostOf(a.url) !== '' && !hostOf(a.url).endsWith('.localhost'))

  const appCount = (stats?.apps?.length ?? 0)

  return (
    <div className="min-h-screen bg-background px-4 py-16 text-foreground sm:px-6 sm:py-24">
      <div className="mx-auto max-w-5xl">
        <div className="reveal text-center">
          <Badge variant="brand">The web10 App Store</Badge>
          <h1 className="mt-4 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Apps that run on data you own.
          </h1>
          {/* real numbers from the node, never faked (D16) */}
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            {loading ? (
              <span className="inline-block h-5 w-64 animate-pulse rounded bg-elevated align-middle" />
            ) : stats ? (
              <>
                <span className="font-semibold text-foreground">{stats.users.toLocaleString()}</span> members
                {' · '}
                <span className="font-semibold text-foreground">{appCount.toLocaleString()}</span> apps
                {' · '}
                <span className="font-semibold text-foreground">{formatBytes(stats.storage)}</span> of data owned on
                web10.
              </>
            ) : (
              <>Every app here talks to your collection over a scoped, revocable token.</>
            )}
          </p>
        </div>

        {/* HERO — web10 social, promoted */}
        <a
          href={HERO.href}
          target="_blank"
          rel="noopener noreferrer"
          className="reveal mt-12 block"
        >
          <Card className="overflow-hidden border-brand-muted bg-gradient-to-br from-brand-muted/30 to-surface transition-colors hover:border-brand-400">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Users className="h-6 w-6 text-brand-300" strokeWidth={1.5} />
                <Badge variant="brand">Flagship</Badge>
              </div>
              <CardTitle className="mt-2 text-2xl">{HERO.name}</CardTitle>
              <CardDescription className="max-w-2xl text-base">{HERO.description}</CardDescription>
            </CardHeader>
            <CardFooter>
              <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-300">
                Open web10 social <ArrowUpRight className="h-4 w-4" strokeWidth={2} />
              </span>
            </CardFooter>
          </Card>
        </a>

        {/* CATALOG */}
        <h2 className="reveal mt-14 font-display text-lg font-semibold text-foreground">On web10</h2>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          {FIRST_PARTY.map((app, i) => (
            <Card key={app.name} className={`reveal bg-surface ${i % 2 ? '[animation-delay:80ms]' : ''}`}>
              <CardHeader>
                <app.icon className="mb-2 h-6 w-6 text-brand-400" strokeWidth={1.5} />
                <CardTitle>{app.name}</CardTitle>
                <CardDescription>{app.description}</CardDescription>
              </CardHeader>
              <CardFooter>
                <a
                  href={app.href}
                  className="text-sm text-brand-300 underline-offset-4 hover:text-brand-400 hover:underline"
                  {...(app.href.startsWith('http') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                >
                  {app.href.startsWith('http') ? 'Open' : 'Try it'}
                </a>
              </CardFooter>
            </Card>
          ))}

          {/* real registered apps from the node — with PWA icons */}
          {registered.map((app) => (
            <Card key={app.url} className="reveal bg-surface">
              <CardHeader>
                <div className="mb-2 flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {app.pwaIcon ? (
                      <img
                        src={app.pwaIcon}
                        alt={app.pwaName || appName(app.url)}
                        className="h-8 w-8 object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none'
                          const parent = e.currentTarget.parentElement
                          if (parent) {
                            const fallback = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
                            fallback.className = 'h-5 w-5 text-muted-foreground'
                            fallback.setAttribute('strokeWidth', '1.5')
                            fallback.setAttribute('fill', 'none')
                            fallback.setAttribute('stroke', 'currentColor')
                            fallback.setAttribute('viewBox', '0 0 24 24')
                            fallback.innerHTML =
                              '<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'
                            parent.appendChild(fallback)
                          }
                        }}
                      />
                    ) : (
                      <Globe className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="truncate">{app.pwaName || appName(app.url)}</CardTitle>
                    <CardDescription>Registered on web10.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                {app.visits.toLocaleString()} {app.visits === 1 ? 'visit' : 'visits'}
              </CardContent>
              <CardFooter>
                <a
                  href={app.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-brand-300 underline-offset-4 hover:text-brand-400 hover:underline"
                >
                  Open <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2} />
                </a>
              </CardFooter>
            </Card>
          ))}

          {/* Build-on-web10 CTA */}
          <Card className="reveal flex flex-col justify-between border-brand-muted bg-brand-muted/20">
            <CardHeader>
              <BookOpen className="mb-2 h-6 w-6 text-brand-300" strokeWidth={1.5} />
              <CardTitle>Build on web10</CardTitle>
              <CardDescription>
                One collection per user, a tiny CRUD API, a scoped token. Register your app and it shows up here.
              </CardDescription>
            </CardHeader>
            <CardFooter className="flex gap-3">
              <Button asChild variant="brand" size="sm">
                <a href="/docs/sdk">SDK Guide</a>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="/docs/cli-quickstart" className="flex items-center gap-1.5">
                  <Terminal className="h-3.5 w-3.5" strokeWidth={1.5} />
                  CLI Quickstart
                </a>
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  )
}

export default AppStore
