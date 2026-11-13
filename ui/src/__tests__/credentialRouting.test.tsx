import React from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from '../App';

const state = vi.hoisted(() => ({ confirmed: true }));
vi.mock('../interfaces/Interface', () => ({ default: () => ({
  auth: true, mode: 'contracts', nodeConfigured: true, _userConfirmed: state.confirmed,
  isAuthenticated: () => true,
  v3: { state: { token: 'synthetic' }, readToken: () => ({ provider: 'api.example' }) },
}) }));
vi.mock('../interfaces/MockInterface', () => ({ default: () => ({}) }));
vi.mock('../components/Contracts/ContractPage', () => ({ default: () => <div>Contracts</div> }));
vi.mock('../components/Consent/ConsentView', () => ({ default: () => <div>Consent remains active</div> }));

beforeEach(() => {
  state.confirmed = true;
  window.history.replaceState(null, '', '/?consent=1&credential=signup&signin=password&redirect=keep&handoff=none');
  vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({ configured: true }) })));
});
afterEach(() => vi.unstubAllGlobals());

it('confirmed authentication removes only entry presentation, not the pending handoff context', async () => {
  render(<App />);
  await waitFor(() => expect(new URLSearchParams(location.search).has('credential')).toBe(false));
  const query = new URLSearchParams(location.search);
  expect(query.has('signin')).toBe(false);
  expect(query.get('redirect')).toBe('keep');
  expect(query.get('handoff')).toBe('none');
  expect(query.has('consent')).toBe(true);
});

it('a restored but unconfirmed session does not erase the requested entry screen', async () => {
  state.confirmed = false;
  const { findByText } = render(<App />);
  await findByText('Consent remains active');
  expect(new URLSearchParams(location.search).get('credential')).toBe('signup');
  expect(new URLSearchParams(location.search).get('signin')).toBe('password');
});
