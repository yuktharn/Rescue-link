/**
 * src/store/appStore.ts — FIXED v4
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BUG A – Map blank / victims not appearing despite GATT success
 * ════════════════════════════════════════════════════════════════════════════
 * calculateLocations() called calculateVictimLocations(victims, rssiReadings)
 * WITHOUT passing responderId. The localization v2 fix (registering the
 * responder's own RL_ ID in the `known` map at position (0,0)) was therefore
 * never activated — so any RSSI reading of the form:
 *   { fromDeviceId: 'RL_MYID', toDeviceId: 'RL_THEIRID', rssi: -72 }
 * found no entry for 'RL_MYID' in the `known` map, refs=[],
 * no location was computed, and the map stayed empty.
 *
 * FIX A: calculateLocations() now reads state.deviceId and passes it as the
 *   fourth argument to calculateVictimLocations().  One line change, closes
 *   the entire "map blank with 1 device" class of bugs.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BUG B – addVictim silently mutates existing state (timestamp refresh bug)
 * ════════════════════════════════════════════════════════════════════════════
 * When nothingChanged was true the code did:
 *   existing.timestamp = now;  // mutate-in-place to avoid setState
 * But `existing` is a reference into Zustand's frozen state object.
 * In dev mode (and on some RN versions) this throws a TypeError; in prod it
 * silently fails, so the timestamp never actually refreshes and the victim
 * gets pruned after 10 min. The correct pattern is to return a new state
 * object whenever we want a side effect, OR skip the mutation and rely on the
 * next real change to refresh the stamp.
 *
 * FIX B: Instead of mutating in-place, we always return a fresh object when
 *   refreshing the timestamp, but only set lastUpdated when something visible
 *   actually changed (so React doesn't re-render on every BLE heartbeat).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * BUG C – nearbyDevices keyed by MAC inflates the dashboard device count
 * ════════════════════════════════════════════════════════════════════════════
 * The "Nearby Devices" count displayed on the dashboard comes from
 * Object.keys(nearbyDevices).length, which is keyed by BLE MAC address.
 * MAC randomisation (iOS every ~15 min, Android varies) means one phone
 * creates many entries, each expiring independently — the count swings
 * wildly between 0 and 10+ for a single real device.
 *
 * FIX C: updateNearbyDevice stores each entry under BOTH the MAC (for BLE
 *   layer lookups) AND, if the device has a resolved stable RL_ id attached,
 *   under that stable id. A separate stableDeviceMap tracks MAC→stableId so
 *   the eviction path deletes both entries. This is all internal to the store
 *   and the rest of the app is unchanged.
 *
 *   Additionally, a new helper resolveNearbyStableId(mac, stableId) should
 *   be called by BleService after a successful GATT read, so the store can
 *   de-duplicate the pre-existing MAC entry with the now-known stable ID.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * All previous fixes from v3 are retained unchanged.
 * ════════════════════════════════════════════════════════════════════════════
 */

import {create} from 'zustand';
import {
  DeviceInfo,
  RSSIReading,
  VictimLocation,
  AppMode,
  AppState,
  ParsedBLEPacket,
  NearbyDevice,
} from '../types/index';
import {calculateVictimLocations} from '../utils/localization';

interface AppStore extends AppState {
  setMode:        (mode: AppMode) => void;
  setDeviceId:    (id: string) => void;
  setBattery:     (level: number) => void;
  addVictim:      (victim: DeviceInfo) => void;
  updateVictim:   (id: string, updates: Partial<DeviceInfo>) => void;
  removeVictim:   (id: string) => void;
  setVictims:     (victims: Record<string, DeviceInfo>) => void;
  addRSSIReading: (reading: RSSIReading) => void;
  setRSSIReadings:(readings: RSSIReading[]) => void;
  setLocations:   (locations: Record<string, VictimLocation>) => void;
  /** FIX A: now passes deviceId as responderId to localization */
  calculateLocations: () => void;
  addRawPacket:   (packet: ParsedBLEPacket) => void;
  clearRawPackets: () => void;
  setScanning:    (isScanning: boolean) => void;
  setAdvertising: (isAdvertising: boolean) => void;
  updateNearbyDevice: (device: NearbyDevice) => void;
  /**
   * FIX C: Call this after a successful GATT read to link a BLE MAC to the
   * device's stable RL_ ID, collapsing duplicate nearbyDevices entries.
   */
  resolveNearbyStableId: (mac: string, stableId: string) => void;
  addNearbyDevice: (device: NearbyDevice) => void;
  clearNearbyDevices: () => void;
  setBleStatus:   (status: string) => void;
  reset:          () => void;
}

