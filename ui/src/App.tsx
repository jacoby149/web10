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

function StatusBar({ I }: { I: Record<string, any> }) {
  if (!I.status) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[500] text-center px-4 py-2 text-sm font-medium" style={{ backgroundColor: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
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
    <div className="m-5 p-4 rounded-lg border max-w-[400px]" style={{ borderColor: 'var(--color-border)' }}>
      <div className="mb-2.5">
        <i><u>From {referrerHost}:</u></i><br />
        status: {SMRs
          ? <i className="font-medium" style={{ color: 'var(--color-warning)' }}> requests need approval</i>
          : <i className="font-medium" style={{ color: 'var(--color-success)' }}> ready</i>}
      </div>
      {SMRs ? (
        <button
          className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
          onClick={() => I.setMode("requests")}
        >
          Review Requests
        </button>
      ) : (
        <button
          className="px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors hover:opacity-80"
          style={{ borderColor: 'var(--color-warning)', color: 'var(--color-warning)' }}
          onClick={() => I.sendToken()}
        >
          Log In
        </button>
      )}
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
      <div className="flex items-center justify-center h-screen" style={{ background: 'var(--color-neutral-950)', color: 'var(--color-neutral-400)' }}>
        <div className="text-center">
          <div className="text-lg mb-2.5">Checking node status...</div>
        </div>
      </div>
    );
  }

  if (!I.nodeConfigured && I.mode === "setup") {
    return <SetupWizard I={I} />;
  }

  return (
    <>
      <StatusBar I={I} />
      <OAuthBanner I={I} />
      {(() => {
        switch (I.mode) {
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