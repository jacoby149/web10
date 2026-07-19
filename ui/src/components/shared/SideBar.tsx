import { cn } from '@/lib/utils';

interface SideBarProps {
  I: Record<string, any>;
}

function SideBar({ I }: SideBarProps) {
  // Bug fix (design.md/B5): this used to be a literal string
  // `+ " style={{ borderColor: ... }}"` concatenated into className —
  // it did nothing (className isn't parsed for inline style syntax) and
  // the border/color never applied. Real Tailwind utilities now.
  const menuItemClass =
    'flex w-full items-center rounded border-b border-border px-4 py-2.5 text-left text-sm font-medium text-foreground transition-colors hover:bg-elevated cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  return (
    <div
      className={cn(
        'hidden flex-col justify-between overflow-hidden border-r border-border bg-surface transition-[width] duration-200 ease-out md:flex',
        I.menuCollapsed ? 'w-0' : 'w-[220px]',
      )}
      data-testid="sidebar"
    >
      <div>
        {I.isAuth ? (
          I.isAuthenticated() ? (
            <div className="px-2 py-2">
              <div className={menuItemClass} onClick={() => I.setMode("contracts")}>Contracts</div>
              <div className={menuItemClass} onClick={() => I.setMode("requests")}>Active Requests</div>
              <div className={menuItemClass} onClick={() => I.setMode("settings")}>Settings</div>
              <div className={menuItemClass} onClick={() => I.setMode("config")}>Node Config</div>
              <div className={menuItemClass} onClick={() => I.setMode("studio")}>Studio</div>
              <div
                className={cn(menuItemClass, 'text-warning underline')}
                onClick={() => I.logout()}
              >
                Log Out
              </div>
            </div>
          ) : (
            <div className="px-2 py-2">
              <div
                className={cn(menuItemClass, 'text-warning underline')}
                onClick={() => I.setMode("login")}
              >
                Log In
              </div>
            </div>
          )
        ) : (
          <div className="px-2 py-2">
            <div
              className={cn(menuItemClass, 'text-warning underline')}
              onClick={() => I.setMode("forgot")}
            >
              Forgot Password
            </div>
            <div className={menuItemClass} onClick={() => window.open("https://docs.web10.app", "_blank")}>SDK Docs</div>
            <div className={menuItemClass} onClick={() => window.open("https://github.com/jacoby149/web10", "_blank")}>Host A Node</div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="font-mono text-xs text-muted-foreground">
          Invented by{" "}
          <a href="https://jacobhoffman.xyz" className="underline hover:text-foreground">
            Jacob Hoffman
          </a>
          <br />
          <iframe
            className="mt-1.5"
            src="https://ghbtns.com/github-btn.html?user=jacoby149&repo=web10&type=star&count=true&size=large"
            frameBorder="0"
            scrolling="0"
            width="170"
            height="30"
            title="Star web10 on GitHub"
          />
        </div>
      </div>
    </div>
  );
}

export default SideBar;
