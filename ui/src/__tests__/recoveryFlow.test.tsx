import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ForgotForm from '../components/CredentialPage/ForgotForm'

// Contact-anchored auth (D61) — the ForgotForm state machine:
// contact (phone OR email) → 6-digit code → pick an account (or create one) →
// sign in. These tests drive the UI wiring (which step renders, which function
// is called with what args). The API calls (v3PostAnon → /v3/recovery/*) are
// covered by the API unit tests + e2e.

function makeI(over: Record<string, any> = {}) {
  return {
    recoveryStep: 'contact',
    recoveryContact: '+15551234567',
    recoveryVerifyToken: 'vt',
    recoveryAccounts: [] as any[],
    setRecoveryContact: vi.fn(),
    setRecoveryStep: vi.fn(),
    recoverRequest: vi.fn(),
    recoverVerify: vi.fn(),
    recoverComplete: vi.fn(),
    setMode: vi.fn(),
    status: null,
    ...over,
  }
}

describe('ForgotForm — contact step', () => {
  it('renders the contact input, send code, and back-to-login', () => {
    render(<ForgotForm I={makeI()} />)
    expect(screen.getByTestId('recovery-contact-input')).toBeTruthy()
    expect(screen.getByTestId('recovery-send-code')).toBeTruthy()
    expect(screen.getByTestId('recovery-back-to-login')).toBeTruthy()
  })

  it('send code calls recoverRequest with the contact', () => {
    const I = makeI()
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-send-code'))
    expect(I.recoverRequest).toHaveBeenCalledWith('+15551234567')
  })

  it('back to login calls setMode(login)', () => {
    const I = makeI()
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-back-to-login'))
    expect(I.setMode).toHaveBeenCalledWith('login')
  })

  it('is embedded without the card chrome or contact-step headline', () => {
    const { container } = render(<ForgotForm I={makeI()} embedded />)
    expect(container.querySelector('[data-testid="recovery-form"]')).toBeNull()
    expect(screen.getByTestId('recovery-send-code')).toBeTruthy()
  })
})

describe('ForgotForm — code step', () => {
  it('renders the code input, verify, and change-contact', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'code' })} />)
    expect(screen.getByTestId('recovery-code-input')).toBeTruthy()
    expect(screen.getByTestId('recovery-verify')).toBeTruthy()
    expect(screen.getByTestId('recovery-change-contact')).toBeTruthy()
  })

  it('verify is disabled until 6 digits are entered', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'code' })} />)
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '12345' } })
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '123456' } })
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(false)
  })

  it('verify calls recoverVerify with contact + code', () => {
    const I = makeI({ recoveryStep: 'code' })
    render(<ForgotForm I={I} />)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('recovery-verify'))
    expect(I.recoverVerify).toHaveBeenCalledWith('+15551234567', '123456')
  })

  it('change contact returns to the contact step', () => {
    const I = makeI({ recoveryStep: 'code' })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-change-contact'))
    expect(I.setRecoveryStep).toHaveBeenCalledWith('contact')
  })
})

describe('ForgotForm — pick step (existing accounts)', () => {
  const accounts = [
    { username: 'alice', email: 'a@x.com' },
    { username: 'bob', email: '' },
  ]

  it('renders the account list + the new-account option', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })} />)
    expect(screen.getByTestId('recovery-account-list')).toBeTruthy()
    expect(screen.getByTestId('recovery-account-alice')).toBeTruthy()
    expect(screen.getByTestId('recovery-account-bob')).toBeTruthy()
    expect(screen.getByTestId('recovery-new-account')).toBeTruthy()
  })

  it('sign in is disabled until an account is picked', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })} />)
    expect((screen.getByTestId('recovery-sign-in') as HTMLButtonElement).disabled).toBe(true)
  })

  it('picking + sign in calls recoverComplete with the username (no new password → undefined)', () => {
    const I = makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-account-alice'))
    fireEvent.click(screen.getByTestId('recovery-sign-in'))
    expect(I.recoverComplete).toHaveBeenCalledWith('alice', undefined)
  })

  it('a new password is passed through to recoverComplete', () => {
    const I = makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-account-alice'))
    fireEvent.change(screen.getByTestId('recovery-new-password'), { target: { value: 'brand-new' } })
    fireEvent.click(screen.getByTestId('recovery-sign-in'))
    expect(I.recoverComplete).toHaveBeenCalledWith('alice', 'brand-new')
  })
})

describe('ForgotForm — pick step (create a new account)', () => {
  it('no accounts on the contact → the create path is active', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'pick', recoveryAccounts: [] })} />)
    expect(screen.queryByTestId('recovery-account-alice')).toBeNull()
    expect(screen.getByTestId('recovery-new-username')).toBeTruthy()
    expect((screen.getByTestId('recovery-sign-in') as HTMLButtonElement).disabled).toBe(true)
  })

  it('typing a username enables create + calls recoverComplete with it', () => {
    const I = makeI({ recoveryStep: 'pick', recoveryAccounts: [] })
    render(<ForgotForm I={I} />)
    fireEvent.change(screen.getByTestId('recovery-new-username'), { target: { value: 'newbie' } })
    expect((screen.getByTestId('recovery-sign-in') as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(screen.getByTestId('recovery-sign-in'))
    expect(I.recoverComplete).toHaveBeenCalledWith('newbie', undefined)
  })

  it('picking "New account" from an existing list reveals the username input', () => {
    const accounts = [{ username: 'alice', email: 'a@x.com' }]
    const I = makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-new-account'))
    expect(screen.getByTestId('recovery-new-username')).toBeTruthy()
    fireEvent.change(screen.getByTestId('recovery-new-username'), { target: { value: 'newbie' } })
    fireEvent.click(screen.getByTestId('recovery-sign-in'))
    expect(I.recoverComplete).toHaveBeenCalledWith('newbie', undefined)
  })
})
