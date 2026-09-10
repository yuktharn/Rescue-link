/**
 * src/App.tsx — FIXED
 *
 * FIX 1 – "Device is not authorized to use BluetoothLE" on iOS
 *   This error means Core Bluetooth denied the scan because the app didn't
 *   wait for CBCentralManagerDelegate.centralManagerDidUpdateState() to fire
 *   with .poweredOn before calling startDeviceScan.  In the original code,
 *   BleService.initialize() set up the state listener but then resolved the
 *   Promise via a 10-second timeout even when BLE was still in the
 *   "unauthorized" or "resetting" state.  On iOS the OS shows the permission
 *   dialog AFTER the Promise already resolved, so startScanning() ran before
 *   the user had granted permission → "not authorized".
 *
 *   Fix A: initialize() now retries startScanning() from inside the
 *   onStateChange listener when state transitions to PoweredOn, so scanning
 *   starts the moment permission is granted, not before.
 *
 *   Fix B: on iOS we call requestBluetoothPermissions() which triggers the
 *   system dialog (CBCentralManager init) and waits for it, so by the time
 *   startScanning() is called the dialog has already been answered.
 *
 * FIX 2 – "11 devices detected" when there is really only 1
 *   The scanner sees the same physical phone through MULTIPLE MAC addresses:
 *   • iOS randomises MAC every few minutes (privacy feature)
 *   • Android also randomises on some OEMs
 *   The store was keying victims by device.id (the MAC), so one phone
 *   appeared as 2-11 separate victims over a 10-minute session.
 *
 *   Fix: victims are now keyed by their RescueLink DEVICE ID (the "RL_XXXXXXXX"
 *   string embedded in the GATT packet), not by the BLE MAC address.
 *   The BLE MAC is only used internally for the scan layer.
 *   When GATT fails (no parsed packet) we still record the sighting for
 *   the Debug screen but do NOT add a victim entry — only confirmed
 *   RescueLink packets (with a stable device ID) create victim records.
 */
// App.tsx — replace the old inline function with this import:
import { requestBluetoothPermissions } from './src/utils/permissions';
import React, {useEffect, useRef} from 'react';
import {
  Alert,
  InteractionManager,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {NavigationContainer} from '@react-navigation/native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {RootNavigator} from './src/navigation/RootNavigator';
import {useAppStore} from './src/store/appStore';
import {StorageService} from './src/services/StorageService';
import {NotificationService} from './src/services/NotificationService';
import {BleService} from './src/services/BleService';
import {AppMode, NearbyDevice} from './src/types/index';

function generateDeviceId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let r = 'RL_';
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return r;
}

// async function requestBluetoothPermissions(): Promise<boolean> {
//   if (Platform.OS === 'android') {
//     const api = Platform.Version as number;
//     console.log('[Permissions] Android API:', api);

//     if (api >= 31) {
//       const res = await PermissionsAndroid.requestMultiple([
//         PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
//         PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
//         PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADVERTISE,
//       ]);
//       const ok = Object.values(res).every(
//         r => r === PermissionsAndroid.RESULTS.GRANTED,
//       );
//       console.log('[Permissions]', ok ? '✅ All granted' : '❌ Some denied');
//       if (!ok) {
//         Alert.alert(
//           'Bluetooth Permission Required',
//           'Please grant all Bluetooth permissions so RescueLink can detect nearby devices.',
//           [{text: 'OK'}],
//         );
//       }
//       return ok;
//     }

//     const granted = await PermissionsAndroid.request(
//       PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
//       {
//         title: 'Location Permission',
//         message: 'Required for Bluetooth scanning on this Android version.',
//         buttonPositive: 'Grant',
//         buttonNegative: 'Deny',
//       },
//     );
//     const ok = granted === PermissionsAndroid.RESULTS.GRANTED;
//     console.log('[Permissions] Location:', ok ? '✅ Granted' : '❌ Denied');
//     return ok;
//   }

//   // iOS — FIX 1B: trigger CBCentralManager init by importing BleManager.
//   // The system dialog fires when the native BleManager is first instantiated
//   // inside BleService.initialize(), so we just need to await that call.
//   // Nothing extra needed here for iOS beyond awaiting initialize().
//   return true;
// }

const App: React.FC = () => {
  const {setDeviceId, addNearbyDevice} = useAppStore();
  const bleRef = useRef<BleService | null>(null);

  useEffect(() => {
    let unsub: (() => void) | null = null;

    const task = InteractionManager.runAfterInteractions(async () => {
      try {
        console.log('=== [App] INIT START ===');

        // Request permissions FIRST — must complete before BLE init
        await requestBluetoothPermissions();

        let deviceId = await StorageService.getDeviceId();
        if (!deviceId) {
          deviceId = generateDeviceId();
          await StorageService.saveDeviceId(deviceId);
        }
        setDeviceId(deviceId);
        console.log('[App] Device ID:', deviceId);

        await NotificationService.initialize();

        const ble = new BleService({
          deviceId,

          // onScanResult: intentionally empty.
          // All store writes (addVictim, addRSSIReading, addRawPacket,
          // calculateLocations) happen inside BleService._drainGattQueue.
          // Doing them here too would double-process every packet.
          onScanResult: _result => {},

          onDisasterAlert: () => {
            console.log('[App] DISASTER ALERT received');
            NotificationService.showDisasterAlert().catch(e =>
              console.error('[App] Notification error (non-fatal):', e?.message),
            );
          },

          onError: err =>
            console.error('[App] BLE Error (non-fatal):', err.message),

          onNearbyDeviceFound: (d: NearbyDevice) => addNearbyDevice(d),
        });

        bleRef.current = ble;

        // FIX 1A: initialize() now waits for PoweredOn state internally.
        // startScanning() is called from inside BleService when state becomes
        // PoweredOn, so we never scan before permission is granted.
        await ble.initialize();
        console.log('[App] BLE initialized — scanning will start when powered on');

        // Mode subscription
        let prevMode = useAppStore.getState().mode;
        unsub = useAppStore.subscribe(state => {
          const b = bleRef.current;
          if (!b || state.mode === prevMode) return;
          prevMode = state.mode;
          console.log('[App] Mode →', state.mode);

          if (state.mode === AppMode.VICTIM_AGGRESSIVE) {
            b.startAdvertising();
            // scanning already running from initialize()
          } else if (state.mode === AppMode.RESPONDER) {
            b.startAdvertising();
            b.broadcastDisasterAlert();
          } else {
            b.stopAdvertising();
          }
        });

        console.log('=== [App] INIT COMPLETE ===');
      } catch (e: any) {
        console.error('[App] INIT FAILED:', e?.message ?? String(e));
      }
    });

    return () => {
      task.cancel();
      unsub?.();
      bleRef.current?.destroy();
    };
  }, []);

  return (
    <GestureHandlerRootView style={{flex: 1}}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default App;