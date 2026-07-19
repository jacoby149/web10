interface SideBarProps {
  I: Record<string, any>;
}

function SideBar({ I }: SideBarProps) {
  const menuItemClass =
    "w-full px-4 py-2.5 text-left text-sm font-medium rounded-lg transition-colors border-b hover:bg-neutral-100 dark:hover:bg-neutral-800 cursor-pointer flex items-center"
    + " style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}";

  return (
    <div
      className="flex flex-col justify-between"
      style={{
        width: I.menuCollapsed ? "0" : "220px",
        borderRight: `1px solid var(--color-border)`,
        overflow: "hidden",
        transition: "width 0.2s ease",
      }}
    >
      <div>
        {I.isAuth ? (
          I.isAuthenticated() ? (
            <div className="px-2">
              <div className={menuItemClass} onClick={() => I.setMode("contracts")}>Contracts</div>
              <div className={menuItemClass} onClick={() => I.setMode("requests")}>Active Requests</div>
              <div className={menuItemClass} onClick={() => I.setMode("settings")}>Settings</div>
              <div className={menuItemClass} onClick={() => I.setMode("config")}>Node Config</div>
              <div className={menuItemClass} onClick={() => I.setMode("studio")}>Studio</div>
              <div
                className={menuItemClass}
                onClick={() => I.logout()}
                style={{ color: "var(--color-warning)" }}
              >
                <u>Log Out</u>
              </div>
            </div>
          ) : (
            <div className="px-2">
              <div
                className={menuItemClass}
                onClick={() => I.setMode("login")}
                style={{ color: "var(--color-warning)" }}
              >
                <u>Log In</u>
              </div>
            </div>
          )
        ) : (
          <div className="px-2">
            <div
              className={menuItemClass}
              onClick={() => I.setMode("forgot")}
              style={{ color: "var(--color-warning)" }}
            >
              <u>Forgot Password</u>
            </div>
            <div className={menuItemClass} onClick={() => window.open("https://docs.web10.app", "_blank")}>SDK Docs</div>
            <div className={menuItemClass} onClick={() => window.open("https://github.com/jacoby149/web10", "_blank")}>Host A Node</div>
          </div>
        )}
      </div>

      <div className="p-4" style={{ borderTop: "1px solid var(--color-border)" }}>
        <div className="text-xs" style={{ fontFamily: "var(--font-mono)", color: 'var(--color-text-secondary)' }}>
          Invented by{" "}
          <a href="https://jacobhoffman.xyz" className="underline hover:opacity-80">
            Jacob Hoffman
          </a>
          <br />
          <iframe
            src="https://ghbtns.com/github-btn.html?user=jacoby149&repo=web10&type=star&count=true&size=large"
            frameBorder="0"
            scrolling="0"
            width="170"
            height="30"
            title="GitHub"
            style={{ marginTop: "5px" }}
          />
        </div>
      </div>
    </div>
  );
}

export default SideBar;