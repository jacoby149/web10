// Screenshot harness entry — renders the REAL Layout + DmsScreen (full app
// chrome, real Tailwind tokens) at /messages, with only the data layer mocked
// (see vite.config.ts aliases). This is how the messages views are captured
// for PR screenshots without the docker stack. See screenshots/README.md.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import '../../src/index.css';
import Layout from '@/components/Social/Layout';
import DmsScreen from '@/components/Chat/DmsScreen';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={['/messages']}>
    <Routes>
      <Route element={<Layout onLogout={() => {}} onReportBug={() => {}} />}>
        <Route path="/messages" element={<DmsScreen />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
