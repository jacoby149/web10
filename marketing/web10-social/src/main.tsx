import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
// Self-hosted fonts (design.md §5) — never Google Fonts CDN.
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';
import { installGa4, trackPageview } from './lib/analytics';

// Install GA4 (aggregate-only, anonymous, content-free — no recording)
installGa4();

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