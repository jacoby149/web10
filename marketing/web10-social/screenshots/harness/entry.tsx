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
import { MemoryRouter, Routes, Route, useParams } from 'react-router-dom';
import '@fontsource-variable/inter/standard.css';
import '@fontsource-variable/space-grotesk';
import '../../src/index.css';
import Layout from '@/components/Social/Layout';
import DmsScreen from '@/components/Chat/DmsScreen';
import SettingsScreen from '@/components/Settings/SettingsScreen';
import GroupsScreen from '@/components/Groups/GroupsScreen';
import GroupDetailScreen from '@/components/Groups/GroupDetailScreen';
import PeopleScreen from '@/components/People/PeopleScreen';
import FeedScreen from '@/components/Feed/FeedScreen';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';
import DiscoverScreen from '@/components/Discover/DiscoverScreen';
import ShortsScreen from '@/components/Shorts/ShortsScreen';
import UserProfileScreen from '@/components/Bio/UserProfileScreen';
import PostComposer from '@/components/Feed/PostComposer';
import MonetizationScreen from '@/components/Monetization/MonetizationScreen';
import { InstallPrompt } from '@/components/shared/InstallPrompt';

// Fake hls.js — the harness has no backend, so the seeded manifest sigs are
// not valid against the production API (a real hls.js would 403 → the
// player's error state). Stub window.Hls with the same surface the player
// uses (isSupported / loadSource / attachMedia / on / destroy) and fire
// MANIFEST_PARSED with fake levels, so the hls path renders its real frame
// (poster + control rack) deterministically, offline. The vendored
// /hls.min.js script tag is left in place for the native-HLS fallback path;
// this assignment wins (the entry module runs after the classic script).
class HarnessHls {
  static Events = { MANIFEST_PARSED: 'manifestParsed', LEVEL_SWITCHED: 'levelSwitched', ERROR: 'error' };
  static isSupported = () => true;
  levels: { height: number }[] = [{ height: 360 }, { height: 720 }];
  currentLevel = -1;
  private listeners: Record<string, ((e: unknown, d: unknown) => void)[]> = {};
  loadSource = (_url: string) => {
    // The manifest "parses" — the quality menu fills (Auto + 360p + 720p).
    queueMicrotask(() => this.emit(HarnessHls.Events.MANIFEST_PARSED, { levels: this.levels }));
  };
  attachMedia = (_el: HTMLVideoElement) => {};
  destroy = () => {};
  on = (event: string, cb: (e: unknown, d: unknown) => void) => {
    (this.listeners[event] ||= []).push(cb);
  };
  off = () => {};
  private emit(event: string, data: unknown) {
    for (const cb of this.listeners[event] || []) cb(event, data);
  }
}
(window as unknown as { Hls: unknown }).Hls = HarnessHls;

// The group detail reads its id from the route (the harness seeds faces per
// group — synthwave-sessions has a full face, lofi-study-room has none, so
// both hero variants are capturable).
function GroupDetailRoute() {
  const { groupId } = useParams();
  return <GroupDetailScreen groupId={groupId || ''} />;
}

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
  : screen === 'discover-people' ? '/discover?tab=people'
  : screen === 'discover-groups' ? '/discover?tab=groups'
  : screen === 'shorts' || screen === 'install-prompt' ? '/shorts'
  : screen === 'groups' ? '/groups'
  : screen === 'groups-discover' ? '/groups?tab=discover'
  : screen === 'groups-detail' ? '/groups/web10%2Fgroups%2Fusers%2Fnova%2Fsynthwave-sessions'
  : screen === 'groups-detail-noface' ? '/groups/web10%2Fgroups%2Fusers%2Fkai%2Flofi-study-room'
  : screen === 'groups-create' ? '/groups/web10%2Fgroups%2Fusers%2Fme%2Fnew-group?edit=1'
  : screen === 'people' ? '/people'
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
        <Route path="/groups/:groupId" element={<GroupDetailRoute />} />
        <Route path="/people" element={<PeopleScreen />} />
        <Route path="/u/:username" element={<UserProfileScreen username={'me'} provider={'web10'} />} />
        <Route path="/monetize" element={<MonetizationScreen />} />
      </Route>
    </Routes>
    {/* D72: the install surface — forced open by ?pwa-prompt=1 for the capture. */}
    <InstallPrompt />
  </MemoryRouter>,
);
