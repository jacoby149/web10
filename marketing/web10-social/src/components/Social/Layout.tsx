import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, User, Users, MessageSquare, LogOut, LogIn, Bug, Compass, Store, Gamepad2, Radio, Zap, Clapperboard, Settings, MoreHorizontal, X, Bell, ChevronDown, DollarSign, Flame } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getWapi } from '@/data/wapi';
import { readProfile, resolveMediaRefs } from '@/data';
import type { ProfileRecord } from '@/data';
import { useNotifications } from '@/hooks/useNotifications';
import { useNodeAdmin } from '@/components/Monetization/useNodeAdmin';
import NotificationBell from '@/components/Notifications/NotificationBell';
import GlobalSearch from '@/components/Search/GlobalSearch';

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
const feedItem = { path: '/feed', icon: Home, label: 'Feed', testId: 'nav-feed' };
const discoverItem = { path: '/discover', icon: Compass, label: 'Discover', testId: 'nav-discover' };
const shortsItem = { path: '/shorts', icon: Clapperboard, label: 'Shorts', testId: 'nav-shorts' };
const messagesItem = { path: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages' };
// The profile nav item shows the user's name/username (not the word "Profile")
// — it tells you you're visiting your own profile (the operator's call). The
// label is resolved at render time (the display name is async).
const profileItem = { path: '/profile', icon: User, label: 'Profile', testId: 'nav-profile' };
const settingsItem = { path: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' };
// Monetization (D75) — every signed-in user: the creator's ad catalog +
// affiliate onboarding. A first-class nav item (the operator's reorder).
// Deep-links to the Monetization surface's default (Creator) tab.
const monetizationItem = { path: '/monetize', icon: DollarSign, label: 'Monetization', testId: 'nav-monetization' };
// Node Monetization (D75) — rendered ONLY for the node admin (the
// useNodeAdmin gate). Deep-links to the Monetization surface's Node tab.
// Stays in the More popover (admin-only, not a core nav item).
const nodeMonetizationItem = { path: '/monetize?tab=node', icon: DollarSign, label: 'Node Monetization', testId: 'nav-node-monetization' };

// Provisional, non-infringing names for the surfaces not yet built. Shorts is
// now a real surface (shorts.md) — it lives in the sidebar + the More sheet,
// not here. Names are placeholders pending operator sign-off.
const comingSoonItems = [
  { icon: Zap, label: 'Stories', testId: 'nav-stories' },
  { icon: Radio, label: 'Livestream', testId: 'nav-livestream' },
  { icon: Gamepad2, label: 'Games', testId: 'nav-games' },
  { icon: Store, label: 'Marketplace', testId: 'nav-marketplace' },
];

function Wordmark({ className, markOnly = false }: { className?: string; markOnly?: boolean }) {
  // `markOnly` (the desktop sidebar, the operator's "just a logo of keys, no
  // web10 text" — Facebook-style): the keys glyph alone. The mobile header
  // keeps the full lockup (it's the only branding on a phone).
  if (markOnly) {
    return (
      <span className={cn('flex items-center', className)} data-testid="wordmark-mark">
        <img src="/keys-mark.png" alt="web10" className="h-7 w-7 shrink-0" aria-hidden="true" />
      </span>
    );
  }
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img src="/keys-mark.png" alt="" className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        web<span className="text-brand">10</span>
      </span>
    </span>
  );
}

export default function Layout({ onLogout, onLogin, isAnon: isAnonProp, onReportBug, children }: LayoutProps) {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const token = getWapi().readToken();
  // Anon mode (the operator: "supporting anon login with web10 social"): a
  // signed-out visitor browses the public surfaces (Discover, Shorts,
  // profiles) in a read-only shell. The chrome swaps the account row for a
  // clear Sign in affordance and hides the signed-in-only nav (Feed, Messages,
  // your Profile, Monetization). `isAnon` is driven by the same source App
  // uses (getSocialAuth().isSignedIn()) so the chrome and the routes agree;
  // a direct Layout render (no prop) falls back to the token's presence.
  const isAnon = isAnonProp ?? !token;
  const profilePath = token ? `/u/${token.username}` : '/discover';
  // Anon nav: only the public surfaces (Discover, Shorts). Feed, Messages,
  // your Profile, and Monetization are signed-in-only — hiding them keeps the
  // chrome honest (a dead nav item that redirects to Discover is worse than
  // no item).
  const anonSidebarNavItems = [discoverItem, shortsItem];
  const anonBottomNavItems = [discoverItem, shortsItem];
  const sidebarNavItems = isAnon ? anonSidebarNavItems : [profileItem, shortsItem, discoverItem, feedItem, messagesItem, monetizationItem];
  const bottomNavItems = isAnon ? anonBottomNavItems : [feedItem, discoverItem, messagesItem, profileItem];
  const [moreOpen, setMoreOpen] = useState(false);
  const { unread } = useNotifications();
  const { isAdmin: isNodeAdmin } = useNodeAdmin();
  const isNotifications = pathname === '/notifications';
  // Shorts is a full-screen immersive lens (the TikTok model): the bottom tab
  // bar would overlap the action rail + the comment sheet, so it is hidden on
  // the lens. The exit is the back arrow the lens renders itself (top-left →
  // /feed); the mobile top header stays so the account actions remain
  // reachable. Dropping the `pb-16` reserve too makes the lens truly
  // full-bleed (the video runs edge to edge, no dead band under the bar).
  const isShorts = pathname.startsWith('/shorts');

  // The Monetization surface holds its section in the URL (`?tab=node`). The
  // two nav entries are the switcher — each must highlight on its OWN section,
  // never both — so the active state reads the query string, not just the
  // pathname (a pathname-only match lit up both rows on `/monetize`).
  const monetizeTab = new URLSearchParams(search).get('tab');
  const isMonetizeCreator = pathname === '/monetize' && monetizeTab !== 'node';
  const isMonetizeNode = pathname === '/monetize' && monetizeTab === 'node';

  // B3: the Discover screen's Trending | People tabs live in the top bar
  // (desktop, Discover screen only — the operator's Facebook-style chrome).
  // The active tab is URL state (?tab=; trending is the bare URL) so it stays
  // deep-linkable + refresh-safe. On non-Discover screens the top bar shows
  // only the bell + the account row.
  const isDiscover = pathname === '/discover';
  const discoverTab = new URLSearchParams(search).get('tab') === 'explore' ? 'explore' : 'trending';
  const setDiscoverTab = useCallback(
    (next: 'trending' | 'explore') => {
      const params = new URLSearchParams(search);
      if (next === 'trending') params.delete('tab');
      else params.set('tab', next);
      const qs = params.toString();
      navigate(`/discover${qs ? `?${qs}` : ''}`);
    },
    [search, navigate],
  );

  // The desktop sidebar's account entry point: an avatar row that opens a
  // user menu (Profile / Settings / Report a bug / Log out). This is where
  // users expect account actions to live (Instagram / X / Discord) — the old
  // ghost "Log out" button buried at the bottom of a long sidebar was not a
  // "clear way to log out".
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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
      if (e.key === 'Escape') setUserMenuOpen(false);
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

  const isActive = (path: string) => {
    if (path === '/profile') return pathname.startsWith('/u/');
    if (path === '/groups') return pathname.startsWith('/groups');
    if (path === '/monetize') return isMonetizeCreator;
    return pathname === path;
  };

  const go = (path: string) => {
    const target = path === '/profile' ? profilePath : path;
    setMoreOpen(false);
    navigate(target);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className={cn(
        'hidden md:flex flex-col w-64 border-r border-border relative',
        'bg-gradient-to-b from-surface to-background',
      )}>
        {/* The decorative glow is clipped by its OWN container — the aside
            itself must NOT be overflow-hidden: the search results dropdown
            anchors here and overflows into the content (the Facebook-style
            wide panel, 25.09.2026). */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
          <div className="absolute -top-20 -left-20 h-40 w-40 rounded-full bg-brand/5 blur-3xl" />
        </div>
        <div className="relative p-4">
          <Wordmark markOnly />
        </div>
        {/* The desktop search field lives in the sidebar (the operator's
            Facebook-style chrome: keys mark, then search, then the nav rows).
            It was in the top bar; the top bar now carries the Discover tabs
            + the bell + the account row. The results dropdown anchors here
            (it positions `absolute top-full` off this wrapper). */}
        <div className="relative px-4 pb-3">
          <GlobalSearch variant="desktop" />
        </div>
        <nav className="relative flex-1 px-2 space-y-1" aria-label="Primary">
          {sidebarNavItems.map(({ path, icon: Icon, label, testId }) => {
            const target = path === '/profile' ? profilePath : path;
            // The profile item shows the user's own name (the operator's call:
            // "has the same behavior as the profile button, just tells you
            // more you are visiting your own profile").
            const navLabel = path === '/profile' ? displayName || username || 'Profile' : label;
            // The Monetization row highlights only on its OWN section (the
            // Creator tab) — never on /monetize?tab=node (where Node
            // Monetization is the active one). The same query-string rule the
            // top-bar account row uses.
            const active = path === '/monetize' ? isMonetizeCreator : isActive(path);
            return (
            <button
              key={path}
              data-testid={testId}
              aria-current={path === '/profile' ? isActive('/profile') : active ? 'page' : undefined}
              onClick={() => navigate(target)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? cn(
                      'bg-gradient-to-r from-brand-muted to-brand/15 text-brand-300',
                      'border border-brand/20 glow-active',
                    )
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80 hover:border hover:border-border/50',
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
                <Icon className={cn('w-6 h-6 transition-colors duration-150', active && 'text-brand')} strokeWidth={active ? 2 : 1.75} />
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
          {/* More — the coming-soon surfaces + Node Monetization (admin-only)
               in a popover. Monetization is a first-class sidebar item (the
               operator's reorder); Node Monetization stays here (it's an
               admin-only surface, not a core nav item). The coming-soon
               surfaces are not real destinations yet, so they don't hold
               permanent nav rows; the popover keeps the roadmap discoverable
               without the dead weight. */}
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
                className="absolute left-0 right-0 bottom-full mb-1 z-30 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0,0,0/0.35)] max-h-[min(70vh,420px)] overflow-y-auto"
              >
                {isNodeAdmin && (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid={nodeMonetizationItem.testId}
                    aria-current={isMonetizeNode ? 'page' : undefined}
                    onClick={() => { setMoreMenuOpen(false); navigate(nodeMonetizationItem.path); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isMonetizeNode ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                    )}
                  >
                    <DollarSign className="w-5 h-5" strokeWidth={1.75} />
                    {nodeMonetizationItem.label}
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

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface/95 backdrop-blur-md sticky top-0 z-20 gap-2">
          <Wordmark />
          <div className="flex items-center gap-1">
            <GlobalSearch variant="mobile" />
            {isAnon ? (
              <Button
                variant="brand"
                size="sm"
                data-testid="sign-in-button-mobile"
                className="h-10 px-4 font-semibold"
                onClick={() => onLogin?.()}
              >
                <LogIn className="w-4 h-4 mr-1.5" strokeWidth={2} />
                Sign in
              </Button>
            ) : (
              <>
                <NotificationBell />
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="report-bug-button-mobile"
                  className="h-11 w-11 text-muted-foreground hover:text-foreground"
                  aria-label="Report a bug"
                  onClick={onReportBug}
                >
                  <Bug className="w-5 h-5" strokeWidth={1.75} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="logout-button-mobile"
                  className="h-11 w-11 text-muted-foreground hover:text-foreground"
                  aria-label="Log out"
                  onClick={onLogout}
                >
                  <LogOut className="w-5 h-5" strokeWidth={1.75} />
                </Button>
              </>
            )}
          </div>
        </header>

        {/* Desktop top bar. The search field moved to the sidebar (B2). On the
            Discover screen the left side carries the Trending | People tabs
            (B3); on every other screen it's empty (the tabs are
            Discover-specific). The right side keeps the bell + the account
            row. Hidden on the Shorts lens (the immersive surface keeps its
            full-bleed frame, like the bottom bar already does). */}
        {!isShorts && (
          <header
            data-testid="topbar-desktop"
            className="hidden md:flex items-center justify-between gap-4 border-b border-border bg-surface/95 backdrop-blur-md z-20 px-4"
          >
            {isDiscover ? (
              <div className="flex items-center gap-1" role="tablist" aria-label="Discover sections" data-testid="discover-tab-row">
                {([
                  ['trending', 'Trending', Flame],
                  // The People tab carries the TWO-people glyph (it holds
                  // profiles + groups — the operator, 25.09.2026: "people
                  // should be the logo of the two people"); the Profiles
                  // *subtab* inside it carries the one-person glyph.
                  ['explore', 'People', Users],
                ] as ['trending' | 'explore', string, typeof Flame][]).map(([id, label, TabIcon]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={discoverTab === id}
                    data-testid={`discover-tab-${id}`}
                    onClick={() => setDiscoverTab(id)}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                      discoverTab === id
                        ? 'bg-brand-muted text-brand-300'
                        : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
                    )}
                  >
                    <TabIcon className="h-4 w-4" strokeWidth={1.75} />
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div aria-hidden="true" />
            )}
            <div className="flex items-center gap-1">
            {isAnon ? (
              /* Anon: no notifications, no account row — a clear Sign in
                 affordance (the operator: "make it clear you can sign in"). */
              <Button
                variant="brand"
                size="sm"
                data-testid="sign-in-button-desktop"
                className="ml-auto h-9 px-4 font-semibold"
                onClick={() => onLogin?.()}
              >
                <LogIn className="w-4 h-4 mr-1.5" strokeWidth={2} />
                Sign in
              </Button>
            ) : (
            <>
            {/* Notifications — the bell lives in the top bar next to the
                account row (the operator: "notifications could go in the top
                right next to the other thing on the top right"). The unread
                badge mirrors the sidebar's (retired from the sidebar). */}
            <button
              type="button"
              data-testid="nav-notifications"
              aria-label="Notifications"
              onClick={() => navigate('/notifications')}
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-lg transition-colors duration-150',
                'hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
                isNotifications ? 'text-brand' : 'text-muted-foreground',
              )}
            >
              <Bell className="w-5 h-5" strokeWidth={isNotifications ? 2 : 1.75} />
              {unread > 0 && (
                <span
                  data-testid="nav-notifications-badge"
                  aria-hidden="true"
                  className="absolute -top-0.5 -right-0.5 min-w-4.5 h-4.5 px-1 rounded-full bg-brand text-background text-[0.5625rem] font-bold flex items-center justify-center animate-glow-pulse"
                >
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <div className="relative shrink-0 pr-3" ref={userMenuRef}>
              <button
                type="button"
                data-testid="user-menu-trigger"
                aria-haspopup="menu"
                aria-expanded={userMenuOpen}
                onClick={() => setUserMenuOpen((o) => !o)}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg pl-1.5 pr-2 py-1.5 transition-colors duration-150',
                  'hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
                  userMenuOpen && 'bg-elevated/80',
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
                  <p className="text-sm font-medium text-foreground truncate leading-tight">{displayName || username}</p>
                  <p className="text-xs text-muted-foreground truncate leading-tight">@{username}</p>
                </div>
                <ChevronDown
                  className={cn('w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-150', userMenuOpen && 'rotate-180')}
                  strokeWidth={1.75}
                />
              </button>

              {userMenuOpen && (
                <div
                  role="menu"
                  data-testid="user-menu"
                  className="absolute right-0 top-full mt-2 w-64 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0,0,0/0.35)] z-30"
                >
                  <div className="border-b border-border px-3 py-2">
                    <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground/70">Signed in as</p>
                    <p className="truncate text-sm font-medium text-foreground">{displayName || username}</p>
                    <p className="truncate text-xs text-muted-foreground">@{username}</p>
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="user-menu-profile"
                      onClick={() => { setUserMenuOpen(false); navigate(profilePath); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <User className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      Profile
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      data-testid="user-menu-settings"
                      onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground hover:bg-elevated transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
                    >
                      <Settings className="w-4 h-4 text-muted-foreground" strokeWidth={1.75} />
                      Settings
                    </button>
                    <button
                      type="button"
                      role="menuitem"
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
                      role="menuitem"
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
            It clears the moment you open /notifications (which marks all read),
            so it's a nudge, not a permanent fixture. */}
        {unread > 0 && !isNotifications && !isAnon && (
          <button
            type="button"
            data-testid="notification-banner"
            onClick={() => navigate('/notifications')}
            className="flex items-center gap-2 px-4 py-2 bg-brand-muted/60 border-b border-brand/20 text-sm text-brand-300 hover:bg-brand-muted transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50"
          >
            <Bell className="w-4 h-4 shrink-0" strokeWidth={2} />
            <span className="truncate">
              <strong className="font-semibold">{unread}</strong> new notification{unread === 1 ? '' : 's'}
            </span>
            <span className="ml-auto text-xs underline underline-offset-2 shrink-0">View</span>
          </button>
        )}

        <div className={cn('flex-1 min-h-0 overflow-y-auto md:pb-0', isShorts ? '' : 'pb-16')}>
          {children || <Outlet />}
        </div>

        <nav
          aria-label="Primary mobile"
          className={cn(
            'md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-md',
            isShorts && 'hidden',
          )}
        >
          {bottomNavItems.map(({ path, icon: Icon, label, testId }) => {
            return (
            <button
              key={path}
              data-testid={`${testId}-mobile`}
              aria-current={isActive(path) ? 'page' : undefined}
              aria-label={label}
              onClick={() => go(path)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 transition-all duration-150 relative',
                isActive(path) ? 'text-brand' : 'text-muted-foreground',
              )}
            >
              {isActive(path) && (
                <div
                  className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-brand to-brand-600 rounded-b-full mx-8"
                  aria-hidden="true"
                />
              )}
              <Icon className="w-5 h-5" strokeWidth={isActive(path) ? 2 : 1.75} />
              <span className="text-[0.625rem] font-medium uppercase tracking-wide">{label}</span>
            </button>
            );
          })}
          {/* The "More" tab: the fifth icon. Opens a sheet with Settings +
               the coming-soon surfaces, so the bottom bar stays at five and
               has room to grow as features ship (operator, 30.08.2026).
               Hidden in anon mode — it only holds signed-in-only surfaces
               (Settings, Monetization); the Sign in affordance is in the
               header. */}
          {!isAnon && (
          <button
            data-testid="nav-more-mobile"
            aria-label="More"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen(true)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 text-muted-foreground transition-colors duration-150"
          >
            <MoreHorizontal className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[0.625rem] font-medium uppercase tracking-wide">More</span>
          </button>
          )}
        </nav>

        {/* The "More" sheet — Settings (the demoted real destination) plus
            the coming-soon surfaces, so the roadmap is discoverable on
            mobile without cramming six dead icons into the bottom bar. */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0 z-50 flex items-end justify-center" role="dialog" aria-modal="true" aria-label="More">
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMoreOpen(false)} aria-hidden="true" />
            <div className="relative w-full max-w-lg rounded-t-lg border-t border-border bg-card p-4 shadow-[0_-8px_30px_rgb(0,0,0,0.35)]" data-testid="more-sheet">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-medium text-foreground">More</h3>
                <button
                  type="button"
                  onClick={() => setMoreOpen(false)}
                  aria-label="Close"
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-elevated transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <button
                  data-testid="nav-shorts-mobile"
                  onClick={() => go(shortsItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive(shortsItem.path) ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <Clapperboard className="w-5 h-5" strokeWidth={1.75} />
                  {shortsItem.label}
                </button>
                <button
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
                    isMonetizeCreator ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <DollarSign className="w-5 h-5" strokeWidth={1.75} />
                  {monetizationItem.label}
                </button>
                {isNodeAdmin && (
                  <button
                    data-testid="nav-node-monetization-mobile"
                    onClick={() => go(nodeMonetizationItem.path)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                      isMonetizeNode ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                    )}
                  >
                    <DollarSign className="w-5 h-5" strokeWidth={1.75} />
                    {nodeMonetizationItem.label}
                  </button>
                )}
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
      </main>
    </div>
  );
}
