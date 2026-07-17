import { describe, it, beforeEach, expect } from 'bun:test';
import * as crypto from '../crypto.js';

function makeSeed() {
  const s = new Uint8Array(32);
  for (let i = 0; i < 32; i++) s[i] = i;
  return s;
}

const SEED_A = makeSeed();
const SEED_B = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED_B[i] = 32 - i;

describe('bytesToHex / hexToBytes', () => {
  it('roundtrips correctly', () => {
    const original = new Uint8Array([0, 1, 255, 128]);
    const hex = crypto.bytesToHex(original);
    const back = crypto.hexToBytes(hex);
    expect(back).toEqual(original);
  });

  it('produces zero-padded hex', () => {
    expect(crypto.bytesToHex(new Uint8Array([0, 15]))).toBe('000f');
  });
});

describe('encodeBase64 / decodeBase64', () => {
  it('roundtrips correctly', () => {
    const original = new Uint8Array([1, 2, 3, 255]);
    const b64 = crypto.encodeBase64(original);
    const back = crypto.decodeBase64(b64);
    expect(back).toEqual(original);
  });
});

describe('concatBytes', () => {
  it('concatenates multiple arrays', () => {
    const result = crypto.concatBytes(
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4]),
      new Uint8Array([5])
    );
    expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });
});
