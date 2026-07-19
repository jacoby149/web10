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
  { mode: 'feed' as const, icon: Home, label: 'Feed' },
  { mode: 'my-bio' as const, icon: User, label: 'Profile' },
  { mode: 'chat' as const, icon: MessageSquare, label: 'Messages' },
];

export default function Layout({ mode, setMode, onLogout, onReportBug, children }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar - desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-border bg-card">
        <div className="p-4">
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            web<span className="text-brand">10</span>
          </h1>
        </div>
        <nav className="flex-1 px-2 space-y-1">
          {navItems.map(({ mode: m, icon: Icon, label }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                mode === m
                  ? 'bg-brand/10 text-brand'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
              )}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
          <button
            onClick={() => setMode('feed')}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-4',
              'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
            )}
          >
            <PlusCircle className="w-5 h-5" />
            New Post
          </button>
        </nav>
        <div className="p-4 border-t border-border space-y-1">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={onReportBug}
          >
            <Bug className="w-5 h-5" />
            Report a bug
          </Button>
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-foreground"
            onClick={onLogout}
          >
            <LogOut className="w-5 h-5" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <h1 className="text-lg font-bold tracking-tight text-foreground">
            web<span className="text-brand">10</span>
          </h1>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        <div className="flex-1 overflow-y-auto">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden flex items-center border-t border-border bg-card">
          {navItems.map(({ mode: m, icon: Icon }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                'flex-1 flex flex-col items-center py-2 transition-colors',
                mode === m ? 'text-brand' : 'text-muted-foreground',
              )}
            >
              <Icon className="w-5 h-5" />
            </button>
          ))}
        </nav>
      </main>
    </div>
  );
}