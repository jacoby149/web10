import { Search as SearchIcon } from 'lucide-react';
import Branding from "./Branding";
import { Icon } from "./Icon";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface TopBarProps {
  I: Record<string, any>;
}

function AppsButton({ I }: { I: Record<string, any> }) {
  return (
    <Button variant="brand" size="sm" onClick={() => I.setMode("appstore")} data-testid="topbar-apps-button">
      Apps
    </Button>
  );
}

function TopBar({ I }: TopBarProps) {
  return (
    <div className="flex h-14 items-center justify-between gap-2 border-b border-border bg-surface px-4">
      <Branding I={I} />

      <div className="hidden items-center gap-1 sm:flex">
        <Icon onClick={I.toggleMenuCollapsed} label="Toggle menu">bars</Icon>
        <Icon onClick={I.toggleTheme} label="Toggle theme">moon</Icon>
      </div>

      <div className="relative mx-2 max-w-[300px] flex-1">
        <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
        <Input
          className="pl-8"
          placeholder="Search…"
          aria-label="Search"
          onChange={(e) => I.runSearch(e.target.value)}
          data-testid="topbar-search"
        />
      </div>

      <div className="flex items-center gap-2">
        {I.isAuthenticated() ? (
          I.mode === "settings" ? (
            <AppsButton I={I} />
          ) : (
            <Icon onClick={() => I.setMode("settings")} label="Settings">gear</Icon>
          )
        ) : I.mode === "appstore" ? (
          I.isAuth ? null : (
            <Button variant="brand" size="sm" onClick={() => I.setMode("login")}>
              Log In
            </Button>
          )
        ) : (
          <AppsButton I={I} />
        )}
      </div>
    </div>
  );
}

export default TopBar;
