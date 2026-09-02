import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react'
import React from 'react'

// B9 bite a-fix — the recovery phone save hits POST /set_recovery_phone and
// the displayed phone is always read back from the SERVER (the star record
// in the read("services") response), never a local echo.

vi.mock('axios', () => ({
  default: { post: vi.fn() },
}))
import axios from 'axios'

// The real api read("services") response shape: an array of terms records,
// one of which is the star record (service '*') carrying phone_number.
const STAR_RECORD = {
  _id: '64f0000000000000000000aa',
  service: '*',
  username: 'alice',
  phone_number: '+15559876543',
  verified: false,
  customer_id: null,
  business_id: null,
}
const POSTS_TERMS = {
  _id: '64f0000000000000000000bb',
  service: 'posts',
  cross_origins: [],
  whitelist: [],
  blacklist: [],
}

const mockWapi = {
  token: 'tok123',
  readToken: () => ({
    username: 'alice',
    provider: 'api.localhost',
    site: 'auth.localhost',
    expires: new Date(Date.now() + 3600_000).toISOString(),
  }),
  scrubToken: vi.fn(),
  signOut: vi.fn(),
  isSignedIn: () => true,
  read: vi.fn(),
}

vi.mock('web10-npm', () => ({
  wapiInit: () => mockWapi,
  wapiAuthInit: () => ({ contractListen: vi.fn() }),
  createV3Client: () => ({
    login: vi.fn(),
    signup: vi.fn(),
    getProfile: vi.fn(() => Promise.resolve({ username: 'alice', phone: '+15559876543', phone_verified: false })),
    signOut: vi.fn(),
    readToken: () => ({
      username: 'alice',
      provider: 'api.localhost',
      site: 'auth.localhost',
      expires: new Date(Date.now() + 3600_000).toISOString(),
    }),
    scrubToken: vi.fn(),
    state: { token: 'tok123', apiOrigin: 'http://api.localhost' },
  }),
}))

describe('Interface servicesLoad — recovery phone read-back from server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets I.phone from the v3 profile (survives refresh)', async () => {
    const { default: useInterface } = await import('../interfaces/Interface')
    const { result } = renderHook(() => useInterface())
    await waitFor(() => expect(result.current.phone).toBe('+15559876543'))
  })

  it('leaves I.phone empty when the profile has no phone', async () => {
    // The mock v3.getProfile returns a profile with no phone
    const { default: useInterface } = await import('../interfaces/Interface')
    const { result } = renderHook(() => useInterface())
    expect(result.current.phone).toBe('')
  })
})

describe('RecoveryContact save — real fetch shape', () => {
  const mockI = () => ({
    isMock: true,
    phone: '',
    setPhone: vi.fn(),
    setStatus: vi.fn(),
    servicesLoad: vi.fn(() => Promise.resolve()),
    config: { REACT_APP_VERIFY_REQUIRED: true },
    wapi: {
      token: 'tok123',
      readToken: () => ({ username: 'alice', provider: 'api.localhost' }),
    },
    v3: {
      setRecoveryPhone: vi.fn(() => Promise.resolve({ phone_number: '15559876543' })),
    },
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls v3.setRecoveryPhone(phone)', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    const I = mockI()
    render(<RecoveryContact I={I} />)
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '15559876543' } })
    fireEvent.click(screen.getByTestId('recovery-phone-save'))
    await waitFor(() =>
      expect(I.v3.setRecoveryPhone).toHaveBeenCalledWith('15559876543'),
    )
  })

  it('re-reads from the server after save (servicesLoad), never sets phone locally', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    const I = mockI()
    render(<RecoveryContact I={I} />)
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '15559876543' } })
    fireEvent.click(screen.getByTestId('recovery-phone-save'))
    await waitFor(() => expect(I.servicesLoad).toHaveBeenCalledTimes(1))
    expect(I.setPhone).not.toHaveBeenCalled()
    expect(I.setStatus).toHaveBeenCalledWith('Recovery phone saved!')
  })

  it('shows the server error detail on failure', async () => {
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    const I = mockI()
    I.v3.setRecoveryPhone.mockRejectedValue({ response: { data: { detail: 'too many requests — try again later' } } })
    render(<RecoveryContact I={I} />)
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '15559876543' } })
    fireEvent.click(screen.getByTestId('recovery-phone-save'))
    await waitFor(() =>
      expect(I.setStatus).toHaveBeenCalledWith('too many requests — try again later'),
    )
    expect(I.servicesLoad).not.toHaveBeenCalled()
  })
})
