import { createRoot } from 'react-dom/client';
// Self-hosted fonts (design.md §5) — never Google Fonts CDN.
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';

const root = createRoot(document.getElementById('root')!);
root.render(<App />);