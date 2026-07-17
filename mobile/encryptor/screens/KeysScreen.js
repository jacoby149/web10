import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import {
  list,
  mint,
  rotate,
  sign,
  verify,
  encrypt,
  decrypt,
  bytesToHex,
} from '../wallet';
import { requireBiometric, truncateHex } from '../wallet-utils';

export default function KeysScreen() {
  const [loading, setLoading] = useState(true);
  const [keys, setKeys] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadKeys();
  }, [filter]);

  async function loadKeys() {
    setLoading(true);
    try {
      const f = filter === 'all' ? {} : { type: filter };
      const result = await list(f);
      setKeys(result);
    } catch (e) {
      Alert.alert('Error', `Failed to load keys: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleMint() {
    Alert.prompt(
      'Mint New Key',
      'Enter key name:',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Keypair',
          onPress: async (name) => {
            if (!name) return;
            try {
              await requireBiometric();
              await mint(name, 'keypair');
              loadKeys();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
        {
          text: 'Secret',
          onPress: async (name) => {
            if (!name) return;
            try {
              await requireBiometric();
              await mint(name, 'secret');
              loadKeys();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
      'plain-text'
    );
  }

  async function handleRotate(name) {
    Alert.alert(
      'Rotate Key',
      `Rotate "${name}"? This creates a new epoch.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Rotate',
          style: 'destructive',
          onPress: async () => {
            try {
              await requireBiometric();
              await rotate(name);
              loadKeys();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  async function handleTestEncrypt(name) {
    try {
      const enc = await encrypt(name, 'hello world');
      const dec = await decrypt(name, enc);
      Alert.alert('Encrypt/Decrypt', `Key: ${name}\nResult: "${dec}"\nSuite: ${enc.suite}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleTestSign(name) {
    try {
      const sig = await sign(name, 'test message');
      const valid = await verify(name, 'test message', sig.signature);
      Alert.alert('Sign/Verify', `Key: ${name}\nValid: ${valid}\nEpoch: ${sig.epoch}`);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#a855f7" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.toolbar}>
        <View style={styles.filters}>
          {['all', 'keypair', 'secret'].map((f) => (
            <TouchableOpacity
              key={f}
              style={[styles.filterBtn, filter === f && styles.filterActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[
                styles.filterText,
                filter === f && styles.filterTextActive
              ]}>
                {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={handleMint}>
          <Text style={styles.addBtnText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {keys.length === 0 ? (
          <Text style={styles.empty}>No keys found. Tap "+" to mint one.</Text>
        ) : (
          keys.map((k) => (
            <View key={k.name} style={styles.card}>
              <View style={styles.keyHeader}>
                <View>
                  <Text style={styles.keyName}>{k.name}</Text>
                  <Text style={styles.epoch}>Epoch {k.epoch}</Text>
                </View>
                <View style={[styles.badge, k.type === 'secret' ? styles.badgeSecret : styles.badgeKeypair]}>
                  <Text style={styles.badgeText}>{k.type}</Text>
                </View>
              </View>

              <Text style={styles.pubKey}>
                {k.publicKey ? truncateHex(k.publicKey, 10) : truncateHex(k.key, 10)}
              </Text>

              <View style={styles.actions}>
                {k.type === 'keypair' && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleTestSign(k.name)}>
                    <Text style={styles.actionText}>Sign Test</Text>
                  </TouchableOpacity>
                )}
                {k.type === 'secret' && (
                  <TouchableOpacity style={styles.actionBtn} onPress={() => handleTestEncrypt(k.name)}>
                    <Text style={styles.actionText}>Encrypt Test</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rotateBtn]}
                  onPress={() => handleRotate(k.name)}
                >
                  <Text style={[styles.actionText, { color: '#f97316' }]}>Rotate</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  filters: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  filterBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  filterActive: {
    backgroundColor: 'rgba(168, 85, 247, 0.3)',
  },
  filterText: {
    fontSize: 12,
    color: '#888',
  },
  filterTextActive: {
    color: '#a855f7',
    fontWeight: '600',
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#a855f7',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  addBtnText: {
    fontSize: 20,
    color: '#fff',
    fontWeight: 'bold',
  },
  list: {
    flex: 1,
    padding: 12,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  keyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  keyName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  epoch: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
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
  pubKey: {
    fontSize: 13,
    color: '#888',
    fontFamily: 'monospace',
    marginBottom: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#1a1a1a',
  },
  rotateBtn: {
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  actionText: {
    fontSize: 12,
    color: '#aaa',
    fontWeight: '500',
  },
  empty: {
    fontSize: 14,
    color: '#555',
    textAlign: 'center',
    padding: 40,
  },
});
