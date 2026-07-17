import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import useContractInterface from '../interfaces/ContractInterface'

const mockChangeTerms = vi.fn()

const mockInterface = {
  changeTerms: mockChangeTerms,
}

const createMockData = (overrides = {}) => ({
  service: 'posts',
  cross_origins: ['localhost'],
  whitelist: [
    { username: '.*', provider: '.*', read: true },
  ],
  blacklist: [],
  ...overrides,
})

describe('useContractInterface', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes with provided data', () => {
    const data = createMockData()
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    expect(result.current.data).toEqual(data)
    expect(result.current.mode).toBe('view')
    expect(result.current.isRequest()).toBe(false)
  })

  it('defaults data to null when not provided', () => {
    const { result } = renderHook(() => useContractInterface(mockInterface, null, false))

    expect(result.current.data).toBeNull()
  })

  it('switches to edit mode', () => {
    const data = createMockData()
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.edit()
    })

    expect(result.current.mode).toBe('edit')
  })

  it('switches back to view mode', () => {
    const data = createMockData()
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.edit()
      result.current.view()
    })

    expect(result.current.mode).toBe('view')
  })

  it('adds a whitelist entry', () => {
    const data = createMockData({ whitelist: [] })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    const permission = { username: 'alice', provider: 'web10.app', create: true }

    act(() => {
      result.current.addWhiteList(permission)
    })

    expect(result.current.data.whitelist).toHaveLength(1)
    expect(result.current.data.whitelist[0]).toEqual(permission)
  })

  it('deletes a whitelist entry by index', () => {
    const data = createMockData({
      whitelist: [
        { username: 'alice', provider: 'p', read: true },
        { username: 'bob', provider: 'p', read: true },
      ],
    })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.deleteWhiteListEntry(0)
    })

    expect(result.current.data.whitelist).toHaveLength(1)
    expect(result.current.data.whitelist[0].username).toBe('bob')
  })

  it('adds a blacklist entry', () => {
    const data = createMockData({ blacklist: [] })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    const permission = { username: 'banned', provider: 'web10.app', read: true }

    act(() => {
      result.current.addBlackList(permission)
    })

    expect(result.current.data.blacklist).toHaveLength(1)
    expect(result.current.data.blacklist[0]).toEqual(permission)
  })

  it('deletes a blacklist entry by index', () => {
    const data = createMockData({
      blacklist: [
        { username: 'bad1', provider: 'p', read: true },
        { username: 'bad2', provider: 'p', read: true },
      ],
    })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.deleteBlackListEntry(1)
    })

    expect(result.current.data.blacklist).toHaveLength(1)
    expect(result.current.data.blacklist[0].username).toBe('bad1')
  })

  it('adds a cross-origin site', () => {
    const data = createMockData({ cross_origins: ['localhost'] })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.addSite('newapp.com')
    })

    expect(result.current.data.cross_origins).toContain('newapp.com')
    expect(result.current.data.cross_origins).toHaveLength(2)
  })

  it('deletes a cross-origin site by index', () => {
    const data = createMockData({ cross_origins: ['localhost', 'app.com', 'other.com'] })
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.deleteSite(1)
    })

    expect(result.current.data.cross_origins).toEqual(['localhost', 'other.com'])
  })

  it('saves changes calls interface changeTerms', () => {
    const data = createMockData()
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    act(() => {
      result.current.saveChanges()
    })

    expect(mockChangeTerms).toHaveBeenCalledWith(data)
    expect(result.current.mode).toBe('view')
  })

  it('clears changes resets to original data', () => {
    const original = createMockData({ whitelist: [{ username: 'original', provider: 'p', read: true }] })
    const { result } = renderHook(() => useContractInterface(mockInterface, original, false))

    act(() => {
      result.current.addWhiteList({ username: 'new', provider: 'p', read: true })
    })

    expect(result.current.data.whitelist).toHaveLength(2)

    act(() => {
      result.current.clearChanges()
    })

    expect(result.current.data.whitelist).toHaveLength(1)
    expect(result.current.data.whitelist[0].username).toBe('original')
    expect(result.current.mode).toBe('view')
  })

  it('toggles hide state', () => {
    const data = createMockData()
    const { result } = renderHook(() => useContractInterface(mockInterface, data, false))

    expect(result.current.hide).toBe(true)

    act(() => {
      result.current.toggleHide()
    })

    expect(result.current.hide).toBe(false)

    act(() => {
      result.current.toggleHide()
    })

    expect(result.current.hide).toBe(true)
  })

  it('reports isRequest correctly', () => {
    const data = createMockData()
    const { result: result1 } = renderHook(() => useContractInterface(mockInterface, data, true))
    const { result: result2 } = renderHook(() => useContractInterface(mockInterface, data, false))

    expect(result1.current.isRequest()).toBe(true)
    expect(result2.current.isRequest()).toBe(false)
  })
})
