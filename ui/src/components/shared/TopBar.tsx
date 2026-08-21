import * as React from 'react';
import { Search as SearchIcon, Settings as GearIcon, LogOut, UserRound, ChevronDown } from 'lucide-react';
import Branding from './Branding';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TopBarProps {
  I: Record<string, any>;
}

// Account chip → a small menu (Settings / Log out). Previously the chip was an
// inert div that lit up on hover but did nothing — a dead affordance.
function AccountMenu({ I, username }: { I: Record<string, any>; username: string }) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const item =
    'flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div className="relative hidden md:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        data-testid="topbar-account"
        className="flex items-center gap-2 rounded-full border border-border bg-elevated py-1 pl-1 pr-2.5 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-muted">
          <UserRound className="h-3.5 w-3.5 text-brand-300" strokeWidth={2} />
        </span>
        <span className="max-w-[10rem] truncate text-sm font-medium text-foreground" data-testid="topbar-username">
          {username}
        </span>
        <ChevronDown className={cn('h-3.5 w-3.5 text-muted-foreground transition-transform', open && 'rotate-180')} strokeWidth={1.5} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-48 rounded-lg border border-border bg-popover p-1 shadow-[0_8px_30px_rgb(0_0_0/0.35)]"
        >
          <div className="border-b border-border px-2.5 py-2">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">Signed in as</p>
            <p className="truncate text-sm font-medium text-foreground">{username}</p>
          </div>
          <div className="pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); I.setMode('settings'); }}
              className={cn(item, 'text-foreground hover:bg-elevated')}
              data-testid="account-settings"
            >
              <GearIcon className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
              Settings
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); I.logout(); }}
              className={cn(item, 'text-muted-foreground hover:bg-danger-muted hover:text-danger')}
              data-testid="account-logout"
            >
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const TITLES: Record<string, string> = {
  contracts: 'App Contracts',
  groups: 'Group Contracts',
  requests: 'Requests',
  studio: 'Studio',
  config: 'Node Config',
  settings: 'Settings',
};

// search applies to the list views only
const SEARCHABLE = new Set(['contracts', 'requests']);

function IconButton({
  onClick,
  label,
  active,
  testid,
  children,
}: {
  onClick: () => void;
  label: string;
  active?: boolean;
  testid?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testid}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active ? 'bg-brand-muted text-brand' : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TopBar({ I }: TopBarProps) {
  const authed = I.isAuthenticated?.();
  const username = I.v3?.readToken?.()?.username as string | undefined;
  const showSearch = authed && SEARCHABLE.has(I.mode);

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-surface px-4">
      {/* LEFT — brand on mobile, page title on desktop */}
      <div className="flex shrink-0 items-center">
        <div className="md:hidden">
          <Branding I={I} size="sm" tagline={false} />
        </div>
        {authed && (
          <h1 className="hidden font-display text-base font-semibold text-foreground md:block">
            {TITLES[I.mode] ?? 'web10'}
          </h1>
        )}
      </div>

      {/* CENTER — search, centered in the available space */}
      <div className="flex flex-1 justify-center">
        {showSearch && (
          <div className="relative hidden w-full max-w-md sm:block">
            <SearchIcon
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              strokeWidth={1.5}
            />
            <Input
              className="h-9 pl-9"
              placeholder={`Search ${I.mode}…`}
              aria-label={`Search ${I.mode}`}
              value={I.search ?? ''}
              onChange={(e) => I.runSearch(e.target.value)}
              data-testid="topbar-search"
            />
          </div>
        )}
      </div>

      {/* RIGHT — account menu (desktop) / settings + logout (mobile) */}
      <div className="flex shrink-0 items-center gap-2">
        {authed && username && <AccountMenu I={I} username={username} />}
        {authed && (
          <div className="flex items-center gap-1 md:hidden">
            <IconButton
              onClick={() => I.setMode('settings')}
              label="Settings"
              active={I.mode === 'settings'}
              testid="topbar-settings"
            >
              <GearIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </IconButton>
            <IconButton onClick={() => I.logout()} label="Log out" testid="topbar-logout">
              <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} />
            </IconButton>
          </div>
        )}
      </div>
    </header>
  );
}

export default TopBar;
