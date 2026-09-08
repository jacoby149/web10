import { describe, it, expect, beforeEach } from 'vitest'
import {
  getRememberedAccounts,
  rememberAccount,
  removeAccount,
} from '../lib/rememberedAccounts'

describe('rememberedAccounts', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty', () => {
    expect(getRememberedAccounts()).toEqual([])
  })

  it('remembers an account', () => {
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    expect(getRememberedAccounts()).toEqual([
      { username: 'alice', provider: 'api.web10.app' },
    ])
  })

  it('moves a re-remembered account to the front (most recent first)', () => {
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    rememberAccount({ username: 'bob', provider: 'api.web10.app' })
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    expect(getRememberedAccounts().map((a) => a.username)).toEqual(['alice', 'bob'])
  })

  it('dedupes by (provider, username)', () => {
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    expect(getRememberedAccounts()).toHaveLength(1)
  })

  it('keeps the same username on a different provider distinct', () => {
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    rememberAccount({ username: 'alice', provider: 'api.other.app' })
    expect(getRememberedAccounts()).toHaveLength(2)
  })

  it('caps at 5, dropping the oldest', () => {
    for (let i = 1; i <= 6; i++) {
      rememberAccount({ username: `u${i}`, provider: 'api.web10.app' })
    }
    const accounts = getRememberedAccounts()
    expect(accounts).toHaveLength(5)
    expect(accounts.map((a) => a.username)).toEqual(['u6', 'u5', 'u4', 'u3', 'u2'])
  })

  it('removes an account', () => {
    rememberAccount({ username: 'alice', provider: 'api.web10.app' })
    rememberAccount({ username: 'bob', provider: 'api.web10.app' })
    removeAccount({ username: 'alice', provider: 'api.web10.app' })
    expect(getRememberedAccounts()).toEqual([
      { username: 'bob', provider: 'api.web10.app' },
    ])
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem('web10.rememberedAccounts', 'not-json')
    expect(getRememberedAccounts()).toEqual([])
    localStorage.setItem(
      'web10.rememberedAccounts',
      JSON.stringify([{ username: 'x' }]),
    )
    expect(getRememberedAccounts()).toEqual([])
  })
})
