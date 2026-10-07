import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, render, screen, fireEvent } from '@testing-library/react';
import useInterface from '../interfaces/Interface';
import ConsentView from '../components/Consent/ConsentView';

const mocks = vi.hoisted(() => ({ delegateApp: vi.fn() }));
const jwt = (claims: object) => `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '')}.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
const selfClaims = { credential_kind: 'self', site: 'api.localhost', provider: 'api.localhost', username: 'alice', expires: '2099-01-01T00:00:00Z' };
const self = jwt(selfClaims);
const appClaims = { ...selfClaims, credential_kind: 'app', site: 'https://app.example', app_origin: 'https://app.example' };
vi.mock('../interfaces/authAdapter', () => ({ default: () => ({ v3: {
  state: { token: self }, readToken: () => selfClaims,
  delegateApp: mocks.delegateApp,
} }) }));

describe('D89 popup delegation', () => {
  let opener: { postMessage: ReturnType<typeof vi.fn> };
  let listeners: EventListener[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    opener = { postMessage: vi.fn() };
    vi.stubGlobal('opener', opener);
    vi.spyOn(window, 'close').mockImplementation(() => {});
    listeners = [];
    const add = window.addEventListener.bind(window);
    vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'message') listeners.push(listener as EventListener);
      add(type, listener, options);
    });
    mocks.delegateApp.mockResolvedValue({ token: jwt(appClaims) });
  });
  afterEach(() => {
    window.history.replaceState({}, '', '/');
    vi.clearAllTimers();
    vi.useRealTimers();
    listeners.forEach((listener) => window.removeEventListener('message', listener));
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  function message(data: object, origin = 'https://app.example', source: unknown = opener) {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source: source as Window }));
  }
  function boot() {
    const hook = renderHook(() => useInterface());
    act(() => hook.result.current.initAuthenticator());
    act(() => message({ type: 'auth_init' }));
    return hook;
  }
  it('uses the SDK redirect for exact readiness without trusting it for token handoff', async () => {
    window.history.replaceState({}, '', '/?redirect=https%3A%2F%2Fapp.example%2Fstudio');
    const { result } = renderHook(() => useInterface());
    act(() => result.current.initAuthenticator());
    act(() => vi.advanceTimersByTime(0));
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'auth_ready' }, 'https://app.example');
    await act(async () => { await result.current.goToApp(); });
    expect(mocks.delegateApp).not.toHaveBeenCalled();
    act(() => message({ type: 'contract', contracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: {} }] }));
    await act(async () => { await result.current.goToApp(); });
    expect(mocks.delegateApp).toHaveBeenCalledWith('https://app.example');
  });
  it('binds readiness without referrer and hands off only a distinct app token to the exact opener origin', async () => {
    const { result } = boot();
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'auth_ready' }, 'https://app.example');
    await act(async () => { await result.current.goToApp(); });
    expect(mocks.delegateApp).toHaveBeenCalledWith('https://app.example');
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'auth', token: (await mocks.delegateApp.mock.results[0].value).token }, 'https://app.example');
    expect(opener.postMessage.mock.calls.some(([payload, target]) => payload.token === self || target === '*')).toBe(false);
  });
  it('rejects wrong sources, origins, mismatched app origins and spoofed close messages', () => {
    const { result } = boot();
    const contract = { type: 'contract', contracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: { node: ['moderate'] } }] };
    act(() => message(contract, 'https://evil.example'));
    act(() => message(contract, 'https://app.example', { postMessage: vi.fn() }));
    act(() => message({ ...contract, contracts: [{ ...contract.contracts[0], app_origin: 'https://evil.example' }] }));
    act(() => message({ type: 'close_popup' }, 'https://evil.example'));
    expect(result.current.pendingContracts).toEqual([]);
    expect(window.close).not.toHaveBeenCalled();
    expect(result.current.connectionError).toMatch(/origin/);
  });
  it('keeps failed delegation visible and never sends a self credential', async () => {
    const { result } = boot();
    mocks.delegateApp.mockResolvedValue({ token: self });
    await act(async () => { await result.current.goToApp(); });
    expect(result.current.connectionError).toBeTruthy();
    expect(opener.postMessage.mock.calls.some(([payload]) => payload.type === 'auth')).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
  });
  it('does not hand off a different self token or an app credential for another origin', async () => {
    const { result } = boot();
    for (const claims of [{ credential_kind: 'self' }, { credential_kind: 'app', app_origin: 'https://evil.example' }]) {
      mocks.delegateApp.mockResolvedValue({ token: jwt(claims) });
      await act(async () => { await result.current.goToApp(); });
    }
    expect(opener.postMessage.mock.calls.some(([payload]) => payload.type === 'auth')).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
  });
  it.each([
    { username: 'bob' }, { provider: 'api.other.app' }, { expires: 'not-a-date' },
    { expires: '2000-01-01T00:00:00Z' }, { expires: undefined }, { username: undefined },
    { site: 'https://evil.example' }, { app_origin: 'https://app.example/' },
  ])('rejects failed delegated identity/expiry/origin shape: %j', async (override) => {
    const { result } = boot();
    mocks.delegateApp.mockResolvedValue({ token: jwt({ ...appClaims, ...override }) });
    await act(async () => { await result.current.goToApp(); });
    expect(result.current.connectionError).toBeTruthy();
    expect(opener.postMessage.mock.calls.some(([payload]) => payload.type === 'auth')).toBe(false);
    expect(window.close).not.toHaveBeenCalled();
  });
  it('returns exact-origin approval and denial responses and accepts close only from the bound opener', async () => {
    const { result } = boot();
    const request = { type: 'contract', contracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: { posts: ['readAll'] } }] };
    act(() => message(request));
    result.current.addV3Contract = vi.fn().mockResolvedValue(undefined);
    result.current.v3ContractsLoad = vi.fn();
    await act(async () => { await result.current.approveContract(result.current.pendingContracts[0]); });
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'contract_response', status: 'approved', errors: undefined }, 'https://app.example');
    act(() => message(request));
    act(() => result.current.denyContract(result.current.pendingContracts[0]));
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'contract_response', status: 'denied', errors: undefined }, 'https://app.example');
    act(() => message({ type: 'close_popup' }));
    expect(window.close).toHaveBeenCalledOnce();
  });
  it('keeps a failed batch pending and does not delegate or close', async () => {
    const { result } = boot();
    act(() => message({ type: 'contract', contracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: { node: ['moderate'] } }] }));
    result.current.addV3Contract = vi.fn().mockRejectedValue(new Error('Approval refused'));
    await act(async () => { await result.current.approveAll(); });
    expect(result.current.pendingContracts).toHaveLength(1);
    expect(result.current.connectionError).toBe('Approval refused');
    expect(mocks.delegateApp).not.toHaveBeenCalled();
    expect(window.close).not.toHaveBeenCalled();
    expect(opener.postMessage).toHaveBeenCalledWith({ type: 'contract_response', status: 'error', errors: ['Approval refused'] }, 'https://app.example');
  });
  it('delegates after a successful batch only once, including the auto-completion fork', async () => {
    const { result } = boot();
    act(() => message({ type: 'contract', contracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: { posts: ['readAll'] } }] }));
    result.current.addV3Contract = vi.fn().mockResolvedValue(undefined);
    result.current.v3ContractsLoad = vi.fn();
    result.current.v3GroupsLoad = vi.fn();
    result.current.v3GroupsManagesLoad = vi.fn();
    await act(async () => { await result.current.approveAll(); });
    await act(async () => { await result.current.goToApp(); });
    expect(result.current.pendingContracts).toEqual([]);
    expect(mocks.delegateApp).toHaveBeenCalledOnce();
  });
  it('requires explicit approval of management upgrades and shows readable scope warnings', () => {
    const I = { isAuthenticated: () => true, _expectedUser: 'alice', _contractReceived: true,
      v3: { readToken: () => ({ username: 'alice' }) },
      v3Contracts: [{ allowed_origin: 'https://app.example', permissions: { posts: ['readAll'] } }],
      pendingContracts: [{ kind: 'app', app_origin: 'https://app.example', permissions: { posts: ['readAll', 'hideAll'], group: ['manageRoles'], node: ['moderate', 'manageMonetization'] } }],
      approveContract: vi.fn(), goToApp: vi.fn(),
    };
    render(<ConsentView I={I} />);
    expect(I.goToApp).not.toHaveBeenCalled();
    expect(I.approveContract).not.toHaveBeenCalled();
    expect(screen.getByTestId('consent-management-warning').textContent).toContain('all groups');
    expect(screen.getByTestId('consent-management-warning').textContent).toContain('node-admin authority');
    expect(screen.getAllByText('Manage node monetization').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByTestId('consent-approve-0'));
    expect(I.approveContract).toHaveBeenCalledWith(I.pendingContracts[0]);
  });
});
