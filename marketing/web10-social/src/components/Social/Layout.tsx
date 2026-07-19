import { cn } from '@/lib/utils';
import { Home, User, MessageSquare, PlusCircle, LogOut, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Mode } from '@/types';

interface LayoutProps {
  mode: Mode;
  setMode: (m: Mode) => void;
  onLogout: () => void;
  onReportBug: () => void;
  children: React.ReactNode;
}

const navItems = [
  { mode: 'feed' as const, icon: Home, label: 'Feed', testId: 'nav-feed' },
  { mode: 'my-bio' as const, icon: User, label: 'Profile', testId: 'nav-profile' },
  { mode: 'chat' as const, icon: MessageSquare, label: 'Messages', testId: 'nav-messages' },
];

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <img src="/alternative.png" alt="" className="h-6 w-6 shrink-0" aria-hidden="true" />
      <span className="font-display text-lg font-bold tracking-tight text-foreground">
        web<span className="text-brand">10</span>
      </span>
    </span>
  );
}

export default function Layout({ mode, setMode, onLogout, onReportBug, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-surface">
        <div className="p-4">
          <Wordmark />
        </div>
        <nav className="flex-1 px-2 space-y-1" aria-label="Primary">
          {navItems.map(({ mode: m, icon: Icon, label, testId }) => (
            <button
              key={m}
              data-testid={testId}
              aria-current={mode === m ? 'page' : undefined}
              onClick={() => setMode(m)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-150',
                mode === m
                  ? 'bg-brand-muted text-brand-300'
                  : 'text-muted-foreground hover:text-foreground hover:bg-elevated',
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={1.75} />
              {label}
            </button>
          ))}
          <button
            data-testid="nav-new-post"
            onClick={() => setMode('feed')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded text-sm font-medium transition-colors duration-150 mt-4',
              'text-muted-foreground hover:text-foreground hover:bg-elevated',
            )}
          >
            <PlusCircle className="w-5 h-5" strokeWidth={1.75} />
            New post
          </button>
        </nav>
        <div className="p-4 border-t border-border space-y-1">
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

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-surface/95 backdrop-blur-md sticky top-0 z-20">
          <Wordmark />
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
        </header>

        <div className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</div>

        {/* Mobile bottom nav */}
        <nav
          aria-label="Primary"
          className="md:hidden fixed bottom-0 inset-x-0 z-20 flex items-stretch border-t border-border bg-surface/95 backdrop-blur-md"
        >
          {navItems.map(({ mode: m, icon: Icon, label, testId }) => (
            <button
              key={m}
              data-testid={`${testId}-mobile`}
              aria-current={mode === m ? 'page' : undefined}
              aria-label={label}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 transition-colors duration-150',
                mode === m ? 'text-brand' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" strokeWidth={mode === m ? 2 : 1.75} />
              <span className="text-[0.625rem] font-medium uppercase tracking-wide">{label}</span>
            </button>
          ))}
          <button
            data-testid="report-bug-button-mobile"
            aria-label="Report a bug"
            onClick={onReportBug}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 min-h-11 py-2.5 text-muted-foreground transition-colors duration-150"
          >
            <Bug className="w-5 h-5" strokeWidth={1.75} />
            <span className="text-[0.625rem] font-medium uppercase tracking-wide">Help</span>
          </button>
        </nav>
      </main>
    </div>
  );
}
