import {
  FileText,
  Inbox,
  LineChart,
  SlidersHorizontal,
  Settings as SettingsIcon,
  LogOut,
  BookOpen,
  Store,
  Sparkles,
  KeyRound,
  ExternalLink,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import Branding from './Branding';
import { WEB10_HOME, WEB10_DOCS, WEB10_APP_STORE } from '@/lib/links';

interface SideBarProps {
  I: Record<string, any>;
}

// The authenticated console destinations. MobileNav mirrors this list —
// keep the two in sync (design.md §9: desktop sidebar, mobile bottom tabs).
export const NAV_ITEMS: { mode: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { mode: 'contracts', label: 'Contracts', icon: FileText },
  { mode: 'requests', label: 'Requests', icon: Inbox },
  { mode: 'studio', label: 'Studio', icon: LineChart },
  { mode: 'config', label: 'Node Config', icon: SlidersHorizontal, adminOnly: true },
];

// The wider web10 ecosystem — the console self-references out to the product.
export const ECOSYSTEM: { label: string; icon: LucideIcon; href: string }[] = [
  { label: 'What is web10', icon: Sparkles, href: WEB10_HOME },
  { label: 'App Store', icon: Store, href: WEB10_APP_STORE },
  { label: 'Docs', icon: BookOpen, href: WEB10_DOCS },
];

function NavItem({
  active,
  label,
  icon: ItemIcon,
  onClick,
  testid,
  tone = 'default',
  external = false,
}: {
  active?: boolean;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  testid?: string;
  tone?: 'default' | 'danger';
  external?: boolean;
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
        className={cn('h-[18px] w-[18px] shrink-0 transition-colors', active ? 'text-brand' : 'text-current')}
        strokeWidth={1.5}
      />
      <span className="flex-1 truncate">{label}</span>
      {external && (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" strokeWidth={1.5} />
      )}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {children}
    </p>
  );
}

function SideBar({ I }: SideBarProps) {
  const authed = I.isAuthenticated?.();
  const navItems = NAV_ITEMS.filter((item) => !item.adminOnly || I.isAdmin);

  return (
    <aside
      className="hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex"
      data-testid="sidebar"
    >
      <div className="border-b border-border px-6 py-5">
        <button
          type="button"
          onClick={() => I.setMode(authed ? 'contracts' : 'login')}
          className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="web10 home"
        >
          <Branding I={I} size="sm" tagline={false} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {authed ? (
          <div className="space-y-1">
            {navItems.map(({ mode, label, icon }) => (
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
          </div>
        )}

        <SectionLabel>Ecosystem</SectionLabel>
        <div className="space-y-1">
          {ECOSYSTEM.map(({ label, icon, href }) => (
            <NavItem
              key={label}
              label={label}
              icon={icon}
              external
              onClick={() => window.open(href, '_blank', 'noopener')}
              testid={`sidebar-eco-${label.toLowerCase().replace(/\s+/g, '-')}`}
            />
          ))}
        </div>
      </nav>

      {authed && (
        <div className="space-y-1 border-t border-border px-3 py-3">
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

      <div className="border-t border-border px-6 py-3">
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
