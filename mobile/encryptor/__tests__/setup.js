import { mock } from 'bun:test';

mock.module('expo-crypto', () => ({
  getRandomBytesAsync: async (length) => {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  },
}));

const store = new Map();
mock.module('expo-secure-store', () => ({
  getItemAsync: async (key) => store.get(key) || null,
  setItemAsync: async (key, value) => store.set(key, value),
  deleteItemAsync: async (key) => store.delete(key),
  _getStore: () => store,
  _clear: () => store.clear(),
}));

mock.module('expo-local-authentication', () => ({
  hasHardwareAsync: async () => true,
  isEnrolledAsync: async () => true,
  authenticateAsync: async () => ({ success: true }),
}));

mock.module('react-native', () => ({
  Platform: { OS: 'ios' },
  StyleSheet: { create: (s) => s },
  View: 'View',
  Text: 'Text',
  TextInput: 'TextInput',
}));

export { store };
