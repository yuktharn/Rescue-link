/**
 * Notification Service — FIXED
 *
 * BUG FIXED: showDisasterAlert() was calling notifee.displayNotification()
 * with a channel ID that wasn't created yet, OR the channel creation was
 * failing silently and the displayNotification call was throwing an unhandled
 * rejection that propagated to App.tsx's onDisasterAlert callback,
 * which killed the BLE error handler and stopped advertising state updates.
 *
 * FIX:
 * 1. Channel creation is now idempotent — safe to call multiple times.
 * 2. showDisasterAlert wraps everything in try/catch so a notification
 *    failure never crashes the BLE flow.
 * 3. initialize() is now safe to call multiple times (guards against double-init).
 * 4. Added showScanningNotification for foreground service indicator.
 */

import notifee, {
  AndroidImportance,
  AndroidVisibility,
} from '@notifee/react-native';
import {Platform} from 'react-native';

const CHANNEL_ID = 'rescuelink_alerts';
const SCANNING_CHANNEL_ID = 'rescuelink_scanning';

let initialized = false;

export class NotificationService {
  static async initialize(): Promise<void> {
    if (initialized) {
      console.log('[Notifications] Already initialized, skipping');
      return;
    }

    try {
      if (Platform.OS === 'android') {
        // ✅ High-priority channel for disaster alerts
        await notifee.createChannel({
          id: CHANNEL_ID,
          name: 'Disaster Alerts',
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          vibration: true,
          vibrationPattern: [300, 500, 300, 500],
          sound: 'default',
          lights: true,
          lightColor: '#FF0000',
        });

        // ✅ Low-priority channel for scanning status
        await notifee.createChannel({
          id: SCANNING_CHANNEL_ID,
          name: 'Scanning Status',
          importance: AndroidImportance.LOW,
          visibility: AndroidVisibility.PUBLIC,
        });

        console.log('[Notifications] ✅ Android channels created');
      }

      initialized = true;
      console.log('[Notifications] ✅ Initialized');
    } catch (error: any) {
      // Don't crash app if notifications fail
      console.error('[Notifications] Init error (non-fatal):', error?.message);
    }
  }

  static async showDisasterAlert(): Promise<void> {
    try {
      // Ensure initialized even if initialize() wasn't called
      if (!initialized) {
        await NotificationService.initialize();
      }

      await notifee.displayNotification({
        title: '⚠️ DISASTER DETECTED',
        body: 'A responder has activated emergency mode. Tap to activate victim tracking.',
        android: {
          channelId: CHANNEL_ID,
          importance: AndroidImportance.HIGH,
          visibility: AndroidVisibility.PUBLIC,
          vibrationPattern: [300, 500, 300, 500],
          pressAction: {id: 'default'},
          smallIcon: 'ic_notification', // falls back gracefully if missing
          color: '#FF4444',
          ongoing: false,
        },
        ios: {
          sound: 'default',
          critical: true,
          criticalVolume: 1.0,
        },
      });

      console.log('[Notifications] ✅ Disaster alert shown');
    } catch (error: any) {
      // ✅ FIX: catch here so BLE flow is never interrupted by notification failure
      console.error('[Notifications] showDisasterAlert error (non-fatal):', error?.message);
    }
  }

  static async showScanningActive(): Promise<void> {
    try {
      if (!initialized) await NotificationService.initialize();

      await notifee.displayNotification({
        id: 'scanning_status',
        title: '📡 RescueLink Active',
        body: 'Scanning for nearby devices...',
        android: {
          channelId: SCANNING_CHANNEL_ID,
          importance: AndroidImportance.LOW,
          ongoing: true,
          asForegroundService: true,
          pressAction: {id: 'default'},
          smallIcon: 'ic_notification',
        },
      });

      console.log('[Notifications] ✅ Scanning notification shown');
    } catch (error: any) {
      console.error('[Notifications] showScanningActive error (non-fatal):', error?.message);
    }
  }

  static async cancelScanningNotification(): Promise<void> {
    try {
      await notifee.cancelNotification('scanning_status');
    } catch (_e) {}
  }

  static async cancelAll(): Promise<void> {
    try {
      await notifee.cancelAllNotifications();
    } catch (_e) {}
  }
}