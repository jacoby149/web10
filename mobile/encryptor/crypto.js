import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

/* ── helpers ── */

export function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

export function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/* ── key derivation (HKDF from master seed) ── */

export function deriveKey(masterSeed, context) {
  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode(`web10-${context}`);
  return hkdf(sha256, masterSeed, salt, info, 32);
}

export function deriveIdentityKeys(masterSeed) {
  const ikm = deriveKey(masterSeed, 'identity');
  const publicKey = ed25519.getPublicKey(ikm);
  return {
    privateKey: bytesToHex(ikm),
    publicKey: bytesToHex(publicKey),
    privateKeyBytes: ikm,
    publicKeyBytes: publicKey,
  };
}

export function deriveExchangeKeys(masterSeed) {
  const ikm = deriveKey(masterSeed, 'exchange');
  const publicKey = x25519.getPublicKey(ikm);
  return {
    privateKey: bytesToHex(ikm),
    publicKey: bytesToHex(publicKey),
    privateKeyBytes: ikm,
    publicKeyBytes: publicKey,
  };
}

/* ── named keys (the keyring) ── */

export function mint(masterSeed, name, type = 'keypair', existing = null) {
  if (!masterSeed) throw new Error('No master seed — wallet not initialized');

  const epoch = existing ? (existing.epoch || 0) + 1 : 0;

  if (type === 'keypair') {
    const ikm = deriveKey(masterSeed, `keyring:${name}:epoch${epoch}`);
    const publicKey = ed25519.getPublicKey(ikm);
    return {
      name,
      type,
      privateKey: bytesToHex(ikm),
      publicKey: bytesToHex(publicKey),
      epoch,
      createdAt: Date.now(),
    };
  } else {
    const symKey = deriveKey(masterSeed, `keyring:${name}:symmetric:epoch${epoch}`);
    return {
      name,
      type: 'secret',
      key: bytesToHex(symKey),
      epoch,
      createdAt: Date.now(),
    };
  }
}

/* ── signing / verification ── */

export function sign(keyData, data) {
  if (!keyData || keyData.type !== 'keypair') throw new Error('Not a signing keypair');
  const privateKey = hexToBytes(keyData.privateKey);
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = ed25519.sign(dataBytes, privateKey);
  return {
    signature: bytesToHex(sig),
    publicKey: keyData.publicKey,
    epoch: keyData.epoch,
    name: keyData.name,
  };
}

export function verify(keyData, data, signatureHex) {
  if (!keyData || keyData.type !== 'keypair') throw new Error('Key not found');
  const publicKey = hexToBytes(keyData.publicKey);
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = hexToBytes(signatureHex);
  return ed25519.verify(sig, dataBytes, publicKey);
}

/* ── encryption / decryption (xchacha20-poly1305) ── */

export function encrypt(keyData, plaintext, nonce) {
  if (!keyData || keyData.type !== 'secret') throw new Error('Not a symmetric key');
  const key = hexToBytes(keyData.key);
  const dataBytes = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;

  const cipher = xchacha20poly1305(key, nonce);
  const ctWithTag = cipher.encrypt(dataBytes);
  const envelope = concatBytes(nonce, ctWithTag);

  return {
    ciphertext: encodeBase64(envelope),
    keyName: keyData.name,
    keyEpoch: keyData.epoch,
    suite: 'xchacha20-poly1305',
    v: 1,
  };
}

export function decrypt(keyData, envelope) {
  if (!keyData || keyData.type !== 'secret') throw new Error('Not a symmetric key');
  const key = hexToBytes(keyData.key);
  const data = decodeBase64(envelope.ciphertext);

  const nonce = data.slice(0, 24);
  const ctWithTag = data.slice(24);

  const decipher = xchacha20poly1305(key, nonce);
  const plaintext = decipher.decrypt(ctWithTag);
  return new TextDecoder().decode(plaintext);
}

/* ── device cert ── */

export function createDeviceCert(identityKeyData, certData) {
  const sig = sign(identityKeyData, JSON.stringify(certData));
  return { ...certData, signature: sig.signature, issuer: identityKeyData.publicKey };
}

export function verifyDeviceCert(identityKeyData, cert) {
  const certData = {
    deviceId: cert.deviceId,
    devicePublicKey: cert.devicePublicKey,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
  };
  return verify(identityKeyData, JSON.stringify(certData), cert.signature);
}

/* ── grant helpers ── */

export function wrap(keyData, to, meta = {}, grantId) {
  if (!keyData) throw new Error('Key not found');
  return {
    id: grantId,
    keyName: keyData.name,
    keyEpoch: keyData.epoch,
    to,
    type: keyData.type,
    wrappedKey: keyData.type === 'secret' ? keyData.key : keyData.publicKey,
    expires: meta.expires || null,
    createdAt: Date.now(),
    meta,
  };
}

export function unwrap(grant) {
  if (!grant) throw new Error('Grant not found');
  if (grant.expires && Date.now() > grant.expires) throw new Error('Grant expired');
  return grant;
}
