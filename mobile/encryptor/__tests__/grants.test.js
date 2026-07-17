import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

describe('wrap / unwrap', () => {
  it('creates a grant and unwraps it', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const grant = crypto.wrap(key, 'recipient-pubkey-abc', {}, 'grant-001');
    expect(grant.keyName).toBe('friends');
    expect(grant.to).toBe('recipient-pubkey-abc');
    expect(grant.id).toBe('grant-001');

    const unwrapped = crypto.unwrap(grant);
    expect(unwrapped.keyName).toBe('friends');
  });

  it('grant stores key epoch', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const rotated = crypto.mint(SEED, 'friends', 'secret', key);
    const grant = crypto.wrap(rotated, 'recipient', {}, 'grant-002');
    expect(grant.keyEpoch).toBe(1);
  });

  it('unwrap throws for null grant', () => {
    expect(() => crypto.unwrap(null)).toThrow('not found');
  });

  it('unwrap throws for expired grant', () => {
    const key = crypto.mint(SEED, 'friends', 'secret');
    const grant = crypto.wrap(key, 'recipient', {
      expires: Date.now() - 1000,
    }, 'grant-003');
    expect(() => crypto.unwrap(grant)).toThrow('expired');
  });

  it('wrap throws for null key', () => {
    expect(() => crypto.wrap(null, 'recipient')).toThrow('not found');
  });
});
