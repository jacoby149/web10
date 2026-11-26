import { useEffect, useId, useRef, useState } from 'react';
import { FileText, Inbox, Settings as SettingsIcon, SlidersHorizontal, Users, Activity, BookOpen, ExternalLink, Ellipsis, Sparkles, Store } from 'lucide-react';
import DockGlass from './DockGlass';
import { cn } from '@/lib/utils';

interface MobileNavProps {
  I: Record<string, any>;
  placement?: 'dock' | 'sidebar';
}

const ITEMS = [
  { mode: 'contracts', label: 'App permissions', compactLabel: 'Apps', icon: FileText },
  { mode: 'groups', label: 'Group permissions', compactLabel: 'Groups', icon: Users },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'config', label: 'Config', icon: SlidersHorizontal, adminOnly: true },
  { mode: 'analytics', label: 'Analytics', icon: Activity, adminOnly: true },
  { mode: 'settings', label: 'Settings', icon: SettingsIcon },
] as const;

const SIDEBAR_ITEM = 'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const DOCK_ITEM = 'auth-dock-item relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium';
const ECOSYSTEM_LINKS = [
  { label: 'What is web10', href: 'https://web10.app', icon: Sparkles },
  { label: 'App Store', href: 'https://web10.app/app-store', icon: Store },
  { label: 'Docs', href: 'https://web10.app/docs', icon: BookOpen },
] as const;

function HubMore({ dock }: { dock: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  return (
    <div ref={root} className={cn('relative', dock && 'z-10 min-w-0 flex-1')} onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }} onKeyDown={event => {
      if (!open || event.key !== 'Escape') return;
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }}>
      <button ref={trigger} type="button" aria-expanded={open} aria-controls={panelId}
        onClick={() => setOpen(value => !value)} className={cn(dock ? `${DOCK_ITEM} w-full` : SIDEBAR_ITEM, open && 'bg-elevated text-foreground')}>
        <Ellipsis aria-hidden="true" className={dock ? 'size-5' : 'size-4'} />
        <span>More…</span>
      </button>
      <ul id={panelId} hidden={!open}
        className={cn('rounded-lg border border-border bg-popover p-1 text-popover-foreground',
          dock ? 'absolute bottom-full right-0 z-50 mb-3 w-48 shadow-lg' : 'mt-1')}>
        {ECOSYSTEM_LINKS.map(({ label, href, icon: Icon }) => (
          <li key={href}>
            <a href={href} target="_blank" rel="noopener noreferrer"
              onClick={() => { setOpen(false); trigger.current?.focus(); }}
              className="flex min-h-11 items-center gap-2 rounded px-2 text-sm font-medium hover:bg-elevated focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
              <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.5} />
              <span className="flex-1">{label}</span>
              <ExternalLink aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
              <span className="sr-only">(opens in a new tab)</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

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
        : 'space-y-1 p-3'}
      aria-label="Console navigation"
      data-testid={dock ? 'mobile-nav' : 'hub-sidebar-nav'}
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
              ? DOCK_ITEM
              : cn(
                  SIDEBAR_ITEM,
                  active && 'bg-brand-muted text-brand-300 ring-1 ring-inset ring-brand/30 forced-colors:border',
                )}
          >
            <ItemIcon aria-hidden="true" className={dock ? 'h-5 w-5 shrink-0' : 'size-4 shrink-0'} strokeWidth={1.5} />
            <span>{dock && 'compactLabel' in item ? item.compactLabel : label}</span>
          </button>
        );
      })}
      <HubMore dock={dock} />
    </nav>
  );
}

export default MobileNav;
