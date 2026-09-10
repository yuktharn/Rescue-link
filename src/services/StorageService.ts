/**
 * AsyncStorage wrapper for persisting state
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, DeviceInfo } from "../types/index";

const STORAGE_KEYS = {
  DEVICE_ID: "@rescuelink:deviceId",
  DEVICE_STATUS: "@rescuelink:deviceStatus",
  VICTIM_LIST: "@rescuelink:victimList",
  APP_MODE: "@rescuelink:appMode",
  RAW_PACKETS: "@rescuelink:rawPackets",
};

export class StorageService {
  static async saveDeviceId(id: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.DEVICE_ID, id);
    } catch (error) {
      console.error("[StorageService] Failed to save device ID:", error);
    }
  }

  static async getDeviceId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_ID);
    } catch (error) {
      console.error("[StorageService] Failed to get device ID:", error);
      return null;
    }
  }

  static async saveVictims(victims: Record<string, DeviceInfo>): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.VICTIM_LIST, JSON.stringify(victims));
    } catch (error) {
      console.error("[StorageService] Failed to save victims:", error);
    }
  }

  static async getVictims(): Promise<Record<string, DeviceInfo>> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.VICTIM_LIST);
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error("[StorageService] Failed to get victims:", error);
      return {};
    }
  }

  static async saveAppMode(mode: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.APP_MODE, mode);
    } catch (error) {
      console.error("[StorageService] Failed to save app mode:", error);
    }
  }

  static async getAppMode(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.APP_MODE);
    } catch (error) {
      console.error("[StorageService] Failed to get app mode:", error);
      return null;
    }
  }

  static async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(STORAGE_KEYS));
    } catch (error) {
      console.error("[StorageService] Failed to clear all:", error);
    }
  }
}