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
