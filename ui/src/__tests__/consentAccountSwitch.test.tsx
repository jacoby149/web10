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
    _userConfirmed: false,
    rememberedAccounts: [
      { username: 'alice', provider: 'api.web10.app' },
      { username: 'bob', provider: 'api.web10.app' },
    ],
    setUserConfirmed: vi.fn(),
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

  it('"Continue as" confirms the session (setUserConfirmed true, no password)', () => {
    const I = signedInHarness()
    render(<ConsentView I={I} />)
    fireEvent.click(screen.getByTestId('consent-continue-as'))
    expect(I.setUserConfirmed).toHaveBeenCalledWith(true)
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

  it('a signed-out opener who APPROVED the contract settles (the cold-start regression)', () => {
    // Post-approve state: the user confirmed their identity by approving
    // (setUserConfirmed true), the contract is now granted (filtered out), the
    // opener is still signed out. The popup must settle (hand back the token),
    // NOT stall on the login screen. This is the case the e2e caught.
    const I = signedInHarness({ _userConfirmed: true })
    render(<ConsentView I={I} />)
    expect(I.goToApp).toHaveBeenCalled()
    expect(screen.getByTestId('consent-connecting')).toBeTruthy()
    expect(screen.queryByTestId('consent-continue-as')).toBeNull()
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

  it('the tall login form scrolls inside the card — the "Signed in as" footer never overlaps it', () => {
    // The screenshot bug: with a live session + the remembered-accounts picker,
    // the login form is tall enough to overflow the popup. The form must scroll
    // inside the card, and the "Signed in as … Log out" footer must stay a
    // sibling of that scroll region — not get pushed down into the password
    // field (the collision in the operator's screenshot).
    const I = signedInHarness()
    render(<ConsentView I={I} />)

    // The login form is shown (the exact scenario: picker + Continue as + form).
    const submit = screen.getByTestId('login-submit')

    // The form lives in a dedicated scroll region (min-h-0 flex-1 overflow-y-auto)
    // so a tall form scrolls inside the card instead of growing past the cap.
    const scroll = submit.closest('[class*="overflow-y-auto"]') as HTMLElement
    expect(scroll).toBeTruthy()
    expect(scroll.className).toMatch(/min-h-0/)
    expect(scroll.className).toMatch(/flex-1/)

    // The footer is a sibling of the scroll region (outside the card), not a
    // descendant of it — so it can't be pushed into the password field.
    const footer = screen.getByTestId('consent-logout')
    expect(footer).toBeTruthy()
    expect(scroll.contains(footer)).toBe(false)
  })
})
