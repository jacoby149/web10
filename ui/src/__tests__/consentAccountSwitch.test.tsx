import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ConsentView from '../components/Consent/ConsentView'

vi.mock('../interfaces/authAdapter', () => ({
  default: () => ({}),
}))

// The app contract the opener requests, and the (already granted) copy on the
// node. When both are present the contract is "already granted" → filtered out
// of the display list → the popup would otherwise auto-complete.
const appContract = {
  kind: 'app',
  app_origin: 'https://social.web10.app',
  permissions: { posts: ['readAll'] },
}
const grantedContract = {
  allowed_origin: 'https://social.web10.app',
  permissions: { posts: ['readAll'] },
}

function signedInHarness(overrides: Record<string, any> = {}) {
  const I: Record<string, any> = {
    mode: 'contracts',
    setMode: vi.fn(),
    isAuthenticated: () => true,
    v3: { readToken: () => ({ username: 'alice', provider: 'api.web10.app' }) },
    v3Contracts: [grantedContract],
    pendingContracts: [appContract],
    _contractReceived: true,
    _expectedUser: undefined, // signed-out opener by default (no ?as=)
    _freshLogin: false,
    rememberedAccounts: [
      { username: 'alice', provider: 'api.web10.app' },
      { username: 'bob', provider: 'api.web10.app' },
    ],
    setFreshLogin: vi.fn(),
    goToApp: vi.fn(),
    logout: vi.fn(),
    approveAll: vi.fn(),
    approveContract: vi.fn(),
    denyContract: vi.fn(),
    setStatus: vi.fn(),
    status: null,
    config: { REACT_APP_DEFAULT_API: 'api.web10.app' },
    ...overrides,
  }
  return I
}

describe('ConsentView — signed-out opener with a live session (account switch)', () => {
  it('shows the login screen + "Continue as" instead of auto-completing', () => {
    const I = signedInHarness()
    render(<ConsentView I={I} />)
    // The login screen is shown — not the consent screen, not a silent
    // auto-complete. This is the fix for "can't switch account".
    expect(screen.getByTestId('consent-continue-as')).toBeTruthy()
    expect(screen.getByTestId('account-picker')).toBeTruthy()
    expect(screen.getByTestId('account-picker-alice')).toBeTruthy()
    expect(screen.getByTestId('account-picker-bob')).toBeTruthy()
    // No auto-complete, no consent approve-all.
    expect(I.goToApp).not.toHaveBeenCalled()
    expect(screen.queryByTestId('consent-approve-all')).toBeNull()
  })

  it('"Continue as" confirms the session (setFreshLogin true, no password)', () => {
    const I = signedInHarness()
    render(<ConsentView I={I} />)
    fireEvent.click(screen.getByTestId('consent-continue-as'))
    expect(I.setFreshLogin).toHaveBeenCalledWith(true)
  })

  it('picking a remembered account pre-fills provider + username', () => {
    const I = signedInHarness()
    render(<ConsentView I={I} />)
    fireEvent.click(screen.getByTestId('account-picker-bob'))
    expect((screen.getByTestId('username-input') as HTMLInputElement).value).toBe('bob')
    expect((screen.getByTestId('provider-input') as HTMLInputElement).value).toBe('api.web10.app')
  })

  it('a signed-in opener (return run) still auto-completes — one tap preserved', () => {
    const I = signedInHarness({ _expectedUser: 'alice' })
    render(<ConsentView I={I} />)
    // Auto-complete: goToApp called, Connecting shown, no login form.
    expect(I.goToApp).toHaveBeenCalled()
    expect(screen.queryByTestId('consent-continue-as')).toBeNull()
    expect(screen.getByTestId('consent-connecting')).toBeTruthy()
  })

  it('a contract that is NOT yet granted still shows the consent screen (approve)', () => {
    // Popup signed in, opener signed out, but the contract is NOT granted →
    // the consent screen (approve) must show, not the login form.
    const I = signedInHarness({ v3Contracts: [] })
    render(<ConsentView I={I} />)
    expect(screen.getByTestId('consent-req-0')).toBeTruthy()
    expect(screen.getByTestId('consent-approve-0')).toBeTruthy()
    expect(screen.queryByTestId('consent-continue-as')).toBeNull()
    expect(I.goToApp).not.toHaveBeenCalled()
  })
})
