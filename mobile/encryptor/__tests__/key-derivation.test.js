import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED_A = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED_A[i] = i;

const SEED_B = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED_B[i] = 32 - i;

describe('deriveIdentityKeys', () => {
  it('returns ed25519 keypair with correct lengths', () => {
    const keys = crypto.deriveIdentityKeys(SEED_A);
    expect(keys.privateKey.length).toBe(64);
    expect(keys.publicKey.length).toBe(64);
    expect(keys.privateKeyBytes.length).toBe(32);
    expect(keys.publicKeyBytes.length).toBe(32);
  });

  it('is deterministic — same seed produces same keys', () => {
    const k1 = crypto.deriveIdentityKeys(SEED_A);
    const k2 = crypto.deriveIdentityKeys(SEED_A);
    expect(k1.privateKey).toBe(k2.privateKey);
    expect(k1.publicKey).toBe(k2.publicKey);
  });

  it('different seeds produce different keys', () => {
    const kA = crypto.deriveIdentityKeys(SEED_A);
    const kB = crypto.deriveIdentityKeys(SEED_B);
    expect(kA.publicKey).not.toBe(kB.publicKey);
    expect(kA.privateKey).not.toBe(kB.privateKey);
  });
});

describe('deriveExchangeKeys', () => {
  it('returns x25519 keypair with correct lengths', () => {
    const keys = crypto.deriveExchangeKeys(SEED_A);
    expect(keys.privateKey.length).toBe(64);
    expect(keys.publicKey.length).toBe(64);
    expect(keys.privateKeyBytes.length).toBe(32);
    expect(keys.publicKeyBytes.length).toBe(32);
  });

  it('is deterministic', () => {
    const k1 = crypto.deriveExchangeKeys(SEED_A);
    const k2 = crypto.deriveExchangeKeys(SEED_A);
    expect(k1.privateKey).toBe(k2.privateKey);
    expect(k1.publicKey).toBe(k2.publicKey);
  });

  it('different seeds produce different keys', () => {
    const kA = crypto.deriveExchangeKeys(SEED_A);
    const kB = crypto.deriveExchangeKeys(SEED_B);
    expect(kA.publicKey).not.toBe(kB.publicKey);
  });
});

describe('key domain separation', () => {
  it('identity and exchange keys from same seed are different', () => {
    const id = crypto.deriveIdentityKeys(SEED_A);
    const ex = crypto.deriveExchangeKeys(SEED_A);
    expect(id.publicKey).not.toBe(ex.publicKey);
    expect(id.privateKey).not.toBe(ex.privateKey);
  });
});
