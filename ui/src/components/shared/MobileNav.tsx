import { FileText, Inbox, Settings as SettingsIcon, SlidersHorizontal, Users, Activity } from 'lucide-react';
import DockGlass from './DockGlass';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  I: Record<string, any>;
  placement?: 'dock' | 'header';
}

const ITEMS = [
  { mode: 'contracts', label: 'App permissions', compactLabel: 'Apps', icon: FileText },
  { mode: 'groups', label: 'Group permissions', compactLabel: 'Groups', icon: Users },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'config', label: 'Config', icon: SlidersHorizontal, adminOnly: true },
  { mode: 'analytics', label: 'Analytics', icon: Activity, adminOnly: true },
  { mode: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

function MobileNav({ I, placement = 'dock' }: MobileNavProps) {
  // show whenever the user is authenticated — previously also required the
  // `?auth` query param (I.isAuth), so the bottom nav never appeared on a
  // normal visit and mobile users had no navigation at all.
  if (!I.isAuthenticated?.()) return null;

  const items = ITEMS.filter((item) => !('adminOnly' in item && item.adminOnly) || I.isAdmin);
  const dock = placement === 'dock';

  return (
    <nav
      className={dock
        ? 'auth-mobile-dock fixed inset-x-3 z-40 mx-auto flex items-center p-2 md:hidden'
        : 'mx-auto hidden items-center gap-1 md:flex'}
      aria-label="Console navigation"
      data-testid={dock ? 'mobile-nav' : 'hub-top-nav'}
    >
      {dock && <DockGlass />}
      {items.map((item) => {
        const { mode, label, icon: ItemIcon } = item;
        const active = I.mode === mode;
        return (
          <button
            key={mode}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => I.setMode(mode)}
            aria-current={active ? 'page' : undefined}
            className={dock
              ? 'auth-dock-item relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium'
              : cn(
                  'inline-flex h-11 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-sm font-medium text-hub-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hub-ink lg:px-3',
                  active ? 'bg-hub-tint-hover ring-1 ring-inset ring-hub-ink/25 forced-colors:border' : 'hover:bg-hub-tint',
                )}
          >
            <ItemIcon aria-hidden="true" className={dock ? 'h-5 w-5 shrink-0' : 'size-4 shrink-0'} strokeWidth={1.5} />
            <span>{'compactLabel' in item ? item.compactLabel : label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default MobileNav;
