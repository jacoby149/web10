import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import {
  getMasterSeed,
  deriveIdentityKeys,
  deriveExchangeKeys,
  getManifest,
  list,
  resetWallet,
  bytesToHex,
} from '../wallet';
import { exportSeed, requireBiometric, truncateHex } from '../wallet-utils';

export default function SettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [identity, setIdentity] = useState(null);
  const [manifest, setManifest] = useState([]);
  const [deviceCount, setDeviceCount] = useState(0);

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const seed = await getMasterSeed();
      const [id, keys] = await Promise.all([
        deriveIdentityKeys(seed),
        getManifest(),
      ]);
      setIdentity(id);
      setManifest(keys);
      const devices = manifest.filter(k => k.name.startsWith('device:'));
      setDeviceCount(devices.length);
    } catch (e) {
      Alert.alert('Error', `Failed to load settings: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleExportSeed() {
    try {
      const hex = await exportSeed();
      if (!hex) {
        Alert.alert('Cancelled', 'Biometric auth required to export seed.');
        return;
      }
      Alert.alert(
        'Master Seed',
        `Save this securely. Anyone with this seed can access all your keys.\n\n${hex}`,
        [
          { text: 'Close' },
          {
            text: 'Share',
            onPress: async () => {
              await Share.share({
                message: `web10 Encryptor Master Seed:\n${hex}`,
                title: 'web10 Encryptor Backup',
              });
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleImportSeed() {
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
            try {
              const success = await requireBiometric();
              if (!success) return;
              const { importSeed } = await import('../wallet-utils');
              await importSeed(hex);
              loadSettings();
              Alert.alert('Imported', 'Master seed replaced successfully.');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
      'plain-text'
    );
  }

  async function handleWipe() {
    Alert.alert(
      'Wipe Wallet',
      'This will permanently delete all keys and grants. This cannot be undone unless you have a backup of your master seed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Wipe Everything',
          style: 'destructive',
          onPress: async () => {
            try {
              await requireBiometric();
              await resetWallet();
              Alert.alert('Wiped', 'Wallet deleted. Restart the app to set up a new one.');
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  async function handleExportBackup() {
    try {
      const success = await requireBiometric();
      if (!success) return;

      const seed = await getMasterSeed();
      const keys = await list();
      const backup = {
        version: 1,
        suite: 'ed25519+xchacha20',
        masterSeed: bytesToHex(seed),
        manifest: keys,
        exportedAt: Date.now(),
      };

      const fileUri = FileSystem.cacheDirectory + 'web10-backup.json';
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

      await Share.share({
        url: fileUri,
        title: 'web10 Encryptor Backup',
      });
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
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Identity Public Key</Text>
          <Text style={styles.value}>{truncateHex(identity.publicKey, 16)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Linked Devices</Text>
          <Text style={styles.value}>{deviceCount}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Named Keys</Text>
          <Text style={styles.value}>{manifest.length}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Backup & Recovery</Text>
        <TouchableOpacity style={styles.card} onPress={handleExportSeed}>
          <Text style={styles.settingTitle}>Export Master Seed</Text>
          <Text style={styles.settingDesc}>
            Biometric auth required. Keep this safe — it controls all your keys.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleImportSeed}>
          <Text style={styles.settingTitle}>Import Master Seed</Text>
          <Text style={styles.settingDesc}>
            Replace current seed with a backed-up one.
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.card} onPress={handleExportBackup}>
          <Text style={styles.settingTitle}>Export Full Backup</Text>
          <Text style={styles.settingDesc}>
            Export seed + key manifest as JSON.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Linking</Text>
        <View style={styles.card}>
          <Text style={styles.settingTitle}>Link a Device</Text>
          <Text style={styles.settingDesc}>
            Scan QR code from the companion device to link it via WebRTC.
          </Text>
          <TouchableOpacity style={styles.linkBtn}>
            <Text style={styles.linkBtnText}>Open QR Scanner</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Danger Zone</Text>
        <TouchableOpacity style={[styles.card, styles.danger]} onPress={handleWipe}>
          <Text style={[styles.settingTitle, { color: '#ef4444' }]}>Wipe Wallet</Text>
          <Text style={styles.settingDesc}>
            Permanently delete all keys, grants, and the master seed.
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>web10 Encryptor v1.0.0</Text>
        <Text style={styles.footerSub}>Your phone is your keychain</Text>
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
  settingTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
  },
  settingDesc: {
    fontSize: 13,
    color: '#888',
    lineHeight: 18,
  },
  linkBtn: {
    marginTop: 10,
    backgroundColor: '#a855f7',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  linkBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  danger: {
    borderColor: '#ef4444',
    borderWidth: 1,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 13,
    color: '#555',
  },
  footerSub: {
    fontSize: 12,
    color: '#333',
    marginTop: 4,
  },
});
