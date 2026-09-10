/**
 * BLE Service and Characteristic UUIDs for RescueLink
 * Using custom 128-bit UUIDs to avoid conflicts
 */

// Service UUID: RescueLink Mesh Service
export const RESCUELINK_SERVICE_UUID = "12345678-1234-5678-1234-567812345678";

// Characteristics
export const ADVERTISE_CHAR_UUID = "12345678-1234-5678-1234-567812345679";
export const SCAN_CHAR_UUID = "12345678-1234-5678-1234-567812345680";
export const DISASTER_ALERT_CHAR_UUID = "12345678-1234-5678-1234-567812345681";
export const RSSI_RELAY_CHAR_UUID = "12345678-1234-5678-1234-567812345682";

// Disaster Alert Magic Flag (sent by responder)
export const DISASTER_ALERT_FLAG = 0xFF;

// BLE Advertisement Data Structure
export const MANUFACTURER_ID = 0x004C; // Apple (using for test; in production, register your own)