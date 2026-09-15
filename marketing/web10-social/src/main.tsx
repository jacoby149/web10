import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
// Self-hosted fonts (design.md §5) — never Google Fonts CDN.
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';
import { installTelemetry, trackPageview } from './lib/analytics';

// D56: full-platform telemetry — GA4 + masked Hotjar (content-blind). IDs
// resolved at runtime from the node (GET /telemetry), env fallback in dev.
installTelemetry();

// D72: the PWA service worker — the keystone that makes the app installable
// (the browser only fires beforeinstallprompt for a functioning SW). Prod
// only: a dev-server SW would cache the app and fight HMR. The SW is the
// app shell only — never user content (pwa.md).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/serviceWorker.js')
      .then((reg) => console.log('[pwa] service worker registered:', reg.scope))
      .catch((err) => console.error('[pwa] service worker registration failed:', err));
  });
}

function AnalyticsTracker() {
  const location = useLocation();
  useEffect(() => {
    trackPageview(location.pathname);
  }, [location.pathname]);
  return null;
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <StrictMode>
    <BrowserRouter>
      <AnalyticsTracker />
      <App />
    </BrowserRouter>
  </StrictMode>,
);