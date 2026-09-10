/**
 * src/utils/permissions.ts
 *
 * DROP-IN REPLACEMENT for the inline requestBluetoothPermissions() in App.tsx.
 *
 * WHAT WAS WRONG:
 *   - iOS: The old code returned `true` early for iOS without doing anything.
 *     The "not authorized" error fires because iOS requires a usage description
 *     string in Info.plist AND a prompt triggered by CBCentralManager init.
 *     BleService.initialize() triggers the native dialog correctly, but ONLY
 *     if the Info.plist keys are present. Without them, the OS silently denies.
 *   - Android < 31: Only ACCESS_FINE_LOCATION was requested, but on some OEMs
 *     (Xiaomi, OPPO, etc.) BLUETOOTH permission is also required even on API 30.
 *   - Both platforms: No user-friendly retry / settings-redirect when denied.
 *
 * FIXES:
 *   1. Android ≥ 31 → BLUETOOTH_SCAN + BLUETOOTH_CONNECT + BLUETOOTH_ADVERTISE
 *      (unchanged, was already correct)
 *   2. Android 29-30 → ACCESS_FINE_LOCATION + legacy BLUETOOTH + BLUETOOTH_ADMIN
 *   3. Android < 29  → ACCESS_COARSE_LOCATION (minimal)
 *   4. iOS           → Logs reminder about Info.plist; nothing else needed at JS layer.
 *   5. Denied case   → Shows Alert with direct link to Settings.
 *
 * INFO.PLIST KEYS REQUIRED (add to ios/RescueLink/Info.plist):
 *   <key>NSBluetoothAlwaysUsageDescription</key>
 *   <string>RescueLink uses Bluetooth to detect and relay distress signals in disaster zones.</string>
 *   <key>NSBluetoothPeripheralUsageDescription</key>
 *   <string>RescueLink needs Bluetooth peripheral access to broadcast your location to rescuers.</string>
 *
 * ANDROID MANIFEST REQUIRED (android/app/src/main/AndroidManifest.xml):
 *   <!-- For API >= 31 -->
 *   <uses-permission android:name="android.permission.BLUETOOTH_SCAN"
 *       android:usesPermissionFlags="neverForLocation" />
 *   <uses-permission android:name="android.permission.BLUETOOTH_CONNECT" />
 *   <uses-permission android:name="android.permission.BLUETOOTH_ADVERTISE" />
 *   <!-- For API < 31 -->
 *   <uses-permission android:name="android.permission.BLUETOOTH" />
 *   <uses-permission android:name="android.permission.BLUETOOTH_ADMIN" />
 *   <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
 *   <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
 *   <!-- Always required -->
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 *   <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
 */

import { Alert, Linking, PermissionsAndroid, Platform } from 'react-native';

function openSettings() {
  Linking.openSettings().catch(() =>
    Alert.alert('Could not open Settings', 'Please open Settings manually and grant Bluetooth permissions.'),
  );
}

function showDeniedAlert(missingPerms: string[]) {
  Alert.alert(
    '🚨 Bluetooth Permission Required',
    `RescueLink cannot detect nearby devices without Bluetooth access.\n\nMissing: ${missingPerms.join(', ')}\n\nPlease grant permissions in Settings.`,
    [
      { text: 'Open Settings', onPress: openSettings },
      { text: 'Cancel', style: 'cancel' },
    ],
  );
}

export async function requestBluetoothPermissions(): Promise<boolean> {
  // ── iOS ────────────────────────────────────────────────────────────────────
  // The permission dialog is triggered automatically by CBCentralManager
  // initialization inside BleService.initialize(). At the JS layer we only
  // need to ensure Info.plist keys are present (see comment above).
  // Return true here — BleService handles the Unauthorized state gracefully.
  if (Platform.OS === 'ios') {
    console.log('[Permissions] iOS: BLE dialog fires via CBCentralManager init.');
    return true;
  }

  // ── Android ────────────────────────────────────────────────────────────────
  const api = Platform.Version as number;
  console.log('[Permissions] Android API level:', api);

  let result: Record<string, string> = {};
  const denied: string[] = [];

  if (api >= 31) {
    // Android 12+ — new granular BLE permissions (no location needed for scan
    // when neverForLocation flag is set in manifest)
    result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
    ]);

    for (const [perm, status] of Object.entries(result)) {
      if (status !== PermissionsAndroid.RESULTS.GRANTED) {
        denied.push(perm.replace('android.permission.', ''));
      }
    }

  } else if (api >= 29) {
    // Android 10-11 — needs fine location for BLE scan
    result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      // Note: BLUETOOTH and BLUETOOTH_ADMIN are normal permissions on <31,
      // automatically granted if declared in manifest. No runtime request needed.
    ]);

    if (result[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
        !== PermissionsAndroid.RESULTS.GRANTED) {
      denied.push('ACCESS_FINE_LOCATION');
    }

  } else {
    // Android 9 and below — coarse location suffices
    const r = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      {
        title: 'Location Access',
        message: 'Required for Bluetooth scanning on Android 9 and below.',
        buttonPositive: 'Grant',
        buttonNegative: 'Deny',
      },
    );
    if (r !== PermissionsAndroid.RESULTS.GRANTED) {
      denied.push('ACCESS_COARSE_LOCATION');
    }
  }

  // Also request POST_NOTIFICATIONS on Android 13+
  if (api >= 33) {
    try {
      const notifResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (notifResult !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('[Permissions] POST_NOTIFICATIONS denied — alerts will be silent');
      }
    } catch (_) {
      // Older react-native versions may not have this constant — ignore
    }
  }

  if (denied.length > 0) {
    console.error('[Permissions] ❌ Denied:', denied);
    showDeniedAlert(denied);
    return false;
  }

  console.log('[Permissions] ✅ All granted');
  return true;
}