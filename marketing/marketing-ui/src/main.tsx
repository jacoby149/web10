import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, useLocation } from 'react-router-dom'
import App from './App.tsx'
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

function AppWithAnalytics() {
  return (
    <>
      <AnalyticsTracker />
      <App />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppWithAnalytics />
    </BrowserRouter>
  </StrictMode>,
)
