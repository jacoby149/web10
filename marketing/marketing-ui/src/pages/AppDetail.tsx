import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, ExternalLink, PackageX, Star, LogIn, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AUTH_ORIGIN } from '@/lib/origins'

function nodeApi(): string {
  if (typeof window !== 'undefined') {
    const q = new URLSearchParams(window.location.search).get('api')
    if (q) return q
    const h = window.location.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h.endsWith('.localhost')) return 'http://api.localhost'
  }
  return (import.meta as any).env?.VITE_API_URL || 'https://api.web10.app'
}

// ---------------------------------------------------------------------------
// Token (the `token` cookie the SDK sets on this origin — path=/, so the
// demos' sign-in is visible here). Read + expiry-checked locally; the API
// re-verifies the signature on the rating call (I2).
// ---------------------------------------------------------------------------

function readTokenCookie(): string | null {
  const m = document.cookie.split('; ').find((c) => c.startsWith('token='))
  if (!m) return null
  const raw = m.slice('token='.length)
  try {
    const parsed = JSON.parse(decodeURIComponent(raw))
    return typeof parsed === 'string' ? parsed : null
  } catch {
    return decodeURIComponent(raw)
  }
}

function tokenUser(token: string | null): { username: string } | null {
  if (!token) return null
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const payload = JSON.parse(atob(padded))
    if (payload.expires && Date.now() >= Date.parse(payload.expires)) return null
    return payload.username ? { username: String(payload.username) } : null
  } catch {
    return null
  }
}

