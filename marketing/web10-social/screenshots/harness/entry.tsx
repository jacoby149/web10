// Screenshot harness entry — renders the REAL Layout + screens (full app
// chrome, real Tailwind tokens) with only the data layer mocked
// (see vite.config.ts aliases). This is how screens are captured
// for PR screenshots without the docker stack. See screenshots/README.md.
// ?screen=settings renders the Settings screen; ?screen=groups /
// groups-discover / groups-detail render the Groups surface; default is
// /messages.
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import '../../src/index.css';
import Layout from '@/components/Social/Layout';
import DmsScreen from '@/components/Chat/DmsScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';
import GroupsScreen from '@/components/Groups/GroupsScreen';
import GroupDetailScreen from '@/components/Groups/GroupDetailScreen';

const screen = new URLSearchParams(window.location.search).get('screen');
const initialRoute =
  screen === 'settings' ? '/settings'
  : screen === 'groups' ? '/groups'
  : screen === 'groups-discover' ? '/groups?tab=discover'
  : screen === 'groups-detail' ? '/groups/web10%2Fgroups%2Fusers%2Fnova%2Fsynthwave-sessions'
  : '/messages';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <Routes>
      <Route element={<Layout onLogout={() => {}} onReportBug={() => {}} />}>
        <Route path="/messages/*" element={<DmsScreen />} />
        <Route path="/settings" element={<SettingsScreen onLogout={() => {}} onReportBug={() => {}} />} />
        <Route path="/groups" element={<GroupsScreen />} />
        <Route path="/groups/:groupId" element={<GroupDetailScreen groupId={'web10/groups/users/nova/synthwave-sessions'} />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
