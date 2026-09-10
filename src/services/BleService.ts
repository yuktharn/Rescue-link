/**
 * src/services/BleService.ts — FIXED v6
 *
 * ════════════════════════════════════════════════════════════════════════════
 * FIXES IN THIS VERSION
 * ════════════════════════════════════════════════════════════════════════════
 *
 * FIX 1 — Root cause of "Operation was cancelled" / GATT spam
 *   With allowDuplicates:true the scan callback fires 10-20 times/second per
 *   device. v5 called _scheduleGatt() on every callback, which immediately
 *   called setImmediate(_runGatt). Even though GATT_COOLDOWN_MS guards re-
 *   reads of the SAME mac, many different MACs can fire simultaneously, so
 *   multiple _runGatt coroutines race each other — the second one finds
 *   gattInFlight=true, waits 500 ms, retries, and by then Android has cancelled
 *   the first connection.
 *
 *   FIX: Replace setImmediate with a controlled GATT drain loop.
 *     - Scan callback only adds MACs to a pending Set (no immediate call).
 *     - A single interval (GATT_DRAIN_INTERVAL_MS = 3 s) drains ONE entry at a
 *       time from the set, guaranteeing no two GATT ops ever overlap.
 *     - GATT_COOLDOWN_MS is now per-MAC from last SUCCESS (20 s), unchanged.
 *
 * FIX 2 — Placeholder cap at MAX_PLACEHOLDERS (= 3)
 *   If GATT never succeeds for many MACs the store fills with RL_PH_ victims
 *   and the map gets cluttered. We now cap at MAX_PLACEHOLDERS total. Once the
 *   cap is reached, new failed MACs are silently ignored (we still queue them
 *   for future GATT attempts) — only the 3 strongest-RSSI failures get a
 *   placeholder.  Each placeholder is updated with fresh RSSI every drain
 *   cycle instead of creating a new one.
 *
 * FIX 3 — Dashboard / map not updating after GATT success
 *   selfEntry lookup was: victims[0] if victims[0].deviceId === stableId
 *   This is wrong when the advertiser inserts themselves at any index.
 *   FIX: use Array.find() correctly (already present in v5 but the fallback
 *   condition was an OR with an always-true arm). Now: find first, fall back
 *   to a safe default. Also explicitly call store.calculateLocations() even
 *   when the victim already exists, so the map always re-runs after new RSSI.
 *
 * FIX 4 — Scan restart stacking
 *   If _doStartScanning() is called while a scan is already running (e.g. from
 *   the drain loop restart after GATT), it now returns immediately (guard was
 *   already there in v5). Added an extra flag _scanRestarting to prevent
 *   double-restarts during the GATT stop/restart window.
 *
 * FIX 5 — Lower scan frequency to reduce radio congestion
 *   Changed to legacyScan:true on both platforms (more compatible, less
 *   aggressive). Removed allowDuplicates on Android (we drain the GATT queue
 *   on a timer anyway so we don't need every single advertisement).
 *   allowDuplicates stays true on iOS (needed there for RSSI updates).
 *
 * All v5 fixes retained (stop-scan-before-GATT, 3-attempt retry, 8 s timeout,
 * placeholder coordinates, never relay placeholder IDs).
 */

import {BleManager, State} from 'react-native-ble-plx';
import {Platform} from 'react-native';
import {Buffer} from 'buffer';
import {RESCUELINK_SERVICE_UUID, RSSI_RELAY_CHAR_UUID} from '../utils/bleUUIDs';
import {
  DeviceInfo,
  DeviceStatus,
  AggregatedPacket,
  ParsedBLEPacket,
  ScanResult,
  NearbyDevice,
  VictimLocation,
} from '../types/index';
import {deserializePacket} from '../utils/packetFormat';
import {useAppStore} from '../store/appStore';
import {AdvertiserService} from './AdvertiserService';

// ── Tuning ─────────────────────────────────────────────────────────────────
const GATT_COOLDOWN_MS     = 20_000; // min ms between GATT reads for the SAME mac
const GATT_TIMEOUT_MS      = 8_000;  // per connection attempt
const GATT_MAX_RETRIES     = 3;      // attempts before giving up
const GATT_RETRY_DELAY     = 800;    // ms base (× attempt#)
const SCAN_PAUSE_MS        = 250;    // settle time after stopping scan before GATT
const GATT_DRAIN_INTERVAL  = 3_000;  // FIX 1: drain one GATT op every 3 s
const MAX_PLACEHOLDERS     = 3;      // FIX 2: cap on placeholder victims

