import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

describe('mint', () => {
  it('creates a keypair with correct structure', () => {
    const key = crypto.mint(SEED, 'friends', 'keypair');
    expect(key.name).toBe('friends');
    expect(key.type).toBe('keypair');
    expect(key.publicKey).toBeDefined();
    expect(key.privateKey).toBeDefined();
    expect(key.epoch).toBe(0);
    expect(key.createdAt).toBeGreaterThan(0);
  });

  it('creates a symmetric secret with correct structure', () => {
    const key = crypto.mint(SEED, 'posts', 'secret');
    expect(key.name).toBe('posts');
    expect(key.type).toBe('secret');
    expect(key.key).toBeDefined();
    expect(key.epoch).toBe(0);
  });

  it('throws when no master seed', () => {
    expect(() => crypto.mint(null, 'test')).toThrow('No master seed');
  });

  it('minting same name increments epoch', () => {
    const k1 = crypto.mint(SEED, 'test', 'keypair');
    const k2 = crypto.mint(SEED, 'test', 'keypair', k1);
    expect(k2.epoch).toBe(1);
    expect(k2.publicKey).not.toBe(k1.publicKey);
  });

  it('is deterministic for same epoch', () => {
    const k1 = crypto.mint(SEED, 'deterministic', 'keypair');
    const k2 = crypto.mint(SEED, 'deterministic', 'keypair');
    expect(k1.publicKey).toBe(k2.publicKey);
  });
});
