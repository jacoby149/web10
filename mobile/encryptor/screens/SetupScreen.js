import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { setupNewWallet, requireBiometric, truncateHex } from '../wallet-utils';
import {
  getMasterSeed,
  deriveIdentityKeys,
  deriveExchangeKeys,
  bytesToHex,
} from '../wallet';

export default function SetupScreen({ onSetup }) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('create');

  async function handleCreate() {
    setLoading(true);
    try {
      await setupNewWallet();
      onSetup();
    } catch (e) {
      Alert.alert('Error', `Failed to create wallet: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    setLoading(true);
    try {
      const success = await requireBiometric();
      if (!success) {
        setLoading(false);
        return;
      }
      Alert.prompt(
        'Import Seed',
        'Paste your 64-character hex master seed:',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async (hex) => {
              if (!hex || hex.length !== 64) {
                Alert.alert('Invalid', 'Seed must be 64 hex characters');
                return;
              }
              const { importSeed } = await import('../wallet-utils');
              await importSeed(hex);
              onSetup();
            },
          },
        ],
        'plain-text'
      );
      setLoading(false);
    } catch (e) {
      Alert.alert('Error', `Failed to import: ${e.message}`);
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>web10 Encryptor</Text>
        <Text style={styles.subtitle}>Your phone is your keychain</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Get Started</Text>
        <Text style={styles.cardText}>
          Create a new wallet to hold your encryption keys, or import an existing
          master seed.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, styles.primary]}
          onPress={handleCreate}
          disabled={loading}
        >
          {loading && mode === 'create' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Create New Wallet</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.secondary]}
          onPress={handleImport}
          disabled={loading}
        >
          {loading && mode === 'import' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={[styles.buttonText, { color: '#a855f7' }]}>
              Import Existing Seed
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.info}>
        <Text style={styles.infoText}>
          Your master seed is stored in the device's Secure Enclave. Back it up —
          losing it means losing all your keys.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 24,
  },
  header: {
    marginTop: 60,
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    marginTop: 8,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 20,
    marginBottom: 32,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 8,
  },
  cardText: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  button: {
    paddingVertical: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  primary: {
    backgroundColor: '#a855f7',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#a855f7',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  info: {
    marginTop: 32,
    padding: 16,
    backgroundColor: '#1a1a1a',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#a855f7',
  },
  infoText: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
});
