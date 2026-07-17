import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  generateMasterSeed,
  storeMasterSeed,
  hasMasterSeed,
  resetWallet,
  bytesToHex,
} from './wallet';

export async function setupNewWallet() {
  const seed = await generateMasterSeed();
  await storeMasterSeed(seed);
  return seed;
}

export async function checkWalletExists() {
  return await hasMasterSeed();
}

export async function wipeWallet() {
  await resetWallet();
}

export async function requireBiometric() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  if (!hasHardware || !isEnrolled) return false;

  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Unlock web10 Encryptor',
    fallbackLabel: 'Enter passcode',
    requireConfirmation: false,
  });

  return result.success;
}

export async function exportSeed() {
  const success = await requireBiometric();
  if (!success) return null;
  const hex = await SecureStore.getItemAsync('@web10:master_seed');
  return hex;
}

export async function importSeed(hex) {
  if (!hex || hex.length !== 64) return false;
  await storeMasterSeed(hexToBytes(hex));
  return true;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

export function truncateHex(hex, chars = 8) {
  if (!hex) return '';
  return `${hex.slice(0, chars)}...${hex.slice(-chars)}`;
}
