// D103: PostHog only; the personal token is used only at the node identity seam.
import { createAnalytics } from '@web10/telemetry/runtime';
import { API_ORIGIN, AUTH_ORIGIN } from './origins';

const analytics = createAnalytics('web10-social', API_ORIGIN, [AUTH_ORIGIN]);
export const installTelemetry = () => analytics.install();
export const identifyAnalytics = (readToken: () => string | null) => analytics.identify(readToken);
export const resetAnalytics = () => analytics.reset();
export const prepareAnalyticsHandoff = () => analytics.prepareAuthHandoff();
export const trackProductSession = () => analytics.tracker.productUse();
export const trackPageview = (path: string) => analytics.tracker.pageview(path);
export const trackEvent = (event: string, params: Record<string, unknown> = {}) => analytics.tracker.capture(event, params);

function fireNode(body: object) {
  try {
    if (navigator.sendBeacon?.(`${API_ORIGIN}/analytics/event`, JSON.stringify(body))) return;
    void fetch(`${API_ORIGIN}/analytics/event`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  } catch { console.warn('[telemetry] operational beacon unavailable'); }
}
export function trackNodePageview(path: string) {
  fireNode({ type: 'pageview', app: 'web10-social', path, referrer: document.referrer || null, user_agent: navigator.userAgent });
}
export function reportNodeError(message: string, opts?: { source?: string; line?: number; column?: number }) {
  fireNode({ type: 'error', app: 'web10-social', message: String(message).slice(0, 2000), source: opts?.source?.slice(0, 500), line: opts?.line, column: opts?.column, route: location.pathname, user_agent: navigator.userAgent });
}
