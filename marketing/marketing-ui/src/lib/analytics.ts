// D103: PostHog only. Existing operational beacons are not acquisition authority.
import { createAnalytics } from '@web10/telemetry/runtime'
import { API_ORIGIN, AUTH_ORIGIN, SOCIAL_ORIGIN } from './origins'

const analytics = createAnalytics('marketing-ui', API_ORIGIN, [AUTH_ORIGIN, SOCIAL_ORIGIN])
export const installTelemetry = () => analytics.install()

function fire(body: object) {
  try {
    if (navigator.sendBeacon?.(`${API_ORIGIN}/analytics/event`, JSON.stringify(body))) return
    void fetch(`${API_ORIGIN}/analytics/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
  } catch { console.warn('[telemetry] operational beacon unavailable') }
}

export function trackPageview(path: string) {
  analytics.tracker.pageview(path)
  fire({ type: 'pageview', app: 'marketing-ui', path, referrer: document.referrer || null, user_agent: navigator.userAgent })
}

export function trackFunnel(event: string, metadata: Record<string, unknown> = {}) {
  analytics.tracker.capture(event, metadata)
  fire({ type: 'funnel', app: 'marketing-ui', event, metadata })
}

export function reportError(message: string, opts?: { source?: string; line?: number; column?: number }) {
  fire({ type: 'error', app: 'marketing-ui', message: String(message).slice(0, 2000), source: opts?.source?.slice(0, 500), line: opts?.line, column: opts?.column, route: location.pathname, user_agent: navigator.userAgent })
}

export function installErrorBeacon() {
  const original = window.onerror
  window.onerror = function (message, source, line, column, error) {
    reportError(error?.message || String(message), { source, line, column })
    return original?.call(this, message, source, line, column, error) ?? false
  }
  window.addEventListener('unhandledrejection', (event) => reportError(event.reason?.message || String(event.reason)))
}