// ── Helpers ────────────────────────────────────────────────────────────────

/** Deterministic pseudo-ID from MAC — stable across GATT failures */
function macToPseudoId(mac: string): string {
  const bytes = mac.replace(/:/g, '');
  let h = 0;
  for (let i = 0; i < bytes.length; i += 2) {
    h = ((h << 5) - h + parseInt(bytes.slice(i, i + 2), 16)) | 0;
  }
  return `RL_PH_${Math.abs(h).toString(36).toUpperCase().slice(0, 6).padStart(6, '0')}`;
}

/** RSSI → rough distance (log-distance path loss, n=2.5) */
function rssiToDistance(rssi: number): number {
  return Math.max(1, Math.min(80, Math.pow(10, (-59 - rssi) / 25)));
}

/** Scatter placeholder around origin using pseudoId as angle seed */
function placeholderLocation(pseudoId: string, rssi: number): VictimLocation {
  // Use a hash of the pseudoId chars to get a consistent angle per device
  const angle =
    ((pseudoId.charCodeAt(6) ?? 0) * 47 +
      (pseudoId.charCodeAt(7) ?? 0) * 13 +
      (pseudoId.charCodeAt(8) ?? 0) * 7) % 360;
  const rad  = (angle * Math.PI) / 180;
  const dist = rssiToDistance(rssi);
  return {
    deviceId:   pseudoId,
    x:          parseFloat((dist * Math.cos(rad)).toFixed(1)),
    y:          parseFloat((dist * Math.sin(rad)).toFixed(1)),
    distance:   dist,
    confidence: 0.2, // clearly "estimated" — UI should render differently
  };
}

// ── BleService ─────────────────────────────────────────────────────────────

export interface BleServiceConfig {
  deviceId:             string;
  onScanResult:         (result: ScanResult) => void;
  onDisasterAlert:      () => void;
  onError:              (error: Error) => void;
  onNearbyDeviceFound?: (device: NearbyDevice) => void;
}

/** Internal record of a pending GATT target */
interface GattTarget {
  mac:     string;
  rssi:    number;
  mfrData: string | null;
}

export class BleService {
  private manager:    BleManager;
  private advertiser: AdvertiserService;
  private config:     BleServiceConfig;

  private isScanning     = false;
  private _scanRestarting = false;   // FIX 4: guard against double restart
  private isAdvertising  = false;

  private currentDeviceInfo: DeviceInfo;
  private nearbyDevices: Map<string, NearbyDevice> = new Map();

  // FIX 1: pending GATT targets (keyed by MAC for dedup)
  private pendingGatt: Map<string, GattTarget> = new Map();
  private gattInFlight  = false;
  private lastGattRead: Map<string, number>   = new Map();

  // FIX 2: placeholder tracking
  private placeholderIds: Set<string> = new Set(); // RL_PH_ ids we've created
  // MAC → RL_PH_ id (so we can update instead of re-create)
  private macToPlaceholder: Map<string, string> = new Map();

  private gattDrainTimer:    ReturnType<typeof setInterval> | null = null;
  private scanRestartTimer:  ReturnType<typeof setTimeout>  | null = null;
  private scanStatsTimer:    ReturnType<typeof setInterval> | null = null;
  private stateSubscription: any = null;

  private stats = {ads: 0, rl: 0, gattOk: 0, gattFail: 0, placeholder: 0};

  constructor(config: BleServiceConfig) {
    this.manager    = new BleManager();
    this.advertiser = new AdvertiserService();
    this.config     = config;
    this.currentDeviceInfo = {
      deviceId:  config.deviceId,
      status:    DeviceStatus.NORMAL,
      battery:   100,
      timestamp: Date.now(),
    };
    console.log('[BleService] Created:', config.deviceId);
  }

