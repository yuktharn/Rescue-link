export enum DeviceStatus {
  NORMAL = 0x00,
  SOS = 0x01,
  TRAPPED = 0x02,
  LOST_SIGNAL = 0x03,
}

export interface DeviceInfo {
  deviceId: string;
  status: DeviceStatus;
  battery: number;
  timestamp: number;
  latitude?: number;
  longitude?: number;
  hopCount?: number;
}

export interface RSSIReading {
  fromDeviceId: string;
  toDeviceId: string;
  rssi: number;
  timestamp: number;
  hopCount: number;
}

export interface AggregatedPacket {
  advertiserId: string;
  victims: DeviceInfo[];
  rssiReadings: RSSIReading[];
  sequenceNumber: number;
  timestamp: number;
  chunkIndex: number;
  totalChunks: number;
}

export interface VictimLocation {
  deviceId: string;
  x: number;
  y: number;
  confidence: number;
  distance: number;
}

export interface ParsedBLEPacket {
  rawHex: string;
  parsed: AggregatedPacket;
  receivedAt: number;
}

export interface NearbyDevice {
  id: string;
  name?: string | null;
  rssi: number;
  isRescueLink: boolean;
  manufacturerData?: string | null;
  lastSeen: number;
}

export interface ScanResult {
  device: {
    id: string;
    name?: string | null;
    rssi?: number | null;
    manufacturerData?: string | null;
    serviceUUIDs?: string[] | null;
  };
  rssi: number;
  data: AggregatedPacket | null;
}

export enum AppMode {
  IDLE = 'idle',
  VICTIM_AGGRESSIVE = 'victim_aggressive',
  RESPONDER = 'responder',
}

export interface AppState {
  mode: AppMode;
  deviceId: string;
  battery: number;
  victimCount: number;
  victims: Record<string, DeviceInfo>;
  rssiReadings: RSSIReading[];
  locations: Record<string, VictimLocation>;
  rawPackets: ParsedBLEPacket[];
  isScanning: boolean;
  isAdvertising: boolean;
  nearbyDevices: Record<string, NearbyDevice>;
  bleStatus: string;
  lastUpdated: number;
}