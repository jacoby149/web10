import { useNavigate, useLocation, Outlet } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Home, User, MessageSquare, PlusCircle, LogOut, Bug, Compass, Users, Store, Gamepad2, Radio, Zap, Clapperboard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getWapi } from '@/data/wapi';

interface LayoutProps {
  onLogout: () => void;
  onReportBug: () => void;
  children?: React.ReactNode;
}

const navItems = [
  { path: '/feed', icon: Home, label: 'Feed', testId: 'nav-feed' },
  { path: '/discover', icon: Compass, label: 'Discover', testId: 'nav-discover' },
  { path: '/profile', icon: User, label: 'Profile', testId: 'nav-profile' },
  { path: '/messages', icon: MessageSquare, label: 'Messages', testId: 'nav-messages' },
  { path: '/settings', icon: Settings, label: 'Settings', testId: 'nav-settings' },
];

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

  const isActive = (path: string) => {
    if (path === '/profile') return pathname.startsWith('/u/');
    return pathname === path;
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
          {navItems.map(({ path, icon: Icon, label, testId }) => {
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
          className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-md overflow-x-auto"
        >
          {navItems.map(({ path, icon: Icon, label, testId }) => {
            const target = path === '/profile' ? profilePath : path;
            return (
            <button
              key={path}
              data-testid={`${testId}-mobile`}
              aria-current={isActive(path) ? 'page' : undefined}
              aria-label={label}
              onClick={() => navigate(target)}
              className={cn(
                'flex-1 min-w-fit flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 transition-all duration-150 relative',
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
          {/* Mobile bottom bar shows only real destinations — the coming-
              soon items stay on the desktop sidebar (operator, 31.07.2026:
              "for the greyed out tabs, just dont even show them! the coming
              soon ones for mobile, looked great on the bottom bar before!
              … coming soon on desktop i actually really like, just dont
              like seeing them on mobile"). */}
          <button
            data-testid="report-bug-button-mobile"
            aria-label="Report a bug"
            onClick={onReportBug}
            className="flex-1 min-w-fit flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 text-muted-foreground transition-colors duration-150"
          >
            <Bug className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[0.625rem] font-medium uppercase tracking-wide">Help</span>
          </button>
        </nav>
      </main>
    </div>
  );
}