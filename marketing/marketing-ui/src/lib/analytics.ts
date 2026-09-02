// Centralized analytics for marketing-ui (D56: full-platform telemetry).
// In-house funnel analytics + JS error beacon (first-party, to the
// marketing-api) + GA4 + masked Hotjar (session replay + heatmaps,
// content-blind: text blurred, images blocked). See
// knowledge-base/web10-v3/telemetry.md.

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
    | 'everything_view'
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
// GA4 + Hotjar (D56: full-platform telemetry). Max tracking, one exception:
// advertising_id OFF (we don't feed the ad machine). Hotjar is content-blind
// (maskAllText + blockAllImages — cursor + layout + timing, never words or
// pictures). The IDs are resolved at RUNTIME from the node (GET /telemetry)
// so an operator can change them live in the Node Config UI without a
// rebuild; the build-time env is the fallback for pure frontend dev.
// ---------------------------------------------------------------------------

import { API_ORIGIN } from '@/lib/origins'

interface GtagQueue {
  (command: 'config', measurementId: string, config?: Record<string, unknown>): void;
  (command: 'event', eventName: string, params?: Record<string, unknown>): void;
  (command: 'js', timestamp: number): void;
}

declare global {
  interface Window {
    dataLayer?: unknown[][];
    gtag?: GtagQueue;
  }
}

export interface TelemetryIds {
  ga4: string
  hotjar: number
}

function envIds(): TelemetryIds {
  const ga4 =
    typeof import.meta.env?.VITE_GA4_MEASUREMENT_ID === 'string'
      ? import.meta.env.VITE_GA4_MEASUREMENT_ID.trim()
      : ''
  const raw = import.meta.env?.VITE_HOTJAR_SITE_ID
  const hotjar = raw ? parseInt(raw, 10) : 0
  return { ga4, hotjar: isNaN(hotjar) ? 0 : hotjar }
}

/**
 * Resolve the telemetry IDs. The node's GET /telemetry is authoritative when
 * reachable (an admin set the IDs in the Node Config UI — empty = off). When
 * the node is unreachable (pure frontend dev), fall back to the build-time
 * env. Never throws — telemetry must never break the app.
 */
export async function resolveTelemetryIds(): Promise<TelemetryIds> {
  try {
    const resp = await fetch(`${API_ORIGIN}/telemetry`)
    if (!resp.ok) throw new Error(String(resp.status))
    const data = await resp.json()
    return {
      ga4: String(data.ga4_measurement_id || '').trim(),
      hotjar: parseInt(String(data.hotjar_site_id || ''), 10) || 0,
    }
  } catch {
    return envIds()
  }
}

/**
 * Load the GA4 snippet and initialise it with the given measurement ID.
 * Idempotent — a second call is a no-op.
 */
export function loadGa4(measurementId: string): void {
  if (typeof document === 'undefined') return
  if (!measurementId || (window as any).gtag) return

  window.dataLayer = window.dataLayer || []
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args as unknown[])
  } as GtagQueue
  window.gtag('js', new Date().getTime())
  window.gtag('config', measurementId, {
    // D56: max tracking, one exception — we do not feed Google's ad
    // network. The only sponsors a fan sees are the creator's (D50/D55).
    advertising_id: 'OFF',
  })

  const s = document.createElement('script')
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  s.async = true
  document.head.appendChild(s)
}

/**
 * Load the Hotjar snippet and initialise it with full content masking
 * (D56): all text blurred, all images blocked. Idempotent — a second call
 * is a no-op.
 */
export function loadHotjar(siteId: number): void {
  if (typeof window === 'undefined') return
  if (!siteId || (window as any).hj) return

  // Canonical Hotjar queue pattern (the real script drains hj.q on load).
  ;(window as any).hj = (window as any).hj || function (...args: unknown[]) {
    ;((window as any).hj.q = (window as any).hj.q || []).push(args)
  }

  const s = document.createElement('script')
  s.src = `https://static.hotjar.com/c/hotjar-${siteId}.js?sv=6`
  s.async = true
  document.head.appendChild(s)

  // D56: the recording is content-blind — blur all text, block all images.
  ;(window as any).hj('init', {
    hjid: siteId,
    maskAllText: true,
    blockAllImages: true,
  })
}

/**
 * Kick off telemetry: resolve the IDs (node config, env fallback) and load
 * whichever instruments are configured. Fire-and-forget — never blocks
 * render, never throws.
 */
export function installTelemetry(): void {
  if (typeof document === 'undefined') return
  resolveTelemetryIds().then(({ ga4, hotjar }) => {
    if (ga4) loadGa4(ga4)
    if (hotjar) loadHotjar(hotjar)
  })
}

/**
 * Identify a known user in Hotjar (e.g., after login on a marketing flow).
 * Safe no-op when Hotjar is not installed.
 */
export function hotjarIdentify(userId: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !(window as any).hj) return
  if (props) {
    ;(window as any).hj('identify', userId, props)
  } else {
    ;(window as any).hj('identify', userId)
  }
}
