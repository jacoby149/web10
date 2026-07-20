import {
  FileText,
  Inbox,
  LineChart,
  SlidersHorizontal,
  Settings as SettingsIcon,
  LogOut,
  BookOpen,
  Server,
  KeyRound,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Branding from './Branding';

interface SideBarProps {
  I: Record<string, any>;
}

// The authenticated console destinations. MobileNav mirrors this list —
// keep the two in sync (design.md §9: desktop sidebar, mobile bottom tabs).
export const NAV_ITEMS: { mode: string; label: string; icon: LucideIcon }[] = [
  { mode: 'contracts', label: 'Contracts', icon: FileText },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'studio', label: 'Studio', icon: LineChart },
  { mode: 'config', label: 'Node Config', icon: SlidersHorizontal },
];

function NavItem({
  active,
  label,
  icon: ItemIcon,
  onClick,
  testid,
  tone = 'default',
}: {
  active?: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  testid?: string;
  tone?: 'default' | 'danger';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      data-testid={testid}
      className={cn(
        'group flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'bg-brand-muted text-foreground'
          : tone === 'danger'
            ? 'text-muted-foreground hover:bg-danger-muted hover:text-danger'
            : 'text-muted-foreground hover:bg-elevated hover:text-foreground',
      )}
    >
      <ItemIcon
        className={cn(
          'h-[18px] w-[18px] shrink-0 transition-colors',
          active ? 'text-brand' : 'text-current',
        )}
        strokeWidth={1.5}
      />
      {label}
    </button>
  );
}

function SideBar({ I }: SideBarProps) {
  const authed = I.isAuthenticated?.();

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex"
      data-testid="sidebar"
    >
      <div className="border-b border-border px-4 py-4">
        <button
          type="button"
          onClick={() => I.setMode(authed ? 'contracts' : 'login')}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="web10 home"
        >
          <Branding I={I} size="sm" tagline={false} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto p-3">
        {authed ? (
          <div className="space-y-1">
            {NAV_ITEMS.map(({ mode, label, icon }) => (
              <NavItem
                key={mode}
                active={I.mode === mode}
                label={label}
                icon={icon}
                onClick={() => I.setMode(mode)}
                testid={`sidebar-nav-${mode}`}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <NavItem
              active={I.mode === 'login'}
              label="Log in"
              icon={KeyRound}
              onClick={() => I.setMode('login')}
              testid="sidebar-login"
            />
            <NavItem
              label="Forgot password"
              icon={KeyRound}
              onClick={() => I.setMode('forgot')}
              testid="sidebar-forgot"
            />
            <NavItem
              label="SDK Docs"
              icon={BookOpen}
              onClick={() => window.open('https://docs.web10.app', '_blank')}
            />
            <NavItem
              label="Host a node"
              icon={Server}
              onClick={() => window.open('https://github.com/jacoby149/web10', '_blank')}
            />
          </div>
        )}
      </nav>

      {authed && (
        <div className="space-y-1 border-t border-border p-3">
          <NavItem
            active={I.mode === 'settings'}
            label="Settings"
            icon={SettingsIcon}
            onClick={() => I.setMode('settings')}
            testid="sidebar-nav-settings"
          />
          <NavItem
            label="Log out"
            icon={LogOut}
            tone="danger"
            onClick={() => I.logout()}
            testid="sidebar-logout"
          />
        </div>
      )}

      <div className="border-t border-border px-4 py-3">
        <p className="font-mono text-xs leading-relaxed text-muted-foreground">
          Invented by{' '}
          <a
            href="https://jacobhoffman.xyz"
            className="rounded underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Jacob Hoffman
          </a>
        </p>
      </div>
    </aside>
  );
}

export default SideBar;
