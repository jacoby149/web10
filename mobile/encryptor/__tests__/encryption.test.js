import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

function randomNonce() {
  const n = new Uint8Array(24);
  for (let i = 0; i < 24; i++) n[i] = Math.floor(Math.random() * 256);
  return n;
}

describe('encrypt / decrypt', () => {
  it('roundtrip encrypt then decrypt', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const plaintext = 'super secret message';
    const encrypted = crypto.encrypt(key, plaintext, randomNonce());
    const decrypted = crypto.decrypt(key, encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it('encrypt produces correct envelope structure', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const enc = crypto.encrypt(key, 'test', randomNonce());
    expect(enc.ciphertext).toBeDefined();
    expect(enc.keyName).toBe('enc-key');
    expect(enc.keyEpoch).toBe(0);
    expect(enc.suite).toBe('xchacha20-poly1305');
    expect(enc.v).toBe(1);
  });

  it('same plaintext produces different ciphertext (nonce uniqueness)', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const enc1 = crypto.encrypt(key, 'same message', randomNonce());
    const enc2 = crypto.encrypt(key, 'same message', randomNonce());
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
  });

  it('throws for non-secret key', () => {
    const key = crypto.mint(SEED, 'kp', 'keypair');
    expect(() => crypto.encrypt(key, 'data', randomNonce())).toThrow('Not a symmetric key');
  });

  it('decrypt fails with wrong key', () => {
    const key1 = crypto.mint(SEED, 'key1', 'secret');
    const key2 = crypto.mint(SEED, 'key2', 'secret');
    const enc = crypto.encrypt(key1, 'secret data', randomNonce());
    expect(() => crypto.decrypt(key2, enc)).toThrow();
  });

  it('encrypts and decrypts large data', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const large = 'A'.repeat(10000);
    const enc = crypto.encrypt(key, large, randomNonce());
    expect(crypto.decrypt(key, enc)).toBe(large);
  });

  it('encrypts and decrypts empty string', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const enc = crypto.encrypt(key, '', randomNonce());
    expect(crypto.decrypt(key, enc)).toBe('');
  });

  it('rotated key cannot decrypt old ciphertext', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const enc = crypto.encrypt(key, 'before rotation', randomNonce());
    const rotated = crypto.mint(SEED, 'enc-key', 'secret', key);
    expect(() => crypto.decrypt(rotated, enc)).toThrow();
  });

  it('tampered ciphertext fails to decrypt', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const enc = crypto.encrypt(key, 'original', randomNonce());
    const tampered = { ...enc, ciphertext: enc.ciphertext.slice(0, -1) + 'x' };
    expect(() => crypto.decrypt(key, tampered)).toThrow();
  });

  it('same nonce + key + plaintext produces identical ciphertext', () => {
    const key = crypto.mint(SEED, 'enc-key', 'secret');
    const nonce = new Uint8Array(24);
    const enc1 = crypto.encrypt(key, 'deterministic', nonce);
    const enc2 = crypto.encrypt(key, 'deterministic', nonce);
    expect(enc1.ciphertext).toBe(enc2.ciphertext);
  });
});
