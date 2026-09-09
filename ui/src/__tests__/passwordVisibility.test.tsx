import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import SignupForm from '../components/CredentialPage/SignupForm'

function harness(overrides: Record<string, any> = {}) {
  return {
    config: { REACT_APP_BETA_REQUIRED: false },
    phone: '',
    setMode: vi.fn(),
    signup: vi.fn(),
    status: null,
    ...overrides,
  }
}

describe('SignupForm — password visibility toggle', () => {
  it('password fields start hidden (type=password) with an eye toggle', () => {
    render(<SignupForm I={harness()} />)
    const pw = screen.getByTestId('password-input') as HTMLInputElement
    const retype = screen.getByTestId('retype-password-input') as HTMLInputElement
    expect(pw.type).toBe('password')
    expect(retype.type).toBe('password')
    expect(screen.getByTestId('password-input-toggle')).toBeTruthy()
    expect(screen.getByTestId('retype-password-input-toggle')).toBeTruthy()
  })

  it('the eye reveals the password (type=text) and hides it again, value preserved', () => {
    render(<SignupForm I={harness()} />)
    const pw = screen.getByTestId('password-input') as HTMLInputElement
    const toggle = screen.getByTestId('password-input-toggle')

    fireEvent.change(pw, { target: { value: 'correct-horse' } })
    expect(pw.type).toBe('password')

    fireEvent.click(toggle)
    expect(pw.type).toBe('text')
    expect(pw.value).toBe('correct-horse')
    expect(toggle).toHaveAttribute('aria-label', 'Hide password')

    fireEvent.click(toggle)
    expect(pw.type).toBe('password')
    expect(pw.value).toBe('correct-horse')
    expect(toggle).toHaveAttribute('aria-label', 'Show password')
  })

  it('the password and retype toggles are independent', () => {
    render(<SignupForm I={harness()} />)
    const pw = screen.getByTestId('password-input') as HTMLInputElement
    const retype = screen.getByTestId('retype-password-input') as HTMLInputElement

    fireEvent.click(screen.getByTestId('password-input-toggle'))
    expect(pw.type).toBe('text')
    expect(retype.type).toBe('password')

    fireEvent.click(screen.getByTestId('retype-password-input-toggle'))
    expect(pw.type).toBe('text')
    expect(retype.type).toBe('text')
  })

  it('the toggle does not submit the form', () => {
    const I = harness()
    render(<SignupForm I={I} />)
    fireEvent.click(screen.getByTestId('password-input-toggle'))
    expect(I.signup).not.toHaveBeenCalled()
  })
})
