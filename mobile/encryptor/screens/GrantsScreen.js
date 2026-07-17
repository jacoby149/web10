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
  list,
  wrap,
  unwrap,
  revokeGrant,
  revoke,
  listGrants,
} from '../wallet';
import { requireBiometric, truncateHex } from '../wallet-utils';

export default function GrantsScreen() {
  const [loading, setLoading] = useState(true);
  const [grants, setGrants] = useState([]);
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [g, k] = await Promise.all([listGrants(), list()]);
      setGrants(g);
      setKeys(k);
    } catch (e) {
      Alert.alert('Error', `Failed to load grants: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleWrap() {
    if (keys.length === 0) {
      Alert.alert('No Keys', 'Create a key first in the Keys tab.');
      return;
    }
    Alert.prompt(
      'Create Grant',
      'Key name to grant (e.g. "friends"):',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Next',
          onPress: async (keyName) => {
            if (!keyName) return;
            Alert.prompt(
              'Recipient',
              'Recipient public key or ID:',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Grant',
                  onPress: async (recipient) => {
                    if (!recipient) return;
                    try {
                      await requireBiometric();
                      const grant = await wrap(keyName, recipient, {
                        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
                      });
                      Alert.alert('Grant Created', `ID: ${truncateHex(grant.id, 8)}`);
                      loadData();
                    } catch (e) {
                      Alert.alert('Error', e.message);
                    }
                  },
                },
              ],
              'plain-text'
            );
          },
        },
      ],
      'plain-text'
    );
  }

  async function handleRevoke(grantId) {
    Alert.alert(
      'Revoke Grant',
      'This recipient will lose access. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            try {
              await revokeGrant(grantId);
              loadData();
            } catch (e) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ]
    );
  }

  function formatDate(ts) {
    if (!ts) return 'N/A';
    const d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function isExpired(grant) {
    return grant.expires && Date.now() > grant.expires;
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
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Grants Map</Text>
        <Text style={styles.headerSub}>Who can see what, until when</Text>
        <TouchableOpacity style={styles.createBtn} onPress={handleWrap}>
          <Text style={styles.createBtnText}>+ Create Grant</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.list}>
        {grants.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No grants yet. Create a grant to share a key with someone.
            </Text>
            <Text style={styles.emptyHint}>
              A grant wraps your key to a recipient's public key, giving them
              access to decrypt content encrypted with that key.
            </Text>
          </View>
        ) : (
          grants.map((g) => {
            const expired = isExpired(g);
            return (
              <View key={g.id} style={[styles.card, expired && styles.cardExpired]}>
                <View style={styles.grantHeader}>
                  <Text style={styles.grantKey}>{g.keyName}</Text>
                  <View style={[
                    styles.statusBadge,
                    expired ? styles.statusExpired : styles.statusActive
                  ]}>
                    <Text style={styles.statusText}>
                      {expired ? 'Expired' : 'Active'}
                    </Text>
                  </View>
                </View>

                <View style={styles.grantRow}>
                  <Text style={styles.grantLabel}>Recipient</Text>
                  <Text style={styles.grantValue}>{truncateHex(g.to, 10)}</Text>
                </View>

                <View style={styles.grantRow}>
                  <Text style={styles.grantLabel}>Key Epoch</Text>
                  <Text style={styles.grantValue}>{g.keyEpoch}</Text>
                </View>

                <View style={styles.grantRow}>
                  <Text style={styles.grantLabel}>Created</Text>
                  <Text style={styles.grantValue}>{formatDate(g.createdAt)}</Text>
                </View>

                {g.expires && (
                  <View style={styles.grantRow}>
                    <Text style={styles.grantLabel}>Expires</Text>
                    <Text style={[styles.grantValue, expired && styles.expiredText]}>
                      {formatDate(g.expires)}
                    </Text>
                  </View>
                )}

                <View style={styles.grantActions}>
                  <TouchableOpacity
                    style={[styles.revokeBtn]}
                    onPress={() => handleRevoke(g.id)}
                  >
                    <Text style={styles.revokeText}>Revoke Access</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
  header: {
    padding: 16,
    backgroundColor: '#111',
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
  },
  headerSub: {
    fontSize: 13,
    color: '#888',
    marginTop: 2,
    marginBottom: 12,
  },
  createBtn: {
    backgroundColor: '#a855f7',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
  },
  createBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  list: {
    flex: 1,
    padding: 12,
  },
  emptyCard: {
    backgroundColor: '#111',
    borderRadius: 12,
    padding: 24,
    marginTop: 20,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 12,
  },
  emptyHint: {
    fontSize: 13,
    color: '#555',
    textAlign: 'center',
    lineHeight: 18,
  },
  card: {
    backgroundColor: '#111',
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  cardExpired: {
    opacity: 0.6,
  },
  grantHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  grantKey: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusActive: {
    backgroundColor: 'rgba(34, 197, 94, 0.2)',
  },
  statusExpired: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22c55e',
  },
  grantRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  grantLabel: {
    fontSize: 12,
    color: '#666',
  },
  grantValue: {
    fontSize: 12,
    color: '#ccc',
    fontFamily: 'monospace',
  },
  expiredText: {
    color: '#ef4444',
  },
  grantActions: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#222',
  },
  revokeBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  revokeText: {
    fontSize: 13,
    color: '#ef4444',
    fontWeight: '600',
  },
});
