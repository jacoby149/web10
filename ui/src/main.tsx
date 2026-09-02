import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/shared/ErrorBoundary'
// D56: full-platform telemetry — GA4 + masked Hotjar (content-blind).
import { installTelemetry, trackPageview } from './lib/analytics'
// Self-hosted variable fonts (design.md §5) — never a font CDN.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import './index.css'

// IDs resolved at runtime from the node (GET /telemetry), env fallback in
// dev. The authenticator is query-parameter-driven (no router) — the screen
// IS the URL, so one pageview per load, fired after GA4 is ready.
installTelemetry().then(() => trackPageview())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)