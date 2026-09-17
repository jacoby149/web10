// Screenshot harness entry — renders the REAL Layout + screens (full app
// chrome, real Tailwind tokens) with only the data layer mocked
// (see vite.config.ts aliases). This is how screens are captured
// for PR screenshots without the docker stack. See README.md.
// ?screen=settings renders the Settings screen; ?screen=feed renders the
// Feed (knob rack + follower feed); ?screen=groups /
// groups-discover / groups-detail render the Groups surface; ?screen=profile /
// profile-feed render the profile (grid view / facebook-shaped feed view);
// default is /messages.
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
import FeedScreen from '@/components/Feed/FeedScreen';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import ShortsScreen from '@/components/Shorts/ShortsScreen';
import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import PostComposer from '@/components/Feed/PostComposer';
import MonetizationScreen from '@/components/Monetization/MonetizationScreen';
import { InstallPrompt } from '@/components/shared/InstallPrompt';

const params = new URLSearchParams(window.location.search);
const screen = params.get('screen');
// The install-prompt capture: render over Shorts and force the surface open
// (?pwa-prompt=1) so the shot shows the real card without a live beforeinstallprompt.
if (screen === 'install-prompt') {
  window.history.replaceState({}, '', '?pwa-prompt=1');
}
const initialRoute =
  screen === 'settings' ? '/settings'
  : screen === 'feed' ? '/feed'
  : screen === 'composer' ? '/composer'
  : screen === 'notifications' ? '/notifications'
  : screen === 'discover' ? '/discover'
  : screen === 'discover-youtube' ? '/discover?view=youtube'
  : screen === 'shorts' || screen === 'install-prompt' ? '/shorts'
  : screen === 'groups' ? '/groups'
  : screen === 'groups-discover' ? '/groups?tab=discover'
  : screen === 'groups-detail' ? '/groups/web10%2Fgroups%2Fusers%2Fnova%2Fsynthwave-sessions'
  : screen === 'profile' ? '/u/me'
  : screen === 'profile-feed' ? '/u/me?view=feed'
  : screen === 'monetize' ? '/monetize'
  : screen === 'monetize-node' ? '/monetize?tab=node'
  : '/messages';

createRoot(document.getElementById('root')!).render(
  <MemoryRouter initialEntries={[initialRoute]}>
    <Routes>
      <Route element={<Layout onLogout={() => {}} onReportBug={() => {}} />}>
        <Route path="/feed" element={<FeedScreen />} />
        <Route path="/composer" element={<PostComposer />} />
        <Route path="/notifications" element={<NotificationsScreen />} />
        <Route path="/discover" element={<DiscoverScreen />} />
        <Route path="/shorts" element={<ShortsScreen />} />
        <Route path="/shorts/:postId" element={<ShortsScreen />} />
        <Route path="/messages/*" element={<DmsScreen />} />
        <Route path="/settings" element={<SettingsScreen onLogout={() => {}} onReportBug={() => {}} />} />
        <Route path="/groups" element={<GroupsScreen />} />
        <Route path="/groups/:groupId" element={<GroupDetailScreen groupId={'web10/groups/users/nova/synthwave-sessions'} />} />
        <Route path="/u/:username" element={<UserProfileScreen username={'me'} provider={'web10'} />} />
        <Route path="/monetize" element={<MonetizationScreen />} />
      </Route>
    </Routes>
    {/* D72: the install surface — forced open by ?pwa-prompt=1 for the capture. */}
    <InstallPrompt />
  </MemoryRouter>,
);
