import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { User, Users, MessageSquare, LogOut, LogIn, Bug, Store, Gamepad2, Radio, Zap, Clapperboard, Settings, MoreHorizontal, X, Bell, ChevronDown, DollarSign, Flame, Shield, Video, Music, Palette } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getWapi } from '@/data/wapi';
import { readProfile, resolveMediaRefs } from '@/data';
import type { ProfileRecord } from '@/data';
import { useNotifications } from '@/hooks/useNotifications';
import { useMessagesUnread } from '@/hooks/useMessagesUnread';
import { useNodeAdmin } from '@/components/Monetization/useNodeAdmin';
import NotificationBell from '@/components/Notifications/NotificationBell';
import NotificationsScreen from '@/components/Notifications/NotificationsScreen';
import GlobalSearch from '@/components/Search/GlobalSearch';
import { NewPostFab } from '@/components/Feed/NewPostFab';
import ActingIdentitySwitcher from './ActingIdentitySwitcher';
import { useActingAuthor } from '@/data/actingIdentity';
import { PersonalProfileContext } from '@/context/PersonalProfileContext';
import DockGlass from './DockGlass';
import { SignInPrompt } from '@/components/shared/SignInPrompt';
import { ThemeMark } from '@/components/shared/ThemeMark';

interface LayoutProps {
  onLogout: () => void;
  /** Anon mode: open the sign-in flow (the consent popup). */
  onLogin?: () => void;
  /**
   * Anon mode (signed-out visitor). Driven by the SAME source App uses
   * (`getSocialAuth().isSignedIn()`) so the chrome and the routes agree. When
   * omitted (direct Layout tests), it falls back to the token's presence.
   */
  isAnon?: boolean;
  onReportBug: () => void;
  children?: React.ReactNode;
}

// The four core destinations that stay one thumb-reach on mobile. Settings
// and Groups move into the "More" sheet so the bottom bar never exceeds five
// icons — room to grow as surfaces ship.
// The merged Posts destination (the X/Threads model): the old Feed + Hot
// Gossip sidebar tabs collapse into ONE "Posts" item (the flame icon) with a
// "Discover | Following" tab row inside (the PostsScreen at /feed). The
// operator's call (29.09.2026): "Posts on the side bar (Flame icon) and in it
// is Discover | Following". The testid stays `nav-feed` (it points at /feed);
// the label + icon change.
const feedItem = { path: '/feed', icon: Flame, label: 'Posts', testId: 'nav-feed' };
// The Discover split (watch-page.md): the old single "Discover" item is
// replaced by four flat destinations — Video (the video wall, the old Home
// view) · Shorts (the vertical lens) · Hot Gossip (the ranked post board, the
// old grid view) · People (the people + groups browser, the old explore tab).
// The sidebar owns the nav; the ?view= / ?tab= salad retires.
const videoItem = { path: '/video', icon: Video, label: 'Video', testId: 'nav-video' };
const shortsItem = { path: '/shorts', icon: Clapperboard, label: 'Shorts', testId: 'nav-shorts' };
const musicItem = { path: '/music', icon: Music, label: 'Music', testId: 'nav-music' };
// One consumption dock for signed-in and signed-out readers; never fork its order.
const bottomNavItems = [feedItem, videoItem, shortsItem, musicItem];
const peopleItem = { path: '/people', icon: Users, label: 'People', testId: 'nav-people' };
const messagesItem = { path: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages' };
// The profile nav item shows the user's name/username (not the word "Profile")
// — it tells you you're visiting your own profile (the operator's call). The
// label is resolved at render time (the display name is async).
const profileItem = { path: '/profile', icon: User, label: 'Profile', testId: 'nav-profile' };
const settingsItem = { path: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' };
// Monetization (D75) — every signed-in user: the creator's ad catalog +
// affiliate onboarding + (node admin) the node-ad inventory. A first-class nav
// item (the operator's reorder). Deep-links to the Monetization surface; the
// surface's in-page tab row (My Ads | Node Ads) is the section switcher, so
// the nav has ONE Monetization entry (no separate Node Monetization row).
const monetizationItem = { path: '/monetize', icon: DollarSign, label: 'Monetization', testId: 'nav-monetization' };
// Node Settings (D59) — the node owner's content-moderation surface, in the
// social app (not the authenticator — it's social-related). Rendered ONLY for
// the node admin (the useNodeAdmin gate). Stays in the More popover (admin-only,
// not a core nav item).
const nodeSettingsItem = { path: '/node-settings', icon: Shield, label: 'Node Settings', testId: 'nav-node-settings' };

// Provisional, non-infringing names for the surfaces not yet built. Shorts is
// now a real surface (shorts.md) — it lives in the sidebar + the More sheet,
// not here. Names are placeholders pending operator sign-off.
const comingSoonItems = [
  { icon: Zap, label: 'Stories', testId: 'nav-stories' },
  { icon: Radio, label: 'Livestream', testId: 'nav-livestream' },
  { icon: Gamepad2, label: 'Games', testId: 'nav-games' },
  { icon: Store, label: 'Marketplace', testId: 'nav-marketplace' },
];

function HeaderBrand() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 min-[360px]:gap-2">
      <ThemeMark className="size-5 min-[360px]:size-6 md:size-7" />
      <span data-testid="social-header-wordmark" className="whitespace-nowrap font-display text-base/none font-bold tracking-tight text-social-header-ink min-[360px]:text-xl/none md:text-2xl/none">
        web<span className="text-social-header-accent">10</span> <span>social</span>
      </span>
    </span>
  );
}

