package com.rescuelinkclean1; // ← change to match your actual package name if different

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.content.Context;
import android.os.ParcelUuid;
import android.util.Log;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.ReadableArray;

import java.util.UUID;

/**
 * BleAdvertiserModule.java
 *
 * Drop this file into:
 *   android/app/src/main/java/com/rescuelink/BleAdvertiserModule.java
 *
 * Wraps Android's BluetoothLeAdvertiser directly — no third party library.
 * New Architecture compatible because ReactContextBaseJavaModule still works
 * with the bridge interop layer in RN 0.76 (Fabric + old-arch bridge shim).
 *
 * Called from JS as:
 *   NativeModules.BleAdvertiser.startAdvertising(serviceUUID, manufacturerBytes, promise)
 *   NativeModules.BleAdvertiser.stopAdvertising(promise)
 */
public class BleAdvertiserModule extends ReactContextBaseJavaModule {
    private static final String TAG = "BleAdvertiserModule";

    private BluetoothLeAdvertiser advertiser;
    private AdvertiseCallback activeCallback;

    public BleAdvertiserModule(ReactApplicationContext context) {
        super(context);
    }

    @Override
    public String getName() {
        return "BleAdvertiser"; // this is what NativeModules.BleAdvertiser maps to in JS
    }

    @ReactMethod
    public void startAdvertising(String serviceUUID, ReadableArray manufacturerBytes, Promise promise) {
        try {
            BluetoothManager btManager = (BluetoothManager)
                getReactApplicationContext().getSystemService(Context.BLUETOOTH_SERVICE);

            if (btManager == null) {
                promise.reject("BT_UNAVAILABLE", "BluetoothManager not available");
                return;
            }

            BluetoothAdapter adapter = btManager.getAdapter();
            if (adapter == null || !adapter.isEnabled()) {
                promise.reject("BT_OFF", "Bluetooth is off");
                return;
            }

            if (!adapter.isMultipleAdvertisementSupported()) {
                promise.reject("NOT_SUPPORTED", "BLE advertising not supported on this device");
                return;
            }

            advertiser = adapter.getBluetoothLeAdvertiser();
            if (advertiser == null) {
                promise.reject("ADVERTISER_NULL", "Could not get BluetoothLeAdvertiser");
                return;
            }

            // Stop any existing advertisement first
            if (activeCallback != null) {
                advertiser.stopAdvertising(activeCallback);
                activeCallback = null;
            }

            // Build settings: low latency = fastest advertising interval (~100ms)
            AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_LATENCY)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_HIGH)
                .setConnectable(true)  // connectable so GATT reads work
                .setTimeout(0)         // 0 = advertise indefinitely
                .build();

            // Build manufacturer data bytes from JS array
            byte[] mfrBytes = new byte[manufacturerBytes.size()];
            for (int i = 0; i < manufacturerBytes.size(); i++) {
                mfrBytes[i] = (byte) manufacturerBytes.getInt(i);
            }

            // Build the advertisement data
            AdvertiseData.Builder dataBuilder = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)  // keep it short
                .setIncludeTxPowerLevel(false)
                .addManufacturerData(0x0059, mfrBytes); // 0x0059 = Nordic Semi (safe for hackathon)

            // Add service UUID so ble-plx scanners can filter by it
            if (serviceUUID != null && !serviceUUID.isEmpty()) {
                dataBuilder.addServiceUuid(new ParcelUuid(UUID.fromString(serviceUUID)));
            }

            AdvertiseData data = dataBuilder.build();

            activeCallback = new AdvertiseCallback() {
                @Override
                public void onStartSuccess(AdvertiseSettings settingsInEffect) {
                    Log.d(TAG, "✅ Advertising started successfully");
                    promise.resolve("started");
                }

                @Override
                public void onStartFailure(int errorCode) {
                    String msg = advertiseErrorToString(errorCode);
                    Log.e(TAG, "❌ Advertising failed: " + msg + " (code " + errorCode + ")");
                    promise.reject("ADVERTISE_FAILED", msg);
                    activeCallback = null;
                }
            };

            advertiser.startAdvertising(settings, data, activeCallback);

        } catch (Exception e) {
            Log.e(TAG, "startAdvertising exception: " + e.getMessage());
            promise.reject("EXCEPTION", e.getMessage());
        }
    }

    @ReactMethod
    public void stopAdvertising(Promise promise) {
        try {
            if (advertiser != null && activeCallback != null) {
                advertiser.stopAdvertising(activeCallback);
                activeCallback = null;
                Log.d(TAG, "🛑 Advertising stopped");
            }
            promise.resolve("stopped");
        } catch (Exception e) {
            Log.e(TAG, "stopAdvertising exception: " + e.getMessage());
            promise.reject("EXCEPTION", e.getMessage());
        }
    }

    // Required for RN 0.71+ to avoid memory leaks on module re-creation
    @ReactMethod
    public void addListener(String eventName) {}

    @ReactMethod
    public void removeListeners(Integer count) {}

    private String advertiseErrorToString(int errorCode) {
        switch (errorCode) {
            case AdvertiseCallback.ADVERTISE_FAILED_ALREADY_STARTED:
                return "Already advertising";
            case AdvertiseCallback.ADVERTISE_FAILED_DATA_TOO_LARGE:
                return "Advertise data too large";
            case AdvertiseCallback.ADVERTISE_FAILED_FEATURE_UNSUPPORTED:
                return "BLE advertising not supported";
            case AdvertiseCallback.ADVERTISE_FAILED_INTERNAL_ERROR:
                return "Internal error";
            case AdvertiseCallback.ADVERTISE_FAILED_TOO_MANY_ADVERTISERS:
                return "Too many advertisers";
            default:
                return "Unknown error: " + errorCode;
        }
    }
}