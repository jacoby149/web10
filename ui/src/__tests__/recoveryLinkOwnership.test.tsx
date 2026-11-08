import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import useInterface from '../interfaces/Interface';
import { contactHandoff, recoveryDestination } from '../lib/contactHandoff';

const v3 = vi.hoisted(() => ({ state: { token: null, apiOrigin: 'https://api.node-a.example' },
  readToken: () => null, setToken: vi.fn(), scrubToken: vi.fn(), getProfile: vi.fn(async () => ({})) }));
vi.mock('axios', () => ({ default: { post: vi.fn() } }));
vi.mock('web10-npm', () => ({
  createV3Client: () => v3,
  wapiInit: () => ({ readToken: () => null, scrubToken: vi.fn(), isSignedIn: () => false }),
  wapiAuthInit: () => ({ contractListen: vi.fn() }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  contactHandoff.node = 'api.node-a.example';
  window.history.replaceState(null, '', '/?mode=forgot');
});

it('never lets a fragment name a new credential destination', () => {
  expect(() => recoveryDestination('evil.example', v3.state.apiOrigin)).toThrow();
  expect(() => recoveryDestination('', v3.state.apiOrigin)).toThrow();
  expect(recoveryDestination(contactHandoff.node, v3.state.apiOrigin)).toBe('https://api.node-a.example');
});

it('pins link exchange and password-reset completion to A even with a provider-B browser session', async () => {
  const fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => url.endsWith('/link')
    ? { contact: 'person@example.com', accounts: [{ username: 'alice' }], verify_token: 'synthetic-proof' }
    : { token: 'synthetic-new-token' } }));
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useInterface());
  act(() => result.current.setMode('forgot'));
  window.I = { v3: { readToken: () => ({ provider: 'api.node-b.example' }) } } as any;
  await act(async () => { expect(await result.current.recoverLink('synthetic-private-link')).toBe(true); });
  expect(fetchMock.mock.calls[0][0]).toBe('https://api.node-a.example/v3/recovery/link');
  act(() => result.current.recoverComplete('alice', 'new-password'));
  await waitFor(() => expect(v3.setToken).toHaveBeenCalledWith('synthetic-new-token'));
  expect(fetchMock.mock.calls[1][0]).toBe('https://api.node-a.example/v3/recovery/complete');
  expect(fetchMock.mock.calls.some(([url]) => url.includes('node-b'))).toBe(false);
  expect(window.location.search).not.toContain('forgot');
  expect(result.current.mode).toBe('contracts');
  vi.unstubAllGlobals();
});

it('rejects an issuer mismatch before any request', async () => {
  contactHandoff.node = 'api.other-node.example';
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  const { result } = renderHook(() => useInterface());
  act(() => result.current.setMode('forgot'));
  await act(async () => { expect(await result.current.recoverLink('private-link')).toBe(false); });
  expect(fetchMock).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
