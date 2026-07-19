import { StrictMode, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ReportBug } from './components/ReportBug'
import './assets/bulma/css/bulma.min.css'

const MARKETING_API = (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('marketing_api')) ||
  (import.meta.env?.VITE_MARKETING_API || 'http://marketing-api.localhost')

function AnalyticsTracker() {
  const location = useLocation()
  useEffect(() => {
    fetch(`${MARKETING_API}/analytics/pageview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: location.pathname,
        referrer: document.referrer || null,
        user_agent: navigator.userAgent,
      }),
    }).catch(() => {})
  }, [location.pathname])
  return null
}

function ErrorFallback({ onReport, onReload }: { onReport: () => void; onReload: () => void }) {
  return (
    <div className="section has-text-centered">
      <h1 className="title is-3">Something went wrong</h1>
      <p className="subtitle is-5 has-text-grey">The page crashed. You can report what happened or try reloading.</p>
      <div className="buttons is-centered">
        <button className="button is-light" onClick={onReload}>Reload</button>
        <button className="button is-primary" onClick={onReport}>Send Report</button>
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
