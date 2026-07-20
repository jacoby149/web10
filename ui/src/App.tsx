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
import { Card, CardContent } from './components/ui/card';
import { Button } from './components/ui/button';

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

function OAuthBanner({ I }: { I: Record<string, any> }) {
  const [hasReferrer, setHasReferrer] = React.useState(false);
  const [referrerHost, setReferrerHost] = React.useState("");

  React.useEffect(() => {
    const referrer = window.document.referrer;
    if (referrer) {
      try {
        const url = new URL(referrer);
        if (url.origin !== window.location.origin) {
          setHasReferrer(true);
          setReferrerHost(url.hostname);
        }
      } catch { }
    }
  }, []);

  if (!hasReferrer || !I.isAuthenticated()) return null;

  const SMRs = I.SMR?.sirs?.length > 0 || I.SMR?.scrs?.length > 0;

  return (
    <Card className="m-5 max-w-[400px]" data-testid="oauth-banner">
      <CardContent className="p-4">
        <div className="mb-2.5 text-sm">
          <span className="text-muted-foreground">From <span className="font-medium text-foreground">{referrerHost}</span>:</span>
          <br />
          status:{SMRs
            ? <span className="font-medium text-warning"> requests need approval</span>
            : <span className="font-medium text-success"> ready</span>}
        </div>
        {SMRs ? (
          <Button
            variant="outline"
            size="sm"
            data-testid="oauth-banner-review-requests"
            onClick={() => I.setMode("requests")}
          >
            Review Requests
          </Button>
        ) : (
          <Button
            variant="brand"
            size="sm"
            data-testid="oauth-banner-login"
            onClick={() => I.sendToken()}
          >
            Log In
          </Button>
        )}
      </CardContent>
    </Card>
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
    const provider = decoded?.provider || "api.localhost";
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

  React.useEffect(() => {
    if (I.isAuthenticated() && I._hasReferrer) {
      I.initAuthenticator();
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
      <OAuthBanner I={I} />
      {(() => {
        switch (effectiveMode) {
          case "contracts": return <ContractPage I={I} />;
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