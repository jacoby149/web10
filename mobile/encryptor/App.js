import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar } from 'expo-status-bar';
import { hasMasterSeed } from './wallet';
import { checkWalletExists } from './wallet-utils';
import WalletScreen from './screens/WalletScreen';
import KeysScreen from './screens/KeysScreen';
import GrantsScreen from './screens/GrantsScreen';
import SettingsScreen from './screens/SettingsScreen';
import SetupScreen from './screens/SetupScreen';

const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#000' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: 'bold' },
        tabBarStyle: { backgroundColor: '#111' },
        tabBarActiveTintColor: '#a855f7',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ tabBarLabel: 'Wallet' }}
      />
      <Tab.Screen
        name="Keys"
        component={KeysScreen}
        options={{ tabBarLabel: 'Keys' }}
      />
      <Tab.Screen
        name="Grants"
        component={GrantsScreen}
        options={{ tabBarLabel: 'Grants' }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [walletReady, setWalletReady] = useState(null);

  useEffect(() => {
    checkWalletExists().then(setWalletReady);
  }, []);

  if (walletReady === null) {
    return null;
  }

  return (
    <NavigationContainer>
      <StatusBar style="light" />
      {walletReady ? <MainTabs /> : <SetupScreen onSetup={() => setWalletReady(true)} />}
    </NavigationContainer>
  );
}
