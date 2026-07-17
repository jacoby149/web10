import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import {
  getMasterSeed,
  deriveIdentityKeys,
  deriveExchangeKeys,
  getManifest,
  mint,
  bytesToHex,
} from '../wallet';
import { requireBiometric, truncateHex } from '../wallet-utils';

export default function WalletScreen() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [exchange, setExchange] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [seedHex, setSeedHex] = useState(null);

  useEffect(() => {
    loadWallet();
  }, []);

  async function loadWallet() {
    setLoading(true);
    try {
      const seed = await getMasterSeed();
      setSeedHex(await require('../wallet-utils').then(m => null));
      const [id, ex, keys] = await Promise.all([
        deriveIdentityKeys(seed),
        deriveExchangeKeys(seed),
        getManifest(),
      ]);
      setIdentity(id);
      setExchange(ex);
      setManifest(keys);
    } catch (e) {
      Alert.alert('Error', `Failed to load wallet: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleMintKey() {
    Alert.prompt(
      'Mint New Key',
      'Enter a name for the key (e.g. "friends", "posts", "agent:lens"):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: async (name) => {
            if (!name) return;
            try {
              await requireBiometric();
              const key = await mint(name, 'secret');
              Alert.alert('Key Created', `"${key.name}" (epoch ${key.epoch})`);
              loadWallet();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
      'plain-text'
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Identity</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Identity Public Key</Text>
          <Text style={styles.value}>{truncateHex(identity.publicKey, 12)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Exchange Public Key</Text>
          <Text style={styles.value}>{truncateHex(exchange.publicKey, 12)}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Named Keys</Text>
          <TouchableOpacity onPress={handleMintKey}>
            <Text style={styles.mintBtn}>+ Mint</Text>
          </TouchableOpacity>
        </View>
        {manifest.length === 0 ? (
          <Text style={styles.empty}>No keys yet. Tap "+ Mint" to create one.</Text>
        ) : (
          manifest.map((k) => (
            <View key={k.name} style={styles.card}>
              <View style={styles.keyHeader}>
                <Text style={styles.keyName}>{k.name}</Text>
                <View style={[styles.badge, k.type === 'secret' ? styles.badgeSecret : styles.badgeKeypair]}>
                  <Text style={styles.badgeText}>{k.type}</Text>
                </View>
              </View>
              <Text style={styles.epoch}>Epoch {k.epoch}</Text>
              <Text style={styles.value}>
                {k.publicKey ? truncateHex(k.publicKey, 8) : truncateHex(k.key, 8)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stats</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{manifest.length}</Text>
            <Text style={styles.statLabel}>Keys</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{manifest.filter(k => k.type === 'keypair').length}</Text>
            <Text style={styles.statLabel}>Keypairs</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{manifest.filter(k => k.type === 'secret').length}</Text>
            <Text style={styles.statLabel}>Secrets</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    padding: 16,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#888',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  value: {
    fontSize: 14,
    color: '#ccc',
    fontFamily: 'monospace',
  },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  keyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeKeypair: {
    backgroundColor: 'rgba(168, 85, 247, 0.2)',
  },
  badgeSecret: {
    backgroundColor: 'rgba(59, 130, 246, 0.2)',
  },
  badgeText: {
    fontSize: 11,
    color: '#a855f7',
    fontWeight: '600',
  },
  epoch: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  mintBtn: {
    fontSize: 14,
    color: '#a855f7',
    fontWeight: '600',
  },
  empty: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#a855f7',
  },
  statLabel: {
    fontSize: 12,
    color: '#888',
    marginTop: 4,
  },
});
