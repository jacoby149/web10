import TopBar from './TopBar';
import MobileNav from './MobileNav';
import { cn } from '@/lib/utils';

interface AppShellProps {
  I: Record<string, any>;
  children: React.ReactNode;
  // content column max-width utility (e.g. "max-w-4xl")
  maxWidth?: string;
  // data-testid on the padded content container
  testid?: string;
  // false = render children flush; the page owns its own padding/testids
  padded?: boolean;
}

// Only the content scrolls; desktop navigation and the phone dock stay in reach.
function AppShell({ I, children, maxWidth = 'max-w-4xl', testid, padded = true }: AppShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <TopBar I={I} />
      <main className={cn('min-h-0 flex-1 overflow-y-auto', I.isAuthenticated?.() && 'auth-dock-clearance')} data-testid="console-content">
        {padded ? (
          <div className={cn('mx-auto p-4 sm:p-6', maxWidth)} data-testid={testid}>
            {children}
          </div>
        ) : children}
      </main>
      <MobileNav I={I} />
    </div>
  );
}

export default AppShell;
