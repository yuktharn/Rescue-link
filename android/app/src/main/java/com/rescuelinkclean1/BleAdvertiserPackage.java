package com.rescuelinkclean1; // ← same package as BleAdvertiserModule.java

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/**
 * BleAdvertiserPackage.java
 *
 * Drop this file into:
 *   android/app/src/main/java/com/rescuelink/BleAdvertiserPackage.java
 *
 * Then register it in MainApplication.kt (see instructions below).
 */
public class BleAdvertiserPackage implements ReactPackage {

    @Override
    public List<NativeModule> createNativeModules(ReactApplicationContext reactContext) {
        return Arrays.asList(new BleAdvertiserModule(reactContext));
    }

    @Override
    public List<ViewManager> createViewManagers(ReactApplicationContext reactContext) {
        return Collections.emptyList();
    }
}