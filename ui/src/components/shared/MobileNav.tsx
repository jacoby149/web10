import { FileText, Inbox, Settings as SettingsIcon, SlidersHorizontal, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  I: Record<string, any>;
}

// Mobile bottom-nav shell (design.md §9) — desktop gets the fixed
// SideBar, mobile gets this. Same destinations as SideBar's authenticated
// menu; keep them in sync if that list changes.
const ITEMS = [
  { mode: 'contracts', label: 'Contracts', icon: FileText },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'studio', label: 'Studio', icon: LineChart },
  { mode: 'config', label: 'Config', icon: SlidersHorizontal, adminOnly: true },
  { mode: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

function MobileNav({ I }: MobileNavProps) {
  // show whenever the user is authenticated — previously also required the
  // `?auth` query param (I.isAuth), so the bottom nav never appeared on a
  // normal visit and mobile users had no navigation at all.
  if (!I.isAuthenticated?.()) return null;

  const items = ITEMS.filter((item) => !('adminOnly' in item && item.adminOnly) || I.isAdmin);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 flex items-center border-t border-border bg-surface md:hidden"
      data-testid="mobile-nav"
    >
      {items.map(({ mode, label, icon: ItemIcon }) => {
        const active = I.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => I.setMode(mode)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'text-brand' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ItemIcon className="h-5 w-5" strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </nav>
  );
}

export default MobileNav;
