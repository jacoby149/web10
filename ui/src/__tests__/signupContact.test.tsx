import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SignupForm from '../components/CredentialPage/SignupForm'

function harness(overrides: Record<string, any> = {}) {
  return {
    config: { REACT_APP_BETA_REQUIRED: false, REACT_APP_DEFAULT_API: 'api.web10.app' },
    contact: '',
    setContact: vi.fn(),
    signup: vi.fn(),
    setMode: vi.fn(),
    status: null,
    ...overrides,
  }
}

function fillForm(I: Record<string, any>, contact: string) {
  fireEvent.change(screen.getByTestId('username-input'), { target: { value: 'newuser' } })
  fireEvent.change(screen.getByTestId('password-input'), { target: { value: 'hunter22' } })
  fireEvent.change(screen.getByTestId('retype-password-input'), { target: { value: 'hunter22' } })
  fireEvent.change(screen.getByTestId('contact-input'), { target: { value: contact } })
  fireEvent.click(screen.getByTestId('signup-submit'))
}

describe('SignupForm — phone OR email contact (D61)', () => {
  it('shows a phone-or-email contact field, not a phone-only field', () => {
    render(<SignupForm I={harness()} />)
    expect(screen.getByTestId('contact-input')).toBeTruthy()
    expect(screen.getByLabelText(/phone number or email/i)).toBeTruthy()
    // The old phone-only field is gone from the registration form.
    expect(screen.queryByTestId('phone-input')).toBeNull()
  })

  it('an email contact is passed as email to signup', () => {
    const I = harness()
    render(<SignupForm I={I} />)
    fillForm(I, 'you@example.com')
    expect(I.signup).toHaveBeenCalledWith(
      'api.web10.app', 'newuser', 'hunter22', 'hunter22', '', 'you@example.com',
    )
  })

  it('a phone contact is passed as phone to signup', () => {
    const I = harness()
    render(<SignupForm I={I} />)
    fillForm(I, '+1 555 123 4567')
    expect(I.signup).toHaveBeenCalledWith(
      'api.web10.app', 'newuser', 'hunter22', 'hunter22', '', '+1 555 123 4567',
    )
  })

  it('the contact inputMode flips to email when the value looks like an address', () => {
    render(<SignupForm I={harness()} />)
    const input = screen.getByTestId('contact-input') as HTMLInputElement
    expect(input.inputMode).toBe('tel')
    fireEvent.change(input, { target: { value: 'you@' } })
    expect(input.inputMode).toBe('email')
  })
})