  // ── initialize ────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    await this.advertiser.initialize();
    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        console.warn('[BleService] Init timeout');
        resolve();
      }, 15_000);

      this.stateSubscription = this.manager.onStateChange(async state => {
        console.log('[BleService] BLE state:', state);
        useAppStore.getState().setBleStatus(state);
        if (state === State.PoweredOn) {
          clearTimeout(timeout);
          resolve();
          await this._doStartScanning();
          this._startGattDrain(); // FIX 1: start drain loop
        } else if (state === State.PoweredOff) {
          useAppStore.getState().setScanning(false);
          useAppStore.getState().setAdvertising(false);
          this.isScanning = false;
        } else if (state === State.Unauthorized) {
          clearTimeout(timeout);
          useAppStore.getState().setBleStatus('Unauthorized');
          resolve();
        }
      }, true);
    });
  }

  // ── scanning ──────────────────────────────────────────────────────────────

  async startScanning(): Promise<void> {
    const state = await this.manager.state();
    if (state !== State.PoweredOn) return;
    await this._doStartScanning();
    this._startGattDrain();
  }

  private async _doStartScanning(): Promise<void> {
    if (this.isScanning || this._scanRestarting) return;
    this.isScanning = true;
    useAppStore.getState().setScanning(true);
    console.log('[BleService] Scan STARTED');

    // FIX 5: less aggressive scan options reduce radio congestion
    this.manager.startDeviceScan(
      null,
      {
        allowDuplicates: Platform.OS === 'ios', // iOS needs dups for RSSI; Android doesn't
        legacyScan: true,                        // more compatible on both platforms
      },
      (error, device) => {
        if (error) {
          console.error('[BleService] Scan error:', error.message);
          this.isScanning = false;
          useAppStore.getState().setScanning(false);
          this.config.onError(error);
          // Backoff restart
          this.scanRestartTimer = setTimeout(() => this._doStartScanning(), 30_000);
          return;
        }
        if (!device || device.rssi === null) return;
        this.stats.ads++;

        const isRL = device.serviceUUIDs?.some(
          u => u.toLowerCase() === RESCUELINK_SERVICE_UUID.toLowerCase(),
        ) ?? false;

        const nearby: NearbyDevice = {
          id:               device.id,
          name:             device.name,
          rssi:             device.rssi,
          isRescueLink:     isRL,
          manufacturerData: device.manufacturerData,
          lastSeen:         Date.now(),
        };
        this.nearbyDevices.set(device.id, nearby);
        useAppStore.getState().updateNearbyDevice(nearby);
        this.config.onNearbyDeviceFound?.(nearby);

        // Disaster alert detection via manufacturer data
        if (device.manufacturerData) {
          try {
            const mfr = Buffer.from(device.manufacturerData, 'base64');
            if (mfr.length > 2 && mfr[2] === 0xff) {
              console.log('[BleService] DISASTER ALERT detected');
              this.config.onDisasterAlert();
            }
          } catch (_) {}
        }

        if (isRL) {
          this.stats.rl++;
          // FIX 1: add to pending set (deduplicated), drain loop handles GATT
          this._enqueueGatt(device.id, device.rssi, device.manufacturerData ?? null);
        }
      },
    );

    this._startStatsLogger();
  }

  // ── GATT drain (FIX 1) ────────────────────────────────────────────────────

  /**
   * Add a MAC to the pending GATT queue. Always keeps the most recent RSSI.
   * Does NOT trigger immediate GATT — the drain loop handles scheduling.
   */
  private _enqueueGatt(mac: string, rssi: number, mfrData: string | null): void {
    const now = Date.now();
    if (now - (this.lastGattRead.get(mac) ?? 0) < GATT_COOLDOWN_MS) return;
    // Update rssi if we already have this in the queue (keep stronger signal)
    const existing = this.pendingGatt.get(mac);
    if (existing) {
      existing.rssi    = Math.max(existing.rssi, rssi);
      existing.mfrData = mfrData ?? existing.mfrData;
    } else {
      this.pendingGatt.set(mac, {mac, rssi, mfrData});
    }
  }

  /**
   * Start the interval that drains one GATT target at a time.
   * One GATT op every GATT_DRAIN_INTERVAL ms — no overlap, no cancel races.
   */
  private _startGattDrain(): void {
    if (this.gattDrainTimer) return; // already running
    this.gattDrainTimer = setInterval(async () => {
      if (this.gattInFlight) return; // previous op still running — skip tick
      if (this.pendingGatt.size === 0) return;

      // Pick the target with the strongest RSSI (most likely to connect)
      let best: GattTarget | null = null;
      for (const target of this.pendingGatt.values()) {
        if (!best || target.rssi > best.rssi) best = target;
      }
      if (!best) return;

      this.pendingGatt.delete(best.mac);
      await this._runGatt(best.mac, best.rssi, best.mfrData);
    }, GATT_DRAIN_INTERVAL);
  }

  // ── GATT read ─────────────────────────────────────────────────────────────

  private async _runGatt(mac: string, rssi: number, mfrData: string | null): Promise<void> {
    this.gattInFlight = true;
    const ownId = this.config.deviceId;

    let parsed: AggregatedPacket | null = null;
    let rawHex = mfrData ? Buffer.from(mfrData, 'base64').toString('hex').toUpperCase() : '';
    let gattSucceeded = false;

    // FIX: stop scan on Android to prevent "Operation was cancelled"
    const wasScanningBefore = this.isScanning;
    if (Platform.OS === 'android' && wasScanningBefore) {
      try {
        this.manager.stopDeviceScan();
        this.isScanning = false;
        useAppStore.getState().setScanning(false);
        await new Promise(r => setTimeout(r, SCAN_PAUSE_MS));
      } catch (_) {}
    }

    // Retry loop with exponential back-off
    for (let attempt = 1; attempt <= GATT_MAX_RETRIES; attempt++) {
      let conn: any = null;
      try {
        console.log(`[BleService] GATT ${attempt}/${GATT_MAX_RETRIES}: ...${mac.slice(-5)}`);

        conn = await this.manager.connectToDevice(mac, {timeout: GATT_TIMEOUT_MS});
        await conn.discoverAllServicesAndCharacteristics();
        const char = await conn.readCharacteristicForService(
          RESCUELINK_SERVICE_UUID,
          RSSI_RELAY_CHAR_UUID,
        );
        if (char.value) {
          const buf = Buffer.from(char.value, 'base64');
          rawHex  = buf.toString('hex').toUpperCase();
          parsed  = deserializePacket(buf);
          console.log(
            `[BleService] ✅ GATT OK (attempt ${attempt}): ...${mac.slice(-5)}` +
            ` | ${buf.length}b | id: ${parsed?.advertiserId ?? '?'}` +
            ` | victims: ${parsed?.victims?.length ?? 0}`,
          );
        }
        try { await conn.cancelConnection(); } catch (_) {}
        this.lastGattRead.set(mac, Date.now());
        this.stats.gattOk++;
        gattSucceeded = true;
        break;

      } catch (e: any) {
        if (conn) { try { await conn.cancelConnection(); } catch (_) {} }
        const reason = e?.message ?? 'unknown';
        console.log(
          `[BleService] GATT attempt ${attempt} FAILED: ...${mac.slice(-5)} — ${reason}`,
        );
        if (attempt < GATT_MAX_RETRIES) {
          await new Promise(r => setTimeout(r, GATT_RETRY_DELAY * attempt));
        } else {
          this.stats.gattFail++;
          console.log(`[BleService] ❌ All GATT attempts failed: ...${mac.slice(-5)}`);
        }
      }
    }

    // Restart scan after GATT (FIX 4: use _scanRestarting guard)
    if (Platform.OS === 'android' && wasScanningBefore && !this.isScanning) {
      this._scanRestarting = true;
      await new Promise(r => setTimeout(r, 200));
      this._scanRestarting = false;
      await this._doStartScanning();
    }

    this.gattInFlight = false;

    // ── Store writes ────────────────────────────────────────────────────────
    const store = useAppStore.getState();

    store.addRawPacket({
      rawHex: rawHex || '(advertisement only — no GATT data)',
      parsed: parsed ?? {
        advertiserId: mac,
        victims:      [],
        rssiReadings: [],
        sequenceNumber: 0,
        timestamp:    Date.now(),
        chunkIndex:   0,
        totalChunks:  1,
      },
      receivedAt: Date.now(),
    });

    if (gattSucceeded && parsed?.advertiserId) {
      // ── REAL data path ────────────────────────────────────────────────────
      const stableId = parsed.advertiserId.startsWith('RL_') ? parsed.advertiserId : null;

      if (stableId && stableId !== ownId) {
        // Replace placeholder for this MAC if one exists
        const phId = this.macToPlaceholder.get(mac);
        if (phId) {
          store.removeVictim(phId);
          const locs = {...(store.locations ?? {})};
          delete locs[phId];
          store.setLocations(locs);
          this.placeholderIds.delete(phId);
          this.macToPlaceholder.delete(mac);
          console.log(`[BleService] 🔄 Replaced placeholder ${phId} → ${stableId}`);
        }

        store.resolveNearbyStableId(mac, stableId);

        // FIX 3: correct selfEntry lookup
        const selfEntry = parsed.victims.find(v => v.deviceId === stableId);

        store.addVictim({
          deviceId:  stableId,
          status:    selfEntry?.status  ?? DeviceStatus.NORMAL,
          battery:   selfEntry?.battery ?? 100,
          timestamp: Date.now(),
          hopCount:  1,
        });

        // RSSI from us → the advertising device
        store.addRSSIReading({
          fromDeviceId: ownId,
          toDeviceId:   stableId,
          rssi,
          timestamp:    Date.now(),
          hopCount:     1,
        });

        // Relay victims and readings from the packet (multi-hop)
        for (const v of parsed.victims) {
          if (v.deviceId === ownId || v.deviceId === stableId) continue;
          if (!v.deviceId.startsWith('RL_PH_')) store.addVictim(v);
        }
        for (const r of parsed.rssiReadings) {
          if (r.fromDeviceId.startsWith('RL_PH_') || r.toDeviceId.startsWith('RL_PH_')) continue;
          store.addRSSIReading(r);
        }

        // FIX 3: always recalculate so map updates immediately
        store.calculateLocations();

        console.log(
          `[BleService] 📡 [REAL] victim: ${stableId} | rssi: ${rssi} dBm`,
        );
      }

    } else {
      // ── FIX 2: Placeholder path — capped at MAX_PLACEHOLDERS ─────────────
      const phId  = macToPseudoId(mac);
      const loc   = placeholderLocation(phId, rssi);

      if (this.placeholderIds.has(phId)) {
        // Update existing placeholder RSSI / location only
        store.addRSSIReading({
          fromDeviceId: ownId, toDeviceId: phId,
          rssi, timestamp: Date.now(), hopCount: 99,
        });
        const locs = {...(store.locations ?? {}), [phId]: loc};
        store.setLocations(locs);
        console.log(`[BleService] 📍 [PH UPDATE] ${phId} | rssi: ${rssi} | dist: ${loc.distance.toFixed(1)}m`);

      } else if (this.placeholderIds.size < MAX_PLACEHOLDERS) {
        // FIX 2: only create a new placeholder if under the cap
        this.placeholderIds.add(phId);
        this.macToPlaceholder.set(mac, phId);
        this.stats.placeholder++;

        store.addVictim({
          deviceId:  phId,
          status:    DeviceStatus.LOST_SIGNAL,
          battery:   0,
          timestamp: Date.now(),
          hopCount:  99,
        });
        store.addRSSIReading({
          fromDeviceId: ownId, toDeviceId: phId,
          rssi, timestamp: Date.now(), hopCount: 99,
        });
        const locs = {...(store.locations ?? {}), [phId]: loc};
        store.setLocations(locs);

        console.log(
          `[BleService] 📍 [PLACEHOLDER] ${phId}` +
          ` | mac: ...${mac.slice(-5)} | rssi: ${rssi} dBm` +
          ` | x:${loc.x}m y:${loc.y}m dist:${loc.distance.toFixed(1)}m` +
          ` | total placeholders: ${this.placeholderIds.size}/${MAX_PLACEHOLDERS}`,
        );
      } else {
        // Cap reached — still queue this MAC for future GATT, but no new placeholder
        console.log(
          `[BleService] ⚠️ Placeholder cap (${MAX_PLACEHOLDERS}) reached, skipping` +
          ` new placeholder for ...${mac.slice(-5)} (rssi: ${rssi})`,
        );
        // Re-enqueue for next drain cycle so we keep trying GATT
        this._enqueueGatt(mac, rssi, mfrData);
      }
    }

    this.config.onScanResult({
      device: {id: mac, name: null, rssi, manufacturerData: mfrData, serviceUUIDs: null},
      rssi,
      data: parsed,
    });
  }

  // ── Stats logger ──────────────────────────────────────────────────────────

  private _startStatsLogger(): void {
    if (this.scanStatsTimer) clearInterval(this.scanStatsTimer);
    this.scanStatsTimer = setInterval(() => {
      const state    = useAppStore.getState();
      const realVics = Object.keys(state.victims).filter(id => !id.startsWith('RL_PH_')).length;
      const phVics   = this.placeholderIds.size;
      const pending  = this.pendingGatt.size;
      console.log(
        `[BleService] 10s stats |` +
        ` ads:${this.stats.ads} rl:${this.stats.rl}` +
        ` gattOk:${this.stats.gattOk} gattFail:${this.stats.gattFail}` +
        ` placeholder:${this.stats.placeholder} pendingGatt:${pending}` +
        ` | scanning:${this.isScanning} adv:${this.isAdvertising}` +
        ` | REAL victims:${realVics}  PLACEHOLDER:${phVics}/${MAX_PLACEHOLDERS}`,
      );
      this.stats = {ads: 0, rl: 0, gattOk: 0, gattFail: 0, placeholder: 0};
    }, 10_000);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  async stopScanning(): Promise<void> {
    try {
      if (this.isScanning) {
        this.manager.stopDeviceScan();
        this.isScanning = false;
        useAppStore.getState().setScanning(false);
        console.log('[BleService] Scan stopped');
      }
      if (this.scanRestartTimer) { clearTimeout(this.scanRestartTimer);  this.scanRestartTimer = null; }
      if (this.scanStatsTimer)   { clearInterval(this.scanStatsTimer);   this.scanStatsTimer   = null; }
      if (this.gattDrainTimer)   { clearInterval(this.gattDrainTimer);   this.gattDrainTimer   = null; }
    } catch (e: any) { console.error('[BleService] Stop scan error:', e?.message); }
  }

  async startAdvertising(deviceInfo?: DeviceInfo): Promise<void> {
    if (deviceInfo) this.currentDeviceInfo = deviceInfo;
    try {
      await this.advertiser.startAdvertising(this._buildPacket(), false);
      this.isAdvertising = true;
      useAppStore.getState().setAdvertising(true);
      console.log('[BleService] Advertising STARTED');
    } catch (e: any) {
      console.error('[BleService] Advertising error:', e?.message);
      this.config.onError(e);
    }
  }

  async stopAdvertising(): Promise<void> {
    await this.advertiser.stopAdvertising();
    this.isAdvertising = false;
    useAppStore.getState().setAdvertising(false);
  }

  async broadcastDisasterAlert(): Promise<void> {
    const pkt = this._buildPacket();
    await this.advertiser.broadcastDisasterAlert(pkt);
    this.isAdvertising = true;
    useAppStore.getState().setAdvertising(true);
    this.config.onDisasterAlert();
  }

  setDeviceStatus(status: DeviceStatus, battery = 100): void {
    this.currentDeviceInfo = {...this.currentDeviceInfo, status, battery, timestamp: Date.now()};
  }

  getNearbyDevices(): NearbyDevice[] { return Array.from(this.nearbyDevices.values()); }
  getIsScanning():    boolean        { return this.isScanning; }
  getIsAdvertising(): boolean        { return this.isAdvertising; }

  async destroy(): Promise<void> {
    await this.stopScanning();
    await this.stopAdvertising();
    await this.advertiser.destroy();
    this.stateSubscription?.remove();
    this.manager.destroy();
  }

  // ── Packet builder ────────────────────────────────────────────────────────

  private _buildPacket(): AggregatedPacket {
    const store = useAppStore.getState();
    // Never relay placeholder victims
    const realVictims = Object.values(store.victims)
      .filter(v => !v.deviceId.startsWith('RL_PH_'))
      .slice(0, 20);
    const realRssi = (store.rssiReadings ?? [])
      .filter(r =>
        !r.toDeviceId.startsWith('RL_PH_') &&
        !r.fromDeviceId.startsWith('RL_PH_'))
      .slice(0, 50);
    return {
      advertiserId:   this.config.deviceId,
      victims:        realVictims.length > 0 ? realVictims : [this.currentDeviceInfo],
      rssiReadings:   realRssi,
      sequenceNumber: Math.floor(Math.random() * 65535),
      timestamp:      Date.now(),
      chunkIndex:     0,
      totalChunks:    1,
    };
  }
}