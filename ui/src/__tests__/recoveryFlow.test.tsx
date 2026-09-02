import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ForgotForm from '../components/CredentialPage/ForgotForm'

// The Phase 2 phone-recovery flow — the ForgotForm state machine:
// phone → 6-digit code → pick account → sign in. These tests drive the UI
// wiring (which step renders, which function is called with what args). The
// API calls themselves (v3PostAnon → /v3/recovery/*) are covered by the e2e
// once the recovery API is merged.

function makeI(over: Record<string, any> = {}) {
  return {
    recoveryStep: 'phone',
    recoveryPhone: '+15551234567',
    recoveryAccounts: [] as any[],
    phone: '+15551234567',
    setPhone: vi.fn(),
    setRecoveryStep: vi.fn(),
    recoverRequest: vi.fn(),
    recoverVerify: vi.fn(),
    recoverComplete: vi.fn(),
    setMode: vi.fn(),
    status: null,
    ...over,
  }
}

describe('ForgotForm — phone step', () => {
  it('renders the phone input, send code, and back-to-login', () => {
    render(<ForgotForm I={makeI()} />)
    expect(screen.getByTestId('recovery-phone-input')).toBeTruthy()
    expect(screen.getByTestId('recovery-send-code')).toBeTruthy()
    expect(screen.getByTestId('recovery-back-to-login')).toBeTruthy()
  })

  it('send code calls recoverRequest with the phone', () => {
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

  it('is embedded without the card chrome or phone-step headline', () => {
    const { container } = render(<ForgotForm I={makeI()} embedded />)
    expect(container.querySelector('[data-testid="recovery-form"]')).toBeNull()
    expect(screen.queryByText('Recover your account')).toBeNull()
    expect(screen.getByTestId('recovery-send-code')).toBeTruthy()
  })
})

describe('ForgotForm — code step', () => {
  it('renders the code input, verify, and change-number', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'code' })} />)
    expect(screen.getByTestId('recovery-code-input')).toBeTruthy()
    expect(screen.getByTestId('recovery-verify')).toBeTruthy()
    expect(screen.getByTestId('recovery-change-number')).toBeTruthy()
  })

  it('verify is disabled until 6 digits are entered', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'code' })} />)
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '12345' } })
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '123456' } })
    expect((screen.getByTestId('recovery-verify') as HTMLButtonElement).disabled).toBe(false)
  })

  it('verify calls recoverVerify with phone + code', () => {
    const I = makeI({ recoveryStep: 'code' })
    render(<ForgotForm I={I} />)
    fireEvent.change(screen.getByTestId('recovery-code-input'), { target: { value: '123456' } })
    fireEvent.click(screen.getByTestId('recovery-verify'))
    expect(I.recoverVerify).toHaveBeenCalledWith('+15551234567', '123456')
  })

  it('change number returns to the phone step', () => {
    const I = makeI({ recoveryStep: 'code' })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-change-number'))
    expect(I.setRecoveryStep).toHaveBeenCalledWith('phone')
  })
})

describe('ForgotForm — pick step', () => {
  const accounts = [
    { username: 'alice', email: 'a@x.com' },
    { username: 'bob', email: '' },
  ]

  it('renders the account list', () => {
    render(<ForgotForm I={makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })} />)
    expect(screen.getByTestId('recovery-account-list')).toBeTruthy()
    expect(screen.getByTestId('recovery-account-alice')).toBeTruthy()
    expect(screen.getByTestId('recovery-account-bob')).toBeTruthy()
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
    expect(I.recoverComplete).toHaveBeenCalledWith('+15551234567', '', 'alice', undefined)
  })

  it('a new password is passed through to recoverComplete', () => {
    const I = makeI({ recoveryStep: 'pick', recoveryAccounts: accounts })
    render(<ForgotForm I={I} />)
    fireEvent.click(screen.getByTestId('recovery-account-alice'))
    fireEvent.change(screen.getByTestId('recovery-new-password'), { target: { value: 'brand-new' } })
    fireEvent.click(screen.getByTestId('recovery-sign-in'))
    expect(I.recoverComplete).toHaveBeenCalledWith('+15551234567', '', 'alice', 'brand-new')
  })
})
