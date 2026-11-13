import { FileText, Inbox, Settings as SettingsIcon, SlidersHorizontal, Users, Activity } from 'lucide-react';
import DockGlass from './DockGlass';

interface MobileNavProps {
  I: Record<string, any>;
}

// Mobile bottom-nav shell (design.md §9) — desktop gets the fixed
// SideBar, mobile gets this. Same destinations as SideBar's authenticated
// menu; keep them in sync if that list changes.
const ITEMS = [
  { mode: 'contracts', label: 'App Contracts', compactLabel: 'Apps', icon: FileText },
  { mode: 'groups', label: 'Group Contracts', compactLabel: 'Groups', icon: Users },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'config', label: 'Config', icon: SlidersHorizontal, adminOnly: true },
  { mode: 'analytics', label: 'Analytics', icon: Activity, adminOnly: true },
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
      className="auth-mobile-dock fixed inset-x-3 z-40 mx-auto flex items-center p-2 md:hidden"
      aria-label="Console navigation"
      data-testid="mobile-nav"
    >
      <DockGlass />
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
            className="auth-dock-item relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium"
          >
            <ItemIcon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={1.5} />
            <span>{'compactLabel' in item ? item.compactLabel : label}</span>
          </button>
        );
      })}
    </nav>
  );
}

export default MobileNav;
