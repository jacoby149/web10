import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/shared/ErrorBoundary'
// D103: PostHog only, enabled through runtime node configuration.
import { installTelemetry, trackPageview } from './lib/analytics'
// Self-hosted variable fonts (design.md §5) — never a font CDN.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import './index.css'

// Runtime config is authoritative. PostHog receives only a route template,
// never the authenticator's credential-bearing query string.
installTelemetry().then(() => trackPageview())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
