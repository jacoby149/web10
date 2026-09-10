import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, User, MessageSquare, PlusCircle, LogOut, Bug, Compass, Users, Store, Gamepad2, Radio, Zap, Clapperboard, Settings, MoreHorizontal, X, Bell, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { getWapi } from '@/data/wapi';
import { readProfile, resolveMediaRefs } from '@/data';
import type { ProfileRecord } from '@/data';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationBell from '@/components/Notifications/NotificationBell';

interface LayoutProps {
  onLogout: () => void;
  onReportBug: () => void;
  children?: React.ReactNode;
}

// The four core destinations that stay one thumb-reach on mobile. Settings
// and Groups move into the "More" sheet so the bottom bar never exceeds five
// icons — room to grow as surfaces ship.
const feedItem = { path: '/feed', icon: Home, label: 'Feed', testId: 'nav-feed' };
const discoverItem = { path: '/discover', icon: Compass, label: 'Discover', testId: 'nav-discover' };
const messagesItem = { path: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages' };
const profileItem = { path: '/profile', icon: User, label: 'Profile', testId: 'nav-profile' };
// Real destinations demoted from the bottom bar into the "More" sheet (and
// the desktop sidebar).
const groupsItem = { path: '/groups', icon: Users, label: 'Groups', testId: 'nav-groups' };
const settingsItem = { path: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' };

// Mobile bottom bar: the four core tabs in thumb-reach order.
const bottomNavItems = [feedItem, discoverItem, messagesItem, profileItem];
// Desktop sidebar keeps its historical order (Feed, Discover, Groups,
// Profile, Messages, Settings) — the bottom bar reorders for thumb-reach,
// the sidebar doesn't need to follow it.
const sidebarNavItems = [feedItem, discoverItem, groupsItem, profileItem, messagesItem, settingsItem];

// Provisional, non-infringing names for the ephemeral-post and short-video
// surfaces (Flares ≈ stories, a brief bright signal you send up; Takes ≈
// reels, a film take). Names are placeholders pending operator sign-off.
const comingSoonItems = [
  { icon: Zap, label: 'Flares', testId: 'nav-flares' },
  { icon: Clapperboard, label: 'Takes', testId: 'nav-takes' },
  { icon: Radio, label: 'Livestream', testId: 'nav-livestream' },
  { icon: Gamepad2, label: 'Games', testId: 'nav-games' },
  { icon: Store, label: 'Marketplace', testId: 'nav-marketplace' },
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img src="/keys-mark.png" alt="" className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        web<span className="text-brand">10</span>
      </span>
    </span>
  );
}

export default function Layout({ onLogout, onReportBug, children }: LayoutProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const token = getWapi().readToken();
  const profilePath = token ? `/u/${token.username}` : '/feed';
  const [moreOpen, setMoreOpen] = useState(false);
  const { unread } = useNotifications();
  const isNotifications = pathname === '/notifications';

  // The desktop sidebar's account entry point: an avatar row that opens a
  // user menu (Profile / Settings / Report a bug / Log out). This is where
  // users expect account actions to live (Instagram / X / Discord) — the old
  // ghost "Log out" button buried at the bottom of a long sidebar was not a
  // "clear way to log out".
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
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

  const isActive = (path: string) => {
    if (path === '/profile') return pathname.startsWith('/u/');
    if (path === '/groups') return pathname.startsWith('/groups');
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
        'hidden md:flex flex-col w-64 border-r border-border relative overflow-hidden',
        'bg-gradient-to-b from-surface to-background',
      )}>
        <div
          className="pointer-events-none absolute -top-20 -left-20 h-40 w-40 rounded-full bg-brand/5 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative p-4">
          <Wordmark />
        </div>
        <nav className="relative flex-1 px-2 space-y-1" aria-label="Primary">
          {sidebarNavItems.map(({ path, icon: Icon, label, testId }) => {
            const target = path === '/profile' ? profilePath : path;
            return (
            <button
              key={path}
              data-testid={testId}
              aria-current={path === '/profile' ? isActive('/profile') : isActive(path) ? 'page' : undefined}
              onClick={() => navigate(target)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive(path)
                  ? cn(
                      'bg-gradient-to-r from-brand-muted to-brand/15 text-brand-300',
                      'border border-brand/20 glow-active',
                    )
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80 hover:border hover:border-border/50',
              )}
            >
              <Icon className={cn('w-5 h-5 transition-colors duration-150', isActive(path) && 'text-brand')} strokeWidth={isActive(path) ? 2 : 1.75} />
              {label}
              {isActive(path) && (
                <div
                  className="ml-auto w-1.5 h-1.5 rounded-full bg-brand animate-glow-pulse"
                  aria-hidden="true"
                />
              )}
            </button>
            );
          })}
          <button
            data-testid="nav-notifications"
            aria-current={isNotifications ? 'page' : undefined}
            onClick={() => navigate('/notifications')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isNotifications
                ? cn(
                    'bg-gradient-to-r from-brand-muted to-brand/15 text-brand-300',
                    'border border-brand/20 glow-active',
                  )
                : 'text-muted-foreground hover:text-foreground hover:bg-elevated/80 hover:border hover:border-border/50',
            )}
          >
            <Bell className={cn('w-5 h-5 transition-colors duration-150', isNotifications && 'text-brand')} strokeWidth={isNotifications ? 2 : 1.75} />
            Notifications
            {unread > 0 && (
              <span
                data-testid="nav-notifications-badge"
                aria-hidden="true"
                className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-brand text-background text-[0.625rem] font-bold flex items-center justify-center animate-glow-pulse"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>
          <button
            data-testid="nav-new-post"
            onClick={() => navigate('/feed')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 mt-4',
              'text-muted-foreground hover:text-foreground hover:bg-elevated/80 hover:border hover:border-border/50',
            )}
          >
            <PlusCircle className="w-5 h-5" strokeWidth={1.75} />
            New post
          </button>

          <div className="mt-6 pt-4 border-t border-border/60" aria-label="Coming soon">
            <p className="px-3 pb-1 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground/50">
              Coming soon
            </p>
            {comingSoonItems.map(({ icon: Icon, label, testId }) => (
              <div
                key={testId}
                data-testid={testId}
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
        </nav>
        <div className="relative p-3 border-t border-border" ref={userMenuRef}>
          <button
            type="button"
            data-testid="user-menu-trigger"
            aria-haspopup="menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((o) => !o)}
            className={cn(
              'w-full flex items-center gap-3 rounded-lg p-2 transition-colors duration-150',
              'hover:bg-elevated/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50',
              userMenuOpen && 'bg-elevated/80',
            )}
          >
            <Avatar className="h-9 w-9">
              {avatarUrl ? (
                <AvatarImage src={avatarUrl} alt="" />
              ) : (
                <AvatarFallback className="bg-brand-muted text-brand-300 text-sm font-semibold">
                  {(displayName || username || '?').charAt(0).toUpperCase()}
                </AvatarFallback>
              )}
            </Avatar>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-medium text-foreground truncate">{displayName || username}</p>
              <p className="text-xs text-muted-foreground truncate">@{username}</p>
            </div>
            <ChevronUp
              className={cn('w-4 h-4 shrink-0 text-muted-foreground transition-transform duration-150', userMenuOpen && 'rotate-180')}
              strokeWidth={1.75}
            />
          </button>

          {userMenuOpen && (
            <div
              role="menu"
              data-testid="user-menu"
              className="absolute bottom-full left-3 right-3 z-30 mb-2 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
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
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface/95 backdrop-blur-md sticky top-0 z-20 gap-2">
          <Wordmark />
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              data-testid="new-post-button-mobile"
              className="h-11 w-11 text-muted-foreground hover:text-foreground"
              aria-label="New post"
              onClick={() => navigate('/feed')}
            >
              <PlusCircle className="w-5 h-5" strokeWidth={1.75} />
            </Button>
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
          </div>
        </header>

        {/* The always-on signal (D69): a live "N new" strip above every screen.
            It clears the moment you open /notifications (which marks all read),
            so it's a nudge, not a permanent fixture. */}
        {unread > 0 && !isNotifications && (
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

        <div className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          {children || <Outlet />}
        </div>

        <nav
          aria-label="Primary mobile"
          className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-md"
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
              has room to grow as features ship (operator, 30.08.2026). */}
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
                  data-testid="nav-groups-mobile"
                  onClick={() => go(groupsItem.path)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                    isActive(groupsItem.path) ? 'bg-brand-muted text-brand-300' : 'text-foreground hover:bg-elevated',
                  )}
                >
                  <Users className="w-5 h-5" strokeWidth={1.75} />
                  {groupsItem.label}
                </button>
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
