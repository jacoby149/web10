// Screenshot harness entry — renders the REAL Layout + screens (full app
// chrome, real Tailwind tokens) with only the data layer mocked
// (see vite.config.ts aliases). This is how screens are captured
// for PR screenshots without the docker stack. See screenshots/README.md.
// ?screen=settings renders the Settings screen; default is /messages.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import '../../src/index.css';
import Layout from '@/components/Social/Layout';
import DmsScreen from '@/components/Chat/DmsScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';

const initialRoute = new URLSearchParams(window.location.search).get('screen') === 'settings' ? '/settings' : '/messages';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <Routes>
      <Route element={<Layout onLogout={() => {}} onReportBug={() => {}} />}>
        <Route path="/messages/:conversationKey?" element={<DmsScreen />} />
        <Route path="/settings" element={<SettingsScreen onLogout={() => {}} onReportBug={() => {}} />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
