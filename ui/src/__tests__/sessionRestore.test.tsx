import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import useInterface from '../interfaces/Interface';
import { decodeSessionClaims } from '../lib/sessionClaims';
import { vaultToken } from '../lib/tokenVault';

const mocks = vi.hoisted(() => ({ state: { token: '' }, scrubToken: vi.fn(), setToken: vi.fn() }));
vi.mock('../interfaces/authAdapter', () => ({ default: () => ({ v3: {
  state: mocks.state,
  readToken: () => decodeSessionClaims(mocks.state.token),
  scrubToken: mocks.scrubToken,
  setToken: mocks.setToken,
  getProfile: () => Promise.resolve({}),
} }) }));
const jwt = (claims: object) => `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '')}.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
const claims = { username: 'alice', provider: 'api.localhost', site: 'api.localhost', credential_kind: 'self', expires: '2099-01-01T00:00:00Z' };

describe('D89 self-session restoration and switching', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    mocks.state.token = jwt(claims);
    mocks.scrubToken.mockImplementation(() => { mocks.state.token = ''; });
    mocks.setToken.mockImplementation((token: string) => { mocks.state.token = token; });
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });
  it('restores and vaults a usable local self credential', () => {
    const { result } = renderHook(() => useInterface());
    expect(result.current.isAuthenticated()).toBe(true);
    expect(mocks.scrubToken).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem('web10.tokenVault')!)[0].token).toBe(jwt(claims));
  });
  it.each([
    { credential_kind: undefined }, { credential_kind: 'app', app_origin: 'https://app.example' },
    { expires: undefined }, { expires: 'invalid' }, { expires: '2000-01-01T00:00:00Z' },
    { username: undefined }, { username: ' ' }, { provider: 'api.other.app' },
    { site: 'auth.localhost' }, { site: undefined },
  ])('rejects restoration of unusable session claims: %j', (override) => {
    mocks.state.token = jwt({ ...claims, ...override });
    const { result } = renderHook(() => useInterface());
    expect(result.current.isAuthenticated()).toBe(false);
    expect(result.current._userConfirmed).toBe(false);
    expect(mocks.scrubToken).toHaveBeenCalled();
    expect(mocks.state.token).toBe('');
    expect(result.current.vaultedAccounts).toEqual([]);
  });
  it.each(['broken', 'header.not-json.signature', 'a.b', ''])('scrubs malformed raw tokens without throwing: %s', (token) => {
    mocks.state.token = token;
    const { result } = renderHook(() => useInterface());
    expect(result.current.isAuthenticated()).toBe(false);
    expect(mocks.scrubToken).toHaveBeenCalled();
  });
  it('switches only to a valid self credential for the chosen local account', () => {
    const token = jwt({ ...claims, username: 'bob' });
    vaultToken({ username: 'bob', provider: claims.provider, token });
    const { result } = renderHook(() => useInterface());
    act(() => result.current.switchAccount('bob', claims.provider));
    expect(mocks.setToken).toHaveBeenCalledWith(token);
    expect(result.current.isAuthenticated()).toBe(true);
    expect(result.current._userConfirmed).toBe(true);
  });
  it.each([
    { credential_kind: undefined }, { credential_kind: 'app', app_origin: 'https://app.example' },
    { username: 'someone-else' }, { expires: 'invalid' }, { expires: '2000-01-01T00:00:00Z' },
  ])('failed vault switch purges unusable credentials and clears stale authenticated state: %j', (override) => {
    localStorage.setItem('web10.tokenVault', JSON.stringify([{ username: 'bob', provider: claims.provider,
      token: jwt({ ...claims, username: 'bob', ...override }) }]));
    const { result } = renderHook(() => useInterface());
    act(() => {
      result.current.setIsAdmin(true);
      result.current.setV3Contracts([{ allowed_origin: 'https://app.example', permissions: { node: ['moderate'] } }]);
      result.current.setUserConfirmed(true);
    });
    act(() => result.current.switchAccount('bob', claims.provider));
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated()).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current._userConfirmed).toBe(false);
    expect(result.current.v3Contracts).toEqual([]);
    expect(result.current.mode).toBe('login');
    expect(result.current.status).toMatch(/log in again/);
  });
  it('rejects a foreign-provider vault switch even on localhost', () => {
    const provider = 'api.other.app';
    vaultToken({ username: 'bob', provider, token: jwt({ ...claims, username: 'bob', provider, site: provider }) });
    const { result } = renderHook(() => useInterface());
    act(() => result.current.switchAccount('bob', provider));
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated()).toBe(false);
    expect(result.current.mode).toBe('login');
  });
  it('rechecks expiry at switch time rather than trusting the rendered picker', () => {
    const expires = new Date(Date.now() + 1000).toISOString();
    vaultToken({ username: 'bob', provider: claims.provider, token: jwt({ ...claims, username: 'bob', expires }) });
    const { result } = renderHook(() => useInterface());
    expect(result.current.vaultedAccounts.some((a: { username: string }) => a.username === 'bob')).toBe(true);
    vi.setSystemTime(Date.now() + 2000);
    act(() => result.current.switchAccount('bob', claims.provider));
    expect(mocks.setToken).not.toHaveBeenCalled();
    expect(result.current.isAuthenticated()).toBe(false);
  });
  it('does not finish login using an invalid or delegated session', () => {
    const { result } = renderHook(() => useInterface());
    mocks.state.token = jwt({ ...claims, credential_kind: 'app', app_origin: 'https://app.example' });
    act(() => result.current.finishLogin());
    expect(result.current.isAuthenticated()).toBe(false);
    expect(result.current._userConfirmed).toBe(false);
    expect(result.current.mode).toBe('login');
  });
});
