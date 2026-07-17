import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { ed25519, x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const MASTER_SEED_KEY = '@web10:master_seed';
const MANIFEST_KEY = '@web10:manifest';
const KEYS_PREFIX = '@web10:key:';
const GRANTS_PREFIX = '@web10:grant:';

/* ── helpers ── */

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function encodeBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function decodeBase64(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function concatBytes(...arrays) {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/* ── secure storage ── */

async function _store(key, value) {
  await SecureStore.setItemAsync(key, value);
}

async function _get(key) {
  return await SecureStore.getItemAsync(key);
}

async function _delete(key) {
  await SecureStore.deleteItemAsync(key);
}

/* ── master seed ── */

export async function generateMasterSeed() {
  return hexToBytes(await Crypto.getRandomBytesAsync(32));
}

export async function storeMasterSeed(seed) {
  await _store(MASTER_SEED_KEY, bytesToHex(seed));
}

export async function getMasterSeed() {
  const hex = await _get(MASTER_SEED_KEY);
  return hex ? hexToBytes(hex) : null;
}

export async function hasMasterSeed() {
  return (await _get(MASTER_SEED_KEY)) !== null;
}

export async function deleteMasterSeed() {
  await _delete(MASTER_SEED_KEY);
}

/* ── key derivation (HKDF from master seed) ── */

function deriveKey(masterSeed, context) {
  const salt = new Uint8Array(32);
  const info = new TextEncoder().encode(`web10-${context}`);
  return hkdf(sha256, masterSeed, salt, info, 32);
}

export async function deriveIdentityKeys(masterSeed) {
  const ikm = deriveKey(masterSeed, 'identity');
  const publicKey = ed25519.getPublicKey(ikm);
  return {
    privateKey: bytesToHex(ikm),
    publicKey: bytesToHex(publicKey),
    privateKeyBytes: ikm,
    publicKeyBytes: publicKey,
  };
}

export async function deriveExchangeKeys(masterSeed) {
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

export async function mint(name, type = 'keypair') {
  const masterSeed = await getMasterSeed();
  if (!masterSeed) throw new Error('No master seed — wallet not initialized');

  const existing = await getKey(name);
  const epoch = existing ? (existing.epoch || 0) + 1 : 0;

  let keyData;
  if (type === 'keypair') {
    const ikm = deriveKey(masterSeed, `keyring:${name}:epoch${epoch}`);
    const publicKey = ed25519.getPublicKey(ikm);
    keyData = {
      name,
      type,
      privateKey: bytesToHex(ikm),
      publicKey: bytesToHex(publicKey),
      epoch,
      createdAt: Date.now(),
    };
  } else {
    const symKey = deriveKey(masterSeed, `keyring:${name}:symmetric:epoch${epoch}`);
    keyData = {
      name,
      type: 'secret',
      key: bytesToHex(symKey),
      epoch,
      createdAt: Date.now(),
    };
  }

  await _store(`${KEYS_PREFIX}${name}`, JSON.stringify(keyData));
  await _updateManifestAdd(name, keyData);
  return keyData;
}

export async function getKey(name) {
  const data = await _get(`${KEYS_PREFIX}${name}`);
  return data ? JSON.parse(data) : null;
}

export async function rotate(name) {
  const existing = await getKey(name);
  if (!existing) throw new Error(`Key "${name}" not found`);
  return await mint(name, existing.type);
}

export async function list(filter = {}) {
  const manifest = await _get(MANIFEST_KEY);
  if (!manifest) return [];
  const keys = JSON.parse(manifest);
  if (filter.type) return keys.filter(k => k.type === filter.type);
  if (filter.name) return keys.filter(k => k.name.includes(filter.name));
  return keys;
}

/* ── signing / verification ── */

export async function sign(name, data) {
  const keyData = await getKey(name);
  if (!keyData || keyData.type !== 'keypair') throw new Error(`Key "${name}" not a signing keypair`);

  const privateKey = hexToBytes(keyData.privateKey);
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = ed25519.sign(dataBytes, privateKey);
  return {
    signature: bytesToHex(sig),
    publicKey: keyData.publicKey,
    epoch: keyData.epoch,
    name,
  };
}

export async function verify(name, data, signatureHex) {
  const keyData = await getKey(name);
  if (!keyData || keyData.type !== 'keypair') throw new Error(`Key "${name}" not found`);

  const publicKey = hexToBytes(keyData.publicKey);
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = hexToBytes(signatureHex);
  return ed25519.verify(sig, dataBytes, publicKey);
}

/* ── encryption / decryption (xchacha20-poly1305) ── */

export async function encrypt(name, plaintext) {
  const keyData = await getKey(name);
  if (!keyData || keyData.type !== 'secret') throw new Error(`Key "${name}" not a symmetric key`);

  const key = hexToBytes(keyData.key);
  const dataBytes = typeof plaintext === 'string' ? new TextEncoder().encode(plaintext) : plaintext;
  const nonce = hexToBytes(await Crypto.getRandomBytesAsync(24));

  const cipher = xchacha20poly1305(key, nonce);
  const ctWithTag = cipher.encrypt(dataBytes);
  const envelope = concatBytes(nonce, ctWithTag);

  return {
    ciphertext: encodeBase64(envelope),
    keyName: name,
    keyEpoch: keyData.epoch,
    suite: 'xchacha20-poly1305',
    v: 1,
  };
}

export async function decrypt(name, envelope) {
  const keyData = await getKey(name);
  if (!keyData || keyData.type !== 'secret') throw new Error(`Key "${name}" not a symmetric key`);

  const key = hexToBytes(keyData.key);
  const data = decodeBase64(envelope.ciphertext);

  const nonce = data.slice(0, 24);
  const ctWithTag = data.slice(24);

  const decipher = xchacha20poly1305(key, nonce);
  const plaintext = decipher.decrypt(ctWithTag);

  return new TextDecoder().decode(plaintext);
}

/* ── grants (wrapping keys to recipients) ── */

export async function wrap(name, to, meta = {}) {
  const keyData = await getKey(name);
  if (!keyData) throw new Error(`Key "${name}" not found`);

  const grant = {
    id: bytesToHex(hexToBytes(await Crypto.getRandomBytesAsync(16))),
    keyName: name,
    keyEpoch: keyData.epoch,
    to,
    type: keyData.type,
    wrappedKey: keyData.type === 'secret'
      ? keyData.key
      : keyData.publicKey,
    expires: meta.expires || null,
    createdAt: Date.now(),
    meta,
  };

  await _store(`${GRANTS_PREFIX}${grant.id}`, JSON.stringify(grant));
  return grant;
}

export async function unwrap(grantId) {
  const grant = await getGrant(grantId);
  if (!grant) throw new Error(`Grant "${grantId}" not found`);
  if (grant.expires && Date.now() > grant.expires) throw new Error('Grant expired');
  return grant;
}

export async function getGrant(grantId) {
  const data = await _get(`${GRANTS_PREFIX}${grantId}`);
  return data ? JSON.parse(data) : null;
}

export async function revokeGrant(grantId) {
  await _delete(`${GRANTS_PREFIX}${grantId}`);
}

export async function listGrants(filter = {}) {
  const grants = [];
  const manifest = await _get(MANIFEST_KEY);
  if (!manifest) return grants;
  const keys = JSON.parse(manifest);
  for (const k of keys) {
    const grantData = await _get(`${GRANTS_PREFIX}list:${k.name}`);
    if (grantData) {
      const list = JSON.parse(grantData);
      grants.push(...list);
    }
  }
  if (filter.to) return grants.filter(g => g.to === filter.to);
  if (filter.keyName) return grants.filter(g => g.keyName === filter.keyName);
  return grants;
}

/* ── manifest ── */

async function _updateManifestAdd(name, keyData) {
  let manifest = await _get(MANIFEST_KEY);
  let keys = manifest ? JSON.parse(manifest) : [];
  const idx = keys.findIndex(k => k.name === name);
  if (idx >= 0) {
    keys[idx] = keyData;
  } else {
    keys.push(keyData);
  }
  await _store(MANIFEST_KEY, JSON.stringify(keys));
}

export async function getManifest() {
  const data = await _get(MANIFEST_KEY);
  return data ? JSON.parse(data) : [];
}

/* ── device cert ── */

export async function createDeviceCert(deviceId, devicePublicKey, expiresMs = 365 * 24 * 60 * 60 * 1000) {
  const masterSeed = await getMasterSeed();
  if (!masterSeed) throw new Error('No master seed');

  const identity = await deriveIdentityKeys(masterSeed);
  const cert = {
    deviceId,
    devicePublicKey,
    issuedAt: Date.now(),
    expiresAt: Date.now() + expiresMs,
  };
  const sig = await sign('identity', JSON.stringify(cert));
  return { ...cert, signature: sig.signature, issuer: identity.publicKey };
}

export async function verifyDeviceCert(cert) {
  const masterSeed = await getMasterSeed();
  const identity = await deriveIdentityKeys(masterSeed);
  const certData = {
    deviceId: cert.deviceId,
    devicePublicKey: cert.devicePublicKey,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
  };
  return verify('identity', JSON.stringify(certData), cert.signature);
}

/* ── full revoke (layered) ── */

export async function revoke(name, grantee) {
  const grants = await listGrants({ to: grantee, keyName: name });
  for (const g of grants) {
    await revokeGrant(g.id);
  }
  const rotated = await rotate(name);
  return { rotated, revokedGrants: grants.length };
}

/* ── wallet init / reset ── */

export async function initWallet() {
  const existing = await getMasterSeed();
  if (existing) return existing;
  const seed = await generateMasterSeed();
  await storeMasterSeed(seed);
  await deriveIdentityKeys(seed);
  await deriveExchangeKeys(seed);
  return seed;
}

export async function resetWallet() {
  await deleteMasterSeed();
  await _delete(MANIFEST_KEY);
  const keys = await list();
  for (const k of keys) {
    await _delete(`${KEYS_PREFIX}${k.name}`);
  }
}

export { bytesToHex, hexToBytes, encodeBase64, decodeBase64 };
