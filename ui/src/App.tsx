import useInterface from './interfaces/Interface'
import useMockInterface from './interfaces/MockInterface'
import React from 'react';
import ContractPage from './components/Contracts/ContractPage';
import CredentialPage from './components/CredentialPage/CredentialPage';
import Settings from './components/Settings/Settings';
import RequestPage from './components/Contracts/RequestPage';
import SetupWizard from './components/SetupWizard/SetupWizard';
import ConfigPage from './components/Config/ConfigPage';
import StudioPage from './components/Studio/StudioPage';
import ConsentView from './components/Consent/ConsentView';
import GroupsPage from './components/Groups/GroupsPage';
import { config } from './config';

function StatusBar({ I }: { I: Record<string, any> }) {
  if (!I.status) return null;
  return (
    <div
      role="status"
      data-testid="status-bar"
      className="fixed inset-x-0 top-0 z-[500] px-4 py-2 text-center text-sm font-medium bg-warning/15 text-warning"
    >
      {I.status}
    </div>
  );
}

function App() {

  const queryParameters = new URLSearchParams(window.location.search)
  const mock = queryParameters.get("mock")
  const auth = queryParameters.get("auth")
  const forgot = queryParameters.get("forgot")
  const mockI = useMockInterface();
  const realI = useInterface();
  const I = mock ? mockI : realI;
  I.isMock = mock;
  I.isAuth = auth;
  window.I = I;

  const [checkingSetup, setCheckingSetup] = React.useState(true);

  React.useEffect(() => {
    if (I.isMock) {
      setCheckingSetup(false);
      return;
    }
    const decoded = I.wapi?.readToken?.();
    // Logged out, there's no token to name the provider — fall back to the
    // configured API host, NOT a hardcoded "api.localhost" (which made the
    // readiness probe hit the wrong API on prod). Mirror authAdapter's
    // *.localhost detection so local dev still points at api.localhost.
    const host = window.location.hostname;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host.endsWith(".localhost");
    const provider = decoded?.provider || (isLocal ? "api.localhost" : config.REACT_APP_DEFAULT_API);
    const protocol = window.location.protocol;
    fetch(`${protocol}//${provider}/ready`)
      .then(r => r.json())
      .then(data => {
        I.nodeConfigured = data.configured || false;
        setCheckingSetup(false);
        if (!data.configured) {
          I._setMode("setup");
        }
      })
      .catch(() => {
        I.nodeConfigured = true;
        setCheckingSetup(false);
      });
  }, []);

  React.useEffect(() => {
    if (forgot) I.setMode("forgot");
  }, []);

  // Set up the contract postMessage listener immediately if opened as a popup
  // (window.open) — before auth. The demo sends the GCR before the user logs in,
  // so the listener must be ready to receive it. Contracts accumulate in
  // I.pendingContracts and display after login.
  React.useEffect(() => {
    if (window.opener && !I.isMock) {
      I.initAuthenticator();
    }
  }, []);

  React.useEffect(() => {
    // For referrer-based flows (not popups), init after auth.
    if (I.isAuthenticated() && I._hasReferrer && !window.opener && !I.isMock) {
      I.initAuthenticator();
    }
    // Restored session (reload with a valid token): hydrate admin status +
    // contracts, which otherwise only run inside the login flow.
    if (I.isAuthenticated() && !I.isMock) {
      I.checkAdmin?.();
      I.servicesLoad?.();
    }
  }, [I.auth]);

  if (checkingSetup) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-muted-foreground">
        <div className="text-center">
          <div className="mb-2.5 text-lg">Checking node status...</div>
        </div>
      </div>
    );
  }

  if (!I.nodeConfigured && I.mode === "setup") {
    return <SetupWizard I={I} />;
  }

  // Opened by another app for consent (window.opener present, or ?consent=1 to
  // preview) → a dedicated, focused consent screen, not the full console with a
  // floating prompt over it.
  const consentMode =
    typeof window !== "undefined" && (window.opener != null || queryParameters.get("consent") != null);
  if (consentMode) {
    return <ConsentView I={I} />;
  }

  // The credential (login/signup/forgot) screens are the only ones a
  // signed-out user may see. Anything else — including an expired/scrubbed
  // token that leaves mode on "contracts" — routes to the login page so a
  // signed-out visitor never lands on an empty authenticated screen with no
  // way back in (B7).
  const credentialModes = ["login", "signup", "forgot"];
  const effectiveMode =
    I.isAuthenticated() || credentialModes.includes(I.mode) ? I.mode : "login";

  return (
    <>
      <StatusBar I={I} />
      {(() => {
        switch (effectiveMode) {
          case "contracts": return <ContractPage I={I} />;
          case "groups": return <GroupsPage I={I} />;
          case "requests": return <RequestPage I={I} />;
          case "settings": return <Settings I={I} />;
          case "config": return <ConfigPage I={I} />;
          case "studio": return <StudioPage I={I} />;
          case "login": return <CredentialPage I={I} />;
          case "signup": return <CredentialPage I={I} />;
          case "forgot": return <CredentialPage I={I} />;
          default: return <ContractPage I={I} />;
        }
      })()}
    </>
  );
}

export default App;