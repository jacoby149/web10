import { useState } from 'react';
import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, User, MessageSquare, PlusCircle, LogOut, Bug, Compass, Users, Store, Gamepad2, Radio, Zap, Clapperboard, Settings, MoreHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getWapi } from '@/data/wapi';

interface LayoutProps {
  onLogout: () => void;
  onReportBug: () => void;
  children?: React.ReactNode;
}

// The four core destinations that stay one thumb-reach on mobile. Settings
// moves into the "More" sheet so the bottom bar never exceeds five icons —
// room to grow as surfaces ship.
const feedItem = { path: '/feed', icon: Home, label: 'Feed', testId: 'nav-feed' };
const discoverItem = { path: '/discover', icon: Compass, label: 'Discover', testId: 'nav-discover' };
const messagesItem = { path: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages' };
const profileItem = { path: '/profile', icon: User, label: 'Profile', testId: 'nav-profile' };
// The fifth real destination, demoted from the bottom bar into the "More"
// sheet (and the desktop sidebar).
const settingsItem = { path: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' };

// Mobile bottom bar: the four core tabs in thumb-reach order.
const bottomNavItems = [feedItem, discoverItem, messagesItem, profileItem];
// Desktop sidebar keeps its historical order (Feed, Discover, Profile,
// Messages, Settings) — the bottom bar reorders for thumb-reach, the sidebar
// doesn't need to follow it.
const sidebarNavItems = [feedItem, discoverItem, profileItem, messagesItem, settingsItem];

// Provisional, non-infringing names for the ephemeral-post and short-video
// surfaces (Flares ≈ stories, a brief bright signal you send up; Takes ≈
// reels, a film take). Names are placeholders pending operator sign-off.
const comingSoonItems = [
  { icon: Zap, label: 'Flares', testId: 'nav-flares' },
  { icon: Clapperboard, label: 'Takes', testId: 'nav-takes' },
  { icon: Radio, label: 'Livestream', testId: 'nav-livestream' },
  { icon: Gamepad2, label: 'Games', testId: 'nav-games' },
  { icon: Users, label: 'Groups', testId: 'nav-groups' },
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

  const isActive = (path: string) => {
    if (path === '/profile') return pathname.startsWith('/u/');
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
        <div className="relative p-4 border-t border-border space-y-1">
          <Button
            variant="ghost"
            data-testid="report-bug-button"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={onReportBug}
          >
            <Bug className="w-5 h-5" strokeWidth={1.75} />
            Report a bug
          </Button>
          <Button
            variant="ghost"
            data-testid="logout-button"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-5 h-5" strokeWidth={1.75} />
            Log out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface/95 backdrop-blur-md sticky top-0 z-20 gap-2">
          <Wordmark />
          <div className="flex items-center gap-1">
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
