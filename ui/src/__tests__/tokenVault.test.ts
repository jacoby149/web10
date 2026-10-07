import { describe, it, expect, beforeEach } from 'vitest';
import { vaultToken, getVaultedToken, removeVaultedToken, vaultedAccountsFor } from '../lib/tokenVault';

const jwt = (claims: object) => `${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).replace(/=/g, '')}.${btoa(JSON.stringify(claims)).replace(/=/g, '')}.signature`;
const entry = (username: string, provider = 'api.web10.app', revision = 1) => ({ username, provider, token: jwt({
  username, provider, site: provider, credential_kind: 'self', expires: '2099-01-01T00:00:00Z', revision,
}) });

describe('tokenVault', () => {
  beforeEach(() => localStorage.clear());
  it('starts empty and returns null for unknown accounts', () => {
    expect(vaultedAccountsFor('api.web10.app')).toEqual([]);
    expect(getVaultedToken('nobody', 'api.web10.app')).toBeNull();
  });
  it('vaults a self token and reads it back', () => {
    vaultToken(entry('alice'));
    expect(getVaultedToken('alice', 'api.web10.app')).toBe(entry('alice').token);
  });
  it('replaces and deduplicates an account, moving it to the front', () => {
    vaultToken(entry('alice'));
    vaultToken(entry('bob'));
    vaultToken(entry('alice', 'api.web10.app', 2));
    expect(vaultedAccountsFor('api.web10.app').map((a) => a.username)).toEqual(['alice', 'bob']);
    expect(getVaultedToken('alice', 'api.web10.app')).toBe(entry('alice', 'api.web10.app', 2).token);
  });
  it('keeps providers distinct and offers only the current provider', () => {
    vaultToken(entry('alice'));
    vaultToken(entry('alice', 'api.other.app'));
    expect(vaultedAccountsFor('api.web10.app')).toEqual([entry('alice')]);
    expect(vaultedAccountsFor('api.other.app')).toEqual([entry('alice', 'api.other.app')]);
    expect(vaultedAccountsFor('')).toHaveLength(2);
  });
  it('caps at five, dropping the oldest', () => {
    for (let i = 1; i <= 6; i++) vaultToken(entry(`u${i}`));
    expect(vaultedAccountsFor('api.web10.app').map((a) => a.username)).toEqual(['u6', 'u5', 'u4', 'u3', 'u2']);
  });
  it('removes a vaulted token', () => {
    vaultToken(entry('alice'));
    vaultToken(entry('bob'));
    removeVaultedToken('alice', 'api.web10.app');
    expect(getVaultedToken('alice', 'api.web10.app')).toBeNull();
    expect(getVaultedToken('bob', 'api.web10.app')).toBe(entry('bob').token);
  });
  it.each([
    { credential_kind: undefined }, { credential_kind: 'app', app_origin: 'https://app.example' },
    { expires: undefined }, { expires: 'invalid' }, { expires: '2000-01-01T00:00:00Z' },
    { site: 'auth.web10.app' }, { username: 'bob' }, { provider: 'api.other.app' },
  ])('purges invalid persisted tokens and rejects new vault entries: %j', (override) => {
    const invalid = { ...entry('alice'), token: jwt({ username: 'alice', provider: 'api.web10.app', site: 'api.web10.app',
      credential_kind: 'self', expires: '2099-01-01T00:00:00Z', ...override }) };
    localStorage.setItem('web10.tokenVault', JSON.stringify([invalid, entry('bob')]));
    expect(getVaultedToken('alice', 'api.web10.app')).toBeNull();
    expect(JSON.parse(localStorage.getItem('web10.tokenVault')!)).toEqual([entry('bob')]);
    vaultToken(invalid);
    expect(vaultedAccountsFor('api.web10.app')).toEqual([entry('bob')]);
  });
  it.each(['not-json', '{}', '[{"username":"x","provider":"api.web10.app","token":"broken"}]'])('ignores malformed storage: %s', (raw) => {
    localStorage.setItem('web10.tokenVault', raw);
    expect(vaultedAccountsFor('api.web10.app')).toEqual([]);
  });
});
