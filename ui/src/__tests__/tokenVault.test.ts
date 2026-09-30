import { describe, it, expect, beforeEach } from 'vitest'
import {
  vaultToken,
  getVaultedToken,
  removeVaultedToken,
  vaultedAccountsFor,
} from '../lib/tokenVault'

describe('tokenVault', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('starts empty', () => {
    expect(vaultedAccountsFor('api.web10.app')).toEqual([])
  })

  it('vaults a token and reads it back', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-alice' })
    expect(getVaultedToken('alice', 'api.web10.app')).toBe('tok-alice')
  })

  it('returns null for an unknown account', () => {
    expect(getVaultedToken('nobody', 'api.web10.app')).toBeNull()
  })

  it('moves a re-vaulted account to the front (most recent first)', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a1' })
    vaultToken({ username: 'bob', provider: 'api.web10.app', token: 'tok-b' })
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a2' })
    const accounts = vaultedAccountsFor('api.web10.app')
    expect(accounts.map((a) => a.username)).toEqual(['alice', 'bob'])
    // The re-vault replaced the token.
    expect(getVaultedToken('alice', 'api.web10.app')).toBe('tok-a2')
  })

  it('dedupes by (provider, username)', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a1' })
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a2' })
    expect(vaultedAccountsFor('api.web10.app')).toHaveLength(1)
  })

  it('keeps the same username on a different provider distinct', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a' })
    vaultToken({ username: 'alice', provider: 'api.other.app', token: 'tok-b' })
    expect(vaultedAccountsFor('api.web10.app')).toHaveLength(1)
    expect(vaultedAccountsFor('api.other.app')).toHaveLength(1)
  })

  it('caps at 5, dropping the oldest', () => {
    for (let i = 1; i <= 6; i++) {
      vaultToken({ username: `u${i}`, provider: 'api.web10.app', token: `tok-${i}` })
    }
    const accounts = vaultedAccountsFor('api.web10.app')
    expect(accounts).toHaveLength(5)
    expect(accounts.map((a) => a.username)).toEqual(['u6', 'u5', 'u4', 'u3', 'u2'])
  })

  it('vaultedAccountsFor filters to the expected provider', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a' })
    vaultToken({ username: 'bob', provider: 'api.other.app', token: 'tok-b' })
    // Only the token from THIS node is offered for a one-tap switch — a
    // token from another provider would 401 here.
    expect(vaultedAccountsFor('api.web10.app').map((a) => a.username)).toEqual(['alice'])
    // An empty expected provider returns everything (no filtering).
    expect(vaultedAccountsFor('').map((a) => a.username)).toEqual(['bob', 'alice'])
  })

  it('removes a vaulted token', () => {
    vaultToken({ username: 'alice', provider: 'api.web10.app', token: 'tok-a' })
    vaultToken({ username: 'bob', provider: 'api.web10.app', token: 'tok-b' })
    removeVaultedToken('alice', 'api.web10.app')
    expect(getVaultedToken('alice', 'api.web10.app')).toBeNull()
    expect(getVaultedToken('bob', 'api.web10.app')).toBe('tok-b')
  })

  it('ignores malformed stored data', () => {
    localStorage.setItem('web10.tokenVault', 'not-json')
    expect(vaultedAccountsFor('api.web10.app')).toEqual([])
    localStorage.setItem(
      'web10.tokenVault',
      JSON.stringify([{ username: 'x', provider: 'api.web10.app' }]),
    )
    expect(vaultedAccountsFor('api.web10.app')).toEqual([])
  })
})
