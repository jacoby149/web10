import { describe, it, expect } from 'bun:test';
import * as crypto from '../crypto.js';

const SEED = new Uint8Array(32);
for (let i = 0; i < 32; i++) SEED[i] = i;

describe('createDeviceCert', () => {
  it('creates a cert with required fields', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    expect(cert.deviceId).toBe('laptop-1');
    expect(cert.devicePublicKey).toBe('device-pubkey-xyz');
    expect(cert.issuedAt).toBeGreaterThan(0);
    expect(cert.expiresAt).toBeGreaterThan(cert.issuedAt);
    expect(cert.signature).toBeDefined();
    expect(cert.issuer).toBeDefined();
  });
});

describe('verifyDeviceCert', () => {
  it('verifies a valid cert', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    expect(crypto.verifyDeviceCert(identity, cert)).toBe(true);
  });

  it('rejects tampered device ID', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    cert.deviceId = 'hacker-device';
    expect(crypto.verifyDeviceCert(identity, cert)).toBe(false);
  });

  it('rejects tampered public key', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    cert.devicePublicKey = 'evil-pubkey';
    expect(crypto.verifyDeviceCert(identity, cert)).toBe(false);
  });

  it('rejects tampered expiry', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    cert.expiresAt = Date.now() + 999999999999;
    expect(crypto.verifyDeviceCert(identity, cert)).toBe(false);
  });

  it('rejects tampered issuedAt', () => {
    const identity = crypto.mint(SEED, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    cert.issuedAt = 0;
    expect(crypto.verifyDeviceCert(identity, cert)).toBe(false);
  });

  it('rejects cert signed by different identity', () => {
    const identity1 = crypto.mint(SEED, 'identity', 'keypair');
    const seed2 = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed2[i] = 255 - i;
    const identity2 = crypto.mint(seed2, 'identity', 'keypair');
    const cert = crypto.createDeviceCert(identity1, {
      deviceId: 'laptop-1',
      devicePublicKey: 'device-pubkey-xyz',
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600000,
    });
    expect(crypto.verifyDeviceCert(identity2, cert)).toBe(false);
  });
});
