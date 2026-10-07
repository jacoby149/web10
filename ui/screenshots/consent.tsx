import React from 'react';
import { createRoot } from 'react-dom/client';
import ConsentView from '../src/components/Consent/ConsentView';
import '../src/index.css';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';

const I = {
  theme: 'dark', logo: '/logo192.png', _referrerHost: 'studio.example', _expectedUser: 'alice',
  _contractReceived: true, isAuthenticated: () => true,
  v3: { readToken: () => ({ username: 'alice' }) },
  v3Contracts: [{ allowed_origin: 'https://studio.example', permissions: { posts: ['readAll'] } }],
  pendingContracts: [{ kind: 'app', app_origin: 'https://studio.example', permissions: {
    posts: ['readAll'], imports: ['create', 'read'], user: ['blockUsers'],
  } }],
  approveContract: () => {}, denyContract: () => {}, approveAll: () => {}, goToApp: () => {}, logout: () => {},
};
createRoot(document.getElementById('root')!).render(<ConsentView I={I} />);
