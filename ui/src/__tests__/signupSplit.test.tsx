import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import useInterface from '../interfaces/Interface'

// The phone/email split in I.signup: the registration contact is phone OR
// email (D61); the form passes the raw contact, and I.signup routes it to the
// right v3.signup field. The node's `require_contact` config enforces the
// requirement server-side — the client only validates format.

const mockV3 = {
  signup: vi.fn(() => Promise.resolve({})),
  login: vi.fn(() => Promise.resolve({})),
  getProfile: vi.fn(() => Promise.resolve({})),
  signOut: vi.fn(),
  readToken: () => null,
  state: { token: null, apiOrigin: 'http://api.localhost' },
}

vi.mock('axios', () => ({ default: { post: vi.fn() } }))
vi.mock('web10-npm', () => ({
  wapiInit: () => ({ readToken: () => null, scrubToken: vi.fn(), signOut: vi.fn(), isSignedIn: () => false }),
  wapiAuthInit: () => ({ contractListen: vi.fn() }),
  createV3Client: () => mockV3,
}))

describe('I.signup — phone OR email contact routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('routes an email contact to the email field', () => {
    const { result } = renderHook(() => useInterface())
    result.current.signup('api.web10.app', 'newuser', 'hunter22', 'hunter22', '', 'you@example.com')
    expect(mockV3.signup).toHaveBeenCalledWith('newuser', 'hunter22', undefined, 'you@example.com')
  })

  it('routes a phone contact to the phone field', () => {
    const { result } = renderHook(() => useInterface())
    result.current.signup('api.web10.app', 'newuser', 'hunter22', 'hunter22', '', '+1 555 123 4567')
    expect(mockV3.signup).toHaveBeenCalledWith('newuser', 'hunter22', '+1 555 123 4567', undefined)
  })

  it('accepts an empty contact (server decides if one is required)', () => {
    const { result } = renderHook(() => useInterface())
    result.current.signup('api.web10.app', 'newuser', 'hunter22', 'hunter22', '', '')
    expect(mockV3.signup).toHaveBeenCalledWith('newuser', 'hunter22', undefined, undefined)
  })

  it('rejects a non-empty contact that is neither a phone nor an email', async () => {
    const { result } = renderHook(() => useInterface())
    act(() => {
      result.current.signup('api.web10.app', 'newuser', 'hunter22', 'hunter22', '', 'not a contact')
    })
    expect(mockV3.signup).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('Enter a valid phone number or email'))
  })
})
