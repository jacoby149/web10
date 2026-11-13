// Browser-only synthetic presentation fixture, not an authentication simulator.
// Vite serves this module in dev; it is not an application entry/build input.
import React from 'react';
import { createRoot } from 'react-dom/client';
import ConsentView from '../src/components/Consent/ConsentView';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '../src/index.css';

const contract = { kind: 'app', app_origin: 'https://social.web10.app', permissions: { posts: ['readAll'] } };
function Preview() {
  const cold = new URLSearchParams(location.search).has('cold');
  const [mode, setMode] = React.useState('login');
  const [loginUsername, setLoginUsername] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<string | null>(null);
  const I = {
    mode, setMode, loginUsername, setLoginUsername, status, setStatus,
    _referrerHost: 'social.web10.app', _contractReceived: true, _userConfirmed: false,
    isAuthenticated: () => !cold,
    config: { REACT_APP_DEFAULT_API: 'api.web10.app', REACT_APP_LOGO_DARK: '/keys-mark.png', REACT_APP_LOGO_LIGHT: '/keys-mark-dark.png' },
    v3: { readToken: () => cold ? null : ({ username: 'jacoby149' }) },
    v3Contracts: [{ allowed_origin: contract.app_origin, permissions: contract.permissions }],
    pendingContracts: [contract],
    rememberedAccounts: cold ? [] : [{ username: 'jacoby149', provider: 'api.web10.app' }, { username: 'alex', provider: 'api.web10.app' }],
    setUserConfirmed: () => setStatus('Connecting…'),
    login: () => setStatus('Incorrect username or password. Try again.'),
    signup: () => setStatus('This username is already taken. Try another.'),
    logout: () => setStatus('Preview only — no session to sign out.'),
    goToApp: () => {},
  };
  return <ConsentView I={I} />;
}
createRoot(document.getElementById('root')!).render(<Preview />);
