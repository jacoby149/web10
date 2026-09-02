import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import ConsentView from '../components/Consent/ConsentView'

vi.mock('../interfaces/authAdapter', () => ({
  default: () => ({}),
}))

// Regression: a signed-out visitor arriving from an app (consent flow) must be
// able to reach signup/forgot. ConsentView used to render only the embedded
// LoginForm regardless of I.mode, so "Create a new account" (setMode('signup'))
// and "Forgot username or password?" (setMode('forgot')) changed state but the
// screen never changed — both buttons looked bricked (reported on dev, 23.07).
function Harness({ initialMode = 'login' }: { initialMode?: string }) {
  const [mode, setMode] = React.useState(initialMode)
  const I: Record<string, any> = {
    mode,
    setMode,
    isAuthenticated: () => false,
    services: [],
    pendingACRs: [],
    v3Contracts: [],
    wapi: { readToken: () => null },
    config: { REACT_APP_DEFAULT_API: 'api.localhost' },
    phone: '',
    login: vi.fn(),
    signup: vi.fn(),
    recover: vi.fn(),
    setStatus: vi.fn(),
  }
  return <ConsentView I={I} />
}

describe('ConsentView signed-out mode switching', () => {
  it('shows the embedded login form by default', () => {
    render(<Harness />)
    expect(screen.getByTestId('login-submit')).toBeTruthy()
    expect(screen.getByTestId('login-create-account')).toBeTruthy()
  })

  it('"Create a new account" swaps in the signup form', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('login-create-account'))
    expect(screen.getByTestId('signup-submit')).toBeTruthy()
    expect(screen.queryByTestId('login-submit')).toBeNull()
  })

  it('signup links back to login', () => {
    render(<Harness initialMode="signup" />)
    fireEvent.click(screen.getByTestId('signup-login-link'))
    expect(screen.getByTestId('login-submit')).toBeTruthy()
  })

  it('"Forgot username or password?" swaps in the recover form', () => {
    render(<Harness />)
    fireEvent.click(screen.getByTestId('login-forgot-link'))
    expect(screen.getByTestId('recovery-send-code')).toBeTruthy()
  })

  it('forgot Cancel returns to login (not the app store) in the consent flow', () => {
    render(<Harness initialMode="forgot" />)
    fireEvent.click(screen.getByTestId('recovery-back-to-login'))
    expect(screen.getByTestId('login-submit')).toBeTruthy()
  })
})
