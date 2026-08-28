// GA4 + Hotjar analytics for the authenticator (D56: full-platform
// telemetry). GA4: pageviews of the (query-parameter-driven) screen.
// Hotjar: session recordings + heatmaps, content-blind by construction
// (maskAllText + blockAllImages — the operator sees cursor + layout +
// timing, never words or pictures). See
// knowledge-base/web10-v3/telemetry.md.
//
// The IDs are resolved at RUNTIME from the node (GET /telemetry) so an
// operator can change them live in the Node Config UI without a rebuild.
// The node is authoritative when reachable; the build-time env is the
// fallback for pure frontend dev where the node is unreachable.

import { config } from '../config'

const API_ORIGIN = config.REACT_APP_API_ORIGIN

interface GtagQueue {
  (command: 'config', measurementId: string, config?: Record<string, unknown>): void
  (command: 'event', eventName: string, params?: Record<string, unknown>): void
  (command: 'js', timestamp: number): void
}

declare global {
  interface Window {
    dataLayer?: unknown[][]
    gtag?: GtagQueue
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
  if (typeof document === 'undefined') return
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
export function installTelemetry(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve()
  return resolveTelemetryIds().then(({ ga4, hotjar }) => {
    if (ga4) loadGa4(ga4)
    if (hotjar) loadHotjar(hotjar)
  })
}

/**
 * Track a pageview. The authenticator is query-parameter-driven (no
 * router), so the screen IS the URL — path + search.
 */
export function trackPageview(path?: string) {
  if (!window.gtag) return
  const p = path ?? (typeof window !== 'undefined' ? window.location.pathname + window.location.search : '')
  window.gtag('event', 'page_view', {
    page_path: p,
  })
}

/**
 * Identify a known user in Hotjar (e.g., after login).
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