import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
// Self-hosted fonts (design.md §5) — never Google Fonts CDN.
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);