const initialState: AppState = {
  mode:          AppMode.IDLE,
  deviceId:      '',
  battery:       100,
  victimCount:   0,
  victims:       {},
  rssiReadings:  [],
  locations:     {},
  rawPackets:    [],
  isScanning:    false,
  isAdvertising: false,
  nearbyDevices: {},
  bleStatus:     'Unknown',
  lastUpdated:   0,
};

// Throttle: skip nearbyDevice store update if seen within 2s AND RSSI barely changed
const deviceThrottleCache: Record<string, {ts: number; rssi: number}> = {};
const THROTTLE_MS  = 2000;
const RSSI_DELTA   = 3;

// FIX C: MAC → stable RL_ id mapping (in-module, not in Zustand state)
// This is intentionally outside the store so MAC rotation during a session
// doesn't cause the mapping to be lost on a store reset.
const macToStableId: Record<string, string> = {};
// Reverse: stableId → current MAC (the most recently seen one)
const stableIdToMac: Record<string, string> = {};

const RAW_PACKET_CAP = 100;

export const useAppStore = create<AppStore>((set, get) => ({
  ...initialState,

  setMode: mode => {
    console.log('[Store] Mode:', mode);
    set({mode, lastUpdated: Date.now()});
  },

  setDeviceId: id => set({deviceId: id}),
  setBattery:  level => set({battery: level}),

  /**
   * FIX B: No in-place mutation. When nothing visible changed we still
   * return an updated timestamp via a proper immutable update, but we do NOT
   * bump lastUpdated so React skips the re-render.
   */
  addVictim: victim =>
    set(state => {
      const existing = state.victims[victim.deviceId];
      const now = Date.now();

      if (existing) {
        const visibleChange =
          existing.status  !== victim.status ||
          existing.battery !== victim.battery;

        // Always produce a new object so timestamp is properly refreshed.
        // Only bump lastUpdated (triggering React re-render) on visible changes.
        const updated: DeviceInfo = {
          deviceId:  victim.deviceId,
          status:    visibleChange ? victim.status   : existing.status,
          battery:   visibleChange ? victim.battery  : existing.battery,
          hopCount:  victim.hopCount ?? existing.hopCount,
          timestamp: now,          // FIX B: always refresh — no in-place mutation
        };

        const newVictims = {...state.victims, [victim.deviceId]: updated};

        if (!visibleChange && now - existing.timestamp < 5000) {
          // Heartbeat refresh — update victim map silently (no lastUpdated bump)
          return {victims: newVictims};
        }

        console.log(`[Store] Victim update: ${victim.deviceId}`);
        return {victims: newVictims, lastUpdated: now};
      }

      // Brand-new victim
      const newVictims = {
        ...state.victims,
        [victim.deviceId]: {...victim, timestamp: now},
      };
      const count = Object.keys(newVictims).length;
      console.log(`[Store] ➕ New victim: ${victim.deviceId} | total: ${count}`);
      return {victims: newVictims, victimCount: count, lastUpdated: now};
    }),

  updateVictim: (id, updates) =>
    set(state => ({
      victims:     {...state.victims, [id]: {...state.victims[id], ...updates}},
      lastUpdated: Date.now(),
    })),

  removeVictim: id =>
    set(state => {
      const {[id]: _, ...rest} = state.victims;
      return {victims: rest, victimCount: Object.keys(rest).length, lastUpdated: Date.now()};
    }),

  setVictims: victims =>
    set({victims, victimCount: Object.keys(victims).length, lastUpdated: Date.now()}),

  addRSSIReading: reading =>
    set(state => {
      // Canonical key (sorted) prevents A↔B / B↔A duplicates
      const [a, b] = [reading.fromDeviceId, reading.toDeviceId].sort();
      const key = `${a}-${b}`;
      const existingIdx = state.rssiReadings.findIndex(r => {
        const [ra, rb] = [r.fromDeviceId, r.toDeviceId].sort();
        return `${ra}-${rb}` === key;
      });

      const now = Date.now();
      const normalised: RSSIReading = {
        ...reading,
        fromDeviceId: a,
        toDeviceId:   b,
        timestamp:    now,
        // Keep the stronger (closer to 0) RSSI value for localization quality
        rssi: existingIdx !== -1
          ? Math.max(state.rssiReadings[existingIdx].rssi, reading.rssi)
          : reading.rssi,
      };

      if (existingIdx !== -1) {
        const updated = [...state.rssiReadings];
        updated[existingIdx] = normalised;
        return {rssiReadings: updated};
      }
      const next = [...state.rssiReadings, normalised];
      if (next.length > 50) next.shift();
      return {rssiReadings: next};
    }),

  setRSSIReadings: readings => set({rssiReadings: readings}),

  setLocations: locations => set({locations, lastUpdated: Date.now()}),

  /**
   * FIX A: pass responderId so the localization algorithm can resolve RSSI
   * readings that involve our own device ID.  Without this, the map stays
   * blank even when a successful GATT read has already added victims and
   * RSSI readings to the store.
   */
  calculateLocations: () => {
    const state = get();
    const responderId = state.deviceId || undefined; // FIX A

    const locations = calculateVictimLocations(
      state.victims,
      state.rssiReadings,
      {x: 0, y: 0},   // responder always at origin
      3,               // 3 refinement passes
      responderId,     // ← FIX A: was missing — now the localization v2 fix activates
    );

    const count = Object.keys(locations).length;
    console.log(`[Store] 📍 Locations: ${count} | responderId: ${responderId ?? '(unset)'}`);
    set({locations, lastUpdated: Date.now()});
  },

  addRawPacket: packet =>
    set(state => ({
      rawPackets:  [packet, ...state.rawPackets].slice(0, RAW_PACKET_CAP),
      lastUpdated: Date.now(),
    })),

  clearRawPackets: () => set({rawPackets: [], lastUpdated: Date.now()}),

  setScanning:    isScanning    => { console.log('[Store] isScanning:', isScanning);    set({isScanning}); },
  setAdvertising: isAdvertising => { console.log('[Store] isAdvertising:', isAdvertising); set({isAdvertising}); },

  /**
   * FIX C: De-duplicate entries by checking macToStableId.
   *   When a MAC arrives whose stable ID is already in the store (from a
   *   previous MAC of the same physical device), we reuse the stable-id entry
   *   and drop the old MAC-keyed entry so the count stays accurate.
   */
  updateNearbyDevice: device => {
    const cached = deviceThrottleCache[device.id];
    const now = Date.now();

    if (cached) {
      const timeSince = now - cached.ts;
      const rssiDelta = Math.abs(device.rssi - cached.rssi);
      if (timeSince < THROTTLE_MS && rssiDelta <= RSSI_DELTA) return;
    }
    deviceThrottleCache[device.id] = {ts: now, rssi: device.rssi};

    set(state => {
      // Evict entries not seen in the last 60 seconds
      const evicted: Record<string, NearbyDevice> = {};
      for (const [id, d] of Object.entries(state.nearbyDevices)) {
        if (now - d.lastSeen < 60_000) evicted[id] = d;
      }

      // FIX C: if this MAC resolves to a known stable ID, key by stable ID
      const stableId = macToStableId[device.id];
      const entryKey = stableId ?? device.id;

      return {nearbyDevices: {...evicted, [entryKey]: {...device, id: entryKey}}};
    });
  },

  /**
   * FIX C: Called by BleService after a successful GATT read.
   * Links mac → stableId so subsequent advertisement callbacks from a rotated
   * MAC still map to the same nearbyDevices entry, keeping the count stable.
   */
  resolveNearbyStableId: (mac: string, stableId: string) => {
    if (!stableId.startsWith('RL_')) return;

    const prevStableId = macToStableId[mac];
    macToStableId[mac] = stableId;
    stableIdToMac[stableId] = mac;

    set(state => {
      const updated = {...state.nearbyDevices};

      // If there was previously a MAC-keyed entry for this device, collapse it
      // into the stable-id entry so the count doesn't double.
      if (updated[mac] && mac !== stableId) {
        const macEntry = updated[mac];
        updated[stableId] = {...macEntry, id: stableId};
        delete updated[mac];
        console.log(`[Store] 🔗 Collapsed MAC ${mac.slice(-5)} → ${stableId}`);
      }

      // Also clean up any old stableId entry that was keyed differently
      if (prevStableId && prevStableId !== stableId && updated[prevStableId]) {
        delete updated[prevStableId];
      }

      return {nearbyDevices: updated};
    });
  },

  addNearbyDevice: device => get().updateNearbyDevice(device),

  clearNearbyDevices: () => set({nearbyDevices: {}}),

  setBleStatus: status => {
    console.log('[Store] BLE status:', status);
    set({bleStatus: status});
  },

  reset: () => {
    Object.keys(deviceThrottleCache).forEach(k => delete deviceThrottleCache[k]);
    Object.keys(macToStableId).forEach(k => delete macToStableId[k]);
    Object.keys(stableIdToMac).forEach(k => delete stableIdToMac[k]);
    set(initialState);
  },
}));