// GA4 + Hotjar analytics for web10-social (D56: full-platform telemetry).
// GA4: pageviews + content-free structural events (max tracking — no
// privacy flags; the one kept flag is advertising_id OFF, we don't feed
// the ad machine). Hotjar: session recordings + heatmaps, content-blind
// by construction (maskAllText + blockAllImages — the operator sees
// cursor + layout + timing, never words or pictures).
// See knowledge-base/web10-v3/telemetry.md.
// No-op when the env IDs are not set (dev-safe).

// ---------------------------------------------------------------------------
// GA4 gtag types (minimal — we only need what we use)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

/**
 * Load the GA4 snippet dynamically and initialise it.
 * No-op when VITE_GA4_MEASUREMENT_ID is not set (dev without env vars)
 * or when gtag is already present (already installed, SSR, etc.).
 */
export function installGa4(): string | null {
  if (typeof document === 'undefined') return null;
  if ((window as any).gtag) return null;

  const measurementId = import.meta.env?.VITE_GA4_MEASUREMENT_ID;
  if (!measurementId || typeof measurementId !== 'string' || !measurementId.trim()) return null;

  // Standard GA4 dataLayer boot
  window.dataLayer = window.dataLayer || [];
  window.gtag = function (...args: unknown[]) {
    window.dataLayer!.push(args as unknown[]);
  } as GtagQueue;
  window.gtag('js', new Date().getTime());
  window.gtag('config', measurementId, {
    // D56: max tracking, one exception — we do not feed Google's ad
    // network. The only sponsors a fan sees are the creator's (D50/D55).
    advertising_id: 'OFF',
  });

  // Load gtag script dynamically (non-blocking)
  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  s.async = true;
  document.head.appendChild(s);

  return measurementId;
}

/**
 * Load the Hotjar snippet and initialise it with full content masking
 * (D56): all text blurred, all images blocked. No-op when
 * VITE_HOTJAR_SITE_ID is not set, or when Hotjar is already installed.
 */
export function installHotjar(): number | null {
  if (typeof document === 'undefined') return null;
  if ((window as any).hj) return null;

  const siteIdRaw = import.meta.env?.VITE_HOTJAR_SITE_ID;
  const siteId = siteIdRaw ? parseInt(siteIdRaw, 10) : 0;
  if (!siteId || isNaN(siteId)) return null;

  // Canonical Hotjar queue pattern (the real script drains hj.q on load).
  (window as any).hj = (window as any).hj || function (...args: unknown[]) {
    ((window as any).hj.q = (window as any).hj.q || []).push(args);
  };

  const s = document.createElement('script');
  s.src = `https://static.hotjar.com/c/hotjar-${siteId}.js?sv=6`;
  s.async = true;
  document.head.appendChild(s);

  // D56: the recording is content-blind — blur all text, block all images.
  (window as any).hj('init', {
    hjid: siteId,
    maskAllText: true,
    blockAllImages: true,
  });

  return siteId;
}

// ---------------------------------------------------------------------------
// Public tracking API (content-free events only)
// ---------------------------------------------------------------------------

/** Track a pageview. Called automatically by the router tracker. */
export function trackPageview(path: string) {
  if (!window.gtag) return;
  window.gtag('event', 'page_view', {
    page_path: path,
  });
}

/**
 * Track a content-free analytics event.
 *
 * Events are aggregate-only: no post text, no media URLs, no PII.
 * Allowed events: login, logout, post_created, follow, unfollow.
 * All metadata is structural (visibility, screen, etc.), never content.
 */
export function trackEvent(
  event: 'login' | 'logout' | 'post_created' | 'follow' | 'unfollow',
  params?: { visibility?: 'public' | 'private'; screen?: string },
) {
  if (!window.gtag) return;
  window.gtag('event', event, params || {});
}

/**
 * Identify a known user in Hotjar (e.g., after login).
 * Safe no-op when Hotjar is not installed.
 */
export function hotjarIdentify(userId: string, props?: Record<string, unknown>) {
  if (typeof window === 'undefined' || !(window as any).hj) return;
  if (props) {
    (window as any).hj('identify', userId, props);
  } else {
    (window as any).hj('identify', userId);
  }
}
