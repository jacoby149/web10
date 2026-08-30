// Screenshot harness entry — renders the REAL Layout + screens (full app
// chrome, real Tailwind tokens) with only the data layer mocked
// (see vite.config.ts aliases). This is how screens are captured
// for PR screenshots without the docker stack. See screenshots/README.md.
// ?screen=settings renders the Settings screen; ?screen=groups /
// groups-discover / groups-detail / groups-create render the Groups surface
// (groups-create auto-opens the Create-group dialog); default is /messages.
import { useEffect } from 'react';
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

// The Create-group dialog is opened by a user gesture; the harness clicks the
// button once the screen is mounted so the sheet can be captured.
function GroupsCreateScreen() {
  useEffect(() => {
    const t = setTimeout(() => {
      document.querySelector('[data-testid="groups-create-button"]')?.click();
    }, 600);
    return () => clearTimeout(t);
  }, []);
  return <GroupsScreen />;
}

const screen = new URLSearchParams(window.location.search).get('screen');
const initialRoute =
  screen === 'settings' ? '/settings'
  : screen === 'groups' ? '/groups'
  : screen === 'groups-discover' ? '/groups?tab=discover'
  : screen === 'groups-detail' ? '/groups/web10%2Fgroups%2Fusers%2Fnova%2Fsynthwave-sessions'
  : screen === 'groups-create' ? '/groups'
  : '/messages';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <Routes>
      <Route element={<Layout onLogout={() => {}} onReportBug={() => {}} />}>
        <Route path="/messages/*" element={<DmsScreen />} />
        <Route path="/settings" element={<SettingsScreen onLogout={() => {}} onReportBug={() => {}} />} />
        <Route path="/groups" element={screen === 'groups-create' ? <GroupsCreateScreen /> : <GroupsScreen />} />
        <Route path="/groups/:groupId" element={<GroupDetailScreen groupId={'web10/groups/users/nova/synthwave-sessions'} />} />
      </Route>
    </Routes>
  </MemoryRouter>,
);
