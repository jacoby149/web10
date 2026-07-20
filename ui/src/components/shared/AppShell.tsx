import TopBar from './TopBar';
import SideBar from './SideBar';
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

// The one console shell every authenticated page shares (design.md §9):
// a full-height fixed sidebar on desktop, a top bar over the content column
// only, and a bottom tab bar on mobile. Extracted from the wrapper that was
// copy-pasted into all five pages so the layout lives in exactly one place.
function AppShell({ I, children, maxWidth = 'max-w-4xl', testid, padded = true }: AppShellProps) {
  return (
    // h-screen + overflow-hidden keeps the sidebar and top bar fixed; only the
    // <main> content scrolls (its own scrollbar), instead of the whole page
    // (which stretched the sidebar down with long content).
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <SideBar I={I} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar I={I} />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {padded ? (
            <div className={cn('mx-auto p-4 sm:p-6', maxWidth)} data-testid={testid}>
              {children}
            </div>
          ) : (
            children
          )}
        </main>
      </div>
      <MobileNav I={I} />
    </div>
  );
}

export default AppShell;
