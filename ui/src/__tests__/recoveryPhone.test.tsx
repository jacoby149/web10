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
  wapiAuthInit: () => ({ SMRListen: vi.fn() }),
}))

describe('Interface servicesLoad — recovery phone read-back from server', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sets I.phone from the star record phone_number (survives refresh)', async () => {
    mockWapi.read.mockResolvedValue({ data: [STAR_RECORD, POSTS_TERMS] })
    const { default: useInterface } = await import('../interfaces/Interface')
    const { result } = renderHook(() => useInterface())
    await waitFor(() => expect(result.current.phone).toBe('+15559876543'))
    expect(mockWapi.read).toHaveBeenCalledWith('services')
  })

  it('leaves I.phone empty when the star record has no phone', async () => {
    mockWapi.read.mockResolvedValue({
      data: [{ ...STAR_RECORD, phone_number: undefined }, POSTS_TERMS],
    })
    const { default: useInterface } = await import('../interfaces/Interface')
    const { result } = renderHook(() => useInterface())
    await waitFor(() => expect(mockWapi.read).toHaveBeenCalledWith('services'))
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
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('POSTs to /set_recovery_phone with {token, query:{phone}}', async () => {
    ;(axios.post as any).mockResolvedValue({ data: { phone_number: '15559876543' } })
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    const I = mockI()
    render(<RecoveryContact I={I} />)
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '15559876543' } })
    fireEvent.click(screen.getByTestId('recovery-phone-save'))
    await waitFor(() =>
      expect(axios.post).toHaveBeenCalledWith('http://api.localhost/set_recovery_phone', {
        token: 'tok123',
        query: { phone: '15559876543' },
      }),
    )
  })

  it('re-reads from the server after save (servicesLoad), never sets phone locally', async () => {
    ;(axios.post as any).mockResolvedValue({ data: { phone_number: '15559876543' } })
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
    ;(axios.post as any).mockRejectedValue({ response: { data: { detail: 'too many requests — try again later' } } })
    const { default: RecoveryContact } = await import('../components/Settings/RecoveryContact')
    const I = mockI()
    render(<RecoveryContact I={I} />)
    fireEvent.change(screen.getByTestId('phone-input'), { target: { value: '15559876543' } })
    fireEvent.click(screen.getByTestId('recovery-phone-save'))
    await waitFor(() =>
      expect(I.setStatus).toHaveBeenCalledWith('too many requests — try again later'),
    )
    expect(I.servicesLoad).not.toHaveBeenCalled()
  })
})
