import { StrictMode, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ReportBug } from './components/ReportBug'
import { Button } from './components/ui/button'
import { trackPageview, installErrorBeacon, installTelemetry } from './lib/analytics'
import './index.css'

// Install JS error beacon (window.onerror + unhandledrejection)
installErrorBeacon()

// D56: full-platform telemetry — GA4 + masked Hotjar (content-blind). IDs
// resolved at runtime from the node (GET /telemetry), env fallback in dev.
installTelemetry()

function AnalyticsTracker() {
  const location = useLocation()
  useEffect(() => {
    trackPageview(location.pathname)
  }, [location.pathname])
  return null
}

function ErrorFallback({ onReport, onReload }: { onReport: () => void; onReload: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
      <h1 className="font-display text-2xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        The page crashed. You can report what happened or try reloading.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onReload}>Reload</Button>
        <Button variant="brand" onClick={onReport}>Send Report</Button>
      </div>
    </div>
  )
}

function AppWithAnalytics() {
  const [showReportBug, setShowReportBug] = useState(false)
  const [reportTrigger, setReportTrigger] = useState<'button' | 'error-boundary'>('button')

  const handleReportBug = useCallback((trigger: 'button' | 'error-boundary' = 'button') => {
    setReportTrigger(trigger)
    setShowReportBug(true)
  }, [])

  const handleBoundaryFallback = useCallback(
    (_info: { error: Error; stackTrace: string | null }) => (
      <ErrorFallback
        onReport={() => handleReportBug('error-boundary')}
        onReload={() => window.location.reload()}
      />
    ),
    [handleReportBug],
  )

  return (
    <ErrorBoundary fallback={handleBoundaryFallback}>
      <AnalyticsTracker />
      <App onReportBug={() => handleReportBug('button')} />
      {showReportBug && (
        <ReportBug
          trigger={reportTrigger}
          onClose={() => setShowReportBug(false)}
        />
      )}
    </ErrorBoundary>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppWithAnalytics />
    </BrowserRouter>
  </StrictMode>,
)
