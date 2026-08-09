import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useMockInterface from '../interfaces/MockInterface'
import mockServices from '../mocks/mockServices'
import mockRequests from '../mocks/mockRequests'

vi.mock('../interfaces/authAdapter', () => ({
  default: () => ({}),
}))

describe('useMockInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with default state', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.theme).toBe('dark')
    expect(result.current.mode).toBe('contracts')
    expect(result.current.menuCollapsed).toBe(true)
    expect(result.current.search).toBe('')
    expect(result.current.auth).toBe(false)
    expect(result.current.verified).toBe(false)
  })

  it('loads mock services', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.services).toEqual(mockServices)
    expect(result.current.services).toHaveLength(5)
  })

  it('loads mock requests', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.requests).toEqual(mockRequests)
    expect(result.current.requests).toHaveLength(3)
  })

  it('login sets auth to true and mode to contracts', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.login()
    })

    expect(result.current.auth).toBe(true)
    expect(result.current.isAuthenticated()).toBe(true)
    expect(result.current.mode).toBe('contracts')
  })

  it('logout sets auth to false and mode to login', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.login()
      result.current.logout()
    })

    expect(result.current.auth).toBe(false)
    expect(result.current.isAuthenticated()).toBe(false)
    expect(result.current.mode).toBe('login')
  })

  it('recover sets auth to true and mode to contracts', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.recover()
    })

    expect(result.current.auth).toBe(true)
    expect(result.current.mode).toBe('contracts')
  })

  it('signup sets auth to true and mode to contracts', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.signup()
    })

    expect(result.current.auth).toBe(true)
    expect(result.current.mode).toBe('contracts')
  })

  it('setMode collapses menu and clears search', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.setSearch('something')
      result.current.setMode('contracts')
    })

    expect(result.current.mode).toBe('contracts')
    expect(result.current.menuCollapsed).toBe(true)
    expect(result.current.search).toBe('')
  })

  it('toggleMenuCollapsed toggles state', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.menuCollapsed).toBe(true)

    act(() => {
      result.current.toggleMenuCollapsed()
    })

    expect(result.current.menuCollapsed).toBe(false)

    act(() => {
      result.current.toggleMenuCollapsed()
    })

    expect(result.current.menuCollapsed).toBe(true)
  })

  it('toggleTheme switches between dark and light', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.theme).toBe('dark')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('light')

    act(() => {
      result.current.toggleTheme()
    })

    expect(result.current.theme).toBe('dark')
  })

  it('verificationChange sets verified when value is 6 chars', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.verified).toBe(false)

    act(() => {
      result.current.verificationChange('12345')
    })

    expect(result.current.verified).toBe(false)

    act(() => {
      result.current.verificationChange('123456')
    })

    expect(result.current.verified).toBe(true)
  })

  it('changePhoneNumber resets verified', () => {
    const { result } = renderHook(() => useMockInterface())

    act(() => {
      result.current.verificationChange('123456')
    })

    expect(result.current.verified).toBe(true)

    act(() => {
      result.current.changePhoneNumber()
    })

    expect(result.current.verified).toBe(false)
  })

  it('approveACR removes the ACR from pending list', () => {
    const { result } = renderHook(() => useMockInterface())

    const acr = {
      allowed_origin: 'app.example.com',
      permissions: { notes: ['readAll', 'create'] },
    }

    act(() => {
      result.current.setPendingACRs([acr])
    })
    expect(result.current.pendingACRs).toHaveLength(1)

    act(() => {
      result.current.approveACR(acr)
    })
    expect(result.current.pendingACRs).toHaveLength(0)
  })

  it('isVerified returns current verified state', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.isVerified()).toBe(false)

    act(() => {
      result.current.verificationChange('123456')
    })

    expect(result.current.isVerified()).toBe(true)
  })

  it('has config object', () => {
    const { result } = renderHook(() => useMockInterface())

    expect(result.current.config).toBeDefined()
    expect(result.current.config.REACT_APP_DEFAULT_API).toBe('api.web10.app')
  })
})
