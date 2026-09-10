/**
 * src/navigation/RootNavigator.tsx — FIXED v2
 *
 * PROBLEM 1 — "Only 4 screens visible" / screens crashing silently:
 *   NearbyDevicesScreen, NetworkGraphScreen, RawPacketsScreen were registered
 *   as both Tab screens AND inside DashboardStack. When rendered as a Tab
 *   screen they get a Tab navigation prop, not a Stack one. Calling
 *   navigation.goBack() or navigation.navigate() then silently errors out,
 *   leaving the screen frozen/blank.
 *
 * FIX: Each tab gets its own Stack wrapper. Standard React Navigation pattern.
 *   Every screen always has a proper stack navigation prop.
 *
 * PROBLEM 2 — BLE Unauthorized has no recovery UI:
 *   DashboardScreen already reads bleStatus from the store. When it shows
 *   "Unauthorized", the user has no way to open Settings from the app.
 *   Added a "Open Settings" action button — see DashboardScreen patch below.
 */
import React from 'react';
import { Text } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import DashboardScreen     from '../screens/DashboardScreen';
import VictimModeScreen    from '../screens/VictimModeScreen';
import ResponderModeScreen from '../screens/ResponderModeScreen';
import RawPacketsScreen    from '../screens/RawPacketsScreen';
import NetworkGraphScreen  from '../screens/NetworkGraphScreen';
import SettingsScreen      from '../screens/SettingsScreen';
import NearbyDevicesScreen from '../screens/NearbyDevicesScreen';
import VictimMapScreen     from '../screens/VictimMapScreen';

const Stack = createNativeStackNavigator();
const Tab   = createBottomTabNavigator();

// ── Tab 1: Dashboard — all primary navigation flows through here ───────────
function DashboardStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DashboardMain"  component={DashboardScreen} />
      <Stack.Screen name="VictimMode"     component={VictimModeScreen} />
      <Stack.Screen name="ResponderMode"  component={ResponderModeScreen} />
      <Stack.Screen name="RawPackets"     component={RawPacketsScreen} />
      <Stack.Screen name="Network"        component={NetworkGraphScreen} />
      <Stack.Screen name="Settings"       component={SettingsScreen} />
      <Stack.Screen name="NearbyDevices"  component={NearbyDevicesScreen} />
      <Stack.Screen name="VictimMap"      component={VictimMapScreen} />
    </Stack.Navigator>
  );
}

// ── Tab 2: Nearby — own stack so the screen gets a stack navigation prop ──
// Without this wrapper, NearbyDevicesScreen gets a Tab nav prop and
// navigation.goBack() / navigation.navigate() silently fail.
function NearbyStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NearbyMain" component={NearbyDevicesScreen} />
    </Stack.Navigator>
  );
}

// ── Tab 3: Network — own stack ─────────────────────────────────────────────
function NetworkStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="NetworkMain" component={NetworkGraphScreen} />
      <Stack.Screen name="VictimMap"   component={VictimMapScreen} />
    </Stack.Navigator>
  );
}

// ── Tab 4: Debug — own stack ───────────────────────────────────────────────
function DebugStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="DebugMain" component={RawPacketsScreen} />
    </Stack.Navigator>
  );
}

// ── Root ───────────────────────────────────────────────────────────────────
export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#2a2a2a',
          borderTopColor: '#444',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor:   '#FF8800',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardStack}
        options={{
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📊</Text>,
        }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyStack}
        options={{
          tabBarLabel: 'Nearby',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📡</Text>,
        }}
      />
      <Tab.Screen
        name="Monitor"
        component={NetworkStack}
        options={{
          tabBarLabel: 'Network',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🕸️</Text>,
        }}
      />
      <Tab.Screen
        name="Debug"
        component={DebugStack}
        options={{
          tabBarLabel: 'Debug',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔍</Text>,
        }}
      />
    </Tab.Navigator>
  );
}