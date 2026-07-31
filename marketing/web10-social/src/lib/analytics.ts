// GA4 analytics for web10-social.
// Aggregate-only, anonymous, content-free events. No recording.
// Platform surfaces stay recording-free (plan.txt ux telemetry spec).
// No-op when VITE_GA4_MEASUREMENT_ID is not set (dev-safe).

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
    // Disable GA4 advertising features — we only need aggregate pageviews + events
    advertising_id: 'OFF',
    anonymize_ip: true,
  });

  // Load gtag script dynamically (non-blocking)
  const s = document.createElement('script');
  s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  s.async = true;
  document.head.appendChild(s);

  return measurementId;
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