// The SDK's IIFE (served at /docs/wapi.js, the same build the demos load) —
// loaded on demand so only this page pays for it.
function loadSdk(): Promise<any | null> {
  return new Promise((resolve) => {
    const w = window as any
    if (w.web10) return resolve(w.web10)
    const s = document.createElement('script')
    s.src = '/docs/wapi.js'
    s.onload = () => resolve((window as any).web10 ?? null)
    s.onerror = () => resolve(null)
    document.head.appendChild(s)
  })
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface AppRating {
  author: string
  rating: number
  comment: string
  provider: string
  created_at: string
}

interface AppDetailData {
  url: string
  name: string
  description: string
  icon_url?: string
  screenshots: string[]
  review_state: string
  registered_at: string
  metrics: {
    visits: number
    users_1d: number
    users_30d: number
    users_90d: number
    users_1y: number
  }
  rating: { average: number | null; count: number }
  ratings: AppRating[]
  node: {
    users: number
    app_count: number
    active_users: { users_1d: number; users_30d: number; users_90d: number; users_1y: number }
    storage: number
  }
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

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1) return '0 MB'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const val = bytes / Math.pow(1024, i)
  return `${val >= 100 || i <= 1 ? Math.round(val) : val.toFixed(1)} ${units[i]}`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

const MAX_COMMENT_LEN = 1000

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function AppDetail() {
  const { id } = useParams<{ id: string }>()
  const appUrl = id ? decodeURIComponent(id) : ''

  const [app, setApp] = useState<AppDetailData | null>(null)
  const [manifest, setManifest] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Rating form
  const [token, setToken] = useState<string | null>(null)
  const [user, setUser] = useState<{ username: string } | null>(null)
  const [stars, setStars] = useState(0)
  const [hoverStars, setHoverStars] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [signInError, setSignInError] = useState<string | null>(null)
  const authStopRef = useRef<(() => void) | null>(null)

  const loadDetail = (initial: boolean) => {
    if (initial) {
      setApp(null)
      setNotFound(false)
      setLoading(true)
    }
    fetch(`${nodeApi()}/v3/apps/detail?url=${encodeURIComponent(appUrl)}`)
      .then((r) => {
        if (r.status === 404) throw new Error('not found')
        if (!r.ok) throw new Error(String(r.status))
        return r.json()
      })
      .then((data) => setApp(data))
      .catch((err) => {
        if (err.message === 'not found') setNotFound(true)
      })
      .finally(() => {
        if (initial) setLoading(false)
      })
  }

  useEffect(() => {
    loadDetail(true)

    // Manifest — the identity source (name/icon/description preferred over
    // the stored values), same proxy the grid uses.
    let alive = true
    fetch(`${nodeApi()}/pwa_listing?url=${encodeURIComponent(appUrl)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => alive && setManifest(m))
      .catch(() => { /* no manifest — fall back to the stored values */ })

    // Session — the token cookie the SDK sets on this origin.
    const t = readTokenCookie()
    setToken(t)
    setUser(tokenUser(t))

    return () => {
      alive = false
      authStopRef.current?.()
    }
  }, [appUrl])

  const signIn = async () => {
    setSignInError(null)
    setSigningIn(true)
    const sdk = await loadSdk()
    if (!sdk) {
      setSignInError('Sign-in is unavailable right now — try again in a moment.')
      setSigningIn(false)
      return
    }
    authStopRef.current?.()
    authStopRef.current = sdk.authListen(() => {
      const t = readTokenCookie()
      if (t) {
        setToken(t)
        setUser(tokenUser(t))
        setSigningIn(false)
      }
    })
    const popup = sdk.openAuthPortal(AUTH_ORIGIN)
    if (!popup) {
      setSignInError('The sign-in popup was blocked — allow popups and try again.')
      setSigningIn(false)
    }
  }

  const submitRating = async () => {
    if (!token || !stars) return
    setSubmitting(true)
    try {
      const resp = await fetch(`${nodeApi()}/v3/apps/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          body: { target_app_id: app.url, rating: stars, comment: comment.trim() },
        }),
      })
      if (!resp.ok) throw new Error(String(resp.status))
      setStars(0)
      setComment('')
      setSubmitted(true)
      loadDetail(false)
    } catch {
      setSubmitted(false)
    } finally {
      setSubmitting(false)
    }
  }

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
          <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl bg-elevated" />
            ))}
          </div>
          <div className="mt-12 h-40 animate-pulse rounded-2xl bg-elevated" />
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

  // Manifest is the identity source (D47) — prefer it over the stored values.
  const name = manifest?.name || manifest?.short_name || app.name
  const description = manifest?.description || app.description
  const iconSrc = manifest
    ? pickIcon(manifest)
      ? resolveIcon(app.url, pickIcon(manifest)!)
      : app.icon_url
    : app.icon_url

  const metricBlocks = [
    { value: app.metrics.users_30d, label: 'users · 30d' },
    { value: app.metrics.users_1d, label: 'users · 1d' },
    { value: app.metrics.users_90d, label: 'users · 90d' },
    { value: app.metrics.users_1y, label: 'users · 1y' },
    { value: app.metrics.visits, label: 'visits' },
  ]

  const shownStars = hoverStars || stars

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

        {/* Header */}
        <div className="mt-8 flex flex-col items-center gap-6 text-center sm:flex-row sm:text-left sm:gap-8">
          <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-elevated sm:h-28 sm:w-28">
            {iconSrc ? (
              <img
                src={iconSrc}
                alt={name}
                className="h-full w-full object-contain"
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
                iconSrc ? 'hidden' : '',
              )}
            >
              {name.charAt(0).toUpperCase()}
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <h1 className="font-display text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-3xl" data-testid="app-detail-name">
              {name}
            </h1>
            {description ? (
              <p className="text-muted-foreground" data-testid="app-detail-description">
                {description}
              </p>
            ) : null}
            <a
              href={app.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              data-testid="open-app-button"
            >
              Open
              <ExternalLink className="h-4 w-4" strokeWidth={2} />
            </a>
          </div>
        </div>

        {/* Metrics — the full breakdown (D49: the grid shows the headline,
            the detail page shows all of it) */}
        <div className="mt-12 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="metrics-section">
          {metricBlocks.map((m) => (
            <div
              key={m.label}
              className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4"
            >
              <span className="font-display text-xl font-bold tabular-nums text-foreground">
                {m.value.toLocaleString()}
              </span>
              <span className="text-[0.75rem] font-medium uppercase tracking-wide text-muted-foreground">
                {m.label}
              </span>
            </div>
          ))}
        </div>

        {/* Reviews */}
        <div className="mt-12" data-testid="reviews-section">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-medium text-foreground">Reviews</h2>
            {app.rating.count > 0 ? (
              <div className="flex items-center gap-1.5" data-testid="rating-summary">
                <span className="font-display text-lg font-bold tabular-nums text-foreground">
                  {app.rating.average?.toFixed(1)}
                </span>
                <Star className="h-4 w-4 fill-brand text-brand" strokeWidth={0} />
                <span className="text-sm text-muted-foreground">
                  {app.rating.count} {app.rating.count === 1 ? 'rating' : 'ratings'}
                </span>
              </div>
            ) : null}
          </div>

          {/* Rate this app — signed in */}
          {user ? (
            <div className="mt-6 rounded-2xl border border-border bg-surface p-5" data-testid="rate-form">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">
                  {stars > 0 ? 'Your rating' : 'Rate this app'}
                </span>
                <span className="text-xs text-muted-foreground">as {user.username}</span>
              </div>
              <div
                className="mt-3 flex gap-1"
                role="radiogroup"
                aria-label="Rating"
                onMouseLeave={() => setHoverStars(0)}
                data-testid="star-picker"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={stars === n}
                    aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    onClick={() => setStars(n)}
                    onMouseEnter={() => setHoverStars(n)}
                    className="rounded-sm p-1 transition-colors duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    data-testid={`star-${n}`}
                  >
                    <Star
                      className={cn(
                        'h-6 w-6 transition-colors duration-150',
                        n <= shownStars ? 'fill-brand text-brand' : 'text-muted-foreground',
                      )}
                      strokeWidth={1.5}
                    />
                  </button>
                ))}
              </div>
              <label htmlFor="review-comment" className="mt-4 block text-sm font-medium text-foreground">
                Your review <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="review-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, MAX_COMMENT_LEN))}
                rows={3}
                placeholder="What should people know before they open it?"
                className="mt-2 w-full resize-none rounded-xl border border-input bg-elevated px-3 py-2.5 text-sm text-foreground placeholder-muted-foreground transition-colors duration-150 focus:border-brand focus:outline-none"
                data-testid="review-comment"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs tabular-nums text-muted-foreground">
                  {comment.length}/{MAX_COMMENT_LEN}
                </span>
                <button
                  type="button"
                  onClick={submitRating}
                  disabled={!stars || submitting}
                  className="inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                  data-testid="submit-rating"
                >
                  {submitting ? 'Submitting…' : 'Submit rating'}
                </button>
              </div>
              {submitted ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-success" data-testid="rating-success">
                  <Check className="h-4 w-4" strokeWidth={2} />
                  Thanks — your rating is live.
                </p>
              ) : null}
            </div>
          ) : (
            /* Rate this app — signed out */
            <div className="mt-6 flex flex-col items-start gap-3 rounded-2xl border border-border bg-surface p-5 sm:flex-row sm:items-center sm:justify-between" data-testid="sign-in-to-rate">
              <div>
                <p className="text-sm font-medium text-foreground">Sign in to rate this app</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Ratings are real web10 accounts — no anonymous stars.
                </p>
              </div>
              <button
                type="button"
                onClick={signIn}
                disabled={signingIn}
                className="inline-flex shrink-0 items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-medium text-brand-foreground transition-colors duration-150 ease-out hover:bg-brand-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:cursor-not-allowed disabled:opacity-50"
                data-testid="sign-in-button"
              >
                <LogIn className="h-4 w-4" strokeWidth={2} />
                {signingIn ? 'Waiting for sign-in…' : 'Sign in'}
              </button>
              {signInError ? (
                <p className="w-full text-sm text-danger" data-testid="sign-in-error">{signInError}</p>
              ) : null}
            </div>
          )}

          {/* The rating list */}
          {app.ratings.length > 0 ? (
            <ul className="mt-6 flex flex-col gap-4" data-testid="rating-list">
              {app.ratings.map((r) => (
                <li key={r.author} className="rounded-2xl border border-border bg-surface p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-0.5" aria-label={`${r.rating} stars`}>
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={cn(
                            'h-3.5 w-3.5',
                            n <= r.rating ? 'fill-brand text-brand' : 'text-muted-foreground',
                          )}
                          strokeWidth={0}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-foreground">
                      {r.author === user?.username ? 'You' : r.author}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">{formatDate(r.created_at)}</span>
                  </div>
                  {r.comment ? (
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground" data-testid={`review-comment-${r.author}`}>
                      {r.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-6 rounded-2xl border border-border bg-surface p-5 text-sm text-muted-foreground" data-testid="no-reviews">
              No reviews yet — be the first to rate this app.
            </p>
          )}
        </div>

        {/* Screenshots */}
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
                    alt={`${name} screenshot ${i + 1}`}
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {/* Node context */}
        <p className="mt-12 text-center text-xs text-muted-foreground" data-testid="node-context">
          This node — {app.node.users.toLocaleString()} members · {app.node.app_count.toLocaleString()} apps · {formatBytes(app.node.storage)} of data owned
        </p>
      </div>
    </div>
  )
}

export default AppDetail
