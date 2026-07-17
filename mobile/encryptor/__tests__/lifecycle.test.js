import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

function randomNonce() {
  const n = new Uint8Array(24);
  for (let i = 0; i < 24; i++) n[i] = Math.floor(Math.random() * 256);
  return n;
}

describe('layered revoke', () => {
  it('after epoch bump, old key cannot decrypt', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const enc = crypto.encrypt(key, 'before revoke', randomNonce());
    const rotated = crypto.mint(SEED, 'friends', 'secret', key);
    expect(() => crypto.decrypt(rotated, enc)).toThrow();
  });

  it('rotated key can encrypt/decrypt new content', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const rotated = crypto.mint(SEED, 'friends', 'secret', key);
    const enc = crypto.encrypt(rotated, 'after revoke', randomNonce());
    expect(crypto.decrypt(rotated, enc)).toBe('after revoke');
  });
});

describe('HKDF domain separation', () => {
  it('identity, exchange, and named keys are all distinct', () => {
    const id = crypto.deriveIdentityKeys(SEED);
    const ex = crypto.deriveExchangeKeys(SEED);
    const named = crypto.mint(SEED, 'friends', 'keypair');
    expect(id.publicKey).not.toBe(ex.publicKey);
    expect(id.publicKey).not.toBe(named.publicKey);
    expect(ex.publicKey).not.toBe(named.publicKey);
  });
});

describe('keypair type enforcement', () => {
  it('cannot sign with secret key', () => {
    const key = crypto.mint(SEED, 'secret', 'secret');
    expect(() => crypto.sign(key, 'data')).toThrow('Not a signing keypair');
  });

  it('cannot encrypt with keypair', () => {
    const key = crypto.mint(SEED, 'kp', 'keypair');
    expect(() => crypto.encrypt(key, 'data', randomNonce())).toThrow('Not a symmetric key');
  });
});

describe('grant expiry enforcement', () => {
  it('future expiry is valid', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const grant = crypto.wrap(key, 'recipient', {
      expires: Date.now() + 86400000,
    }, 'g1');
    expect(() => crypto.unwrap(grant)).not.toThrow();
  });

  it('past expiry is rejected', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const grant = crypto.wrap(key, 'recipient', {
      expires: Date.now() - 1000,
    }, 'g2');
    expect(() => crypto.unwrap(grant)).toThrow('expired');
  });

  it('no expiry is always valid', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const grant = crypto.wrap(key, 'recipient', {}, 'g3');
    expect(() => crypto.unwrap(grant)).not.toThrow();
  });
});

describe('crypto integrity', () => {
  it('single byte tamper in ciphertext is detected', () => {
    const key = crypto.mint(SEED, 'enc', 'secret');
    const enc = crypto.encrypt(key, 'test', randomNonce());
    const bytes = crypto.decodeBase64(enc.ciphertext);
    bytes[bytes.length - 1] ^= 0xff;
    expect(() => crypto.decrypt(key, { ...enc, ciphertext: crypto.encodeBase64(bytes) })).toThrow();
  });

  it('nonce reuse produces identical output (deterministic)', () => {
    const key = crypto.mint(SEED, 'enc', 'secret');
    const nonce = new Uint8Array(24);
    const enc1 = crypto.encrypt(key, 'same', nonce);
    const enc2 = crypto.encrypt(key, 'same', nonce);
    expect(enc1.ciphertext).toBe(enc2.ciphertext);
  });
});
