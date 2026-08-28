import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
// Self-hosted fonts (design.md §5) — never Google Fonts CDN.
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';
import { installGa4, installHotjar, trackPageview } from './lib/analytics';

// D56: full-platform telemetry — GA4 + masked Hotjar (content-blind).
installGa4();
installHotjar();

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