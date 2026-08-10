// Centralized analytics for marketing-ui.
// Full funnel analytics + JS error beacon — marketing-ui is pre-signup,
// so full tracking is fair game (plan.txt ux telemetry spec).

const MARKETING_API =
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('marketing_api')) ||
  (import.meta.env?.VITE_MARKETING_API || 'http://marketing-api.localhost')

const APP = 'marketing-ui'

function fire(url: string, body: object) {
  // Fire-and-forget: never block the user.
  navigator.sendBeacon?.(url, JSON.stringify(body)) ??
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {})
}

/** Track a pageview. Called automatically by the router tracker. */
export function trackPageview(path: string) {
  fire(`${MARKETING_API}/analytics/pageview`, {
    path,
    referrer: document.referrer || null,
    user_agent: navigator.userAgent,
  })
}

/** Track a funnel event (landing, docs_view, export_started, etc.). */
export function trackFunnel(
  event:
    | 'landing'
    | 'docs_view'
    | 'app_store_view'
    | 'exporter_view'
    | 'trending_view'
    | 'freedom_view'
    | 'export_started'
    | 'export_complete'
    | 'trending_load_more'
    | 'trending_comment_attempt'
    | 'trending_like_attempt'
    | 'trending_repost_attempt'
    | 'trending_preset'
    | 'trending_search'
    | 'trending_view_toggle'
    | 'join_view'
    | 'join_click'
    | 'sign_in_click'
    | 'sign_up_click'
    | 'github_click'
    | 'enter_click',
  metadata: Record<string, unknown> = {},
) {
  fire(`${MARKETING_API}/analytics/funnel`, { event, metadata })
}

/** Report a client-side JS error (content-free, no PII). */
export function reportError(message: string, opts?: { source?: string; line?: number; column?: number }) {
  fire(`${MARKETING_API}/analytics/error`, {
    message: typeof message === 'string' ? message.slice(0, 2000) : String(message).slice(0, 2000),
    source: opts?.source?.slice(0, 500),
    line: opts?.line,
    column: opts?.column,
    app: APP,
    route: typeof window !== 'undefined' ? window.location.pathname : '',
    user_agent: navigator.userAgent?.slice(0, 500),
  })
}

/** Install global JS error handlers (window.onerror + unhandledrejection). */
export function installErrorBeacon() {
  if (typeof window === 'undefined') return

  const originalError = window.onerror
  window.onerror = function (message, source, line, column, error) {
    reportError(
      error?.message || String(message),
      { source, line, column },
    )
    return originalError?.(message, source, line, column, error) ?? false
  }

  window.addEventListener('unhandledrejection', (e) => {
    reportError(e.reason?.message || String(e.reason))
  })
}

// ---------------------------------------------------------------------------
// Hotjar — session replay + heatmaps (marketing-ui ONLY).
// Platform surfaces (ui/ + web10-social) remain recording-free.
// Site ID is required: VITE_HOTJAR_SITE_ID. Version defaults to 1.
// ---------------------------------------------------------------------------

/**
 * Load the Hotjar snippet dynamically and initialise it.
 * No-op when VITE_HOTJAR_SITE_ID is not set (dev without env vars).
 */
export function installHotjar() {
  if (typeof window === 'undefined') return
  const siteIdRaw = import.meta.env?.VITE_HOTJAR_SITE_ID
  const siteId = siteIdRaw ? parseInt(siteIdRaw, 10) : 0
  if (!siteId || isNaN(siteId)) return

  const versionRaw = import.meta.env?.VITE_HOTJAR_VERSION
  const version = versionRaw ? parseInt(versionRaw, 10) : 1

  // Standard Hotjar queue pattern
  ;(window as any).hjs = (window as any).hjs || []
  ;(window as any).hj = function (...args: unknown[]) {
    ;(window as any).hjs.push(args)
  }

  const s = document.createElement('script')
  s.src = `https://script.hotjar.com/${siteId}.js`
  s.async = true
  document.head.appendChild(s)

  ;(window as any).hj('initialize', siteId, version)
}

/**
 * Identify a known user in Hotjar (e.g., after login on a marketing flow).
 * Safe no-op when Hotjar is not installed.
 */
export function hotjarIdentify(userId: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !(window as any).hj) return
  ;(window as any).hj('identify', userId, props)
}
