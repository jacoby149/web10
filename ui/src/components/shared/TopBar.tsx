import { Search as SearchIcon, Settings as GearIcon, LogOut } from 'lucide-react';
import Branding from './Branding';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface TopBarProps {
  I: Record<string, any>;
}

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
        active
          ? 'bg-brand-muted text-brand'
          : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function TopBar({ I }: TopBarProps) {
  const authed = I.isAuthenticated?.();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-surface px-4">
      {/* Brand only on mobile — desktop carries it in the sidebar */}
      <div className="md:hidden">
        <Branding I={I} size="sm" tagline={false} />
      </div>

      {authed && (
        // hidden on the smallest phones so it never collides with the mobile
        // brand mark; the bottom tab bar carries navigation there anyway
        <div className="relative hidden w-full max-w-xs flex-1 sm:block md:flex-none md:w-80">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            strokeWidth={1.5}
          />
          <Input
            className="h-9 pl-8"
            placeholder="Search contracts…"
            aria-label="Search"
            onChange={(e) => I.runSearch(e.target.value)}
            data-testid="topbar-search"
          />
        </div>
      )}

      {/* Settings + logout live in the sidebar on desktop; surface them here
          for mobile where the sidebar is hidden */}
      {authed && (
        <div className="ml-auto flex items-center gap-1 md:hidden">
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
    </header>
  );
}

export default TopBar;
