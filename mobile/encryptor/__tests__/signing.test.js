import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

describe('sign / verify', () => {
  it('signs and verifies correctly', () => {
    const key = crypto.mint(SEED, 'signer', 'keypair');
    const msg = 'hello world';
    const sig = crypto.sign(key, msg);
    expect(sig.signature).toBeDefined();
    expect(sig.name).toBe('signer');
    expect(sig.epoch).toBe(0);

    expect(crypto.verify(key, msg, sig.signature)).toBe(true);
  });

  it('rejects tampered message', () => {
    const key = crypto.mint(SEED, 'signer', 'keypair');
    const sig = crypto.sign(key, 'original');
    expect(crypto.verify(key, 'tampered', sig.signature)).toBe(false);
  });

  it('rejects signature from different key', () => {
    const key1 = crypto.mint(SEED, 'signer', 'keypair');
    const key2 = crypto.mint(SEED, 'other', 'keypair');
    const sig = crypto.sign(key1, 'test');
    expect(crypto.verify(key2, 'test', sig.signature)).toBe(false);
  });

  it('throws for non-keypair key', () => {
    const key = crypto.mint(SEED, 'secret', 'secret');
    expect(() => crypto.sign(key, 'data')).toThrow('Not a signing keypair');
  });

  it('signs binary data', () => {
    const key = crypto.mint(SEED, 'signer', 'keypair');
    const data = new Uint8Array([1, 2, 3, 255]);
    const sig = crypto.sign(key, data);
    expect(crypto.verify(key, data, sig.signature)).toBe(true);
  });

  it('different messages produce different signatures', () => {
    const key = crypto.mint(SEED, 'signer', 'keypair');
    const sig1 = crypto.sign(key, 'msg1');
    const sig2 = crypto.sign(key, 'msg2');
    expect(sig1.signature).not.toBe(sig2.signature);
  });

  it('ed25519 signatures are 64 bytes', () => {
    const key = crypto.mint(SEED, 'signer', 'keypair');
    const sig = crypto.sign(key, 'test');
    expect(sig.signature.length).toBe(128);
  });
});
