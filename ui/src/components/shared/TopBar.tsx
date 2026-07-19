import Branding from "./Branding";
import { Icon } from "./Icon";
import { Search } from '@chatscope/chat-ui-kit-react';
import '@chatscope/chat-ui-kit-styles/dist/default/styles.min.css';

interface TopBarProps {
  I: Record<string, any>;
}

function AppsButton({ I }: { I: Record<string, any> }) {
  return (
    <button
      className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
      style={{ backgroundColor: 'var(--color-info)' }}
      onClick={() => I.setMode("appstore")}
    >
      Apps
    </button>
  );
}

function TopBar({ I }: TopBarProps) {
  return (
    <div
      className="flex items-center justify-between px-4 border-b"
      style={{ height: "55px", borderColor: 'var(--color-border)' }}
    >
      <Branding I={I} />

      <div className="flex items-center gap-2">
        <Icon onClick={I.toggleMenuCollapsed}>bars</Icon>
        <Icon onClick={I.toggleTheme}>moon</Icon>
      </div>

      <div className="flex-1 mx-4" style={{ maxWidth: "300px" }}>
        <Search
          onClearClick={() => I.runSearch("")}
          onChange={(v) => I.runSearch(v)}
          placeholder="Search..."
          style={{ width: "100%" }}
        />
      </div>

      <div className="flex items-center gap-2">
        {I.isAuthenticated() ? (
          I.mode === "settings" ? (
            <div className="w-[75px]"><AppsButton I={I} /></div>
          ) : (
            <Icon onClick={() => I.setMode("settings")}>gear</Icon>
          )
        ) : (
          <div className="w-[75px]">
            {I.mode === "appstore" ? (
              I.isAuth ? (
                <></>
              ) : (
                <button
                  className="px-3 py-1.5 text-sm font-medium rounded-lg text-white transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary-600)' }}
                  onClick={() => I.setMode("login")}
                >
                  Login
                </button>
              )
            ) : (
              <AppsButton I={I} />
            )}
          </div>
        )}
      </div>

      <div className="w-[30px]" />
    </div>
  );
}

export default TopBar;