export default function Layout({ onLogout, onLogin, isAnon: isAnonProp, onReportBug, children }: LayoutProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const actingIdentity = useActingAuthor();
  const token = getWapi().readToken();
  // Signed-out readers keep public content navigation and a clear Sign in
  // action, without personal/account destinations. App supplies the same
  // session state used by its routes; direct Layout tests fall back to a token.
  const isAnon = isAnonProp ?? !token;
  const profilePath = token ? `/u/${token.username}` : '/video';
  // Desktop retains its existing People-first public sidebar.
  const anonSidebarNavItems = [peopleItem, feedItem, videoItem, shortsItem, musicItem];
  // Signed-in: Profile at the top, then the pyramid (People, Posts, Video,
  // Shorts, Music), then Messages + Monetization. More holds the rest
  // (Settings, Node Monetization, Node Settings, coming-soon).
  const sidebarNavItems = isAnon ? anonSidebarNavItems : [profileItem, peopleItem, feedItem, videoItem, shortsItem, musicItem, messagesItem, monetizationItem];
  const [moreOpen, setMoreOpen] = useState(false);
  const [moreIdentityOpen, setMoreIdentityOpen] = useState(false);
  const { unread } = useNotifications();
  // The Messages unread badge (the purple count on the Messages icon) — DMs
  // have their own badge, separate from the notifications bell.
  const { unread: messagesUnread } = useMessagesUnread();
  const { isAdmin: isNodeAdmin } = useNodeAdmin();
  const isNotifications = pathname === '/notifications';
  // The notifications panel (the operator: notifications "just toggles open
  // closed, also an x button to hide the page, sending you back to where you
  // were right last" — it is NOT its own page). One fixed panel, anchored
  // under the bell on desktop, full-width under the header on mobile. The
  // URL never changes (the user stays on their screen); the /notifications
  // route remains for deep links and renders the same component full-page.
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsPanelRef = useRef<HTMLDivElement>(null);
  // The Shorts LENS (`/shorts/:postId`) is a full-screen immersive surface
  // (the TikTok model): the bottom tab bar would overlap the action rail + the
  // comment sheet, so it is hidden on the lens. The exit is the back arrow the
  // lens renders itself (top-left → /feed); the mobile top header stays.
  // Dropping the `pb-16` reserve too makes
  // the lens truly full-bleed (the video runs edge to edge, no dead band under
  // the bar). The Shorts WALL (`/shorts`, no `:postId`) is a normal scrollable
  // grid — it keeps the normal chrome (top bar + bottom nav + pb-16).
  const isShorts = /^\/shorts\/[^/]+/.test(pathname);
  // The floating "+" New Post button only makes sense where posting IS the
  // surface's job: the Posts destination (the feed + the board), the Video
  // wall, the Shorts wall (a short IS a post), and your OWN profile (post to
  // your followers). It is hidden on every other surface — People (a browser),
  // other people's profiles, group pages (a member's "Post to this group"
  // button is the compose entry there), Monetization, Settings, Node Settings,
  // Notifications — where a "New post" bubble reads as noise (the operator,
  // 30.09.2026: "make new post on people tab doesnt make sense, on the
  // monetize tab doesnt make sense").
  const isOwnProfile = !!token && pathname === `/u/${token.username}`;
  const isPostDestination =
    pathname === '/feed' ||
    pathname === '/video' ||
    pathname === '/shorts' ||
    isOwnProfile;

  // The Monetization surface holds its section in the URL (`?tab=`). The nav
  // has ONE Monetization entry — the surface's in-page tab row (Ads | Products
  // | Analytics) is the section switcher — so the row highlights on ANY
  // /monetize section, not just the default.
  const isMonetize = pathname === '/monetize';

  // The desktop sidebar's account entry point: an avatar row that opens a
  // user menu (Profile / Settings / Report a bug / Log out). This is where
  // users expect account actions to live (Instagram / X / Discord) — the old
  // ghost "Log out" button buried at the bottom of a long sidebar was not a
  // "clear way to log out".
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userMenuTriggerRef = useRef<HTMLButtonElement>(null);
  // The desktop "More" popover — the coming-soon surfaces, tucked out of the
  // permanent nav (they're not real destinations yet, so they don't hold a
  // nav row; the popover keeps the roadmap discoverable).
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const username = token?.username ?? '';

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await readProfile();
        if (cancelled) return;
        if (p?.display_name) setDisplayName(p.display_name);
        if (p?.avatar_ref) {
          const media = await resolveMediaRefs([p.avatar_ref]);
          if (cancelled) return;
          const rec = media.find((m) => m._id === p.avatar_ref) ?? media[0];
          if (rec?.url) setAvatarUrl(rec.url);
        }
      } catch (e) {
        // A "No token available" (401) here means the user signed out mid-load —
        // a normal lifecycle event, not an error. The row degrades to the
        // token's username + an initial. console.log (not error) so the e2e
        // console-error gauntlet (which allows only 403/404 resource failures)
        // doesn't flag a benign sign-out race.
        console.log('[layout] user menu profile load skipped:', String(e));
      }
    })();
    return () => { cancelled = true; };
  }, [token?.username]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || userMenuRef.current?.querySelector('[data-testid="acting-identity-panel"]')) return;
      setUserMenuOpen(false);
      userMenuTriggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  useEffect(() => {
    if (!moreMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) setMoreMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreMenuOpen]);

  // The notifications panel closes on outside click + Esc (the popover
  // idiom — the same pattern the More popover + user menu run).
  useEffect(() => {
    if (!notificationsOpen) return;
    const onDown = (e: MouseEvent) => {
      if (notificationsPanelRef.current && !notificationsPanelRef.current.contains(e.target as Node)) setNotificationsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNotificationsOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [notificationsOpen]);

  // A route change (any navigation) closes the panel — the user moved on.
  useEffect(() => {
    setNotificationsOpen(false);
  }, [pathname]);

  const isActive = (path: string) => {
    if (path === '/profile') return pathname.startsWith('/u/');
    if (path === '/groups') return pathname.startsWith('/groups');
    if (path === '/monetize') return isMonetize;
    return pathname === path;
  };

  const go = (path: string) => {
    const target = path === '/profile' ? profilePath : path;
    console.log('[layout] navigate', { target, isAnon });
    setMoreOpen(false);
    navigate(target);
  };

  return (
    <div className="social-shell flex h-dvh overflow-hidden">
      <aside className={cn(
        'social-sidebar chrome-glass hidden md:flex flex-col w-64 shrink-0 border-r relative',
      )}>
        {/* The decorative glow is clipped by its OWN container (the
            overflow-hidden wrapper), so the aside itself carries no
            overflow rule. */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden dark:hidden" aria-hidden="true">
          <div className="absolute -top-20 -left-20 h-40 w-40 rounded-full bg-brand/5 blur-3xl" />
        </div>
        <div className="social-desktop-header relative -mr-px flex h-16 shrink-0 items-center bg-social-header px-4" data-testid="sidebar-brand-strip">
          <HeaderBrand />
        </div>
        <nav className="relative flex-1 px-2 pt-3 space-y-1" aria-label="Primary">
          {sidebarNavItems.map(({ path, icon: Icon, label, testId }) => {
            const target = path === '/profile' ? profilePath : path;
            // The profile item shows the user's own name (the operator's call:
            // "has the same behavior as the profile button, just tells you
            // more you are visiting your own profile").
            const navLabel = path === '/profile' ? displayName || username || 'Profile' : label;
            // The Monetization row highlights on ANY /monetize section — the
            // surface's in-page tab row (My Ads | Node Ads) is the section
            // switcher, so the nav has one entry that lights up for both.
            const active = path === '/monetize' ? isMonetize : isActive(path);
            return (
            <button
              key={path}
              data-testid={testId}
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(target)}
              className={cn(
                'chrome-nav-item w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium',
                active ? 'text-brand-300' : 'text-muted-foreground',
              )}
            >
              {path === '/profile' ? (
                <Avatar className="h-6 w-6 shrink-0">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt="" />
                  ) : (
                    <AvatarFallback className="bg-brand-muted text-brand-300 text-xs font-semibold">
                      {(displayName || username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
              ) : (
                <span className="relative shrink-0">
                  <Icon className={cn('w-6 h-6 transition-colors duration-150', active && 'text-brand')} strokeWidth={active ? 2 : 1.75} />
                  {path === '/messages' && messagesUnread > 0 && (
                    <span
                      data-testid="nav-messages-badge-desktop"
                      aria-hidden="true"
                       className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-brand text-brand-foreground text-[0.5625rem] font-bold flex items-center justify-center"
                    >
                      {messagesUnread > 99 ? '99+' : messagesUnread}
                    </span>
                  )}
                </span>
              )}
              <span className="truncate">{navLabel}</span>
              {active && (
                <div
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-brand animate-glow-pulse"
                  aria-hidden="true"
                />
              )}
            </button>
            );
          })}
          {isAnon && <div className="px-2 py-4"><SignInPrompt placement="sidebar" onLogin={onLogin} /></div>}
          {/* More — the coming-soon surfaces + Node Settings (admin-only) in a
                popover. Monetization is a first-class sidebar item (the
                operator's reorder); the node-ad inventory is its in-page Node
                Ads tab (the surface's tab row), not a separate nav row. The
                coming-soon surfaces are not real destinations yet, so they
                don't hold permanent nav rows; the popover keeps the roadmap
                discoverable without the dead weight. */}
          <div className="relative mt-4" ref={moreMenuRef}>
            <button
              type="button"
              data-testid="nav-more-desktop"
              aria-haspopup="menu"
              aria-expanded={moreMenuOpen}
              onClick={() => setMoreMenuOpen((o) => !o)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                moreMenuOpen
                  ? 'bg-elevated/80 text-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80 hover:border hover:border-border/50',
              )}
            >
              <MoreHorizontal className="w-6 h-6" strokeWidth={1.75} />
              More
            </button>
            {moreMenuOpen && (
              <div
                role="menu"
                data-testid="more-menu"
                className="chrome-glass chrome-floating absolute left-0 right-0 bottom-full mb-1 z-30 rounded-lg border p-1 max-h-[min(70vh,420px)] overflow-y-auto"
              >
                <button type="button" role="menuitem" data-testid="nav-appearance-desktop"
                  onClick={() => { setMoreMenuOpen(false); navigate('/appearance'); }}
                  className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-foreground hover:bg-elevated">
                  <Palette className="h-5 w-5" strokeWidth={1.75} />Appearance
                </button>
                {isNodeAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={nodeSettingsItem.testId}
                    aria-current={pathname === nodeSettingsItem.path ? 'page' : undefined}
                    onClick={() => { setMoreMenuOpen(false); navigate(nodeSettingsItem.path); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      pathname === nodeSettingsItem.path ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                    )}
                  >
                    <Shield className="w-5 h-5" strokeWidth={1.75} />
                    {nodeSettingsItem.label}
                  </button>
                )}
                {isNodeAdmin && <div className="my-1 h-px bg-border" aria-hidden="true" />}
                <p className="px-3 py-1.5 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Coming soon
                </p>
                {comingSoonItems.map(({ icon: Icon, label, testId }) => (
                  <div
                    key={testId}
                    data-testid={testId}
                    aria-disabled="true"
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-muted-foreground/50 cursor-not-allowed select-none"
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                    {label}
                    <span className="ml-auto text-[0.5625rem] font-semibold uppercase tracking-wide text-brand-300/80 bg-brand-muted/50 border border-brand/15 rounded-full px-1.5 py-0.5">
                      Soon
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </nav>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0" data-replay-private={/^\/(?:messages|settings|node-settings|monetize|notifications|uploads)(?:\/|$)/.test(pathname) ? '' : undefined}>
        <header data-testid="topbar-mobile" className="md:hidden flex shrink-0 items-center justify-between px-3 h-15 bg-social-header sticky top-0 z-20 gap-1">
          <HeaderBrand />
          <div className="flex shrink-0 items-center">
            {isAnon && <button type="button" aria-label="Appearance" data-testid="nav-appearance-anon"
              onClick={() => navigate('/appearance')} className="flex h-11 w-11 items-center justify-center rounded-lg text-social-header-ink hover:bg-social-header-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-social-header-ink">
              <Palette className="h-5 w-5" strokeWidth={1.75} />
            </button>}
            <GlobalSearch variant="mobile" />
            {isAnon ? (
              <Button
                variant="brand"
                size="sm"
                data-testid="sign-in-button-mobile"
                className="h-11 px-2 font-semibold min-[360px]:px-4"
                onClick={() => onLogin?.()}
              >
                <LogIn className="w-4 h-4 mr-1.5" strokeWidth={2} />
                Sign in
              </Button>
            ) : (
              <>
                <NotificationBell
                  open={notificationsOpen}
                  onToggle={() => setNotificationsOpen((o) => !o)}
                  className="text-social-header-ink hover:text-social-header-ink hover:bg-social-header-tint focus-visible:ring-social-header-ink aria-expanded:bg-social-header-tint"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="logout-button-mobile"
                  className="h-11 w-11 text-social-header-ink hover:text-social-header-ink hover:bg-social-header-tint focus-visible:ring-social-header-ink"
                  aria-label="Log out"
                  onClick={onLogout}
                >
                  <LogOut className="w-5 h-5" strokeWidth={1.75} />
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Desktop top bar. The search field lives here (the operator's
            29.09.2026 pass: the sidebar's search pill was a "traffic jam" —
            the field returns to the top bar, the sidebar keeps the full
            web10 wordmark). The right side keeps the bell + the account row.
            Hidden on the Shorts lens (the immersive surface keeps its
            full-bleed frame, like the bottom bar already does). */}
        {!isShorts && (
          <header
            data-testid="topbar-desktop"
            className="social-desktop-header hidden md:flex shrink-0 items-center justify-between gap-4 bg-social-header z-20 px-4 h-16"
          >
            {/* The desktop search: a fixed-width field on the left (the
                YouTube/Instagram top-bar shape). The results dropdown
                anchors below it (absolute top-full off the field's wrapper). */}
            <div className="w-72 max-w-full shrink-0">
              <GlobalSearch variant="desktop" />
            </div>
            <div className="flex items-center gap-3">
            {isAnon ? (
              /* Anon: no notifications, no account row — a clear Sign in
                 affordance (the operator: "make it clear you can sign in"). */
              <Button
                variant="brand"
                size="sm"
                data-testid="sign-in-button-desktop"
                className="ml-auto h-11 px-4 font-semibold"
                onClick={() => onLogin?.()}
              >
                <LogIn className="w-4 h-4 mr-1.5" strokeWidth={2} />
                Sign in
              </Button>
            ) : (
            <>
            {/* Notifications — the bell lives in the top bar next to the
                account row (the operator: "notifications could go in the top
                right next to the other thing on the top right"). It TOGGLES
                the notifications panel (not a page — the operator: "just
                toggles open closed, also an x button to hide the page,
                sending you back to where you were right last"). The unread
                badge mirrors the sidebar's (retired from the sidebar). */}
            <button
              type="button"
              data-testid="nav-notifications"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((o) => !o)}
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors duration-150',
                'text-social-header-ink hover:bg-social-header-tint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-social-header-ink',
                notificationsOpen && 'bg-social-header-tint',
              )}
            >
              <Bell className="w-5 h-5" strokeWidth={notificationsOpen || unread > 0 ? 2 : 1.75} />
              {unread > 0 && (
                <span
                  data-testid="nav-notifications-badge"
                  aria-hidden="true"
                   className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-brand text-brand-foreground text-[0.5625rem] font-bold flex items-center justify-center animate-glow-pulse"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <div className="relative shrink-0 pr-3" ref={userMenuRef}>
              <button
                ref={userMenuTriggerRef}
                type="button"
                data-testid="user-menu-trigger"
                aria-label="Account"
                aria-haspopup="dialog"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-2.5 rounded-full border border-social-header-ink/20 bg-social-header-tint pl-1.5 pr-2 py-1 text-social-header-ink transition-colors duration-150',
                  'hover:bg-social-header-tint-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-social-header-ink',
                  userMenuOpen && 'bg-social-header-tint-hover',
                )}
              >
                <Avatar className="h-8 w-8">
                  {avatarUrl ? (
                    <AvatarImage src={avatarUrl} alt="" />
                  ) : (
                    <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
                      {(displayName || username || '?').charAt(0).toUpperCase()}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div className="hidden lg:block text-left min-w-0">
                  <p className="text-sm font-medium truncate leading-tight">{displayName || username}</p>
                  <p className="text-xs text-social-header-ink/80 truncate leading-tight">@{username}</p>
                </div>
                <ChevronDown
                  className={cn('w-4 h-4 shrink-0 transition-transform duration-150', userMenuOpen && 'rotate-180')}
                  strokeWidth={1.75}
                />
              </button>

              {userMenuOpen && (
                <div
                  role="dialog"
                  aria-label="Account"
                  data-testid="user-menu"
                  data-replay-private
                  className="chrome-glass chrome-floating absolute right-0 top-full mt-2 w-64 rounded-lg border p-1 z-30"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground/70">Signed in as</p>
                    <p className="truncate text-sm font-medium text-foreground">{displayName || username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{username}</p>
                  </div>
                  <div className="border-b border-border py-1">
                    <ActingIdentitySwitcher personalName={displayName || username} personalAvatar={avatarUrl}
                      onCreateGroup={() => { setUserMenuOpen(false); go('/groups'); }} />
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      data-testid="user-menu-profile"
                      onClick={() => { setUserMenuOpen(false); navigate(profilePath); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      Profile
                    </button>
                    <button
                      type="button"
                      data-testid="user-menu-settings"
                      onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      Settings
                    </button>
                    <button
                      type="button"
                      data-testid="user-menu-report-bug"
                      onClick={() => { setUserMenuOpen(false); onReportBug(); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <Bug className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      Report a bug
                    </button>
                    <div className="my-1 h-px bg-border" aria-hidden="true" />
                    <button
                      type="button"
                      data-testid="logout-button"
                      onClick={onLogout}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-danger-muted hover:text-danger transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <LogOut className="w-4 h-4" strokeWidth={1.75} />
                      Log out
                    </button>
                  </div>
                </div>
              )}
            </div>
            </>
            )}
            </div>
          </header>
        )}

        {/* The always-on signal (D69): a live "N new" strip above every screen.
            It opens the notifications panel (the same toggle the bell is) and
            clears the moment the panel marks all read. */}
        {unread > 0 && !isNotifications && !isAnon && (
          <button
            type="button"
            data-testid="notification-banner"
            onClick={() => setNotificationsOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-muted/60 border-b border-brand/20 text-sm text-brand-300 hover:bg-brand-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Bell className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="truncate">
              <strong className="font-semibold">{unread}</strong> new notification{unread === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-xs underline underline-offset-2 shrink-0">View</span>
          </button>
        )}

        {/* The notifications panel — the bell's popover (the operator:
            notifications "just toggles open closed, also an x button to hide
            the page, sending you back to where you were right last" — NOT
            its own page). Anchored under the bell on desktop, full-width
            under the header on mobile. The URL never changes; the X (in the
            panel header) + outside click + Esc all close it. The same
            component the /notifications route renders full-page. */}
        {notificationsOpen && !isAnon && (
          <div
            ref={notificationsPanelRef}
            data-testid="notifications-panel"
            role="dialog"
            aria-label="Notifications"
            className="fixed z-40 inset-x-0 top-15 bottom-14 bg-surface flex flex-col md:inset-x-auto md:top-16 md:right-4 md:bottom-auto md:w-96 md:max-w-[calc(100vw-2rem)] md:max-h-[calc(100vh-4rem)] md:rounded-lg md:border md:border-border md:shadow-[0_8px_30px_rgb(0,0,0/0.35)] md:bg-popover md:overflow-hidden"
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <NotificationsScreen onClose={() => setNotificationsOpen(false)} />
            </div>
          </div>
        )}

        <div data-testid="shell-content" className={cn('flex-1 min-h-0 overflow-y-auto md:pb-0 md:[body:has([data-testid=music-player])_&]:pb-36', isShorts ? '' : 'chrome-content-clearance')}>
          {actingIdentity && /^\/(messages|monetize|settings|node-settings)(\/|$)/.test(pathname) && <p className="border-b border-border bg-surface px-4 py-2 text-xs text-muted-foreground" data-testid="personal-authority-notice">This screen uses your personal account: {username}.</p>}
          <PersonalProfileContext.Provider value={isAnon ? null : { name: displayName || username, avatarUrl }}>{children || <Outlet />}</PersonalProfileContext.Provider>
        </div>

        <nav
          aria-label="Primary mobile"
          className={cn(
            'chrome-glass chrome-floating chrome-mobile-dock md:hidden fixed inset-x-3 z-20 flex items-stretch gap-1 border p-1.5',
            isShorts && 'hidden',
          )}
        >
          <DockGlass />
          {bottomNavItems.map(({ path, icon: Icon, label, testId }) => {
            return (
            <button
              key={path}
              data-testid={`${testId}-mobile`}
              aria-current={isActive(path) ? 'page' : undefined}
              aria-label={label}
              onClick={() => go(path)}
              className={cn(
                'chrome-nav-item min-w-0 flex-1 flex flex-col items-center justify-center gap-1 min-h-12 py-2 relative',
                isActive(path) ? 'text-brand-300' : 'text-foreground',
              )}
            >
              <span className="relative">
                <Icon className="w-5 h-5" strokeWidth={isActive(path) ? 2 : 1.75} />
              </span>
              <span className="text-[0.625rem] font-medium">{label}</span>
            </button>
            );
          })}
          {/* More keeps People/Appearance reachable for everyone; personal
              destinations and message counts remain signed-in-only. */}
          <button
            data-testid="nav-more-mobile"
            aria-label={!isAnon && messagesUnread > 0 ? `More, ${messagesUnread > 99 ? '99+' : messagesUnread} unread messages` : 'More'}
            aria-current={isActive(peopleItem.path) || (!isAnon && isActive(messagesItem.path)) ? 'page' : undefined}
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className="chrome-nav-item relative min-w-0 flex-1 flex flex-col items-center justify-center gap-1 min-h-12 py-2 text-foreground"
          >
            <span className="relative"><MoreHorizontal className="w-5 h-5" strokeWidth={1.75} />
               {!isAnon && messagesUnread > 0 && <span data-testid="nav-more-messages-badge" aria-hidden="true" className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[0.5625rem] font-bold text-brand-foreground">{messagesUnread > 99 ? '99+' : messagesUnread}</span>}
            </span>
            <span className="text-[0.625rem] font-medium">More</span>
          </button>
        </nav>

        {/* The "More" sheet — Settings (the demoted real destination) plus
            the coming-soon surfaces, so the roadmap is discoverable on
            mobile without cramming six dead icons into the bottom bar. */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal={isAnon || !moreIdentityOpen} inert={!isAnon && moreIdentityOpen} aria-label="More">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-hidden="true" />
            <div className="chrome-glass chrome-floating relative w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-t-lg border p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" data-testid="more-sheet">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-medium text-foreground">More</h3>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close"
                  className="flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                {!isAnon && <div className="mb-4 rounded-lg border border-border bg-elevated p-1" data-replay-private data-testid="more-profile-card">
                  <button type="button" data-testid="nav-profile-mobile" aria-label="View your profile" onClick={() => go(profileItem.path)} className="flex min-h-20 w-full items-center gap-3 rounded-sm p-3 text-left hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Avatar className="h-12 w-12 shrink-0">{avatarUrl && <AvatarImage src={avatarUrl} alt="" />}<AvatarFallback className="bg-brand-muted text-brand-300">{(displayName || username || '?').charAt(0).toUpperCase()}</AvatarFallback></Avatar>
                    <span className="min-w-0 flex-1"><span className="block truncate text-base font-semibold text-foreground">{displayName || username || 'Your profile'}</span><span className="mt-1 block truncate text-xs text-muted-foreground">@{username}</span><span className="mt-1 block text-sm font-medium text-brand-300">View profile</span></span>
                  </button>
                  <div className="border-t border-border pt-1">
                    <ActingIdentitySwitcher placement="profile-card" personalName={displayName || username} personalAvatar={avatarUrl}
                      onPickerOpenChange={setMoreIdentityOpen} onCreateGroup={() => go('/groups')} />
                  </div>
                </div>}
                {/* People — the discovery/browse surface, kept in More. */}
                <button
                  data-testid="nav-people-mobile"
                  onClick={() => go(peopleItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive(peopleItem.path) ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <Users className="w-5 h-5" strokeWidth={1.75} />
                  {peopleItem.label}
                </button>
                {/* Messages keeps its route/unread indicator, outside the primary dock. */}
                {!isAnon && <button
                  data-testid="nav-messages-mobile"
                  onClick={() => go(messagesItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive(messagesItem.path) ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <MessageSquare className="w-5 h-5" strokeWidth={1.75} />
                  {messagesItem.label}
                   {messagesUnread > 0 && <span data-testid="nav-messages-badge-mobile" className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">{messagesUnread > 99 ? '99+' : messagesUnread}</span>}
                </button>}
                <button type="button" data-testid="nav-appearance-mobile" onClick={() => go('/appearance')}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-elevated">
                  <Palette className="h-5 w-5" strokeWidth={1.75} />Appearance
                </button>
                {!isAnon && <><button
                  data-testid="nav-settings-mobile"
                  onClick={() => go(settingsItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive(settingsItem.path) ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <Settings className="w-5 h-5" strokeWidth={1.75} />
                  {settingsItem.label}
                </button>
                <button
                  data-testid="nav-monetization-mobile"
                  onClick={() => go(monetizationItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isMonetize ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <DollarSign className="w-5 h-5" strokeWidth={1.75} />
                  {monetizationItem.label}
                </button>
                {isNodeAdmin && (
                  <button
                    data-testid="nav-node-settings-mobile"
                    onClick={() => go(nodeSettingsItem.path)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                      pathname === nodeSettingsItem.path ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                    )}
                  >
                    <Shield className="w-5 h-5" strokeWidth={1.75} />
                    {nodeSettingsItem.label}
                  </button>
                )}
                </>}
              </div>

              <div className="mt-4 pt-3 border-t border-border/60">
                <p className="px-3 pb-1 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground/50">
                  Coming soon
                </p>
                {comingSoonItems.map(({ icon: Icon, label, testId }) => (
                  <div
                    key={testId}
                    data-testid={`${testId}-mobile`}
                    aria-disabled="true"
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground/50 cursor-not-allowed select-none"
                  >
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                    {label}
                    <span className="ml-auto text-[0.5625rem] font-semibold uppercase tracking-wide text-brand-300/80 bg-brand-muted/50 border border-brand/15 rounded-full px-1.5 py-0.5">
                      Soon
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* The floating "New Post" button — the only resting compose chrome
            (the inline composer boxes are retired; the full composer pops up
            in the app-level sheet on tap). Hidden on the Shorts lens (the
            immersive surface keeps its full-bleed frame), on the Messages
            surface (a chat has its own bottom-right send button the FAB would
            cover — and a "new post" affordance inside a conversation is noise),
            and in anon mode (a signed-out visitor can't post). */}
        <NewPostFab hidden={!isPostDestination || isShorts || isAnon || pathname.startsWith('/messages')} />
      </main>
    </div>
  );
}
