import useInterface from './interfaces/Interface'
import useMockInterface from './interfaces/MockInterface'
import React from 'react';
import './assets/bulma/css/bulma.min.css';
import ContractPage from './components/Contracts/ContractPage';
import CredentialPage from './components/CredentialPage/CredentialPage';
import Settings from './components/Settings/Settings';
import RequestPage from './components/Contracts/RequestPage';

function StatusBar({ I }: { I: Record<string, any> }) {
  if (!I.status) return null;
  return (
    <div className="notification is-warning is-light" style={{ position: "fixed", top: "0", left: "0", right: "0", zIndex: 1000, textAlign: "center" }}>
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
    <div style={{ margin: "10px 20px", padding: "15px", border: "1px solid #666", borderRadius: "6px", maxWidth: "400px" }}>
      <div style={{ marginBottom: "10px" }}>
        <i><u>From {referrerHost}:</u></i><br />
        status: {SMRs
          ? <i style={{ color: "yellow" }}> requests need approval</i>
          : <i style={{ color: "lightgreen" }}> ready</i>}
      </div>
      {SMRs ? (
        <div>
          <button
            className="button is-warning is-small"
            onClick={() => I.setMode("requests")}
          >
            Review Requests
          </button>
        </div>
      ) : (
        <div>
          <button
            className="button is-warning is-small"
            onClick={() => I.sendToken()}
          >
            Log In
          </button>
        </div>
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
  const I = mock?mockI:realI;
  I.isMock = mock;
  I.isAuth = auth;
  window.I = I;

  React.useEffect(()=>{
    if(forgot) I.setMode("forgot");
  },[])

  React.useEffect(() => {
    if (I.isAuthenticated() && I._hasReferrer) {
      I.initAuthenticator();
    }
  }, [I.auth]);
  
  return (
    <>
      <StatusBar I={I} />
      <OAuthBanner I={I} />
      {(() => {
        switch (I.mode) {
          case "contracts": return <ContractPage I={I} />;
          case "requests": return <RequestPage I={I} />;
          case "settings": return <Settings I={I} />;
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