import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import LoginForm from '../components/CredentialPage/LoginForm'
import SignupForm from '../components/CredentialPage/SignupForm'
import ForgotForm from '../components/CredentialPage/ForgotForm'

// The auth forms used to be formless — divs plus a button whose click handler
// scraped the provider/username/password by element id. Password managers key
// off a real <form> to detect a login and offer fills; a formless login is a
// classic autofill-hostile pattern. These tests lock in the fix: a real <form>
// wrapping the credential fields, a type="submit" button, and name attributes
// on the inputs.

function loginHarness(overrides: Record<string, any> = {}) {
  return {
    config: { REACT_APP_DEFAULT_API: 'api.web10.app', REACT_APP_BETA_REQUIRED: false },
    rememberedAccounts: [],
    vaultedAccounts: [],
    setLoginUsername: vi.fn(),
    login: vi.fn(),
    signup: vi.fn(),
    setMode: vi.fn(),
    status: null,
    ...overrides,
  }
}

describe('LoginForm — autofill-friendly (a real form)', () => {
  it('wraps the credential fields in a <form> element', () => {
    render(<LoginForm I={loginHarness()} />)
    const submit = screen.getByTestId('login-submit')
    expect(submit.closest('form')).toBeTruthy()
    // The password field lives INSIDE that form (the manager's fill target).
    expect(screen.getByTestId('password-input').closest('form')).toBe(
      submit.closest('form'),
    )
  })

  it('the submit button is a type="submit" that submits the form', () => {
    const I = loginHarness()
    render(<LoginForm I={I} />)
    const submit = screen.getByTestId('login-submit')
    expect(submit).toHaveAttribute('type', 'submit')
    // Submitting the form (not a stray click) drives the login.
    fireEvent.submit(submit.closest('form')!)
    expect(I.login).toHaveBeenCalledTimes(1)
  })

  it('the username field carries a name attribute', () => {
    render(<LoginForm I={loginHarness()} />)
    expect(screen.getByTestId('username-input')).toHaveAttribute('name', 'username')
  })
})

describe('SignupForm — autofill-friendly (a real form)', () => {
  it('wraps the credential fields in a <form> element', () => {
    render(<SignupForm I={loginHarness()} />)
    const submit = screen.getByTestId('signup-submit')
    expect(submit.closest('form')).toBeTruthy()
    expect(screen.getByTestId('password-input').closest('form')).toBe(
      submit.closest('form'),
    )
  })

  it('the submit button is a type="submit" that submits the form', () => {
    const I = loginHarness()
    render(<SignupForm I={I} />)
    const submit = screen.getByTestId('signup-submit')
    expect(submit).toHaveAttribute('type', 'submit')
    fireEvent.change(screen.getByTestId('username-input'), { target: { value: 'newuser' } })
    fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'hunter22' } })
    fireEvent.change(screen.getByTestId('retype-password-input'), { target: { value: 'hunter22' } })
    fireEvent.change(screen.getByTestId('contact-input'), { target: { value: 'you@example.com' } })
    fireEvent.submit(submit.closest('form')!)
    expect(I.signup).toHaveBeenCalledWith(
      'api.web10.app', 'newuser', 'hunter22', 'hunter22', '', 'you@example.com',
    )
  })

  it('the username field carries a name attribute', () => {
    render(<SignupForm I={loginHarness()} />)
    expect(screen.getByTestId('username-input')).toHaveAttribute('name', 'username')
  })
})

describe('ForgotForm — autofill-friendly (a real form per step)', () => {
  function forgotHarness(overrides: Record<string, any> = {}) {
    return {
      recoveryStep: 'contact',
      recoveryContact: '',
      setRecoveryContact: vi.fn(),
      recoverRequest: vi.fn(),
      recoverVerify: vi.fn(),
      recoverComplete: vi.fn(),
      setMode: vi.fn(),
      status: null,
      ...overrides,
    }
  }

  it('the contact step wraps its field + button in a <form>', () => {
    render(<ForgotForm I={forgotHarness()} />)
    const submit = screen.getByTestId('recovery-send-code')
    expect(submit.closest('form')).toBeTruthy()
    expect(screen.getByTestId('recovery-contact-input').closest('form')).toBe(
      submit.closest('form'),
    )
  })

  it('the code step wraps the code field + button in a <form>', () => {
    render(<ForgotForm I={forgotHarness({ recoveryStep: 'code', recoveryContact: 'you@example.com' })} />)
    const submit = screen.getByTestId('recovery-verify')
    expect(submit.closest('form')).toBeTruthy()
    expect(screen.getByTestId('recovery-code-input').closest('form')).toBe(
      submit.closest('form'),
    )
  })

  it('the pick step wraps the account list + password + button in a <form>', () => {
    render(
      <ForgotForm
        I={forgotHarness({
          recoveryStep: 'pick',
          recoveryContact: 'you@example.com',
          recoveryAccounts: [{ username: 'alice' }],
        })}
      />,
    )
    const submit = screen.getByTestId('recovery-sign-in')
    expect(submit.closest('form')).toBeTruthy()
    expect(screen.getByTestId('recovery-account-list').closest('form')).toBe(
      submit.closest('form'),
    )
    expect(screen.getByTestId('recovery-new-password').closest('form')).toBe(
      submit.closest('form'),
    )
  })
})
